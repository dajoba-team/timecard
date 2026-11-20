// 동기부여 (v32): 배지 모음집(영구) · 신기록 · 이번 주 미션 · 팀 목표 · 동료 고마워요 · 사장님 평가 체크리스트 · 백업
const fs = require('fs');
const assert = require('assert');
// 시계: 2026-11-20(금) 12:00 한국시간
const RealDate = Date;
const NOW = new RealDate('2026-11-20T12:00:00+09:00').getTime();
global.Date = class extends RealDate { constructor(...a){ if (a.length) super(...a); else super(NOW); } static now(){ return NOW; } };
const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:true, value:'' };
const view = { innerHTML:'' }, toasts = [];
global.document = { addEventListener(){}, querySelector: s => s === '#view' ? view : s === '#toasts' ? { prepend: e => toasts.push(e.innerHTML) } : el, querySelectorAll: () => [], createElement: () => ({ ...el, remove(){} }) };
global.window = {}; global.location = { hash:'' }; global.scrollTo = () => {}; global.setInterval = () => 0; global.setTimeout = () => 0;
global.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
let src = fs.readFileSync('chk.js', 'utf8').replace(/\nboot\(\);\s*$/, '\n');
src += `
const docs = {}; let writes = 0;
const mk = p => ({ set: async d => { writes++; docs[p] = JSON.parse(JSON.stringify(d)); }, update: async d => { writes++; docs[p] = { ...docs[p], ...JSON.parse(JSON.stringify(d)) }; }, delete: async () => { delete docs[p]; } });
S.db = { doc: p => mk(p), collection: c => ({ doc: id => mk(c + '/' + id), onSnapshot: () => () => {} }) };
window.tcStore = { invoke: async (fn, b) => ({ translations: b.texts.map(x => '[' + b.to + '] ' + x) }) };
const day = { on:true, start:'09:00', end:'18:00', brk:60 };
S.config = { graceMin:5, otUnit:10, earlyClamp:true, photo:{ on:false }, geo:{ on:false }, award:{ amount:50000 }, evalStart:'' };   // 평가 시작일 규칙은 맨 아래에서 따로
S.staff = [
  { id:'a', name:'성실', position:'홀', sched:Array(7).fill(day), active:true, hireDate:'2026-01-01', pin:'1111' },
  { id:'b', name:'가나다', position:'주방', sched:Array(7).fill(day), active:true, hireDate:'2026-01-01', pin:'2222' },
];
const t = (ds, hm) => new RealDate(ds + 'T' + hm + ':00+09:00').getTime();
const m = new Map();
for (let d = 1; d <= 20; d++){
  const ds = '2026-11-' + String(d).padStart(2, '0'), today = d === 20;
  m.set('a_' + ds, { id:'a_' + ds, staffId:'a', date:ds, kind:'work', in:t(ds, '08:55'), out: today ? null : t(ds, '18:05'), lateMin:0 });
  const late = d % 2 === 1;
  m.set('b_' + ds, { id:'b_' + ds, staffId:'b', date:ds, kind:'work', in:t(ds, late ? '09:20' : '08:58'), out: today ? null : t(ds, '18:00'), lateMin: late ? 20 : 0 });
}
S.months['2026-11'] = m; S.monthLoaded['2026-11'] = true; S.months['2026-10'] = new Map(); S.monthLoaded['2026-10'] = true;
S.ready.staff = true; S.ready.tasks = true; S.ready.treads = true; S.lang = 'ko';
const [A, B] = S.staff;
(async () => {
  // ----- 1. 이번 주 미션 (11/16 월 ~ 11/22 일) -----
  let w = weekMission(A);
  assert.ok(w.total === 7 && w.ok === 5 && !w.fail && !w.done, '성실: 5/7일 진행 중');
  assert.ok(missionLine(A).includes('5/7일') && missionLine(A).includes('class="ok"'), '미션 진행 표시');
  w = weekMission(B); assert.ok(w.fail && missionLine(B).includes('아쉽게'), '가나다: 이번 주 지각 → 다음 주에 다시');

  // ----- 2. 배지·신기록 (저장, 한 번 받으면 계속) -----
  let g = await syncGrowth(A), d = docs['badges/a'];
  assert.ok(d && d.got.first && d.got.st10 && d.got.st20 && !d.got.on50, '첫 정시·10일·20일 연속 배지');
  assert.strictEqual(d.best.streak, 20); assert.strictEqual(d.months['2026-11'].ontime, 20);
  assert.ok(S.growthNews.a.record === 20 && S.growthNews.a.badges.includes('st20'), '신기록·새 배지 소식');
  assert.ok(toasts.some(x => x.includes('새 배지를 받았어요')), '새 배지 알림');
  const n = writes; await syncGrowth(A); assert.strictEqual(writes, n, '바뀐 게 없으면 다시 저장하지 않음');
  // 기록이 줄어도 배지는 남음
  S.badges.set('a', d); m.delete('a_2026-11-19'); await syncGrowth(A);
  assert.ok(docs['badges/a'].got.st20 && docs['badges/a'].best.streak === 20, '한 번 받은 배지·최고 기록은 그대로');
  m.set('a_2026-11-19', { id:'a_2026-11-19', staffId:'a', date:'2026-11-19', kind:'work', in:t('2026-11-19', '08:55'), out:t('2026-11-19', '18:05'), lateMin:0 });
  // 칭찬 배지
  S.praise = [{ id:'p1', staffId:'b', ym:'2026-11', pts:10, note:'친절', at:NOW }];
  await syncGrowth(B); assert.ok(docs['badges/b'].got.praise && !docs['badges/b'].got.st10, '칭찬 배지, 가나다는 연속 배지 없음');
  // 지난달 무지각·무결근 → 한 달 배지 (지난달 기록이 불러와져 있을 때)
  const oct = new Map(); for (let dd = 1; dd <= 31; dd++){ const ds = '2026-10-' + String(dd).padStart(2, '0'); oct.set('a_' + ds, { id:'a_' + ds, staffId:'a', date:ds, kind:'work', in:t(ds, '08:50'), out:t(ds, '18:10'), lateMin:0 }); }
  S.months['2026-10'] = oct; await syncGrowth(A);
  assert.ok(docs['badges/a'].got.perfect && docs['badges/a'].months['2026-10'].end, '지난달 한 달 무지각·무결근 배지');
  assert.ok(docs['badges/a'].got.on50, '두 달 합쳐 정시 출근 50회');
  console.log('배지·신기록·미션 통과');

  // ----- 3. 직원 휴대폰: 내 성장 카드 -----
  S.badges = new Map(Object.entries(docs).filter(([k]) => k.startsWith('badges/')).map(([k, v]) => [k.slice(7), v]));
  S.mode = 'phone'; S.phone.staffId = 'a'; resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('내 배지 ') && view.innerHTML.includes('class="bdg got"') && view.innerHTML.includes('다음 배지'), '배지 모음집');
  assert.ok(view.innerHTML.includes('최고 ') && view.innerHTML.includes('이번 주 미션'), '최고 기록·미션');
  assert.ok(view.innerHTML.includes('data-act="thOpen"'), '고마워요 보내기 버튼');
  assert.ok(!view.innerHTML.includes('가나다') || !view.innerHTML.includes('rate'), '다른 직원 점수 없음');
  S.lang = 'vi'; render(true); assert.ok(view.innerHTML.includes('Huy hiệu của tôi') && view.innerHTML.includes('Nhiệm vụ tuần'), '베트남어'); S.lang = 'ko';

  // ----- 4. 동료 고마워요 (하루 한 번, 번역, 점수 아님) -----
  S.mode = 'kiosk'; resetKiosk(); Object.assign(S.kiosk, { staffId:'a', step:'action' }); render(true);
  assert.ok(view.innerHTML.includes('data-act="thOpen"'), '태블릿 번호 누른 뒤 고마워요 버튼');
  ACT.thOpen(); render(true); assert.strictEqual(S.kiosk.step, 'thanks'); assert.ok(view.innerHTML.includes('data-act="thTo" data-id="b"') && !view.innerHTML.includes('data-id="a"'), '나 빼고 동료 고르기');
  await ACT.thSend(); assert.ok(toasts.some(x => x.includes('받는 사람을 골라 주세요')), '받는 사람 없으면 안 보냄');
  ACT.thTo({ id:'b' }); el.value = 'Cảm ơn đã giúp nhé'; await ACT.thSend();
  const th = docs['thanks/2026-11-20_a'];
  assert.ok(th && th.from === 'a' && th.to === 'b' && th.textKo === '[ko] Cảm ơn đã giúp nhé', '고마워요 저장 (사장님용 한국어 번역)');
  assert.strictEqual(S.kiosk.step, 'action');
  ACT.thOpen(); render(true); assert.ok(view.innerHTML.includes('오늘은 이미'), '하루 한 번');
  ACT.thBack();
  const before = scoreMonth(B, '2026-11').total;
  S.mode = 'phone'; S.phone.staffId = 'b'; resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('받은 고마워요 1개') && view.innerHTML.includes('[ko] Cảm ơn đã giúp nhé'), '받은 사람 화면 (한국어 화면엔 번역)');
  assert.strictEqual(scoreMonth(B, '2026-11').total, before, '고마워요는 점수에 안 들어감');

  // ----- 5. 팀 목표 -----
  S.config.team = { on:true, target:90, reward:'회식 🍖', rewardVi:'Liên hoan 🍖' };
  const tg = teamGoal();
  assert.ok(tg.kind === 'ontime' && tg.rate > 0.7 && tg.rate < 0.8 && !tg.ok, '가게 전체 정시 출근률 (성실 100%, 가나다 절반) — 예전 설정은 이번 달·정시 출근률로');
  S.mode = 'kiosk'; resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('이번 달 팀 목표') && view.innerHTML.includes('회식 🍖'), '태블릿 첫 화면 팀 목표');
  S.lang = 'vi'; render(true); assert.ok(view.innerHTML.includes('Liên hoan 🍖'), '보상 베트남어'); S.lang = 'ko';
  S.config.team.target = 70; assert.ok(teamGoal().ok, '목표 넘으면 달성');
  // v37: 이번 주 정시 출근률 (11/16~22): 가나다 홀수 날 지각
  S.config.team = { on:true, kind:'ontime', target:90, period:'week' };
  const wk = teamGoal(); assert.ok(wk.rg.from === '2026-11-16' && wk.rg.to === '2026-11-22' && wk.rate > 0.6 && wk.rate < 0.9, '이번 주 기간으로 계산');
  render(true); assert.ok(view.innerHTML.includes('이번 주 팀 목표'), '이번 주 표시');
  // v37: 직접 정한 목표 (사장님이 +1)
  S.config.team = { on:true, kind:'custom', title:'손님 리뷰 별 5개', titleVi:'Đánh giá 5 sao', goal:10, unit:'개', current:3, period:'range', from:'2026-11-18', to:'2026-11-30', reward:'아이스크림', rewardVi:'Kem' };
  const cg = teamGoal(); assert.ok(cg.kind === 'custom' && cg.p === 0.3 && !cg.ok && cg.rg.ko === '11/18~11/30', '직접 목표 진행 3/10');
  render(true); assert.ok(view.innerHTML.includes('손님 리뷰 별 5개') && view.innerHTML.includes('3/10개'), '첫 화면에 직접 목표');
  S.lang = 'vi'; render(true); assert.ok(view.innerHTML.includes('Đánh giá 5 sao'), '직접 목표 베트남어'); S.lang = 'ko';
  S.mode = 'owner'; S.unlocked = true; S.tab = 'award';
  await ACT.tmAdd({ v:'1' }); assert.strictEqual(S.config.team.current, 4, '+1 올리기');
  for (let i = 0; i < 6; i++) await ACT.tmAdd({ v:'1' });
  assert.ok(teamGoal().ok && toasts.some(x => x.includes('팀 목표 달성')), '목표 수에 닿으면 달성');
  // 기간이 끝나면 직원 화면에선 내려가고 사장님 화면에 안내
  S.config.team = { ...S.config.team, from:'2026-11-01', to:'2026-11-15' };
  S.mode = 'kiosk'; resetKiosk(); render(true); assert.ok(!view.innerHTML.includes('팀 목표'), '기간 끝나면 직원 화면에서 내려감');
  S.mode = 'owner'; S.tmDraft = null; render(true); assert.ok(view.innerHTML.includes('기간이 끝났어요') && view.innerHTML.includes('data-act="tmKind" data-v="custom" class="on"'), '사장님: 기간 끝 안내 + 지금 설정');
  S.mode = 'kiosk';
  S.config.team.on = false; render(true); assert.ok(!view.innerHTML.includes('팀 목표'), '끄면 안 보임');

  // ----- 6. 사장님: 동기부여 탭, 평가 체크리스트 → 가중치 -----
  S.config.award.months = { '2026-11':true };
  S.config.award.att = { '2026-11': { a:{ h:5, k:5, t:5, r:5 }, b:{ h:4, k:4, t:4, r:4 } } };
  assert.strictEqual(attOf('a', '2026-11'), 1.3); assert.strictEqual(attOf('b', '2026-11'), 1.15);
  S.config.award.att = { '2026-11': { a:{ h:2, k:1, t:3, r:2 }, b:1.2 } };
  assert.strictEqual(attOf('a', '2026-11'), 0.85, 'v37: 별 평균 2개 → ×0.85 (깎임)'); assert.strictEqual(attOf('b', '2026-11'), 1.2, '예전 숫자 가중치도 읽음');
  S.config.award.att = { '2026-11': { a:{ h:1, k:1, t:1, r:1 }, b:{ mode:'manual', w:0.8 } } };
  assert.strictEqual(attOf('a', '2026-11'), 0.7, '별 1개 → 최소 ×0.7'); assert.strictEqual(attOf('b', '2026-11'), 0.8, '직접 ×0.8');
  S.config.award.att = { '2026-11': { a:{ h:2, k:2, t:3, r:2 } } };
  assert.strictEqual(attOf('a', '2026-11'), 0.89, '★2.25 → ×0.89');
  S.config.award.att = {};
  S.mode = 'owner'; S.unlocked = true; S.tab = 'award'; S.month = '2026-11'; render(true);
  assert.ok(view.innerHTML.includes('🎮 동기부여') && view.innerHTML.includes('업무태도 평가') && view.innerHTML.includes('직원끼리 고마워요') && view.innerHTML.includes('직원 배지') && view.innerHTML.includes('팀 목표'), '동기부여 탭');
  assert.ok(view.innerHTML.includes('<b>성실</b> → <b>가나다</b>') && view.innerHTML.includes('(번역: [ko] Cảm ơn đã giúp nhé)'), '고마워요 목록 (사장님)');
  await ACT.attStar({ sid:'b', c:'t', v:'5' });
  assert.deepStrictEqual(S.config.award.att['2026-11'].b, { mode:'stars', h:3, k:3, t:5, r:3, w:1 }, '별 누르면 저장 (나머지는 보통)');
  assert.strictEqual(attOf('b', '2026-11'), 1.08, '평균 3.5 → ×1.08');
  assert.ok(docs['config/main'].award.att['2026-11'].b.t === 5, '설정에 저장');
  // v35: 직접 정하기 — 별점과 섞이지 않게 한 가지 방법만
  await ACT.attMode({ sid:'b', v:'manual' });
  assert.strictEqual(attOf('b', '2026-11'), 1, '직접으로 바꾸면 직접 가중치(처음 ×1.0)');
  await ACT.attW({ sid:'b', v:'1.2' });
  assert.strictEqual(attOf('b', '2026-11'), 1.2, '직접 ×1.2');
  assert.strictEqual(S.config.award.att['2026-11'].b.t, 5, '별점은 남아 있음 (반영만 안 됨)');
  render(true);
  assert.ok(view.innerHTML.includes('✋ 직접 정한 ×1.2를 써요') && view.innerHTML.includes('evstars off'), '직접일 땐 별점 흐리게·반영 안 됨 안내');
  assert.ok(view.innerHTML.includes('✋ 직접 <b>×1.2</b>'), '점수표에 방법 표시');
  await ACT.attMode({ sid:'b', v:'stars' }); assert.strictEqual(attOf('b', '2026-11'), 1.08, '별점으로 돌아오면 별점 가중치');
  // 예전(v30) 숫자 가중치는 '직접'으로 읽고 바꿀 수 있음
  S.config.award.att['2026-11'].a = 1.1; render(true);
  assert.ok(attInfo('a', '2026-11').mode === 'manual' && view.innerHTML.includes('data-act="attW" data-sid="a" data-v="1.1" class="on"'), '예전 ×1.1은 직접 ×1.1로 보이고 바꿀 수 있음');
  await ACT.attW({ sid:'a', v:'1.3' }); assert.strictEqual(attOf('a', '2026-11'), 1.3);
  // 로고를 누르면 처음 화면
  S.tab = 'payroll'; ACT.navHome(); assert.strictEqual(S.tab, 'now', '로고(처음으로) → 현황');
  renderTop(); assert.ok(document.querySelector('#top').innerHTML.includes('class="brand" data-act="navHome"'), '맨 위 우리 가게 로고가 처음으로 버튼');
  S.tab = 'award';
  el.checked = true; el.value = '95'; await ACT.tmSave();
  assert.ok(S.config.team.on && S.config.team.target === 95, '팀 목표 저장');
  console.log('고마워요·팀 목표·평가 통과');

  // ----- 7. 일찍 출근 (v33): 직원 화면엔 연속 일수만, 첫 화면에 오늘 출근 시각·가장 일찍 효과 -----
  S.mode = 'kiosk'; resetKiosk(); Object.assign(S.kiosk, { staffId:'a', step:'action' }); render(true);
  assert.ok(view.innerHTML.includes('일찍 출근 <b>+20일</b> 연속') && !view.innerHTML.includes('합계 <b>') && !view.innerHTML.includes('11/19 5분'), '직원 화면: 일찍 출근 +20일 연속만');
  resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('class="kname early1" data-act="kPick" data-id="a"') && view.innerHTML.includes('오늘 가장 일찍 출근') && view.innerHTML.includes('class="claps"'), '첫 화면: 성실(5분 일찍)에게 효과');
  assert.ok(!view.innerHTML.includes('class="kname early1" data-act="kPick" data-id="b"'), '가나다(2분 일찍)는 효과 없음');
  assert.ok(view.innerHTML.includes('출근 08:55') && view.innerHTML.includes('출근 08:58'), '모든 직원의 오늘 출근 시각');
  assert.strictEqual(earlyBird({ sid:'b', in:t('2026-11-20', '08:40') }).sid, 'b', '더 일찍 찍으면 바뀜 (정해진 시각 기준)');
  S.mode = 'owner'; S.tab = 'timecard'; render(true);
  assert.ok(view.innerHTML.includes('🌅 일찍 출근 <b>20일</b> · 합계 <b>1시간 40분</b>') && view.innerHTML.includes('11/1 5분'), '사장님 근무 집계: 날짜·분·합계');
  assert.ok(view.innerHTML.includes('🐓 합계 1등 (지금까지)'), '사장님: 이번 달 합계 1등 표시');
  // 지난달 일찍 출근 합계 1등 배지 (달이 끝난 뒤): 10월엔 성실만 10분 일찍(08:50)
  assert.deepStrictEqual(earlyTopOf('2026-10').ids, ['a']);
  await syncGrowth(A);
  assert.ok(docs['badges/a'].got.ebird && docs['badges/a'].months['2026-10'].earlyTop && docs['badges/a'].months['2026-10'].early === 310, '🐓 일찍 출근 합계 한 달 1등 배지');
  await syncGrowth(B); assert.ok(!docs['badges/b'].got.ebird, '1등이 아니면 없음');
  // 지난달 기록이 아예 없으면 아무도 🐓를 받지 않음 (v36 확인)
  const octSave = S.months['2026-10']; S.months['2026-10'] = new Map();
  assert.deepStrictEqual(earlyTopOf('2026-10').ids, [], '기록 없는 달은 1등 없음');
  S.badges.delete('b'); delete docs['badges/b']; await syncGrowth(B);
  assert.ok(!docs['badges/b'].got.ebird && !docs['badges/b'].got.perfect, '기록 없는 지난달로는 🐓·한 달 배지 안 줌');
  S.months['2026-10'] = octSave;
  // 직원 화면: 받은 배지만 금빛, 안 받은 🐓는 흐리게
  S.badges = new Map(Object.entries(docs).filter(([k]) => k.startsWith('badges/')).map(([k, v]) => [k.slice(7), v]));
  S.mode = 'phone'; S.phone.staffId = 'b'; resetKiosk(); render(true);
  assert.ok(view.innerHTML.includes('class="bdg " title="일찍 출근 합계 한 달 1등 · 아직"') && view.innerHTML.includes('class="bdg got" title="사장님 칭찬 받기 · 받음"'), '받은 것과 아직인 것이 구분됨');
  // 사장님 동기부여 탭: 배지 안내표
  S.mode = 'owner'; S.tab = 'award'; render(true);
  assert.ok(view.innerHTML.includes('📖 배지 안내') && view.innerHTML.includes('일찍 온 분을 모두 더해 1등') && view.innerHTML.includes(BADGE_WHEN.st10), '배지 안내표 (언제 받나요)');
  S.tab = 'timecard'; render(true);
  console.log('일찍 출근 통과');

  // ----- 8. 출퇴근 평가 시작일 (v34): 11/17 전은 지각·결근·점수에서 뺌, 일한 시간은 그대로 -----
  S.config.evalStart = '2026-11-17';
  let r = dayCalc(B, '2026-11-15');   // 가나다 11/15: 09:20 출근 (원래 지각 20분)
  assert.ok(r.late === 0 && r.worked > 0 && r.paid > 0 && r.status === 'done', '시작일 전: 지각 아님, 일한 시간은 그대로');
  m.delete('b_2026-11-14'); r = dayCalc(B, '2026-11-14');
  assert.ok(r.status !== 'absent' && r.preEval, '시작일 전: 기록 없어도 결근 아님');
  assert.ok(statusChips(r).includes('평가 시작 전'), '기록 화면 표시');
  assert.ok(dayCalc(B, '2026-11-17').late === 20, '시작일부터는 지각');
  const so = scoreMonth(A, '2026-11');
  assert.strictEqual(so.att.ontime, 4, '점수는 11/17~11/20만 (4일)');
  const ms = monthSummary(B, '2026-11');
  assert.ok(ms.absentDays.length === 0 && ms.lateDays.every(x => x.ds >= '2026-11-17'), '이번 달 결근·지각도 시작일부터');
  assert.strictEqual(earlyStreak(monthSummary(A, '2026-11')), 4, '일찍 출근 연속도 시작일부터 (+4일)');
  assert.ok(earlyDays(monthSummary(A, '2026-11')).every(x => x.ds >= '2026-11-17'), '일찍 출근 합계도 시작일부터');
  assert.ok(weekMission(A).total === 6 && weekMission(A).ok === 4 && weekMission(B).fail, '이번 주 미션: 11/16 월요일은 빼고 6일 중 4일');
  S.config.evalStart = '';
  console.log('평가 시작일 통과');

  // ----- 9. 직원 휴대폰 연결 필수 (v38) -----
  S.config.phoneReq = { on:true, deadline:'2026-11-27' }; S.plinks = new Map(); S.mode = 'kiosk'; S.lang = 'ko';
  resetKiosk(); ACT.kPick({ id:'a' }); for (const dg of '1111') padPress('staff', dg);
  assert.strictEqual(S.kiosk.step, 'phonereq', '연결 안 한 직원은 번호 뒤 안내부터'); render(true);
  assert.ok(view.innerHTML.includes('휴대폰 연결이 필요해요') && view.innerHTML.includes('/#phone') && view.innerHTML.includes('사장님께 로그인을 부탁') && view.innerHTML.includes('data-act="phSkip"') && view.innerHTML.includes('D-7'), '안내: 주소·방법·기한 전 넘어가기');
  ACT.phSkip(); assert.strictEqual(S.kiosk.step, 'action', '기한 전엔 오늘은 넘어가기');
  S.config.phoneReq.deadline = '2026-11-19';
  resetKiosk(); ACT.kPick({ id:'a' }); for (const dg of '1111') padPress('staff', dg); render(true);
  assert.ok(view.innerHTML.includes('연결 기한이 지났어요') && !view.innerHTML.includes('data-act="phSkip"'), '기한 지나면 넘어가기 없음');
  ACT.phSkip(); assert.strictEqual(S.kiosk.step, 'phonereq', '기한 지나면 출퇴근 단추 안 나옴');
  // 휴대폰에서 이름+번호로 연결 → 기록 → 태블릿이 저절로 넘어감
  const kioskSave = { ...S.kiosk };
  S.mode = 'phone'; S.phone.staffId = null; S.phone.pickId = 'a'; for (const dg of '1111') padPress('phone', dg);
  assert.ok(docs['phone_links/a'] && docs['phone_links/a'].first && S.phone.staffId === 'a', '휴대폰 연결 기록');
  S.mode = 'kiosk'; Object.assign(S.kiosk, kioskSave); render(true);
  assert.ok(S.kiosk.step === 'action' && !view.innerHTML.includes('휴대폰 연결이 필요해요'), '연결되면 태블릿 화면이 바로 출퇴근으로');
  resetKiosk(); ACT.kPick({ id:'a' }); for (const dg of '1111') padPress('staff', dg); assert.strictEqual(S.kiosk.step, 'action', '연결한 직원에게는 다시 안 뜸');
  // 마스터 번호는 통과, 꺼져 있으면 안 뜸
  S.config.masterPin = '9999'; resetKiosk(); ACT.kPick({ id:'b' }); for (const dg of '9999') padPress('staff', dg); assert.strictEqual(S.kiosk.step, 'action', '마스터 번호는 통과');
  S.config.phoneReq.on = false; resetKiosk(); ACT.kPick({ id:'b' }); for (const dg of '2222') padPress('staff', dg); assert.strictEqual(S.kiosk.step, 'action', '꺼져 있으면 안 뜸');
  // 사장님: 연결 현황
  S.mode = 'owner'; S.tab = 'tasks'; render(true);
  assert.ok(view.innerHTML.includes('휴대폰 연결 현황') && view.innerHTML.includes('✅ <b>성실</b>') && view.innerHTML.includes('⬜ <b>가나다</b>'), '사장님: 누가 연결했는지');
  await ACT.plDel({ id:'a' }); assert.ok(!docs['phone_links/a'] && !S.plinks.has('a'), '연결 지우기 (휴대폰 바꿨을 때)');
  // v39: 태블릿 1회용 QR — 서버 함수에서 그 직원 전용 코드를 받아 로그인 없이 연결
  const invSave = window.tcStore.invoke, asked = [];
  window.tcStore.invoke = async (fn, b) => { asked.push([fn, b]); return fn === 'tc-phone-join' && b.action === 'issue' ? { code:'C'.repeat(24), exp: Date.now() + 600000 } : fn === 'tc-phone-join' && b.action === 'revoke' ? { ok:true, removed:true } : { translations:(b.texts || []).map(x => x) }; };
  S.config.phoneReq = { on:true, deadline:'2026-11-27' }; S.join = null; S.mode = 'kiosk';
  resetKiosk(); ACT.kPick({ id:'a' }); for (const dg of '1111') padPress('staff', dg);
  render(true); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); render(true);
  assert.ok(asked.some(([fn, b]) => fn === 'tc-phone-join' && b.action === 'issue' && b.staffId === 'a'), '번호 확인한 직원 전용 코드 요청');
  assert.ok(S.join.code === 'C'.repeat(24) && joinUrl(S.join.code).endsWith('/#join=' + 'C'.repeat(24)), '1회용 연결 주소');
  assert.ok(view.innerHTML.includes('님 전용') && view.innerHTML.includes('로그인 없이 바로') && !view.innerHTML.includes('사장님께 로그인을 부탁'), '전용 QR 안내 (사장님 로그인 필요 없음)');
  // 사장님: 모두 끊기 (두 번 눌러야)
  S.mode = 'owner'; S.tab = 'tasks'; await ACT.plRevoke(); assert.ok(!asked.some(([fn, b]) => b?.action === 'revoke'), '한 번만 누르면 확인만');
  render(true); assert.ok(view.innerHTML.includes('정말 끊을까요'));
  await ACT.plRevoke(); assert.ok(asked.some(([fn, b]) => b?.action === 'revoke') && toasts.some(x => x.includes('모두 끊었어요')), '두 번 누르면 모두 끊기');
  // 직원용 공용 계정은 사장님 화면을 못 엶
  window.tcStore.userRole = () => 'phone';
  S.mode = 'phone'; renderTop(); assert.ok(!document.querySelector('#top').innerHTML.includes('data-act="toOwner"'), '공용 계정: 사장님 화면 버튼 없음');
  ACT.toOwner(); assert.strictEqual(S.mode, 'phone', '공용 계정: 사장님 화면으로 안 감');
  delete window.tcStore.userRole; window.tcStore.invoke = invSave;
  console.log('휴대폰 연결 필수 통과');

  // ----- 10. 백업 -----
  const Bk = await import('../supabase/functions/tc-notyet-check/backup.mjs');
  const bk = Bk.buildBackup([{ collection:'badges', id:'a', data: docs['badges/a'] }, { collection:'thanks', id:'2026-11-20_a', data: th }], NOW, '가게');
  assert.ok(bk.extra.badges[0].id === 'a' && bk.extra.thanks[0].id === '2026-11-20_a', '자동 백업에 배지·고마워요');
  const L = await import('../scripts/lib.mjs');
  const back = L.backupToDocs({ ...bk, staff:[], punches:{}, contracts:[], reports:{} });
  assert.ok(back.rows.some(x => x.collection === 'badges') && back.rows.some(x => x.collection === 'thanks'), '백업에서 되살리기');
  console.log('백업 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
`;
eval(src);
