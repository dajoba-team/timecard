// 한국어 / Tiếng Việt 병기 (직원 화면): 토글, 태블릿·휴대폰 문구, 사장님 화면은 한국어 그대로, 번역 사전 빠짐 검사
const fs = require('fs');
const assert = require('assert');
const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:false, value:'' };
const view = { innerHTML:'' }, top = { innerHTML:'' }, toasts = [];
const ls = new Map();
global.document = { addEventListener(){}, querySelector: s => s === '#view' ? view : s === '#top' ? top : s === '#toasts' ? { prepend: e => toasts.push(e.innerHTML) } : el, querySelectorAll: () => [], createElement: () => ({ ...el, remove(){} }) };
global.window = {}; global.location = { hash:'' }; global.scrollTo = () => {}; global.setInterval = () => 0; global.setTimeout = (f) => 0;
global.localStorage = { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
const html = fs.readFileSync('../public/index.html', 'utf8');
const W = JSON.parse(fs.readFileSync('writes.json', 'utf8'));
let src = fs.readFileSync('chk.js', 'utf8').replace(/\nboot\(\);\s*$/, '\n');
src += `
const mk = (c, id) => ({ set: async d => { if (c.includes('punches')) S.months[ymOf(todayStr())].set(id, { id, ...d }); }, update: async d => {}, delete: async () => {} });
S.db = { doc: p => mk(p, p), collection: c => ({ doc: id => mk(c, id), onSnapshot: () => () => {} }) };
S.config = { ...W[0].data, photo:{ on:false }, geo:{ on:false } };
S.staff = W.filter(w => w.collection === 'staff').map(w => ({ id:w.doc_id, ...w.data }));
S.months[ymOf(todayStr())] = new Map(); S.monthLoaded[ymOf(todayStr())] = true; S.ready.staff = true; S.ready.tasks = true; S.ready.treads = true;
const [A] = S.staff;
S.tasks = [{ id:'n1', kind:'notice', title:'지각·결근 규정 안내', body:'무단 지각이 3회가 되면 퇴사 처리될 수 있습니다.', titleVi:NOTICE_TEMPLATES.attendance.titleVi, bodyVi:NOTICE_TEMPLATES.attendance.bodyVi, pinned:true, target:{ mode:'all' }, active:true, createdAt:Date.now() },
  { id:'t1', kind:'task', title:'그린홍합 손질', target:{ mode:'all' }, repeat:'daily', due:'23:59', minPhotos:1, active:true, start:todayStr(), createdAt:Date.now() }];
(async () => {
  // 1. 처음엔 베트남어(병기)가 먼저, 버튼도 Tiếng Việt가 앞
  S.mode = 'kiosk'; resetKiosk(); render(true);
  assert.strictEqual(S.lang, 'vi', '처음엔 베트남어');
  assert.ok(view.innerHTML.includes('Chạm vào tên của bạn'), '처음 화면 베트남어');
  assert.ok(top.innerHTML.indexOf('Tiếng Việt') < top.innerHTML.indexOf('한국어'), '버튼 순서: Tiếng Việt | 한국어');
  // 한국어로 바꾸면 한국어만, 기기에 기억
  ACT.lang({ v:'ko' });
  assert.strictEqual(ls.get('tc.uilang'), 'ko', '기기에 기억');
  assert.ok(view.innerHTML.includes('본인 이름을 누르고') && !view.innerHTML.includes('Chạm vào') && !view.innerHTML.includes('kosub'), '한국어일 땐 한국어만');

  // 2. 다시 Tiếng Việt → 베트남어 크게 + 한국어 작게
  ACT.lang({ v:'vi' });
  assert.strictEqual(ls.get('tc.uilang'), 'vi', '기기에 기억');
  assert.ok(view.innerHTML.includes('Chạm vào tên của bạn') && view.innerHTML.includes('<span class="kosub">본인 이름을 누르고'), '첫 화면 병기');
  assert.ok(/Thứ \\S+, \\d+\\/\\d+\\/\\d{4}/.test(view.innerHTML), '베트남어 날짜');
  assert.ok(view.innerHTML.includes('📌 Thông báo') && view.innerHTML.includes('Thông báo quy định đi muộn'), '첫 화면 공고도 베트남어 제목');
  assert.ok(/Thông báo mới \\d/.test(view.innerHTML), '새 공지 뱃지');
  ACT.kPick({ id:A.id }); render(true);
  assert.strictEqual(S.kiosk.step, 'prenotice', '이름 누르면 안 읽은 공지 팝업 먼저 (v44)');
  assert.ok(view.innerHTML.includes('class="npop"') && view.innerHTML.includes('hãy đọc chỉ thị/thông báo mới trước') && view.innerHTML.includes('Tôi đã đọc và xác nhận'), '팝업 베트남어');
  assert.ok(view.innerHTML.includes('quán xin thông báo quy định') && view.innerHTML.includes('kobody'), '팝업 공지 본문: 베트남어 + 한국어');
  while (S.kiosk.step === 'prenotice'){ ACT.preOk({ id: preNoticeList(A)[0].id }); render(true); }
  assert.ok(view.innerHTML.includes('Nhập mã cá nhân 4 số') && view.innerHTML.includes('>Xóa<'), '팝업 다음 번호판');
  for (const d of String(A.pin)) padPress('staff', d);
  for (let i = 0; i < 5; i++) await null;
  assert.deepStrictEqual(S.kiosk.preOk, [], '번호가 맞으면 읽음 저장 (이 시험의 가짜 저장소는 읽음을 안 남김 — 저장은 notice-popup.test.js)');
  assert.ok(view.innerHTML.includes('Vào ca<span class="kosub">출근하기</span>'), '출근 단추 병기');
  assert.ok(view.innerHTML.includes('Công việc tháng này của tôi') && view.innerHTML.includes('Giờ làm'), '이번 달 요약');
  await ACT.kIn();
  assert.strictEqual(S.kiosk.step, 'done');
  assert.ok(view.innerHTML.includes('VÀO CA<span class="kosub">출근</span>'), '출근 도장 병기');
  assert.ok(/Dự kiến tan ca|Đã ghi là làm thêm|Bạn đến muộn/.test(view.innerHTML), '도장 아래 안내 베트남어');
  // 출근 뒤 공지 단계(마스터 번호로 들어온 경우 등)도 베트남어
  ACT.kNext(); render(true);
  assert.strictEqual(S.kiosk.step, 'notices');
  assert.ok(view.innerHTML.includes('có 2 thông báo mới') || view.innerHTML.includes('có 1 thông báo mới'), '공지 확인 제목');
  assert.ok(view.innerHTML.includes('quán xin thông báo quy định') && view.innerHTML.includes('kobody'), '공지 본문: 베트남어 + 한국어');
  assert.ok(view.innerHTML.includes('Đã hiểu'), '확인 단추');
  // 사전에 있는 토스트는 병기
  toast('출근 기록이 없어요', '사장님께 확인을 요청하세요.');
  assert.ok(toasts.at(-1).includes('Không có bản ghi vào ca · 출근 기록이 없어요'), '토스트 병기');

  // 3. 직원 휴대폰
  S.mode = 'phone'; S.phone.staffId = null; resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('Kết nối điện thoại của tôi'), '휴대폰 연결 화면');
  S.phone.staffId = A.id; render(true);
  assert.ok(view.innerHTML.includes('Việc hôm nay') && view.innerHTML.includes('Người khác'), '휴대폰 첫 화면');
  ACT.phOpen({ id:'t1' }); render(true);
  assert.ok(view.innerHTML.includes('Chụp ảnh') && view.innerHTML.includes('Gửi cho chủ quán'), '사진 보고 화면');
  ACT.phBack();

  // 4. 사장님 화면은 Tiếng Việt를 골라도 한국어 그대로
  S.mode = 'owner'; S.unlocked = true; S.tab = 'tasks'; render(true);
  assert.ok(!/Vào ca|Thông báo mới|kosub/.test(view.innerHTML), '사장님 화면은 한국어');
  assert.ok(!top.innerHTML.includes('data-act="lang"'), '사장님 화면엔 언어 버튼 없음');
  toast('저장하지 못했어요', ''); assert.ok(!toasts.at(-1).includes('Không lưu'), '사장님 화면 토스트는 한국어');

  // 5. 다시 한국어
  S.mode = 'kiosk'; ACT.lang({ v:'ko' }); resetKiosk(); render(true);
  assert.ok(!view.innerHTML.includes('Chạm vào') && !view.innerHTML.includes('kosub'), '한국어로 돌아옴');
  console.log('언어 전환 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
`;
// 번역 사전 빠짐 검사: 화면 코드의 T('…') / TV('…') 문구가 모두 VI 사전에 있어야 해요
const viBlock = html.slice(html.indexOf('const VI = {'), html.indexOf('const VI_DAYS'));
const keys = new Set([...viBlock.matchAll(/'((?:[^'\\]|\\.)*)':'/g)].map(m => m[1]));
const used = [...html.matchAll(/\bT[V]?\('((?:[^'\\]|\\.)+)'/g)].map(m => m[1]);
const missing = [...new Set(used)].filter(k => !keys.has(k));
assert.deepStrictEqual(missing, [], '번역 사전에 없는 문구: ' + missing.join(' | '));
console.log(`번역 사전 검사: 화면 문구 ${new Set(used).size}개 모두 있음 (사전 ${keys.size}개)`);
eval(src);
