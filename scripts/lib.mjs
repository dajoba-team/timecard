// scripts 공용: .env 읽기, Supabase 클라이언트, 백업 JSON ↔ docs 행 변환
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 환경변수 우선, 없으면 프로젝트 루트 .env
export const loadEnv = () => {
  const file = path.join(ROOT, ".env");
  const env = Object.fromEntries(
    (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "")
      .split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#") && l.includes("="))
      .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
  );
  return {
    url: process.env.SUPABASE_URL || env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
  };
};

export const connect = async () => {
  const { url, key } = loadEnv();
  if (!url || !key) { console.error("❌ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 필요해요 (.env 또는 환경변수)"); process.exit(1); }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
};

export const DOCS = "tc_docs";   // 장부와 같은 프로젝트라 타임카드 자원은 tc 접두어

export const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
export const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// 삭제되지 않은 tc_docs 행 전체
export const fetchDocs = async sb => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await sb.from(DOCS).select("collection,id,data").is("deleted_at", null)
      .order("collection").order("id").range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
};

// 서버(Edge Function)가 스스로 쓰는 문서: 백업에 없고, 옮기기에서 건드리지 않음
//   status/*  마지막 슬랙 알림·백업 결과,  months/{YYYY-MM}/alerts/*  알림 중복 방지 표시
export const isServerDoc = collection => collection === "status" || /^months\/\d{4}-\d{2}\/alerts$/.test(collection);

// 다시 옮길 때(--force) 지워야 할 문서: 서버에는 있는데 새 백업에는 없는 것 (서버 전용 문서 제외)
// serverRows: [{collection, id}], fileRows: backupToDocs().rows → [{collection, id}]
export const staleDocs = (serverRows, fileRows) => {
  const keep = new Set(fileRows.map(r => r.collection + "/" + r.id));
  return serverRows.filter(r => !isServerDoc(r.collection) && !keep.has(r.collection + "/" + r.id))
    .map(r => ({ collection: r.collection, id: r.id }));
};

// 키 순서와 무관하게 비교 (DB jsonb는 키 순서를 바꿔 돌려줌)
const sortDeep = v => Array.isArray(v) ? v.map(sortDeep) : v && typeof v === "object" ? Object.keys(v).sort().reduce((a, k) => (a[k] = sortDeep(v[k]), a), {}) : v;
export const canon = o => JSON.stringify(sortDeep(o));

// 앱 상태는 { id: 문서id, ...문서내용 } 모양 → 문서내용에서 id를 뺀다
const body = o => { const { id, ...rest } = o; return JSON.parse(JSON.stringify(rest)); };

// 타임카드 '전체 백업(.json)' → docs 행 목록 + 검사 결과
// 백업 모양 (index.html BACT.bkAll): { app, format, exportedAt, config, ownerSign, staff[], punches{ym:[]}, contracts[], reports{ym:{}} }
export const backupToDocs = backup => {
  const problems = [], notes = [], rows = [];
  if (!backup || backup.app !== "가게 타임카드 백업") problems.push("타임카드 전체 백업 파일이 아니에요 (app 값이 다름)");
  if (backup && backup.format !== 1) problems.push("모르는 백업 형식이에요 (format " + (backup && backup.format) + ")");
  if (problems.length) return { rows, problems, notes };

  const add = (collection, id, data) => {
    if (!id || /\//.test(id)) { problems.push("잘못된 문서 id: " + collection + "/" + id); return; }
    rows.push({ collection, id: String(id), data });
  };

  if (backup.config && typeof backup.config === "object" && Object.keys(backup.config).length) add("config", "main", JSON.parse(JSON.stringify(backup.config)));
  else notes.push("가게 설정이 비어 있어요 (기본값으로 시작)");

  // 사장님 서명: 원래 { data, at } 이었는데 백업에는 data만 있어서 at은 백업 시각으로 채움
  if (backup.ownerSign) add("config", "sign", { data: backup.ownerSign, at: Date.parse(backup.exportedAt) || Date.now() });

  for (const s of backup.staff || []) add("staff", s.id, body(s));

  let photoRefs = 0;
  for (const [ym, list] of Object.entries(backup.punches || {})) {
    if (!/^\d{4}-\d{2}$/.test(ym)) { problems.push("잘못된 달: " + ym); continue; }
    for (const p of list || []) {
      if (p.inPhoto) photoRefs++;
      if (p.outPhoto) photoRefs++;
      add(`months/${ym}/punches`, p.id, body(p));
    }
  }
  if (photoRefs) notes.push("출퇴근 사진 번호 " + photoRefs + "개는 기록에 남지만 사진 파일은 옮기지 않아요 (화면에서 깨진 사진으로 보임)");

  for (const c of backup.contracts || []) add("contracts", c.id, body(c));
  for (const [ym, r] of Object.entries(backup.reports || {})) add("reports", ym, JSON.parse(JSON.stringify(r)));

  // 중복 검사
  const seen = new Set();
  for (const r of rows) { const k = r.collection + "/" + r.id; if (seen.has(k)) problems.push("중복 문서: " + k); seen.add(k); }

  // 백업 안의 개수와 맞는지
  const c = backup.counts || {};
  const punchCount = rows.filter(r => r.collection.startsWith("months/")).length;
  if (c.staff != null && c.staff !== (backup.staff || []).length) problems.push(`직원 수가 백업 표시(${c.staff})와 달라요`);
  if (c.punches != null && c.punches !== punchCount) problems.push(`출퇴근 기록 수가 백업 표시(${c.punches})와 달라요 (${punchCount})`);
  if (c.contracts != null && c.contracts !== (backup.contracts || []).length) problems.push(`계약서 수가 백업 표시(${c.contracts})와 달라요`);

  return { rows, problems, notes };
};
