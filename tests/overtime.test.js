// 추가근무 요청·승인 (v27): 승인제 켜기, 미리 요청 → 승인, 승인보다 더 일하면 퇴근 때 이유, 건너뛰기('보고 없음'),
// 일부 승인·불인정, 확인 안 한 추가근무는 급여에 안 들어감, 직원 휴대폰, 베트남어, 슬랙 규칙, 백업
const fs = require('fs');
const assert = require('assert');
// 시계: 2026-11-20(금) 한국시간, 시험 중에 옮겨 가며 씀
const RealDate = Date;
let NOW = 0;
const kt = (hm, ds = '2026-11-20') => new RealDate(`${ds}T${hm}:00+09:00`).getTime();
NOW = kt('15:00');
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
  if (c === 'ot'){ if (docs[p]) S.ots.set(id, docs[p]); else S.ots.delete(id); }
}
const mk = p => ({ set: async d => { docs[p] = JSON.parse(JSON.stringify(d)); apply(p); }, update: async d => { docs[p] = { ...docs[p], ...JSON.parse(JSON.stringify(d)) }; apply(p); }, delete: async () => { delete docs[p]; apply(p); } });
S.db = { doc: p => mk(p), collection: c => ({ doc: id => mk(c + '/' + id), onSnapshot: () => () => {} }) };
window.tcStore = { invoke: async (fn, b) => ({ translations: b.texts.map(x => '[' + b.to + '] ' + x) }) };
const day = { on:true, start:'09:00', end:'18:00', brk:60 };
S.config = { graceMin:5, otUnit:10, earlyClamp:true, photo:{ on:false }, geo:{ on:false }, ot:{ on:false, since:'' } };
S.staff = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name:['성실', '가나다', '라마바', '사아자'][i], position:'홀', sched:Array(7).fill(day), active:true, hireDate:'2026-01-01', pin:'111' + (i + 1), wage:10030 }));
const [A, B, C, D] = S.staff;
S.months['2026-11'] = new Map(); S.monthLoaded['2026-11'] = true; S.months['2026-10'] = new Map(); S.monthLoaded['2026-10'] = true;
S.ready.staff = true; S.ready.tasks = true; S.ready.treads = true; S.lang = 'ko';
const putPunch = (st, ds, inHm, outHm) => { const id = st.id + '_' + ds; docs['months/2026-11/punches/' + id] = { staffId:st.id, name:st.name, date:ds, kind:'work', in:kt(inHm, ds), out: outHm ? kt(outHm, ds) : null, sched:day, lateMin:0 }; apply('months/2026-11/punches/' + id); };
const T20 = '2026-11-20';
(async () => {
  // ----- 1. 승인제 꺼짐: 예전처럼 더 일한 시간은 모두 추가근무 -----
  putPunch(A, '2026-11-19', '09:00', '18:40');
  let r = dayCalc(A, '2026-11-19');
  assert.strictEqual(r.ot, 40, '꺼져 있으면 40분 모두 추가근무'); assert.ok(!r.otWait);
  // ----- 2. 켜면 켠 날부터: 승인 안 된 추가근무는 확인 대기, 급여에 안 들어감 -----
  S.config.ot = { on:true, since:'2026-11-19' };
  r = dayCalc(A, '2026-11-19');
  assert.ok(r.ot === 0 && r.otRaw === 40 && r.otWait === 40 && r.paid === 480, '확인 전에는 급여에 안 들어감 (정해진 8시간만)');
  putPunch(A, '2026-11-18', '09:00', '18:40');
  assert.strictEqual(dayCalc(A, '2026-11-18').ot, 40, '켜기 전 날짜는 예전 그대로');
  assert.strictEqual(monthSummary(A, '2026-11').otWait, 40, '이달 확인 대기 합계');
  assert.ok(statusChips(dayCalc(A, '2026-11-19')).includes('확인 대기'), '기록 화면에 확인 대기 표시');
  console.log('규칙 통과');

  // ----- 3. 태블릿: 미리 요청 -----
  putPunch(B, T20, '09:00', null);
  S.mode = 'kiosk'; resetKiosk(); Object.assign(S.kiosk, { staffId:'b', step:'action' }); render(true);
  assert.ok(view.innerHTML.includes('data-act="otOpen"'), '근무 중 화면에 추가근무 요청 버튼');
  ACT.otOpen(); render(true);
  assert.strictEqual(S.kiosk.step, 'otreq'); assert.ok(view.innerHTML.includes('얼마나 더 일해야') && view.innerHTML.includes('오늘 예정 퇴근 18:00'));
  ACT.otMin({ v:'60' }); ACT.otWhy({ v:'busy' }); render(true);
  assert.ok(view.innerHTML.includes('퇴근 18:00 → 19:00'), '퇴근 시각 미리 보기');
  el.value = 'Đông khách quá'; await ACT.otSend();
  let o = docs['ot/b_' + T20];
  assert.ok(o && o.kind === 'pre' && o.status === 'pending' && o.reqMin === 60 && o.until === '19:00' && o.reason === 'busy' && o.noteKo === '[ko] Đông khách quá' && o.via === 'tablet', '요청 저장 (베트남어 한마디는 한국어 번역도)');
  assert.strictEqual(S.kiosk.step, 'action', '요청 뒤 원래 화면'); assert.strictEqual(S.editing, null);
  render(true); assert.ok(view.innerHTML.includes('사장님 답을 기다리는 중'), '대기 중 표시');

  // ----- 4. 사장님: 확인할 추가근무 → 승인 -----
  S.mode = 'owner'; S.unlocked = true; S.tab = 'now'; render(true);
  assert.ok(view.innerHTML.includes('확인할 추가근무') && view.innerHTML.includes('미리 요청') && view.innerHTML.includes('승인 +1시간') && view.innerHTML.includes('(번역: [ko] Đông khách quá)'), '현황 맨 위 요청 카드');
  assert.ok(view.innerHTML.includes('보고 없음'), '어제 성실(보고 없음)도 보임');
  await ACT.otOk({ id:'b_' + T20, min:'60' });
  assert.ok(docs['ot/b_' + T20].status === 'approved' && docs['ot/b_' + T20].okMin === 60, '승인');
  // 승인 안에서 퇴근 → 이유 안 물음
  S.mode = 'kiosk'; resetKiosk(); Object.assign(S.kiosk, { staffId:'b', step:'action' }); NOW = kt('18:50');
  render(true); assert.ok(view.innerHTML.includes('추가근무 승인됨 · 퇴근 19:00'), '직원 화면에 승인 표시');
  await ACT.kOut();
  assert.strictEqual(S.kiosk.step, 'done', '승인 시간 안이면 바로 퇴근');
  r = dayCalc(B, T20); assert.ok(r.ot === 50 && !r.otWait, '실제 50분 (승인 60분 안) 급여에');
  console.log('미리 요청 → 승인 통과');

  // ----- 5. 승인보다 더 일함 → 퇴근 때 이유 → 사장님 불인정 -----
  putPunch(C, T20, '09:00', null);
  docs['ot/c_' + T20] = { staffId:'c', date:T20, kind:'pre', status:'approved', reqMin:30, okMin:30, until:'18:30', reason:'close', note:'', at:kt('15:00') }; apply('ot/c_' + T20);
  NOW = kt('19:20'); resetKiosk(); Object.assign(S.kiosk, { staffId:'c', step:'action' });
  await ACT.kOut(); render(true);
  assert.strictEqual(S.kiosk.step, 'ot', '승인보다 더 일하면 이유 묻기');
  assert.ok(view.innerHTML.includes('정해진 시간보다 1시간 20분 더 일했어요') && view.innerHTML.includes('그중 30분은 이미 승인됐어요'), '얼마나 더 일했는지');
  S.lang = 'vi'; render(true);
  assert.ok(view.innerHTML.includes('Bạn đã làm hơn giờ quy định 1 giờ 20 phút.<span class="kosub">정해진 시간보다 1시간 20분 더 일했어요.'), '베트남어 줄·한국어 줄에 각 언어 시간');
  S.lang = 'ko';
  assert.ok(docs['months/2026-11/punches/c_' + T20].out === kt('19:20'), '퇴근은 먼저 저장 (이유를 안 써도)');
  ACT.otWhy({ v:'busy' }); el.value = ''; await ACT.otSend();
  o = docs['ot/c_' + T20];
  assert.ok(o.kind === 'post' && o.status === 'pending' && o.reqMin === 80 && o.okMin === 30 && o.pre.status === 'approved', '먼저 하고 보고로 바뀜 (먼저 받은 승인은 유지)');
  r = dayCalc(C, T20); assert.ok(r.ot === 30 && r.otWait === 50, '승인 30분만 급여, 50분은 확인 대기');
  // 사장님 불인정: 이유 없으면 안 됨
  S.mode = 'owner'; ACT.otNo({ id:'c_' + T20 }); el.value = ''; await ACT.otEditSave();
  assert.ok(toasts.some(x => x.includes('불인정 이유를 적어 주세요')) && docs['ot/c_' + T20].status === 'pending', '불인정은 이유가 있어야');
  el.value = '정리 끝나고 쉬다 감'; await ACT.otEditSave();
  o = docs['ot/c_' + T20];
  assert.ok(o.status === 'rejected' && o.okMin === 30 && o.ownerNoteVi === '[vi] 정리 끝나고 쉬다 감', '불인정 (먼저 받은 30분은 그대로, 이유는 베트남어로)');
  r = dayCalc(C, T20); assert.ok(r.ot === 30 && r.otNo === 50 && !r.otWait, '불인정 50분');
  S.mode = 'phone'; S.phone.staffId = 'c'; resetKiosk(); S.lang = 'vi'; render(true);
  assert.ok(view.innerHTML.includes('Giờ làm thêm không được công nhận') && view.innerHTML.includes('[vi] 정리 끝나고 쉬다 감'), '직원 휴대폰: 결과와 사장님 이유 (베트남어)');
  S.lang = 'ko';
  console.log('승인보다 더 일함 → 불인정 통과');

  // ----- 6. 이유 건너뛰기 → '보고 없음' → 시간 바꿔 승인(일부) -----
  putPunch(D, T20, '09:00', null);
  NOW = kt('18:40'); S.mode = 'kiosk'; resetKiosk(); Object.assign(S.kiosk, { staffId:'d', step:'action' });
  await ACT.kOut(); assert.strictEqual(S.kiosk.step, 'ot');
  ACT.otSkip(); assert.ok(S.kiosk.step === 'done' && !docs['ot/d_' + T20], '건너뛰면 저장 안 함');
  S.mode = 'owner'; render(true);
  assert.ok(otQueue().some(it => it.id === 'd_' + T20 && !it.o), "사장님께 '보고 없음'으로 보임");
  ACT.otTime({ id:'d_' + T20 }); render(true); assert.ok(view.innerHTML.includes('인정할 분'));
  el.value = '20'; await ACT.otEditSave();
  o = docs['ot/d_' + T20];
  assert.ok(o.kind === 'post' && o.status === 'approved' && o.okMin === 20 && o.reqMin === 40 && o.via === 'owner', '사장님이 직접 일부 승인');
  r = dayCalc(D, T20); assert.ok(r.ot === 20 && !r.otWait && r.otNo === 20, '20분만 급여, 나머지는 끝난 것으로 (다시 안 뜸)');
  assert.ok(!otQueue().some(it => it.id === 'd_' + T20), '결정한 건 목록에서 빠짐');
  console.log('보고 없음 → 일부 승인 통과');

  // ----- 7. 근무 집계·인건비 경고: 확인 안 한 것 (성실 어제 40분) -----
  S.month = '2026-11'; S.tab = 'timecard'; render(true);
  assert.ok(view.innerHTML.includes('확인 안 한 추가근무 1건 · 40분') && view.innerHTML.includes('성실 40분'), '근무 집계 경고');
  S.tab = 'payroll'; render(true); assert.ok(view.innerHTML.includes('확인 안 한 추가근무 1건'), '인건비 경고');
  await ACT.otOk({ id:'a_2026-11-19', min:'40' });
  render(true); assert.ok(!view.innerHTML.includes('확인 안 한 추가근무'), '승인하면 경고 사라짐');
  assert.strictEqual(dayCalc(A, '2026-11-19').ot, 40);
  console.log('급여 경고 통과');

  // ----- 8. 직원 휴대폰: 요청 버튼·화면, 베트남어 -----
  S.mode = 'phone'; S.phone.staffId = 'b'; resetKiosk(); NOW = kt('12:00', '2026-11-21');   // 다음 날, 아직 출근 전
  render(true); assert.ok(view.innerHTML.includes('data-act="otOpen"'), '휴대폰 첫 화면 요청 버튼 (출근 전에도)');
  S.lang = 'vi'; ACT.otOpen(); render(true);
  assert.ok(view.innerHTML.includes('Bạn cần làm thêm bao lâu?') && view.innerHTML.includes('Đông khách'), '베트남어 요청 화면');
  ACT.otMin({ v:'30' }); ACT.otWhy({ v:'prep' }); el.value = ''; await ACT.otSend();
  assert.ok(docs['ot/b_2026-11-21'].via === 'phone' && S.kiosk.step === 'list', '휴대폰 요청 뒤 첫 화면');
  S.lang = 'ko';
  // 쓰다 말고 처음 화면으로 돌아가면 입력 상태 정리
  ACT.otOpen(); assert.strictEqual(S.editing, 'ot'); resetKiosk(); assert.ok(!S.otForm && S.editing === null, '처음 화면으로 가면 정리');
  // 승인제 꺼지면 버튼 없음
  S.config.ot = { on:false, since:'' }; render(true); assert.ok(!view.innerHTML.includes('data-act="otOpen"'), '꺼져 있으면 요청 버튼 없음');
  S.config.ot = { on:true, since:'2026-11-19' };
  console.log('직원 휴대폰 통과');

  // ----- 9. 슬랙 규칙 · 백업 -----
  const R = await import('../supabase/functions/tc-notyet-check/rules.mjs');
  const ots = { 'b_2026-11-21': docs['ot/b_2026-11-21'], 'c_2026-11-20': docs['ot/c_2026-11-20'] };
  const ev = R.otEvents({ ots, now: NOW + 1000 });
  assert.ok(ev.length === 1 && ev[0].key.startsWith('ot_b_2026-11-21_pre_'), '대기 중인 것만 알림 (결정한 것 제외)');
  const msg = R.otMessage('우리 가게', ev, { staff: S.staff });
  assert.ok(msg.includes('가나다 추가근무 요청') && msg.includes('+30분 미리 요청') && msg.includes('재료 손질'), '슬랙 문구');
  const Bk = await import('../supabase/functions/tc-notyet-check/backup.mjs');
  const bk = Bk.buildBackup([{ collection:'ot', id:'b_2026-11-21', data: docs['ot/b_2026-11-21'] }, { collection:'config', id:'main', data:{} }], NOW, '가게');
  assert.strictEqual(bk.extra.ot[0].id, 'b_2026-11-21', '자동 백업에 추가근무 기록');
  const L = await import('../scripts/lib.mjs');
  const back = L.backupToDocs({ ...bk, staff:[], punches:{}, contracts:[], reports:{} });
  assert.ok(back.rows.some(x => x.collection === 'ot' && x.id === 'b_2026-11-21'), '백업에서 되살리기');
  console.log('슬랙·백업 통과');

  // ----- 10. 시즌 장식 (v40): 날짜로 자동, 끄기·늘 켜기 -----
  const seasonAt = (ds, mode) => { NOW = kt('12:00', ds); S.config.season = mode; return seasonNow(); };
  assert.strictEqual(seasonAt('2026-11-19', 'auto'), null, '11/19 전엔 없음');
  assert.strictEqual(seasonAt('2026-11-20', 'auto'), 'xmas', '11/20부터 크리스마스');
  assert.strictEqual(seasonAt('2026-12-25', 'auto'), 'xmas');
  assert.strictEqual(seasonAt('2026-12-26', 'auto'), 'newyear', '12/26부터 새해');
  assert.strictEqual(seasonAt('2027-01-05', 'auto'), 'newyear');
  assert.strictEqual(seasonAt('2027-01-06', 'auto'), null, '1/6부터 없음');
  assert.strictEqual(seasonAt('2027-03-01', 'on'), 'xmas', '늘 켜기');
  assert.strictEqual(seasonAt('2026-12-01', 'off'), null, '끄기');
  NOW = kt('12:00', '2026-12-28'); S.config.season = 'auto'; S.mode = 'kiosk'; S.lang = 'ko'; resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('kclock season newyear') && view.innerHTML.includes('Happy New Year 2027') && view.innerHTML.includes('id="ktime"') && !view.innerHTML.includes('class="xtree"'), '새해 장식 (시계는 그대로)');
  NOW = kt('12:00', '2026-12-10'); render(true);
  assert.ok(view.innerHTML.includes('class="xtree"') && view.innerHTML.includes('class="xsnow"') && view.innerHTML.includes('Christmas is Coming Soon!') && !view.innerHTML.includes('Merry Christmas') && !view.innerHTML.includes('Giáng sinh') && view.innerHTML.includes('class="xlights"'), '크리스마스 트리·눈사람·전구·인사말 (12/19까지 Coming Soon)');
  S.lang = 'vi'; render(true); assert.ok(view.innerHTML.includes('Christmas is Coming Soon!') && !view.innerHTML.includes('Giáng sinh'), '베트남어 화면도 같은 영어 문구'); S.lang = 'ko';
  NOW = kt('12:00', '2026-12-19'); render(true); assert.ok(view.innerHTML.includes('Christmas is Coming Soon!'), '12/19까지 Coming Soon');
  NOW = kt('12:00', '2026-12-20'); render(true); assert.ok(view.innerHTML.includes('Merry Christmas 메리크리스마스 !') && !view.innerHTML.includes('Coming Soon'), '12/20부터 Merry Christmas');
  NOW = kt('12:00', '2026-12-25'); render(true); assert.ok(view.innerHTML.includes('Merry Christmas 메리크리스마스 !'), '12/25도 Merry Christmas');
  Object.assign(S.kiosk, { staffId:'a', step:'action' }); render(true); assert.ok(!view.innerHTML.includes('class="xtree"'), '첫 화면에서만');
  S.config.season = 'off'; resetKiosk(); render(true); assert.ok(!view.innerHTML.includes('season'), '끄면 장식 없음');
  console.log('시즌 장식 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
`;
eval(src);
