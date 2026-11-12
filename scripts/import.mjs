// 타임카드 백업 JSON → Supabase 이전 (1회용)
//
// 사용법:
//   node scripts/import.mjs <백업.json> --dry-run   # 서버 접속 없이 파일 검사만
//   node scripts/import.mjs <백업.json>             # 이전 + 검증
//   node scripts/import.mjs <백업.json> --verify    # 이전 없이 서버 데이터와 비교만
//   node scripts/import.mjs <백업.json> --force     # 서버에 이미 데이터가 있어도 새 백업으로 바꾸기 (예행연습 뒤 전환하는 날)
//                                                   새 백업에 없는 문서(그사이 기존 프로그램에서 지운 것)는 삭제 표시
//
// 필요: npm install, 프로젝트 루트 .env 파일
//   SUPABASE_URL=https://xxxx.supabase.co           (장부와 같은 프로젝트)
//   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   (대시보드 → Project Settings → API Keys → Secret key. 절대 커밋·배포 금지)
//
// 백업 파일: claude.ai 아티팩트 → 사장님 화면 → 직원·설정 → 데이터 백업 → '전체 백업 파일 받기 (.json)'
// 사진 파일은 백업에 없어서 옮기지 않아요 (기록의 사진 번호만 남음).

import fs from "node:fs";
import path from "node:path";
import { connect, check, chunks, fetchDocs, canon, backupToDocs, staleDocs, isServerDoc, DOCS } from "./lib.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const DRY = args.includes("--dry-run");
const VERIFY_ONLY = args.includes("--verify");
const FORCE = args.includes("--force");
if (!file) { console.error("사용법: node scripts/import.mjs <백업.json> [--dry-run|--verify] [--force]"); process.exit(1); }

// ----- 1. 파일 검사 -----
let backup;
try { backup = JSON.parse(fs.readFileSync(file, "utf8")); }
catch (e) { console.error("❌ 파일을 읽지 못했어요: " + e.message); process.exit(1); }
const { rows, problems, notes } = backupToDocs(backup);

const byCol = rows.reduce((m, r) => { const k = r.collection.startsWith("months/") ? "출퇴근 기록" : r.collection; m[k] = (m[k] || 0) + 1; return m; }, {});
const months = Object.keys(backup.punches || {}).sort();
console.log("📄 " + path.basename(file) + (backup.exportedAt ? " (백업 시각 " + backup.exportedAt + ")" : ""));
console.log("   직원 " + (byCol.staff || 0) + "명 (재직 " + (backup.staff || []).filter(s => s.active !== false).length + "명)" +
  ", 출퇴근 기록 " + (byCol["출퇴근 기록"] || 0) + "건 (" + (months.length ? months[0] + " ~ " + months.at(-1) + ", " + months.length + "개월" : "없음") + ")");
console.log("   근로계약서 " + (byCol.contracts || 0) + "건, 세무사 전달 내역 " + (byCol.reports || 0) + "개월, 사장님 서명 " + (backup.ownerSign ? "있음" : "없음"));
const sample = (backup.staff || []).filter(s => /\(예시\)/.test(s.name || "")).length;
if (sample) console.log("   ⚠️ 예시 직원 " + sample + "명이 들어 있어요. 옮긴 뒤 앱에서 '예시 데이터 지우기'로 지울 수 있어요.");
notes.forEach(n => console.log("   ℹ️ " + n));
if (problems.length) { console.error("❌ 문제: " + problems.join(" / ")); process.exit(1); }
console.log("✅ 파일 검사 통과 (문서 " + rows.length + "개)");
if (DRY) process.exit(0);

// ----- 2. 서버 접속 -----
const sb = await connect();

// ----- 3. 이전 -----
if (!VERIFY_ONLY) {
  // 서버가 스스로 쓰는 기록(status/*: 마지막 슬랙 알림 결과 등, months/*/alerts: 알림 중복 방지)은 '이미 있는 데이터'로 치지 않음
  const { count, error } = await sb.from(DOCS).select("id", { count: "exact", head: true }).is("deleted_at", null)
    .neq("collection", "status").not("collection", "like", "months/%/alerts");   // isServerDoc과 같은 기준
  if (error) { console.error("❌ 서버 접속 실패: " + error.message + " (schema.sql을 실행했는지 확인하세요)"); process.exit(1); }
  if (count > 0 && !FORCE) {
    console.error("❌ 서버에 이미 문서 " + count + "개가 있어요. 운영 중인 데이터를 옛 백업으로 덮어쓸 수 있어 멈춰요.");
    console.error("   (예행연습으로 옮긴 뒤 최신 백업으로 바꾸는 경우라면 --force)");
    process.exit(1);
  }
  console.log("⬆️  저장 중...");
  let done = 0;
  for (const part of chunks(rows.map(r => ({ ...r, deleted_at: null })), 500)) {
    check(await sb.from(DOCS).upsert(part, { onConflict: "collection,id" }));
    done += part.length;
    console.log("   " + done + "/" + rows.length);
  }
  console.log("   저장 완료");

  // 다시 옮기기: 새 백업에 없는 문서는 삭제 표시 (실제로 지우지 않고 deleted_at만, 변경 이력에도 남음)
  if (FORCE) {
    const stale = staleDocs(await fetchDocs(sb), rows);
    if (stale.length) {
      const at = new Date().toISOString();
      const byCol = stale.reduce((m, r) => ((m[r.collection] = m[r.collection] || []).push(r.id), m), {});
      for (const [collection, ids] of Object.entries(byCol))
        for (const part of chunks(ids, 500))
          check(await sb.from(DOCS).update({ deleted_at: at }).eq("collection", collection).in("id", part).is("deleted_at", null));
      console.log("   새 백업에 없는 문서 " + stale.length + "개를 삭제 표시했어요 (그사이 기존 프로그램에서 지운 것)");
    }
  }
}

// ----- 4. 검증: 서버에서 다시 읽어 원본과 비교 -----
console.log("🔍 검증 중...");
const server = new Map((await fetchDocs(sb)).map(r => [r.collection + "/" + r.id, canon(r.data)]));
const missing = [], diff = [];
for (const r of rows) {
  const k = r.collection + "/" + r.id;
  if (!server.has(k)) missing.push(k);
  else if (server.get(k) !== canon(r.data)) diff.push(k);
}
const group = list => Object.entries(list.reduce((m, k) => { const c = k.startsWith("months/") ? k.split("/").slice(0, 2).join("/") : k.split("/")[0]; m[c] = (m[c] || 0) + 1; return m; }, {}))
  .map(([c, n]) => c + " " + n).join(", ");
console.log("   파일 " + rows.length + "개 / 서버 " + server.size + "개");
if (missing.length) console.log("   누락: " + group(missing));
if (diff.length) console.log("   내용 다름: " + group(diff));
const fileKeys = new Set(rows.map(r => r.collection + "/" + r.id));
const extra = [...server.keys()].filter(k => !fileKeys.has(k) && !isServerDoc(k.slice(0, k.lastIndexOf("/"))));
if (extra.length) console.log("   ℹ️ 서버에만 있는 문서 " + extra.length + "개 (이전 뒤 앱에서 새로 저장한 것일 수 있어요): " + group(extra));
if (missing.length || diff.length) { console.error("❌ 검증 실패 - 위 항목을 확인하세요"); process.exit(1); }
console.log("✅ 검증 통과: 파일과 서버 데이터가 일치해요");
