// 업무 지시·사진 보고 (요청서 3번): 지시 만들기, 보고 상태 계산, 태블릿 출근 뒤 공지·퇴근 때 안 보낸 보고 안내,
// 직원 휴대폰 연결·출근·사진 보내기, 사장님 확인/다시 요청, 60일 지난 업무 사진 정리
const assert = require('assert');
const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:false, value:'' };
const view = { innerHTML:'' };
let toasts = [], cleaned = [], uploads = [];
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
window.tcStore = { use: async n => n === 'assets' ? { upload: async (b, o) => { const id = (o.prefix || '') + 'x' + uploads.length; uploads.push(id); return { id }; }, delete: async () => {}, cleanOld: async (p, d) => { cleaned.push([p, d]); return 3; } } : null };
toast = (a, b) => toasts.push(a + (b ? ' / ' + b : ''));
S.config = W[0].data;
S.staff = W.filter(w => w.collection === 'staff').map(w => ({ id:w.doc_id, ...w.data }));
const [A, B, C] = S.staff;
A.position = '주방'; B.position = '홀'; C.position = '홀'; A.phonePunch = true;
S.ready.staff = true;
S.lang = 'ko';   // 이 시험은 한국어 문구로 확인 (베트남어는 lang.test.js)
const today = todayStr(), ym = ymOf(today);
needMonth(ym); bootTasks(S.db);
(async () => {
  // ----- 사장님: 지시 만들기 -----
  S.mode = 'owner'; S.unlocked = true; S.tab = 'tasks';
  readTForm = () => {};   // 화면 입력 대신 아래에서 직접 채움
  ACT.trNew();
  Object.assign(S.tform, { kind:'task', title:'그린홍합 손질', body:'촉수 제거 후 사진', target:{ mode:'pos', pos:'주방', ids:[] }, repeat:'daily', due:'00:00', minPhotos:1 });
  await ACT.trSave();
  ACT.trNew(); Object.assign(S.tform, { kind:'notice', title:'대청소 안내', target:{ mode:'all', ids:[] } });
  await ACT.trSave();
  ACT.trNew(); Object.assign(S.tform, { kind:'task', title:'', target:{ mode:'all', ids:[] } });
  await ACT.trSave();
  assert.ok(toasts.includes('제목을 넣어 주세요'), '제목 없으면 저장 안 함');
  S.tform = null; S.editing = null;
  assert.strictEqual(S.tasks.length, 2, '지시 2개 저장');
  const task = S.tasks.find(t => t.kind === 'task'), notice = S.tasks.find(t => t.kind === 'notice');
  assert.deepStrictEqual(assignees(task).map(s => s.id), [A.id], '주방 전체 = 주방 직원만');
  assert.strictEqual(assignees(notice).length, activeStaff().length, '전체 직원');
  assert.ok(appliesOn(task, today) && !appliesOn(notice, today), '매일 업무는 오늘 해당, 공지는 보고 없음');
  assert.strictEqual(trStatus(task, A, today).s, 'late', '마감(00:00) 지났고 보고 없음 = 마감 지남');
  assert.deepStrictEqual(unreadFor(A).map(t => t.id).sort(), [task.id, notice.id].sort(), 'A는 2건 안 읽음');
  assert.deepStrictEqual(unreadFor(B).map(t => t.id), [notice.id], 'B는 공지만');
  render(true);
  assert.ok(view.innerHTML.includes('그린홍합 손질') && view.innerHTML.includes('확인할 보고'), '사장님 업무 보고 탭');
  console.log('지시 만들기 통과');

  // ----- 가게 태블릿: 출근 → 공지 → 오늘 할 일 -----
  S.mode = 'kiosk'; resetKiosk();
  ACT.kPick({ id:A.id }); for (const d of String(A.pin)) padPress('staff', d);
  render(true);
  assert.ok(/새 공지/.test((() => { resetKiosk(); render(true); return view.innerHTML; })()), '이름 카드에 새 공지 표시');
  ACT.kPick({ id:A.id }); for (const d of String(A.pin)) padPress('staff', d);
  await ACT.kIn();
  assert.strictEqual(S.kiosk.step, 'done'); assert.ok(S.kiosk.didIn);
  assert.ok(getPunch(A.id, today).in, '출근 시각 먼저 저장 (공지 안 읽어도)');
  render(true); assert.ok(view.innerHTML.includes('새 공지 2건 확인하기'), '도장 화면에 다음 단계');
  ACT.kNext(); assert.strictEqual(S.kiosk.step, 'notices');
  render(true); assert.ok(view.innerHTML.includes('대청소 안내') && view.innerHTML.includes('trReadAll'));
  await ACT.trReadOne({ id: notice.id });
  assert.ok(isRead(notice, A) && S.treads.get(notice.id + '_' + A.id).where === 'tablet', '하나씩 확인 (어디서 읽었는지)');
  await ACT.trReadAll();
  assert.strictEqual(unreadFor(A).length, 0); assert.strictEqual(S.kiosk.step, 'remind', '공지 다음은 오늘 할 일 안내');
  render(true); assert.ok(view.innerHTML.includes('오늘 휴대폰으로 보낼 사진 보고'));
  ACT.kCancel();
  // 퇴근: 안 보낸 보고 안내 → 그래도 퇴근
  ACT.kPick({ id:A.id }); for (const d of String(A.pin)) padPress('staff', d);
  await ACT.kOut();
  assert.strictEqual(S.kiosk.step, 'outwarn', '안 보낸 보고가 있으면 먼저 안내');
  assert.ok(!getPunch(A.id, today).out, '안내만, 아직 퇴근 기록 안 함');
  await ACT.kOutGo();
  assert.ok(getPunch(A.id, today).out, '그래도 퇴근하기 = 퇴근 기록');
  console.log('태블릿 흐름 통과');

  // ----- 직원 휴대폰: 연결 → 사진 보고 -----
  col('months/' + ym + '/punches').delete(A.id + '_' + today); emitCol('months/' + ym + '/punches');
  S.mode = 'phone'; resetKiosk(); S.phone.staffId = null;
  render(true); assert.ok(view.innerHTML.includes('내 휴대폰 연결'));
  ACT.phPick({ id:A.id }); padPress('phone', '9'); padPress('phone', '9'); padPress('phone', '9'); padPress('phone', '9');
  assert.ok(!S.phone.staffId && S.phone.err, '틀린 번호는 거절');
  for (const d of String(A.pin)) padPress('phone', d);
  assert.strictEqual(S.phone.staffId, A.id); assert.strictEqual(ls.get('tc.phoneStaff'), A.id, '이 휴대폰에 기억');
  render(true);
  assert.ok(view.innerHTML.includes('data-act="phIn"'), '휴대폰 출퇴근 허용 직원은 출근 단추');
  await ACT.phIn();
  assert.strictEqual(getPunch(A.id, today).inVia, 'phone', '휴대폰 출근 표시');
  resetKiosk();
  ACT.phOpen({ id: task.id });
  assert.strictEqual(S.editing, 'phone');
  render(true); assert.ok(view.innerHTML.includes('사진 찍기') && /data-act="phSend" disabled/.test(view.innerHTML), '사진 없으면 보내기 막힘');
  S.phone.shots.push({ blob:{ size:10 }, url:'blob:x', old:true }); el.value = '3kg 손질';   // 한마디 칸
  global.URL = { revokeObjectURL(){} };
  await ACT.phSend();
  const rep = getRep(task.id, A.id, today);
  assert.ok(rep && rep.status === 'sent' && rep.round === 1 && rep.oldPhoto === true && rep.note === '3kg 손질', '보고 저장');
  assert.ok(rep.photos[0].startsWith('w_'), '업무 사진은 work 폴더(w_)');
  assert.strictEqual(S.phone.step, 'done');
  ACT.phBack();
  // 매장 직원(허용 안 됨): 출퇴근 단추 없음
  S.phone.staffId = B.id; render(true);
  assert.ok(!view.innerHTML.includes('data-act="phIn"') && view.innerHTML.includes('가게 태블릿'), '매장 직원은 태블릿 안내');
  console.log('직원 휴대폰 통과');

  // ----- 사장님: 확인 / 다시 요청 -----
  S.mode = 'owner'; S.editing = null;
  assert.strictEqual(trWaiting().length, 1, '확인할 보고 1건');
  const key = trKey(task.id, A.id, today);
  global.$ = undefined;
  ACT.trRedoOpen({ id:key });
  el.value = '촉수가 보여요';
  await ACT.trRedoSend({ id:key, ds:today });
  assert.strictEqual(getRep(task.id, A.id, today).status, 'redo'); assert.strictEqual(getRep(task.id, A.id, today).ownerNote, '촉수가 보여요');
  assert.strictEqual(trStatus(task, A, today).s, 'redo'); assert.deepStrictEqual(unsentFor(A).map(t => t.id), [task.id], '다시 요청은 안 보낸 보고로');
  S.mode = 'phone'; S.phone.staffId = A.id; render(true);
  assert.ok(view.innerHTML.includes('촉수가 보여요'), '휴대폰 오늘 할 일에 사장님 메모');
  S.phone.open = task.id; S.phone.shots = [{ blob:{ size:1 }, url:'u', old:false }]; await ACT.phSend();
  assert.strictEqual(getRep(task.id, A.id, today).round, 2, '다시 보내면 회차 올라감');
  S.mode = 'owner';
  await ACT.trOk({ id:key, ds:today });
  assert.strictEqual(getRep(task.id, A.id, today).status, 'ok'); assert.strictEqual(trWaiting().length, 0);
  console.log('확인·다시 요청 통과');

  // ----- 첫 화면 공고 (공지 + 고정) -----
  S.mode = 'owner'; S.tform = null; ACT.trNew();
  ACT.trTpl({ v:'attendance' });
  assert.strictEqual(S.tform.kind, 'notice'); assert.ok(S.tform.pinned, '예시 문구는 공고로 고정');
  assert.ok(/무단 지각이 3회/.test(S.tform.body) && /무단결근이 2회/.test(S.tform.body), '예시 문구 내용');
  await ACT.trSave();
  const pin = S.tasks.find(t => t.title === '지각·결근 규정 안내');
  assert.ok(pin && pin.pinned === true && pin.kind === 'notice', '공고 저장');
  S.mode = 'kiosk'; resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('📌 공고') && view.innerHTML.includes('무단결근이 2회'), '태블릿 첫 화면에 공고');
  assert.ok(view.innerHTML.indexOf('📌 공고') < view.innerHTML.indexOf('kPick'), '이름 카드보다 위');
  S.mode = 'phone'; S.phone.staffId = B.id; S.phone.open = null; S.editing = null; resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('지각·결근 규정 안내'), '직원 휴대폰 첫 화면에도');
  assert.ok(unreadFor(B).some(t => t.id === pin.id), '출근 뒤 공지 확인에도 들어감 (읽음 기록)');
  S.mode = 'owner'; await ACT.trPinToggle({ id: pin.id });
  assert.strictEqual(taskById(pin.id).pinned, false);
  S.mode = 'kiosk'; render(true); assert.ok(!view.innerHTML.includes('📌 공고'), '내리면 첫 화면에서 빠짐');
  // 쓰던 내용이 있으면 예시 문구로 바로 덮지 않음
  S.mode = 'owner'; ACT.trNew(); S.tform.title = '내 공지'; ACT.trTpl({ v:'attendance' });
  assert.strictEqual(S.tform.title, '내 공지', '한 번 누르면 확인만'); ACT.trTpl({ v:'attendance' }); assert.strictEqual(S.tform.title, '지각·결근 규정 안내');
  S.tform = null; S.editing = null;
  console.log('첫 화면 공고 통과');

  // ----- 지시 멈추기 / 60일 사진 정리 / 휴대폰 표시 -----
  await ACT.trToggle({ id: task.id });
  assert.strictEqual(taskById(task.id).active, false); assert.strictEqual(todayTasksFor(A).length, 0, '멈춘 지시는 오늘 할 일에서 빠짐');
  await cleanWorkPhotos();
  assert.deepStrictEqual(cleaned, [['w_', 60]], '60일 지난 업무 사진 정리');
  await cleanWorkPhotos(); assert.strictEqual(cleaned.length, 1, '하루 한 번만');
  assert.ok(/휴대폰/.test(statusChips({ status:'done', p:{ inVia:'phone' } })), '기록에 휴대폰 표시');
  console.log('정리 통과');

  // ----- 자동 번역 (Claude API 서버 함수 tc-translate) -----
  const asked = [];
  window.tcStore.invoke = async (fn, b) => { asked.push([fn, b]); return { translations: b.texts.map(x => x ? '[vi] ' + x : '') }; };
  S.mode = 'owner'; ACT.trNew(); Object.assign(S.tform, { kind:'notice', title:'내일 대청소', body:'10시까지 와 주세요', target:{ mode:'all', ids:[] } });
  await ACT.trSave();
  let nt = S.tasks.find(t => t.title === '내일 대청소');
  assert.ok(nt.titleVi === '[vi] 내일 대청소' && nt.bodyVi === '[vi] 10시까지 와 주세요' && asked.at(-1)[0] === 'tc-translate' && asked.at(-1)[1].to === 'vi', '저장할 때 베트남어 자동 번역');
  // 베트남어를 직접 넣었으면 번역하지 않음
  const n0 = asked.length;
  ACT.trNew(); Object.assign(S.tform, { kind:'notice', title:'직접 번역', titleVi:'Tự dịch', body:'', bodyVi:'', target:{ mode:'all', ids:[] } });
  await ACT.trSave(); assert.strictEqual(asked.length, n0, '직접 넣은 베트남어는 그대로');
  // 번역 버튼
  ACT.trNew(); Object.assign(S.tform, { kind:'notice', title:'창문 닦기', body:'', target:{ mode:'all', ids:[] } });
  await ACT.trTranslate(); assert.strictEqual(S.tform.titleVi, '[vi] 창문 닦기', '자동 번역 버튼'); S.tform = null; S.editing = null;
  // 번역이 안 되면 한국어만 저장 + 안내
  window.tcStore.invoke = async () => { throw new Error('번역 꺼짐'); };
  const w = console.warn; console.warn = () => {};
  ACT.trNew(); Object.assign(S.tform, { kind:'notice', title:'번역 안 됨 공지', body:'', target:{ mode:'all', ids:[] } });
  await ACT.trSave(); console.warn = w;
  nt = S.tasks.find(t => t.title === '번역 안 됨 공지');
  assert.ok(nt && !nt.titleVi && toasts.some(x => x.startsWith('자동 번역을 못 했어요')), '번역 실패해도 한국어로 저장');
  console.log('자동 번역 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
`;
eval(src);
