// 새 지각 규칙 (v42): 시작일(기본 2026-12-01)부터 1분이라도 늦으면 지각, 사장님이 사유를 적고 지각 지우기·되살리기,
// 무단 지각 3회 = 퇴사 기준 알림, 마지막 지각 뒤 한 달 동안 지각 없으면 0회로, 직원 화면 안내, 설정
const fs = require('fs');
const assert = require('assert');
const RealDate = Date;
let NOW = 0;
const kt = (hms, ds) => new RealDate(`${ds}T${hms.length === 5 ? hms + ':00' : hms}+09:00`).getTime();
NOW = kt('12:00', '2026-11-27');
global.Date = class extends RealDate { constructor(...a){ if (a.length) super(...a); else super(NOW); } static now(){ return NOW; } };
const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:true, value:'' };
const view = { innerHTML:'' }, toasts = [];
global.document = { addEventListener(){}, querySelector: s => s === '#view' ? view : s === '#toasts' ? { prepend: e => toasts.push(e.innerHTML) } : el, querySelectorAll: () => [], createElement: () => ({ ...el, remove(){} }) };
global.window = {}; global.location = { hash:'' }; global.scrollTo = () => {}; global.setInterval = () => 0; global.setTimeout = () => 0;
global.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
let src = fs.readFileSync('chk.js', 'utf8').replace(/\nboot\(\);\s*$/, '\n');
src += `
const docs = {};
function apply(p){
  const i = p.lastIndexOf('/'), c = p.slice(0, i), id = p.slice(i + 1), m = /^months\\/(\\d{4}-\\d{2})\\/punches$/.exec(c);
  if (m){ const map = S.months[m[1]]; if (docs[p]) map.set(id, { id, ...docs[p] }); else map.delete(id); }
}
const mk = p => ({ set: async d => { docs[p] = JSON.parse(JSON.stringify(d)); apply(p); }, update: async d => { docs[p] = { ...docs[p], ...JSON.parse(JSON.stringify(d)) }; apply(p); }, delete: async () => { delete docs[p]; apply(p); } });
S.db = { doc: p => mk(p), collection: c => ({ doc: id => mk(c + '/' + id), onSnapshot: () => () => {} }) };
const day = { on:true, start:'09:00', end:'18:00', brk:60 };
S.config = { graceMin:5, otUnit:10, earlyClamp:true, photo:{ on:false }, geo:{ on:false }, ot:{ on:false, since:'' } };
S.staff = ['a', 'b', 'c'].map((id, i) => ({ id, name:['성실', '가나다', '라마바'][i], position:'홀', sched:Array(7).fill(day), active:true, hireDate:'2026-01-01', pin:'111' + (i + 1), wage:10320 }));
const [A, B, C] = S.staff;
for (const ym of ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02']){ S.months[ym] = new Map(); S.monthLoaded[ym] = true; }
S.ready.staff = true; S.lang = 'ko';
const putPunch = (st, ds, inHms, outHm = '18:00') => { const p = 'months/' + ds.slice(0, 7) + '/punches/' + st.id + '_' + ds; docs[p] = { staffId:st.id, name:st.name, date:ds, kind:'work', in:kt(inHms, ds), out:kt(outHm, ds), sched:day, lateMin:0 }; apply(p); };
(async () => {
  // ----- 1. 시작일 전(11/30)은 예전처럼 5분 봐줌, 시작일(12/1)부터는 1분이라도 늦으면 지각 -----
  assert.strictEqual(cfg().lateRule.since, '2026-12-01', '기본 시작일 12/1'); assert.strictEqual(cfg().lateRule.limit, 3, '기본 3회');
  putPunch(C, '2026-11-30', '09:03'); assert.strictEqual(dayCalc(C, '2026-11-30').late, 0, '11/30 3분 늦음 = 예전 규칙으로 지각 아님');
  putPunch(C, '2026-11-29', '09:06'); assert.strictEqual(dayCalc(C, '2026-11-29').late, 6, '11/29 6분 = 지각');
  putPunch(C, '2026-12-01', '09:00:59'); assert.strictEqual(dayCalc(C, '2026-12-01').late, 0, '09:00:59는 아직 정시');
  putPunch(C, '2026-12-02', '09:01:00'); assert.strictEqual(dayCalc(C, '2026-12-02').late, 1, '09:01부터 지각 1분');
  putPunch(C, '2026-12-03', '09:03:40'); assert.strictEqual(dayCalc(C, '2026-12-03').late, 3, '3분 40초 = 3분 지각 (봐주는 시간 없음)');
  putPunch(C, '2026-12-04', '08:50'); assert.strictEqual(dayCalc(C, '2026-12-04').late, 0, '일찍 오면 지각 아님');
  assert.strictEqual(lateOf('2026-12-05', kt('09:00', '2026-12-05'), kt('09:02', '2026-12-05')), 2, '태블릿·수정 저장도 같은 계산');
  assert.strictEqual(lateOf('2026-11-25', kt('09:00', '2026-11-25'), kt('09:02', '2026-11-25')), 0, '시작일 전 태블릿 계산은 예전 그대로');
  console.log('1분 지각 통과');

  // ----- 2. 무단 지각 횟수 + 한 달 동안 지각 없으면 0회 -----
  putPunch(A, '2026-12-02', '09:05'); putPunch(A, '2026-12-10', '09:10');
  let ls = lateStrikes(A, '2026-12-31');
  assert.ok(ls.on && ls.count === 2 && ls.resetOn === '2027-01-10', '2회 · 1/10까지 지각 없으면 0회');
  assert.deepStrictEqual(ls.lates.map(x => x.ds), ['2026-12-02', '2026-12-10']);
  assert.strictEqual(lateStrikes(A, '2027-01-09').count, 2, '하루 전까지는 그대로');
  ls = lateStrikes(A, '2027-01-10');
  assert.ok(ls.count === 0 && ls.resets === 1 && ls.lastReset === '2027-01-10', '한 달 지나면 0회로');
  putPunch(A, '2027-01-15', '09:02');
  ls = lateStrikes(A, '2027-01-20');
  assert.ok(ls.count === 1 && ls.lates[0].ds === '2027-01-15' && ls.resetOn === '2027-02-15', '리셋 뒤 새로 1회부터');
  assert.strictEqual(monthSummary(A, '2026-12').lateDays.length, 2, '출퇴근 기록(월 집계)은 그대로 남음 — 횟수만 0회로');
  console.log('한 달 리셋 통과');

  // ----- 3. 3회 = 퇴사 기준 알림 (한 달이 안 되는 간격이면 이어서 셈) -----
  putPunch(B, '2026-12-01', '09:01'); putPunch(B, '2026-12-20', '09:04'); putPunch(B, '2027-01-19', '09:02');
  ls = lateStrikes(B, '2027-01-19');
  assert.strictEqual(ls.count, 3, '12/20 → 1/19는 한 달이 안 돼서 이어서 3회');
  NOW = kt('12:00', '2027-01-19');
  assert.ok(strikeReminder().includes('퇴사 처리 기준') && strikeReminder().includes('가나다'), '현황에 퇴사 기준 알림');
  assert.ok(strikeOwnerLine(B).includes('무단 지각 3/3회') && strikeOwnerLine(B).includes('⚠ 퇴사 처리 기준'), '직원 목록 한 줄');
  assert.ok(staffView().includes('무단 지각 3/3회'), '직원·설정 화면에 표시');
  assert.ok(strikeReminder().includes('성실(1회)') === false, '1회는 알림 안 함');
  console.log('3회 알림 통과');

  // ----- 4. 사장님이 사유를 적고 지각 지우기 → 횟수에서 빠짐, 되살리기 -----
  S.editing = 'punch:b|2026-12-20'; el.value = ''; await ACT.lateOk();
  assert.ok(!docs['months/2026-12/punches/b_2026-12-20'].lateOk && toasts.some(t => t.includes('사유')), '사유 없으면 안 지움');
  S.editing = 'punch:b|2026-12-20'; el.value = '미리 연락함 · 병원 진료'; await ACT.lateOk();
  const p = docs['months/2026-12/punches/b_2026-12-20'];
  assert.ok(p.lateOk && p.lateOk.reason === '미리 연락함 · 병원 진료' && p.in === kt('09:04', '2026-12-20'), '사유와 함께 저장, 출근 시각은 그대로');
  let r = dayCalc(B, '2026-12-20');
  assert.ok(r.late === 0 && r.lateOk === 4 && r.paid > 0, '지각 0 · 지운 지각 4분 · 일한 시간 그대로');
  assert.ok(statusChips(r).includes('지각 지움 (4분)') && !statusChips(r).includes('chip red'), '기록 화면 표시');
  assert.strictEqual(monthSummary(B, '2026-12').lateDays.length, 1, '월 지각 횟수에서도 빠짐');
  ls = lateStrikes(B, '2027-01-19');
  assert.ok(ls.count === 0 || ls.count === 1, '중간 지각을 지우면 다시 계산');
  assert.strictEqual(ls.count, 1, '12/1 → 1/19는 한 달 넘게 떨어져 12/1은 리셋, 1/19만 1회');
  assert.ok(!strikeReminder().includes('퇴사 처리 기준'), '알림 사라짐');
  S.editing = 'punch:b|2026-12-20'; await ACT.lateUndo();
  assert.strictEqual(dayCalc(B, '2026-12-20').late, 4, '되살리면 다시 지각'); assert.strictEqual(lateStrikes(B, '2027-01-19').count, 3);
  // 수정 화면: 지각이면 사유 칸, 지운 지각이면 되살리기
  S.recSub = 'day'; S.editing = 'punch:b|2026-12-20';
  assert.ok(dayTable('2026-12-20').includes('id="ed-lateWhy"') && dayTable('2026-12-20').includes('data-act="lateOk"'), '수정 화면에 지각 지우기');
  S.editing = null;
  assert.ok(dayTable('2026-12-20').includes('지각 지우기'), '기록 줄에 지각 지우기 버튼');
  console.log('지각 지우기 통과');

  // ----- 5. 직원 화면 안내 (시작일 전 예고 → 횟수) -----
  NOW = kt('12:00', '2026-11-27');
  assert.ok(strikeMine(A).includes('12월 1일') && strikeMine(A).includes('1분이라도'), '시작 전: 새 규칙 예고');
  S.lang = 'vi'; assert.ok(strikeMine(A).includes('1/12') && strikeMine(A).includes('dù 1 phút'), '베트남어 예고'); S.lang = 'ko';
  assert.strictEqual(strikeReminder(), '', '시작 전에는 사장님 알림 없음');
  NOW = kt('12:00', '2026-12-15');
  assert.ok(strikeMine(A).includes('2/3회') && strikeMine(A).includes('1월 10일'), '직원: 2/3회 · 1월 10일까지');
  assert.ok(mySummary(A).includes('무단 지각'), '내 근무 요약에 표시');
  NOW = kt('12:00', '2027-01-12');
  assert.ok(strikeMine(A).includes('0/3회'), '리셋 뒤 0/3회');
  console.log('직원 화면 통과');

  // ----- 6. 설정: 시작일 비우면 예전 방식 / 퇴사 기준 횟수 -----
  S.config.lateRule = { since:'', limit:3 };
  assert.strictEqual(dayCalc(C, '2026-12-03').late, 0, '규칙 끄면 3분은 봐줌');
  assert.ok(!lateStrikes(A).on && strikeMine(A) === '' && strikeReminder() === '', '끄면 횟수·안내 없음');
  S.config.lateRule = { since:'2026-12-01', limit:2 };
  NOW = kt('12:00', '2026-12-15');
  assert.ok(strikeOwnerLine(A).includes('2/2회') && strikeOwnerLine(A).includes('퇴사 처리 기준'), '기준 2회로 바꾸면 2회에서 알림');
  S.config.lateRule = { since:'2026-12-01', limit:3 };
  assert.ok(staffView().includes('1분이라도 넘으면 지각'), '가게 설정에 지각 기준 설명');
  S.editing = 'config'; assert.ok(staffView().includes('id="c-lateSince"') && staffView().includes('id="c-lateLimit"'), '설정 고치기에 시작일·기준'); S.editing = null;
  assert.ok(NOTICE_TEMPLATES.attendance.body.includes('1분이라도') && NOTICE_TEMPLATES.attendance.body.includes('0회로') && NOTICE_TEMPLATES.attendance.bodyVi.includes('1 phút'), '공지 예시 문구');
  console.log('설정 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
`;
eval(src);
