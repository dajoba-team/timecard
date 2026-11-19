// 뒤로 · 처음으로: 직원 화면(태블릿·휴대폰)과 사장님 화면, 휴대폰 뒤로 가기 버튼
const fs = require('fs');
const assert = require('assert');
const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:false, value:'' };
const view = { innerHTML:'' };
let pushed = 0, popHandler = null;
global.document = { addEventListener(){}, querySelector: s => s === '#view' ? view : s === '#toasts' ? { prepend(){} } : el, querySelectorAll: () => [], createElement: () => ({ ...el, remove(){} }) };
global.window = { addEventListener: (t, f) => { if (t === 'popstate') popHandler = f; } };
global.history = { state:null, pushState(s){ this.state = s; pushed++; } };
global.location = { hash:'' }; global.scrollTo = () => {}; global.setInterval = () => 0;
global.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
const W = JSON.parse(fs.readFileSync('writes.json', 'utf8'));
let src = fs.readFileSync('chk.js', 'utf8').replace(/\nboot\(\);\s*$/, '\n');
src += `
const mk = (c, id) => ({ set: async d => { if (c.includes('punches')) S.months[ymOf(todayStr())].set(id, { id, ...d }); }, update: async () => {}, delete: async () => {} });
S.db = { doc: p => mk(p, p), collection: c => ({ doc: id => mk(c, id), onSnapshot: () => () => {} }) };
S.config = { ...W[0].data, photo:{ on:true }, geo:{ on:false } };
S.staff = W.filter(w => w.collection === 'staff').map(w => ({ id:w.doc_id, ...w.data }));
S.months[ymOf(todayStr())] = new Map(); S.monthLoaded[ymOf(todayStr())] = true; S.ready.staff = true; S.ready.tasks = true; S.ready.treads = true;
S.tasks = [{ id:'t1', kind:'task', title:'그린홍합 손질', target:{ mode:'all' }, repeat:'daily', due:'23:59', minPhotos:1, active:true, start:todayStr(), createdAt:1 }];
const [A] = S.staff; A.phonePunch = true;
const has = () => view.innerHTML.includes('data-act="navBack"') && view.innerHTML.includes('data-act="navHome"');
(async () => {
  // ----- 가게 태블릿 -----
  S.mode = 'kiosk'; resetKiosk(); render(true);
  assert.ok(!has(), '첫 화면엔 버튼 없음');
  ACT.kPick({ id:A.id }); render(true);
  assert.ok(has(), '번호 화면에 뒤로·처음으로');
  ACT.navBack(); assert.strictEqual(S.kiosk.step, 'list', '번호 → 뒤로 = 첫 화면');
  ACT.kPick({ id:A.id }); for (const d of String(A.pin)) padPress('staff', d);
  assert.strictEqual(S.kiosk.step, 'action'); assert.ok(has());
  global.navigator = { mediaDevices:null };
  await ACT.kIn(); assert.strictEqual(S.kiosk.step, 'photo', '사진 단계');
  assert.ok(has(), '사진 화면에도');
  ACT.navBack(); assert.strictEqual(S.kiosk.step, 'action', '사진 → 뒤로 = 출근 단추');
  ACT.navHome(); assert.strictEqual(S.kiosk.step, 'list', '처음으로');
  assert.ok(pushed >= 1, '휴대폰 뒤로 가기 대비 기록');
  // 휴대폰·브라우저 뒤로 가기 버튼
  ACT.kPick({ id:A.id }); render(true); popHandler(); assert.strictEqual(S.kiosk.step, 'list', '뒤로 가기 버튼 = 앱 안에서 뒤로');
  // 베트남어
  S.lang = 'vi'; ACT.kPick({ id:A.id }); render(true);
  assert.ok(view.innerHTML.includes('← Quay lại') && view.innerHTML.includes('⌂ Màn hình đầu'), '베트남어 버튼');
  S.lang = 'ko'; ACT.navHome();

  // ----- 직원 휴대폰 -----
  S.mode = 'phone'; S.phone.staffId = null; resetKiosk(); render(true);
  assert.ok(!has(), '연결 화면(이름 고르기)은 첫 화면');
  ACT.phPick({ id:A.id }); render(true); assert.ok(has(), '번호 넣기 화면');
  ACT.navBack(); assert.strictEqual(S.phone.pickId, null, '번호 → 뒤로 = 이름 고르기');
  S.phone.staffId = A.id; render(true); assert.ok(!has(), '내 첫 화면엔 버튼 없음');
  ACT.phTab({ v:'notices' }); assert.ok(has(), '공지 탭'); ACT.navBack(); assert.strictEqual(S.phone.tab, 'tasks', '공지 탭 → 뒤로 = 오늘 할 일');
  ACT.phOpen({ id:'t1' }); render(true); assert.ok(has(), '업무 화면');
  ACT.navBack(); assert.strictEqual(S.phone.open, null, '업무 → 뒤로 = 목록');
  ACT.phOpen({ id:'t1' }); ACT.navHome(); assert.ok(!S.phone.open && S.phone.tab === 'tasks' && !S.editing, '처음으로');

  // ----- 사장님 화면 -----
  S.mode = 'owner'; S.unlocked = true; S.tab = 'now'; S.editing = null; render(true);
  assert.ok(!has(), '현황(첫 화면)엔 버튼 없음');
  ACT.tab({ v:'records' }); assert.ok(has(), '다른 탭엔 버튼');
  ACT.tab({ v:'staff' }); ACT.editStaff({ id:A.id }); render(true);
  assert.strictEqual(S.editing, 'staff:' + A.id);
  ACT.navBack(); assert.strictEqual(S.editing, null, '입력 화면 → 뒤로 = 닫기'); assert.strictEqual(S.tab, 'staff');
  ACT.navBack(); assert.strictEqual(S.tab, 'records', '한 번 더 뒤로 = 전에 보던 탭');
  ACT.navBack(); assert.strictEqual(S.tab, 'now', '또 뒤로 = 현황');
  ACT.tab({ v:'tasks' }); ACT.trNew(); assert.ok(S.tform);
  ACT.navHome(); assert.ok(S.tab === 'now' && !S.editing && !S.tform, '처음으로 = 현황, 쓰던 지시 닫힘');
  // 잠금 화면엔 버튼 없음
  S.unlocked = false; render(true); assert.ok(!has(), '잠금 화면엔 없음');
  console.log('뒤로·처음으로 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
`;
eval(src);
