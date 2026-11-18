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

// ===== 출근·퇴근 알림 =====
// 최근 windowMs 안에 찍힌 출근·퇴근 (서버가 5분마다 + 앱이 찍을 때 바로 부름. 같은 건은 표시(alerts)로 한 번만)
// punches: { "직원id_날짜": 기록 } (오늘·어제), staff: [{ id, ... }]
// → [{ kind:'in'|'out', st, p, t, key }]  key = 중복 방지 표시 id
export const EVENT_WINDOW = 60 * 60000;
export function punchEvents({ staff = [], punches = {}, now, windowMs = EVENT_WINDOW }) {
  const byId = new Map(staff.map(s => [s.id, s]));
  const out = [];
  for (const [id, p] of Object.entries(punches)) {
    if (!p || p.kind === "leave" || p.edited) continue;   // 사장님이 고친 기록은 알리지 않음
    const st = byId.get(p.staffId) || { id: p.staffId, name: p.name || "직원" };
    for (const kind of ["in", "out"]) {
      const t = +p[kind] || 0;
      if (t && t <= now + 60000 && now - t <= windowMs) out.push({ kind, st, p, t, key: `${kind}_${id}` });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
const punchLine = e => {
  const p = e.p, tags = [];
  if (e.kind === "in" && p.lateMin) tags.push(`지각 ${p.lateMin}분`);
  if (p[e.kind + "Via"] === "phone") tags.push("휴대폰");
  if (p[e.kind + "By"] === "master") tags.push("사장님 대리 입력");
  const g = p[e.kind + "Geo"];
  if (g && g.out) tags.push(`가게 밖 ${g.dist != null ? g.dist + "m" : ""}`.trim());
  else if (g && g.ex && g.far) tags.push("외근");
  if (p[e.kind + "Photo"] === null) tags.push("사진 없음");
  const time = e.kind === "in" ? `출근 ${fmtT(e.t)}` : `퇴근 ${fmtT(e.t)}${p.in ? ` (출근 ${fmtT(p.in)})` : ""}`;
  return `• ${e.kind === "in" ? "🟦" : "⬜"} ${e.st.name}${e.st.position ? ` (${e.st.position})` : ""}: ${time}${tags.length ? ` · ${tags.join(" · ")}` : ""}`;
};
export function punchMessage(storeName, events) {
  const ins = events.filter(e => e.kind === "in").length, outs = events.length - ins;
  const head = events.length === 1 ? `${events[0].st.name} ${events[0].kind === "in" ? "출근" : "퇴근"}` : [ins && `출근 ${ins}명`, outs && `퇴근 ${outs}명`].filter(Boolean).join(" · ");
  return [`*[${storeName || "우리 가게"}] ${head}*`, ...events.map(punchLine)].join("\n");
}

// ===== 업무 지시·사진 보고 알림 =====
// public/index.html의 assignees / appliesOn과 같은 규칙 (tests/slack-events.test.js가 확인)
export function assignees(t, staff = []) {
  const tg = t.target || { mode: "all" }, list = staff.filter(s => s.active !== false);
  if (tg.mode === "pos") return list.filter(s => s.position === tg.pos);
  if (tg.mode === "staff") return list.filter(s => (tg.ids || []).includes(s.id));
  return list;
}
export function appliesOn(t, ds) {
  if (t.kind !== "task" || !t.start || ds < t.start) return false;
  if (t.repeat === "daily") return true;
  if (t.repeat === "days") return (t.days || []).includes(weekday(ds));
  return ds === t.start;
}
// 보고 도착: 확인 대기(sent) 보고 중 최근에 보낸 것. key에 회차를 넣어 '다시 보내기'도 알림
// reports: { "업무_직원_날짜": 보고 }
export function reportEvents({ reports = {}, now, windowMs = EVENT_WINDOW }) {
  const out = [];
  for (const [id, r] of Object.entries(reports)) {
    const t = +r.sentAt || 0;
    if ((r.status || "sent") === "sent" && t && t <= now + 60000 && now - t <= windowMs) out.push({ id, r, t, key: `rep_${id}_${r.round || 1}` });
  }
  return out.sort((a, b) => a.t - b.t);
}
export function reportMessage(storeName, events, { tasks = {}, staff = [] } = {}) {
  const byId = new Map(staff.map(s => [s.id, s]));
  const head = events.length === 1 ? `${byId.get(events[0].r.staffId)?.name || "직원"} 업무 보고 도착` : `업무 보고 ${events.length}건 도착`;
  return [
    `*[${storeName || "우리 가게"}] ${head}*`,
    ...events.map(e => `• ${byId.get(e.r.staffId)?.name || "직원"}: ${tasks[e.r.taskId]?.title || "업무"} · 사진 ${(e.r.photos || []).length}장 · ${fmtT(e.t)}${(e.r.round || 1) > 1 ? ` · ${e.r.round}번째` : ""}${e.r.oldPhoto ? " · 앨범 사진 섞임" : ""}${e.r.note ? `\n   “${String(e.r.note).slice(0, 80)}”` : ""}`),
    "",
    "사장님 화면 → 업무 보고에서 사진을 보고 [확인] 또는 [다시 요청]을 눌러 주세요.",
  ].join("\n");
}
// 마감 지남: 오늘 해당하는 사진 보고 업무 중 마감 시각이 지났는데 보고 안 한 직원이 있는 것 (업무·날짜당 한 번)
// '다시 요청'을 받고 아직 안 보낸 직원도 포함. 마감 뒤에 만든 업무는 알리지 않음
export function dueEvents({ tasks = {}, staff = [], reports = {}, now }) {
  const ds = kstDate(now), out = [];
  for (const [id, t] of Object.entries(tasks)) {
    if (t.active === false || !t.due || !appliesOn(t, ds)) continue;
    const dueAt = kstAt(ds, t.due);
    if (now <= dueAt || (t.createdAt && t.createdAt > dueAt)) continue;
    const missing = assignees(t, staff).filter(st => { const r = reports[`${id}_${st.id}_${ds}`]; return !r || r.status === "redo"; });
    if (missing.length) out.push({ id, t, missing, key: `due_${id}_${ds}` });
  }
  return out;
}
export function dueMessage(storeName, events) {
  return [
    `*[${storeName || "우리 가게"}] 업무 마감 지남*`,
    ...events.map(e => `• ${e.t.title} (${e.t.due}까지): ${e.missing.map(s => s.name).join(", ")} 아직 안 보냄`),
  ].join("\n");
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
