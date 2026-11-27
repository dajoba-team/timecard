// 직원 휴대폰 알림 규칙 (v46, Edge Function과 시험이 함께 씀. Deno·Node 모두 돌아가는 순수 JS)
//
// 앱이 직원마다 strikes/{직원} 문서에 무단 지각 횟수를 적어 둠 (public/index.html lateStrikes와 같은 계산):
//   { staffId, name, count, limit, lates:[날짜], lastLate, resetOn, ack }
// 서버는 그 문서를 보고 두 가지 알림을 보냄 (같은 알림은 months/{YYYY-MM}/alerts 표시로 한 번만)
//   1. 지각 경고: 오늘 지각이 기록되면 바로 — 1회(한 번 더 하면 2회) = 약한 경고, 한 번 더 하면 퇴사 기준 = 강한 경고
//   2. 출근 전 알림: 지각이 1회 이상 쌓인 직원에게 정해진 출근 시각 N분 전 (기본 60분)
// 지각이 없는 직원에게는 아무것도 안 보냄. resetOn이 지났으면(한 달 지각 없음) 0회로 봄

import { kstDate, kstAt, schedFor } from "./rules.mjs";

export const PUSH_DEFAULT = { on: true, pre: true, before: 60 };
const LATE_DEFAULT = { since: "2026-12-01", limit: 3 };   // 앱 DEFAULT_CONFIG.lateRule과 같게
export const pushCfg = config => ({ ...PUSH_DEFAULT, ...((config && config.push) || {}) });
const lateCfg = config => ({ ...LATE_DEFAULT, ...((config && config.lateRule) || {}) });
export const ruleLive = (config, ds) => { const s = lateCfg(config).since; return !!s && ds >= s; };
export const liveCount = (sk, ds) => !sk || !(+sk.count > 0) || (sk.resetOn && sk.resetOn <= ds) ? 0 : +sk.count;
// 1회(한 번 더 해도 기준 아래) = 약한 경고, 한 번 더 하면 기준 = 강한 경고, 기준 이상 = 기준 도달
export const warnLevel = (count, limit) => count < 1 ? null : count >= limit ? "over" : count + 1 >= limit ? "strong" : "weak";

const md = ds => { const [, m, d] = String(ds).split("-").map(Number); return { ko: `${m}월 ${d}일`, vi: `${d}/${m}` }; };

// 1. 지각 경고: 오늘 기록된 지각 (lastLate = 오늘). key에 횟수가 들어가서 하루 두 번 지각해도 각각 한 번씩
export function warnPushEvents({ config = {}, strikes = {}, staff = [], now }) {
  const ds = kstDate(now), P = pushCfg(config);
  if (!P.on || !ruleLive(config, ds)) return [];
  const byId = new Map(staff.map(s => [s.id, s]));
  const out = [];
  for (const [id, sk] of Object.entries(strikes)) {
    const st = byId.get(sk.staffId || id) || { id, name: sk.name || "직원" };
    if (st.active === false || sk.lastLate !== ds) continue;
    const count = liveCount(sk, ds), level = warnLevel(count, +sk.limit || lateCfg(config).limit);
    if (level) out.push({ kind: "warn", st, sk, count, level, key: `pw_${st.id}_${count}_${ds}` });
  }
  return out;
}

// 2. 출근 전 알림: 지각 1회 이상 + 오늘 근무 + 아직 출근 안 함 + 출근 before분 전 ~ 출근 시각
export function preShiftEvents({ config = {}, strikes = {}, staff = [], punches = {}, now }) {
  const ds = kstDate(now), P = pushCfg(config);
  if (!P.on || !P.pre || !ruleLive(config, ds)) return [];
  const before = Math.max(5, +P.before || 60) * 60000;
  const out = [];
  for (const st of staff) {
    if (st.active === false) continue;
    const sk = strikes[st.id], count = liveCount(sk, ds);
    if (!count) continue;
    const p = punches[st.id + "_" + ds], sc = schedFor(st, ds, p);
    if (!sc || (p && (p.kind === "leave" || p.in))) continue;
    const sStart = kstAt(ds, sc.start);
    if (now >= sStart - before && now < sStart) out.push({ kind: "pre", st, sk, sc, count, level: warnLevel(count, +sk.limit || lateCfg(config).limit), key: `pp_${st.id}_${ds}` });
  }
  return out;
}

// 알림 내용 (베트남어 먼저, 한국어 함께 — 직원 대부분 베트남 사람)
export function pushPayload(ev, config = {}) {
  const limit = +ev.sk?.limit || lateCfg(config).limit, n = ev.count, r = ev.sk?.resetOn ? md(ev.sk.resetOn) : null;
  const reset = r ? { ko: ` ${r.ko}까지 지각이 없으면 0회로 돌아가요.`, vi: ` Không đi muộn đến ${r.vi} thì về 0 lần.` } : { ko: "", vi: "" };
  if (ev.kind === "pre") {
    const t = ev.sc.start;
    const line = ev.level === "weak"
      ? { vi: `Đi muộn ${n}/${limit} lần. Hãy đến sớm 5 phút để chuẩn bị!`, ko: `지각 ${n}/${limit}회 — 5분 일찍 와서 준비해 주세요!` }
      : { vi: `🚨 Đi muộn ${n}/${limit} lần — thêm 1 lần nữa là cho nghỉ việc!`, ko: `🚨 지각 ${n}/${limit}회 — 한 번 더 하면 퇴사 기준이에요!` };
    if (ev.level === "over") { line.vi = `🚨 Đi muộn ${n}/${limit} lần — đã đến mức cho nghỉ việc.`; line.ko = `🚨 지각 ${n}/${limit}회 — 퇴사 기준에 닿았어요.`; }
    return { title: `⏰ Hôm nay vào ca ${t} · 오늘 ${t} 출근`, body: `${line.vi}\n${line.ko}`, strong: ev.level !== "weak", tag: "tc-pre", url: "/" };
  }
  if (ev.level === "weak") return {
    title: `⚠️ Chú ý đi muộn (${n} lần) · 지각 주의 (${n}회)`,
    body: `Bạn đã đi muộn ${n} lần. Thêm 1 lần nữa là ${n + 1} lần — hãy chú ý!${reset.vi}\n지각이 ${n}회 기록됐어요. 한 번 더 하면 ${n + 1}회예요 — 주의해 주세요!${reset.ko}`,
    strong: false, tag: "tc-warn", url: "/",
  };
  if (ev.level === "strong") return {
    title: `🚨 Cảnh báo đi muộn (${n} lần) · 지각 경고 (${n}회)`,
    body: `Bạn đã đi muộn ${n} lần. Thêm 1 lần nữa là ${limit} lần = cho nghỉ việc!${reset.vi}\n지각이 ${n}회예요. 한 번 더 하면 ${limit}회 = 퇴사 기준이에요!${reset.ko}`,
    strong: true, tag: "tc-warn", url: "/",
  };
  return {
    title: `🚨 Đi muộn ${n} lần · 무단 지각 ${n}회`,
    body: `Đã đến mức cho nghỉ việc theo quy định. Hãy nói chuyện với chủ quán.\n규정상 퇴사 처리 기준에 닿았어요. 사장님과 꼭 이야기해 주세요.`,
    strong: true, tag: "tc-warn", url: "/",
  };
}
