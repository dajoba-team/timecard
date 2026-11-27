// 지각 경고 (v46): 1회 = 약한 경고, 한 번 더 하면 퇴사 기준 = 강한 경고. 태블릿·휴대폰 경고 팝업 [확인했어요],
// 무단 지각 요약(strikes/) 저장, 직원 휴대폰 알림 켜기(push_subs/), 서버 알림 규칙(pushrules.mjs)
const fs = require('fs');
const assert = require('assert');
const RealDate = Date;
let NOW = 0;
const kt = (hm, ds) => new RealDate(`${ds}T${hm}:00+09:00`).getTime();
NOW = kt('09:05', '2026-12-02');
global.Date = class extends RealDate { constructor(...a){ if (a.length) super(...a); else super(NOW); } static now(){ return NOW; } };
const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:false, value:'' };
const view = { innerHTML:'' }, toasts = [];
const ls = new Map();
global.document = { addEventListener(){}, querySelector: s => s === '#view' ? view : s === '#toasts' ? { prepend: e => toasts.push(e.innerHTML) } : el, querySelectorAll: () => [], createElement: () => ({ ...el, remove(){} }) };
global.window = {}; global.location = { hash:'', protocol:'https:' }; global.scrollTo = () => {}; global.setInterval = () => 0; global.setTimeout = () => 0;
global.localStorage = { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
let src = fs.readFileSync('chk.js', 'utf8').replace(/\nboot\(\);\s*$/, '\n');
src += `
const docs = {};
function apply(p){
  const i = p.lastIndexOf('/'), c = p.slice(0, i), id = p.slice(i + 1), m = /^months\\/(\\d{4}-\\d{2})\\/punches$/.exec(c);
  if (m){ const map = S.months[m[1]]; if (docs[p]) map.set(id, { id, ...docs[p] }); else map.delete(id); }
  if (c === 'strikes'){ if (docs[p]) S.strikes.set(id, docs[p]); else S.strikes.delete(id); }
  if (c === 'push_subs'){ S.pushSubs = Object.entries(docs).filter(([k]) => k.startsWith('push_subs/')).map(([k, d]) => ({ id:k.slice(10), ...d })); }
}
const mk = p => ({ set: async d => { docs[p] = JSON.parse(JSON.stringify(d)); apply(p); }, update: async d => { docs[p] = { ...docs[p], ...JSON.parse(JSON.stringify(d)) }; apply(p); }, delete: async () => { delete docs[p]; apply(p); } });
S.db = { doc: p => mk(p), collection: c => ({ doc: id => mk(c + '/' + id), onSnapshot: () => () => {} }) };
window.tcStore = { invoke: async () => ({}) };
const day = { on:true, start:'09:00', end:'18:00', brk:60 };
S.config = { graceMin:5, otUnit:10, earlyClamp:true, photo:{ on:false }, geo:{ on:false }, ot:{ on:false, since:'' }, masterPin:'9876', phoneReq:{ on:false, deadline:'' } };
S.staff = ['a', 'b', 'c'].map((id, i) => ({ id, name:['성실', '가나다', '라마바'][i], position:'홀', sched:Array(7).fill(day), active:true, hireDate:'2026-01-01', pin:'111' + (i + 1), wage:10320 }));
const [A, B, C] = S.staff;
for (const ym of ['2026-11', '2026-12', '2027-01']){ S.months[ym] = new Map(); S.monthLoaded[ym] = true; }
S.ready.staff = true; S.ready.strikes = true; S.lang = 'ko';
const tick = async () => { for (let i = 0; i < 6; i++) await null; };
const putPunch = (st, ds, inHm) => { const p = 'months/' + ds.slice(0, 7) + '/punches/' + st.id + '_' + ds; docs[p] = { staffId:st.id, name:st.name, date:ds, kind:'work', in:kt(inHm, ds), out:kt('18:00', ds), sched:day, lateMin:0 }; apply(p); };
const punchIn = async (st, pin) => { S.mode = 'kiosk'; resetKiosk(); ACT.kPick({ id:st.id }); for (const d of pin) padPress('staff', d); return S.kiosk.step; };
(async () => {
  // ----- 1. 첫 지각 → 약한 경고 (태블릿) -----
  let step = await punchIn(B, B.pin);
  assert.strictEqual(step, 'action', '지각 없으면 경고 없이 출퇴근 단추');
  await ACT.kIn(); await tick();
  assert.strictEqual(S.kiosk.step, 'done');
  let sk = docs['strikes/b'];
  assert.ok(sk && sk.count === 1 && sk.lastLate === '2026-12-02' && sk.resetOn === '2027-01-02' && sk.limit === 3, '무단 지각 요약 저장 (서버 알림용)');
  assert.strictEqual(kNextStep(B), 'lwarn', '지각한 출근이면 다음 단계는 경고');
  render(true); assert.ok(view.innerHTML.includes('지각 안내 확인하기'), '도장 화면 단추');
  ACT.kNext(); render(true);
  assert.ok(view.innerHTML.includes('lwarn weak') && view.innerHTML.includes('지각 주의 (1회)') && view.innerHTML.includes('한 번 더 지각하면 <b>2회</b>') && view.innerHTML.includes('1/3') && view.innerHTML.includes('1월 2일'), '약한 경고 팝업');
  await ACT.lwarnOk(); await tick();
  assert.ok(docs['strikes/b'].ack && docs['strikes/b'].ack.key === '1|2026-12-02' && docs['strikes/b'].ack.level === 'weak' && docs['strikes/b'].ack.where === 'tablet', '확인 기록');
  assert.strictEqual(S.kiosk.step, 'list', '확인하면 처음 화면');
  assert.ok(strikeOwnerLine(B).includes('✅ 약한 경고 확인함'), '사장님 직원 목록에 경고 확인함');
  // 다음 날 제때 오면 경고 다시 안 뜸
  NOW = kt('08:50', '2026-12-03'); step = await punchIn(B, B.pin);
  assert.strictEqual(step, 'action', '확인한 경고는 다시 안 뜸');
  await ACT.kIn(); await tick(); assert.notStrictEqual(kNextStep(B), 'lwarn');
  console.log('약한 경고 통과');

  // ----- 2. 두 번째 지각 → 강한 경고. 안 누르고 가면 다음에 번호 넣을 때 다시 -----
  NOW = kt('09:12', '2026-12-05'); await punchIn(B, B.pin); await ACT.kIn(); await tick();
  assert.ok(docs['strikes/b'].count === 2 && docs['strikes/b'].lastLate === '2026-12-05' && docs['strikes/b'].ack.key === '1|2026-12-02', '2회 · 예전 확인은 남아 있음');
  ACT.kNext(); render(true);
  assert.ok(view.innerHTML.includes('lwarn strong') && view.innerHTML.includes('지각 경고 (2회)') && view.innerHTML.includes('3회 = 퇴사 기준') && view.innerHTML.includes('2/3'), '강한 경고 팝업');
  resetKiosk();   // 그냥 가 버림 (잠시 뒤 처음으로)
  NOW = kt('18:01', '2026-12-05'); step = await punchIn(B, B.pin);
  assert.ok(step === 'lwarn' && S.kiosk.afterWarn === 'action', '퇴근하러 번호 넣으면 확인 안 한 경고가 먼저');
  await ACT.lwarnOk(); assert.strictEqual(S.kiosk.step, 'action', '확인하면 퇴근 단추로');
  assert.strictEqual(docs['strikes/b'].ack.level, 'strong');
  // 마스터 번호면 경고 안 띄움
  putPunch(A, '2026-12-05', '09:20'); await syncStrikes(A);
  S.mode = 'kiosk'; resetKiosk(); ACT.kPick({ id:A.id }); for (const d of '9876') padPress('staff', d);
  assert.strictEqual(S.kiosk.step, 'action', '마스터 번호(사장님 대리)는 경고 안 띄움');
  console.log('강한 경고 통과');

  // ----- 3. 기준 도달 / 지각 지우면 다시 계산 -----
  NOW = kt('09:03', '2026-12-08'); await punchIn(B, B.pin); await ACT.kIn(); await tick();
  assert.strictEqual(docs['strikes/b'].count, 3);
  ACT.kNext(); render(true); assert.ok(view.innerHTML.includes('lwarn over') && view.innerHTML.includes('퇴사 처리 기준'), '3회 = 기준 도달 팝업');
  resetKiosk();
  S.editing = 'punch:b|2026-12-08'; el.value = '버스 사고'; await ACT.lateOk(); await tick();
  assert.ok(docs['strikes/b'].count === 2 && docs['strikes/b'].lastLate === '2026-12-05', '사장님이 지우면 요약도 다시 (서버 알림 기준)');
  assert.strictEqual(warnPending(B), null, '이미 확인한 2회 경고로 돌아감');
  el.value = '';
  console.log('기준·지우기 통과');

  // ----- 4. 직원 휴대폰: 첫 화면에 경고 팝업, 알림 켜기 -----
  putPunch(C, '2026-12-08', '09:02'); await syncStrikes(C);
  S.mode = 'phone'; S.phone.staffId = C.id; resetKiosk(); S.ready.tasks = true; S.ready.treads = true; S.tasks = []; render(true);
  assert.ok(view.innerHTML.includes('lwarn weak') && view.innerHTML.includes('지각 주의 (1회)'), '휴대폰 첫 화면에 확인 안 한 경고');
  await ACT.lwarnOk(); render(true);
  assert.ok(!view.innerHTML.includes('lwarn') && docs['strikes/c'].ack.where === 'phone', '휴대폰에서 확인');
  assert.ok(!view.innerHTML.includes('pushcard'), '알림을 못 쓰는 기기면 카드 없음');
  // 알림 되는 휴대폰 흉내
  let subOpts = null;
  Object.defineProperty(globalThis, 'navigator', { value:{ userAgent:'Android Chrome', serviceWorker:{ register: async () => ({ pushManager:{ getSubscription: async () => null, subscribe: async o => { subOpts = o; return { toJSON: () => ({ endpoint:'https://fcm.googleapis.com/fcm/send/xyz', keys:{ p256dh:'PKEY', auth:'AKEY' } }) }; } } }), ready: Promise.resolve() } }, configurable:true });
  window.PushManager = function(){}; let perm = 'default';
  global.Notification = { get permission(){ return perm; }, requestPermission: async () => (perm = 'granted') };
  render(true); assert.ok(view.innerHTML.includes('data-act="pushOn"') && view.innerHTML.includes('알림 켜기'), '알림 켜기 카드');
  await ACT.pushOn(); await tick();
  const subKey = Object.keys(docs).find(k => k.startsWith('push_subs/c_'));
  assert.ok(subKey && docs[subKey].staffId === 'c' && docs[subKey].sub.endpoint.includes('fcm') && docs[subKey].sub.keys.auth === 'AKEY', '구독 저장 (직원별)');
  assert.ok(subOpts && subOpts.userVisibleOnly && subOpts.applicationServerKey.length === 65, '공개키 65바이트');
  render(true); assert.ok(view.innerHTML.includes('알림 받는 중') && view.innerHTML.includes('data-act="pushTest"'), '켜진 뒤 표시');
  S.mode = 'owner'; S.unlocked = true; S.tab = 'staff'; render(true);
  assert.ok(view.innerHTML.includes('🔔 알림 받음') && view.innerHTML.includes('알림 받는 직원 1/3명'), '사장님 화면: 알림 받는 직원');
  S.mode = 'phone'; ACT.phSwitch(); await tick();
  assert.ok(!docs[subKey] && !ls.has('tc.pushId'), '다른 사람으로 바꾸면 이 휴대폰 알림도 끊음');
  // 아이폰 브라우저(홈 화면 설치 전)
  Object.defineProperty(globalThis, 'navigator', { value:{ userAgent:'iPhone Safari' }, configurable:true }); delete window.PushManager;
  S.phone.staffId = C.id; render(true); assert.ok(view.innerHTML.includes('홈 화면에 설치한 타임카드 앱'), '아이폰은 홈 화면 설치 안내');
  console.log('휴대폰 통과');

  // ----- 5. 설정 -----
  S.mode = 'owner'; S.editing = 'config'; assert.ok(staffView().includes('id="c-push"') && staffView().includes('id="c-pushBefore"'), '설정에 휴대폰 알림'); S.editing = null;
  console.log('설정 통과');

  // ----- 6. 서버 알림 규칙 (pushrules.mjs) -----
  const R = await import('../supabase/functions/tc-notyet-check/pushrules.mjs');
  const ds = '2026-12-10', at = hm => kt(hm, ds), config = { lateRule:{ since:'2026-12-01', limit:3 } };
  const staffS = [{ id:'b', name:'가나다', sched:Array(7).fill(day), active:true }, { id:'c', name:'라마바', sched:Array(7).fill(day), active:true }];
  let ev = R.warnPushEvents({ config, staff:staffS, strikes:{ b:{ staffId:'b', count:1, limit:3, lastLate:ds, resetOn:'2027-01-10' } }, now:at('09:10') });
  assert.ok(ev.length === 1 && ev[0].level === 'weak' && ev[0].key === 'pw_b_1_' + ds, '오늘 첫 지각 = 약한 경고 알림');
  let pl = R.pushPayload(ev[0], config);
  assert.ok(pl.title.includes('지각 주의 (1회)') && pl.title.includes('Chú ý') && pl.body.includes('한 번 더 하면 2회') && pl.body.includes('1월 10일') && !pl.strong, '약한 경고 내용 (베트남어+한국어)');
  ev = R.warnPushEvents({ config, staff:staffS, strikes:{ b:{ count:2, limit:3, lastLate:ds, resetOn:'2027-01-10' } }, now:at('09:10') });
  pl = R.pushPayload(ev[0], config);
  assert.ok(ev[0].level === 'strong' && pl.strong && pl.body.includes('3회 = 퇴사 기준') && pl.body.includes('cho nghỉ việc'), '2회 = 강한 경고');
  assert.strictEqual(R.warnPushEvents({ config, staff:staffS, strikes:{ b:{ count:3, limit:3, lastLate:ds } }, now:at('09:10') })[0].level, 'over');
  assert.strictEqual(R.warnPushEvents({ config, staff:staffS, strikes:{ b:{ count:1, limit:3, lastLate:'2026-12-09' } }, now:at('09:10') }).length, 0, '어제 지각은 경고 알림 다시 안 보냄');
  assert.strictEqual(R.warnPushEvents({ config:{ ...config, push:{ on:false } }, staff:staffS, strikes:{ b:{ count:1, lastLate:ds } }, now:at('09:10') }).length, 0, '끄면 안 보냄');
  assert.strictEqual(R.warnPushEvents({ config:{ lateRule:{ since:'2027-01-01' } }, staff:staffS, strikes:{ b:{ count:1, lastLate:ds } }, now:at('09:10') }).length, 0, '새 규칙 시작 전이면 안 보냄');
  // 출근 전 알림: 지각 1회 이상 + 출근 60분 전 ~ 출근 시각
  const strikes = { b:{ count:1, limit:3, lastLate:'2026-12-05', resetOn:'2027-01-05' }, c:{ count:0 } };
  ev = R.preShiftEvents({ config, staff:staffS, strikes, punches:{}, now:at('08:10') });
  assert.ok(ev.length === 1 && ev[0].st.id === 'b' && ev[0].key === 'pp_b_' + ds, '지각 있는 직원만 출근 전 알림');
  pl = R.pushPayload(ev[0], config);
  assert.ok(pl.title.includes('09:00') && pl.body.includes('5분 일찍') && pl.body.includes('1/3'), '출근 전 알림 내용');
  assert.strictEqual(R.preShiftEvents({ config, staff:staffS, strikes, punches:{}, now:at('07:59') }).length, 0, '60분 전보다 이르면 아직');
  assert.strictEqual(R.preShiftEvents({ config, staff:staffS, strikes, punches:{}, now:at('09:00') }).length, 0, '출근 시각이 지나면 안 보냄');
  assert.strictEqual(R.preShiftEvents({ config, staff:staffS, strikes, punches:{ ['b_' + ds]:{ in:at('08:30') } }, now:at('08:40') }).length, 0, '이미 출근했으면 안 보냄');
  assert.strictEqual(R.preShiftEvents({ config:{ ...config, push:{ pre:false } }, staff:staffS, strikes, punches:{}, now:at('08:10') }).length, 0, '출근 전 알림 끄기');
  assert.strictEqual(R.preShiftEvents({ config:{ ...config, push:{ before:30 } }, staff:staffS, strikes, punches:{}, now:at('08:20') }).length, 0, '30분 전으로 바꾸면 8:20은 아직');
  assert.strictEqual(R.preShiftEvents({ config, staff:staffS, strikes:{ b:{ ...strikes.b, resetOn:'2026-12-10' } }, punches:{}, now:at('08:10') }).length, 0, '한 달 지나 0회면 안 보냄');
  assert.strictEqual(R.pushPayload(R.preShiftEvents({ config, staff:staffS, strikes:{ b:{ count:2, limit:3, resetOn:'2027-01-05' } }, punches:{}, now:at('08:10') })[0], config).strong, true, '2회면 출근 전 알림도 강하게');
  console.log('서버 규칙 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
`;
eval(src);
