// 이달의 우수직원 (활동 점수): 감점 없는 점수, 달성률 순위, 칭찬, 확정·축하 공고(베트남어), 직원은 자기 점수와 우수직원만
const fs = require('fs');
const assert = require('assert');
// 시계를 2026-11-20 12:00 (한국시간)으로 고정
const RealDate = Date;
const NOW = new RealDate('2026-11-20T12:00:00+09:00').getTime();
global.Date = class extends RealDate { constructor(...a){ if (a.length) super(...a); else super(NOW); } static now(){ return NOW; } };
const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:true, value:'' };
const view = { innerHTML:'' };
global.document = { addEventListener(){}, querySelector: s => s === '#view' ? view : s === '#toasts' ? { prepend(){} } : el, querySelectorAll: () => [], createElement: () => ({ ...el, remove(){} }) };
global.window = {}; global.location = { hash:'' }; global.scrollTo = () => {}; global.setInterval = () => 0;
global.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
let src = fs.readFileSync('chk.js', 'utf8').replace(/\nboot\(\);\s*$/, '\n');
src += `
const docs = {};
const mk = p => ({ set: async d => { docs[p] = JSON.parse(JSON.stringify(d)); apply(p); }, update: async d => { docs[p] = { ...docs[p], ...JSON.parse(JSON.stringify(d)) }; apply(p); }, delete: async () => { delete docs[p]; apply(p); } });
function apply(p){
  const [c, id] = [p.slice(0, p.lastIndexOf('/')), p.slice(p.lastIndexOf('/') + 1)];
  if (c === 'awards') S.awards = Object.fromEntries(Object.entries(docs).filter(([k]) => k.startsWith('awards/')).map(([k, v]) => [k.slice(7), v]));
  if (c === 'praise') S.praise = Object.entries(docs).filter(([k]) => k.startsWith('praise/')).map(([k, v]) => ({ id:k.slice(7), ...v }));
  if (c === 'tasks') S.tasks = Object.entries(docs).filter(([k]) => k.startsWith('tasks/')).map(([k, v]) => ({ id:k.slice(6), ...v }));
}
S.db = { doc: p => mk(p), collection: c => ({ doc: id => mk(c + '/' + id), onSnapshot: () => () => {} }) };
const day = { on:true, start:'09:00', end:'18:00', brk:60 };
S.config = { graceMin:5, otUnit:10, earlyClamp:true, award:{ amount:50000 } };
S.staff = [
  { id:'a', name:'성실', position:'홀', sched:Array(7).fill(day), active:true, hireDate:'2026-01-01', pin:'1111' },
  { id:'b', name:'가끔늦음', position:'주방', sched:Array(7).fill(day), active:true, hireDate:'2026-01-01', pin:'2222' },
  { id:'c', name:'새직원', position:'홀', sched:Array(7).fill(day), active:true, hireDate:'2026-11-17', pin:'3333' },
];
const t = (ds, hm) => new RealDate(ds + 'T' + hm + ':00+09:00').getTime();
const m = new Map();
for (let d = 1; d <= 20; d++){
  const ds = '2026-11-' + String(d).padStart(2, '0');
  const today = d === 20;
  m.set('a_' + ds, { id:'a_' + ds, staffId:'a', date:ds, kind:'work', in:t(ds, '08:55'), out: today ? null : t(ds, '18:05'), lateMin:0 });
  const late = d % 2 === 1;
  if (d !== 10) m.set('b_' + ds, { id:'b_' + ds, staffId:'b', date:ds, kind:'work', in:t(ds, late ? '09:20' : '08:58'), out: today ? null : t(ds, '18:00'), lateMin: late ? 20 : 0 });   // 10일 결근
  if (d >= 17) m.set('c_' + ds, { id:'c_' + ds, staffId:'c', date:ds, kind:'work', in:t(ds, '08:50'), out: today ? null : t(ds, '18:00'), lateMin:0 });
}
S.months['2026-11'] = m; S.monthLoaded['2026-11'] = true; S.months['2026-10'] = new Map(); S.monthLoaded['2026-10'] = true;
S.ready.staff = true; S.ready.tasks = true; S.ready.treads = true;
S.trSubs['2026-11'] = () => {}; S.trSubs['2026-10'] = () => {}; S.monthSubs['2026-11'] = 1; S.monthSubs['2026-10'] = 1;
(async () => {
  const [A, B, C] = S.staff;
  // ----- 점수 -----
  const a = scoreMonth(A, '2026-11'), b = scoreMonth(B, '2026-11'), c = scoreMonth(C, '2026-11');
  assert.strictEqual(a.rate, 1, '매일 정시 = 달성률 100%');
  assert.strictEqual(a.att.ontime, 20); assert.strictEqual(a.possible, 20 * 10 + 19 * 5, '오늘은 퇴근 전이라 근무 완료 점수 아직');
  assert.strictEqual(a.b.streak, 40, '🔥 5일 연속마다 +10 (20일 → 4번)');
  assert.ok(a.b.week >= 40, '한 주 개근 보너스');
  assert.strictEqual(a.b.month, 0, '이번 달은 아직 안 끝나서 한 달 개근은 아직');
  assert.ok(b.rate < 1 && b.rate > 0.5, '가끔 늦으면 달성률이 낮아짐 (감점은 없음): ' + b.rate);
  assert.ok(b.earned >= 0 && b.att.late === 10 && b.att.absent === 1, '지각 10번, 결근 1번');
  assert.ok(b.earned === b.att.ontime * 10 + b.att.done * 5, '받은 점수 = 정시·완료 점수만 (깎이지 않음)');
  assert.ok(c.possible < AWARD_MIN_POSSIBLE, '새 직원은 근무가 적어 추천에서 빠짐');
  const rank = awardRank('2026-11');
  assert.strictEqual(rank.top.st.id, 'a', '달성률 1위 = 추천');
  // 업무 보고·공지 점수
  S.tasks = [{ id:'t1', kind:'task', title:'홍합', target:{ mode:'all' }, repeat:'daily', due:'15:00', minPhotos:1, active:true, start:'2026-11-19', createdAt:t('2026-11-19', '08:00') }];
  S.trep['2026-11'] = new Map([['t1_a_2026-11-19', { sentAt:t('2026-11-19', '14:00'), status:'ok' }], ['t1_b_2026-11-19', { sentAt:t('2026-11-19', '16:00'), status:'sent' }]]);
  const a2 = scoreMonth(A, '2026-11'), b2 = scoreMonth(B, '2026-11');
  assert.strictEqual(a2.task.sent, 1); assert.strictEqual(a2.task.ok, 1); assert.strictEqual(a2.earned - a.earned, 15, '제때 +10, 확인 +5 (오늘은 마감 전이라 계산 안 함)');
  assert.strictEqual(b2.task.late, 1); assert.strictEqual(b2.earned - b.earned, 5, '늦게 보내도 +5');
  assert.strictEqual(a2.readPossible, 1); assert.strictEqual(a2.read, 0, '공지 안 읽음 = 점수 못 받음');
  S.treads.set('t1_a', { at:1 }); assert.strictEqual(scoreMonth(A, '2026-11').read, 1, '읽으면 +2');
  // 칭찬은 총점에만
  S.month = '2026-11';
  el.value = 'b';   // $('#prStaff') 등
  global.$q = null;
  const before = scoreMonth(B, '2026-11');
  docs['praise/x'] = { staffId:'b', ym:'2026-11', pts:30, note:'손님 칭찬', at:NOW }; apply('praise/x');
  const after = scoreMonth(B, '2026-11');
  assert.strictEqual(after.total - before.total, 30, '칭찬 +30 = 총점'); assert.strictEqual(after.rate, before.rate, '달성률은 그대로');
  console.log('점수 통과');

  // ----- 사장님 화면 -----
  S.tasks = []; S.trep['2026-11'] = new Map();   // 점수표 확인은 출퇴근만으로
  // 달마다 켜기 (v29): 처음엔 꺼져 있어서 선발 화면·직원 점수가 없음
  S.mode = 'owner'; S.unlocked = true; S.tab = 'award'; render(true);
  assert.ok(view.innerHTML.includes('이 달은 우수직원 선발을 하지 않아요') && view.innerHTML.includes('data-act="awMonthToggle"') && !view.innerHTML.includes('추천:') && !view.innerHTML.includes('awDecide'), '꺼진 달: 켜기 버튼만');
  S.mode = 'phone'; S.phone.staffId = 'a'; resetKiosk(); render(true);
  assert.ok(!view.innerHTML.includes('이번 달 달성률') && !view.innerHTML.includes('이번 달 점수'), '꺼진 달: 직원 휴대폰에 점수 없음');
  S.mode = 'kiosk'; Object.assign(S.kiosk, { staffId:'a', step:'action' }); render(true);
  assert.ok(!view.innerHTML.includes('⭐ 이번 달 점수'), '꺼진 달: 태블릿 요약에 점수 없음');
  resetKiosk(); S.mode = 'owner'; render(true);
  await ACT.awMonthToggle();
  assert.strictEqual(docs['config/main'].award.months['2026-11'], true, '이 달 진행하기 → 저장');
  S.config = docs['config/main'];
  render(true);
  assert.ok(view.innerHTML.includes('이달의 우수직원') && view.innerHTML.includes('추천: <b>성실</b>') && view.innerHTML.includes('이 달은 안 하기'), '추천 표시');
  // 업무태도 가중치 (v30): 사장님만, 최종 점수 = 달성률 × 100 × 가중치, 감점 없음
  assert.ok(view.innerHTML.includes('name="awAtt"') && view.innerHTML.includes('최고 ×1.3') && !view.innerHTML.includes('×0.'), '업무태도 고르기 (감점 없음)');
  const base = awardRank('2026-11');
  assert.strictEqual(base.top.st.id, 'a'); assert.strictEqual(base.top.final, 100, '가중치 없으면 달성률 그대로');
  const bRate = base.list.find(o => o.st.id === 'b').rate;
  S.config.award.att = { '2026-11': { b: 1.3 } };
  const wr = awardRank('2026-11'), bo = wr.list.find(o => o.st.id === 'b');
  assert.strictEqual(bo.final, Math.round(bRate * 130 * 10) / 10, '최종 점수에 가중치 반영');
  if (bRate * 1.3 > 1) assert.strictEqual(wr.top.st.id, 'b', '가중치로 추천이 바뀔 수 있음');
  S.config.award.att = { '2026-11': { b: 7 } }; assert.strictEqual(attOf('b', '2026-11'), 1, '이상한 값은 보통으로');
  S.config.award.att = {};
  // 직원 요약: 추가근무날 대신 일찍 출근한 날·시간 (v30)
  S.mode = 'kiosk'; resetKiosk(); Object.assign(S.kiosk, { staffId:'a', step:'action' }); render(true);
  assert.ok(view.innerHTML.includes('일찍 출근 <b>') && view.innerHTML.includes(' 5분') && !view.innerHTML.includes('추가근무날'), '일찍 출근 표시, 추가근무날은 뺌');
  assert.ok(!view.innerHTML.includes('업무태도') && !view.innerHTML.includes('최종 점수'), '직원 화면엔 업무태도·순위 없음');
  resetKiosk(); S.mode = 'owner'; render(true);
  assert.ok(view.innerHTML.includes('100%') && view.innerHTML.includes('근무 적음'), '점수표');
  // 지난달 축하 공고가 있으면 확정할 때 내림
  docs['awards/2026-10'] = { staffId:'b', name:'가끔늦음', rate:0.9, points:300, amount:30000, noticeId:'aw202610', decidedAt:1 }; apply('awards/2026-10');
  docs['tasks/aw202610'] = { kind:'notice', pinned:true, title:'10월', target:{ mode:'all' }, active:true, createdAt:1 }; apply('tasks/aw202610');
  S.awForm = { ym:'2026-11', staffId:'a', amount:70000, note:'한 번도 안 늦음', notice:true, showAmount:true };
  readAwForm = () => {};
  await ACT.awDecide();
  const aw = docs['awards/2026-11'];
  assert.ok(aw && aw.staffId === 'a' && aw.amount === 70000 && aw.rate === 1, '확정 (이번 달 포상금 7만 원)');
  const nt = docs['tasks/aw202611'];
  assert.ok(nt && nt.pinned && nt.title.includes('11월 이달의 우수직원 · 성실') && nt.body.includes('70,000원') && nt.titleVi.includes('Nhân viên xuất sắc tháng 11'), '첫 화면 축하 공고 (한국어·베트남어, 금액 포함)');
  assert.strictEqual(docs['tasks/aw202610'].pinned, false, '지난달 공고는 첫 화면에서 내림');
  render(true); assert.ok(view.innerHTML.includes('포상금 <b>70,000원</b>') && view.innerHTML.includes('지급 완료로 표시'));
  await ACT.awPaid(); assert.ok(docs['awards/2026-11'].paidAt, '지급 완료');
  // 기본 포상금 바꾸기
  el.value = '80000'; await ACT.awDefaultSave(); assert.strictEqual(docs['config/main'].award.amount, 80000);
  console.log('사장님 화면 통과');

  // ----- 직원 화면: 자기 점수 + 우수직원만 -----
  S.mode = 'phone'; S.phone.staffId = 'b'; S.phone.open = null; S.editing = null; resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('이번 달 달성률') && view.innerHTML.includes('손님 칭찬'), '내 점수·칭찬');
  assert.ok(view.innerHTML.includes('10월 이달의 우수직원') && view.innerHTML.includes('가끔늦음') && view.innerHTML.includes('축하해요'), '지난달 우수직원(본인) 축하');
  assert.ok(!view.innerHTML.includes('awt') && !view.innerHTML.includes('새직원'), '직원별 점수표·다른 직원 점수는 안 보임 (우수직원 축하 공고만)');
  S.lang = 'vi'; render(true); assert.ok(view.innerHTML.includes('Tỷ lệ hoàn thành tháng này'), '베트남어'); S.lang = 'ko';
  // 태블릿 출근 도장 +10점
  S.mode = 'kiosk'; resetKiosk(); m.delete('c_2026-11-20');
  C.sched = C.sched.map((s, i) => i === 5 ? { ...s, start:'13:00', end:'21:00' } : s);   // 금요일 오후 근무 → 12:00 출근은 정시
  Object.assign(S.kiosk, { staffId:'c', step:'action' });
  S.config.photo = { on:false };
  await ACT.kIn(); render(true);
  assert.ok(view.innerHTML.includes('+10점'), '정시 출근 도장에 +10점');
  console.log('직원 화면 통과');

  // ----- 축하 공고 반응: 👏 인정 / 🙅 인정 못 해(이유, 자동 번역) / 🎉 소감(뽑힌 본인) -----
  window.tcStore = { invoke: async (fn, b) => ({ translations: b.texts.map(x => '[' + b.to + '] ' + x) }) };
  S.reacts = new Map(); S.reactDraft = null; S.editing = null;
  S.mode = 'phone'; S.phone.staffId = 'b'; S.phone.open = null; resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('data-act="rcPick" data-v="yes"') && view.innerHTML.includes('data-v="no"'), '휴대폰 첫 화면 축하 공고에 인정/인정 못 해 버튼');
  ACT.rcPick({ v:'no', ym:'2026-11' }); render(true);
  assert.ok(view.innerHTML.includes('id="rcText"') && view.innerHTML.includes('인정 못 하는 이유'), '이유 적는 칸');
  el.value = 'Tôi đến sớm hơn mà 😤'; await ACT.rcSend();
  let rc = docs['award_reacts/2026-11_b'];
  assert.ok(rc && rc.react === 'no' && rc.text === 'Tôi đến sớm hơn mà 😤' && rc.textKo === '[ko] Tôi đến sớm hơn mà 😤', '베트남어 이유 → 사장님용 한국어 번역도 저장');
  assert.ok(view.innerHTML.includes('내 반응') && view.innerHTML.includes('rcChange'), '내 반응 + 바꾸기');
  ACT.rcChange({ ym:'2026-11' }); render(true); assert.ok(view.innerHTML.includes('data-v="yes"'), '바꾸기 → 다시 고르기');
  ACT.rcPick({ v:'no', ym:'2026-11' }); el.value = 'Tôi đến sớm hơn mà 😤'; await ACT.rcSend();
  S.phone.staffId = 'c'; render(true); await ACT.rcPick({ v:'yes', ym:'2026-11' });
  assert.strictEqual(docs['award_reacts/2026-11_c'].react, 'yes', '인정은 바로 저장');
  // 뽑힌 본인은 소감
  S.phone.staffId = 'a'; render(true);
  assert.ok(view.innerHTML.includes('data-v="thanks"') && !view.innerHTML.includes('data-v="no"'), '우수직원 본인은 소감 버튼만');
  ACT.rcPick({ v:'thanks', ym:'2026-11' }); el.value = '모두 고마워요'; await ACT.rcSend();
  assert.strictEqual(docs['award_reacts/2026-11_a'].textVi, '[vi] 모두 고마워요', '한국어 소감 → 베트남어 번역');
  // 직원 화면 베트남어: 한국어 소감은 번역본으로
  S.lang = 'vi'; render(true); assert.ok(view.innerHTML.includes('[vi] 모두 고마워요') && view.innerHTML.includes('Công nhận'), '베트남어 화면'); S.lang = 'ko';
  // 태블릿 첫 화면(아직 누군지 모름): 수와 한마디만, 버튼 없음
  S.mode = 'kiosk'; resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('인정 1') && view.innerHTML.includes('인정 못 함 1') && !view.innerHTML.includes('rcPick'), '태블릿 첫 화면은 수만');
  // 사장님 우수직원 탭: 반응 목록 + 번역
  S.mode = 'owner'; S.unlocked = true; S.tab = 'award'; S.month = '2026-11'; render(true);
  assert.ok(view.innerHTML.includes('인정 못 함 1') && view.innerHTML.includes('(번역: [ko] Tôi đến sớm hơn mà 😤)'), '사장님 화면 반응 + 번역');
  // 번역이 안 돼도 반응은 저장
  window.tcStore = {}; const w = console.warn; console.warn = () => {};
  S.mode = 'phone'; S.phone.staffId = 'b'; ACT.rcChange({ ym:'2026-11' }); ACT.rcPick({ v:'no', ym:'2026-11' }); el.value = 'Không phục'; await ACT.rcSend();
  console.warn = w;
  assert.ok(docs['award_reacts/2026-11_b'].text === 'Không phục' && !docs['award_reacts/2026-11_b'].textKo, '번역 실패해도 저장');
  console.log('축하 반응 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
`;
eval(src);
