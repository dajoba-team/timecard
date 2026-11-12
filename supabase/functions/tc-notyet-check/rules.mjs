// 미출근 판단 규칙 (Edge Function과 시험이 함께 씀. Deno·Node 모두에서 돌아가는 순수 JS)
//
// public/index.html의 dayCalc / schedFor와 같은 규칙이에요. 앱 규칙을 바꾸면 여기도 같이 고쳐야 해요.
// (tests/notyet.test.js가 두 규칙이 같은 답을 내는지 확인해요)
//
// 미출근 = 오늘 근무날(근무표·입사/퇴사일 기준) + 휴무 처리 없음 + 출근 기록 없음
//          + (정해진 출근 시각 + 지각 봐주는 분)이 지났고 + 아직 정해진 퇴근 시각 전
// 시간은 모두 한국시간(UTC+9) 기준이에요.

const KST = 9 * 3600 * 1000;
const pad = n => String(n).padStart(2, "0");
export const hm2min = s => { const [h, m] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const kstDate = ms => new Date(ms + KST).toISOString().slice(0, 10);              // "2026-11-12"
export const kstAt = (ds, hhmm) => Date.parse(ds + "T00:00:00+09:00") + hm2min(hhmm) * 60000;
export const weekday = ds => new Date(ds + "T00:00:00Z").getUTCDay();                    // 0 = 일요일
export const fmtT = ms => { const d = new Date(ms + KST); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); };

export function schedFor(st, ds, p) {
  if (p && p.sched !== undefined) return p.sched;
  if (st.hireDate && ds < st.hireDate) return null;
  if (st.endDate && ds > st.endDate) return null;
  const s = st.sched && st.sched[weekday(ds)];
  return s && s.on ? { start: s.start, end: s.end, brk: +s.brk || 0 } : null;
}

// config: config/main 문서, staff: [{ id, ...문서 }], punches: { "직원id_날짜": 기록 }, now: ms
// → [{ st, sc, sStart, sEnd }] 지금 미출근인 직원
export function notyetList({ config = {}, staff = [], punches = {}, now }) {
  const ds = kstDate(now);
  const grace = (config.graceMin === undefined ? 5 : (+config.graceMin || 0)) * 60000;
  const out = [];
  for (const st of staff) {
    if (st.active === false) continue;
    const p = punches[st.id + "_" + ds];
    const sc = schedFor(st, ds, p);
    if (!sc) continue;
    if (p && (p.kind === "leave" || p.in)) continue;
    const sStart = kstAt(ds, sc.start);
    let sEnd = kstAt(ds, sc.end);
    if (sEnd <= sStart) sEnd += 86400000;
    if (now > sStart + grace && now <= sEnd) out.push({ st, sc, sStart, sEnd });
  }
  return out;
}

export function notyetMessage(storeName, items, now) {
  const head = items.length === 1 ? `${items[0].st.name} 미출근` : `${items.length}명 미출근`;
  return [
    `*[${storeName || "우리 가게"}] ${head}*`,
    ...items.map(i => `• ${i.st.name}${i.st.position ? ` (${i.st.position})` : ""}: 출근 ${i.sc.start} 예정인데 ${fmtT(now)} 현재 출근 기록이 없어요.`),
    "",
    "연락해 보시거나, 쉬는 날이면 사장님 화면 → 출퇴근 기록에서 ‘휴무 처리’ 해 주세요.",
    "_가게 태블릿 인터넷이 끊겨 있었다면 실제로는 출근했을 수도 있어요._",
  ].join("\n");
}
