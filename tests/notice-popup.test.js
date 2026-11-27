// 이름을 누르면 안 읽은 지시·공지 팝업 (v44): 한 건씩 [읽고 확인했어요], 번호가 맞아야 읽음 저장,
// [나중에]·마스터 번호는 읽음 안 남김, 번호 없는 직원·휴대폰 출근도 팝업, 안 읽은 게 없으면 바로 번호판
const assert = require('assert');
const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:false, value:'' };
const view = { innerHTML:'' };
let toasts = [];
const ls = new Map();
global.document = { addEventListener(){}, querySelector: s => s === '#view' ? view : s === '#toasts' ? { prepend(){} } : el, querySelectorAll: () => [], createElement: () => ({ ...el, remove(){} }) };
global.window = {}; global.location = { hash:'', host:'timecard.dajoba.kr' }; global.scrollTo = () => {}; global.setInterval = () => 0;
global.localStorage = { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
const W = JSON.parse(require('fs').readFileSync('writes.json', 'utf8'));
let src = require('fs').readFileSync('chk.js', 'utf8').replace(/\nboot\(\);\s*$/, '\n');
src += `
const cols = {};
const col = c => cols[c] = cols[c] || new Map();
const subs = {};
const emitCol = c => (subs[c] || []).forEach(f => f({ docs:[...col(c).entries()].map(([id, d]) => ({ id, data: () => JSON.parse(JSON.stringify(d)) })), metadata:{} }));
const ref = (c, id) => ({
  set: async d => { col(c).set(id, JSON.parse(JSON.stringify(d))); emitCol(c); },
  update: async d => { col(c).set(id, { ...col(c).get(id), ...JSON.parse(JSON.stringify(d)) }); emitCol(c); },
  delete: async () => { col(c).delete(id); emitCol(c); },
  onSnapshot: () => () => {},
});
S.db = { doc: p => { const i = p.lastIndexOf('/'); return ref(p.slice(0, i), p.slice(i + 1)); },
  collection: c => ({ doc: id => ref(c, id), onSnapshot: next => { (subs[c] = subs[c] || []).push(next); emitCol(c); return () => {}; } }) };
window.tcStore = { use: async () => null };
toast = (a, b) => toasts.push(a + (b ? ' / ' + b : ''));
S.config = { ...W[0].data, masterPin:'9876', photo:{ on:false }, geo:{ on:false }, phoneReq:{ on:false, deadline:'' } };
S.staff = W.filter(w => w.collection === 'staff').map(w => ({ id:w.doc_id, ...w.data }));
const [A, B, C] = S.staff;
A.phonePunch = true;
S.staff.push({ id:'np', name:'번호없음', pin:'', position:'홀', sched:A.sched, active:true, hireDate:'2026-01-01', wage:10320 });
const NP = S.staff.at(-1);
S.ready.staff = true; S.lang = 'ko';
const today = todayStr(), ym = ymOf(today);
needMonth(ym); bootTasks(S.db);
const tick = async () => { for (let i = 0; i < 6; i++) await null; };
const addNotice = async (id, title) => { await S.db.collection('tasks').doc(id).set({ kind:'notice', title, body:title + ' 본문', target:{ mode:'all', ids:[] }, active:true, createdAt:Date.now() }); };
(async () => {
  await addNotice('n1', '재료 반출 금지 안내'); await addNotice('n2', '대청소 안내');
  assert.strictEqual(unreadFor(B).length, 2, 'B는 2건 안 읽음');

  // ----- 1. 이름 누르면 팝업 → 한 건씩 확인 → 번호판 → 번호 맞으면 읽음 저장 -----
  S.mode = 'kiosk'; resetKiosk();
  ACT.kPick({ id:B.id }); render(true);
  assert.strictEqual(S.kiosk.step, 'prenotice', '번호판보다 팝업 먼저');
  assert.ok(view.innerHTML.includes('class="npop"') && view.innerHTML.includes('새 지시·공지를 먼저 읽어 주세요') && view.innerHTML.includes('1/2') && view.innerHTML.includes('data-act="preOk"'), '팝업: 제목·1/2·확인 단추');
  const first = preNoticeList(B)[0];
  assert.ok(view.innerHTML.includes(first.title) && view.innerHTML.includes(first.title + ' 본문'), '공지 내용이 팝업에');
  ACT.preOk({ id:first.id }); render(true);
  assert.ok(S.kiosk.step === 'prenotice' && view.innerHTML.includes('2/2') && !view.innerHTML.includes(first.title + ' 본문'), '다음 공지 2/2');
  // [나중에] 누르면 읽음 안 남음
  ACT.kCancel(); await tick();
  assert.strictEqual(unreadFor(B).length, 2, '나중에 = 읽음 안 남김 (다음에 다시 뜸)');
  ACT.kPick({ id:B.id });
  while (S.kiosk.step === 'prenotice') ACT.preOk({ id:preNoticeList(B)[0].id });
  assert.strictEqual(S.kiosk.step, 'pin', '다 읽으면 번호판'); await tick();
  assert.strictEqual(unreadFor(B).length, 2, '번호 넣기 전에는 아직 저장 안 함 (다른 사람이 대신 누르는 것 막기)');
  for (const d of '0000') padPress('staff', d);
  assert.ok(S.kiosk.step === 'pin' && S.kiosk.err, '틀린 번호'); await tick(); assert.strictEqual(unreadFor(B).length, 2);
  for (const d of String(B.pin)) padPress('staff', d); await tick();
  assert.ok(S.kiosk.step === 'action' || S.kiosk.step === 'phonereq', '번호 맞으면 출퇴근 단추');
  assert.strictEqual(unreadFor(B).length, 0, '번호 맞으면 2건 모두 읽음');
  assert.strictEqual(S.treads.get('n1_' + B.id).where, 'tablet', '어디서 읽었는지');
  S.kiosk.step = 'action'; await ACT.kIn();
  assert.notStrictEqual(kNextStep(B), 'notices', '출근 뒤 공지 단계에 다시 안 나옴');
  console.log('태블릿 팝업 통과');

  // ----- 2. 안 읽은 게 없으면 바로 번호판 -----
  resetKiosk(); ACT.kPick({ id:B.id }); assert.strictEqual(S.kiosk.step, 'pin', '안 읽은 공지 없으면 바로 번호판');
  resetKiosk();

  // ----- 3. 마스터 번호로 들어가면 읽음 안 남김 → 출근 뒤 공지 단계 -----
  ACT.kPick({ id:C.id }); while (S.kiosk.step === 'prenotice') ACT.preOk({ id:preNoticeList(C)[0].id });
  for (const d of '9876') padPress('staff', d); await tick();
  assert.ok(S.kiosk.master && S.kiosk.step === 'action', '마스터 번호 통과');
  assert.strictEqual(unreadFor(C).length, 2, '사장님이 대신 들어가면 직원 읽음으로 안 남김');
  await ACT.kIn(); assert.strictEqual(kNextStep(C), 'notices', '출근 뒤 공지 단계로 다시 보여 줌');
  resetKiosk();

  // ----- 4. 번호 없는 직원: 팝업 다 읽으면 바로 저장·출퇴근 단추 -----
  ACT.kPick({ id:NP.id }); assert.strictEqual(S.kiosk.step, 'prenotice');
  while (S.kiosk.step === 'prenotice') ACT.preOk({ id:preNoticeList(NP)[0].id });
  await tick();
  assert.ok(S.kiosk.step === 'action' && unreadFor(NP).length === 0, '번호 없는 직원은 바로 읽음 저장');
  resetKiosk();

  // ----- 5. 그사이 공지가 내려가면 팝업 없이 다음 단계 -----
  await addNotice('n3', '새 공지 하나');
  ACT.kPick({ id:B.id }); assert.strictEqual(S.kiosk.step, 'prenotice');
  await S.db.collection('tasks').doc('n3').delete(); render(true);
  assert.strictEqual(S.kiosk.step, 'pin', '공지가 지워졌으면 번호판으로');
  resetKiosk();

  // ----- 6. 직원 휴대폰: [출근] 누르면 팝업 → 다 읽으면 바로 출근 도장 -----
  await addNotice('n4', '휴대폰 공지');
  S.mode = 'phone'; S.phone.staffId = A.id; resetKiosk();
  if (phoneCanPunch(A)){
    await ACT.phIn(); render(true);
    assert.ok(S.kiosk.step === 'prenotice' && S.kiosk.afterNotice === 'phonein' && view.innerHTML.includes('class="npop"'), '휴대폰 출근 전 팝업');
    assert.ok(!getPunch(A.id, today)?.in, '아직 출근 기록 안 함');
    while (S.kiosk.step === 'prenotice'){ const p = ACT.preOk({ id:preNoticeList(A)[0].id }); if (p) await p; }
    await tick();
    assert.ok(getPunch(A.id, today)?.in, '다 읽으면 바로 출근 기록');
    assert.strictEqual(unreadFor(A).length, 0, '휴대폰에서 읽음 저장'); assert.strictEqual(S.treads.get('n4_' + A.id).where, 'phone');
    console.log('휴대폰 팝업 통과');
  } else console.log('휴대폰 출근 꺼짐 — 건너뜀');
  console.log('공지 팝업 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
`;
eval(src);
