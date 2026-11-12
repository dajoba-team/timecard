// 미출근 판단 시험: 서버(Edge Function) 규칙이 앱 화면(dayCalc)의 '미출근'과 같은 답을 내는지
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 시계를 마음대로 옮길 수 있게 (앱의 todayStr()도 이 시계를 씀). 이 컴퓨터는 한국시간 기준.
const RealDate = Date;
let fakeNow = RealDate.now();
global.Date = class extends RealDate {
  constructor(...a){ if (a.length) super(...a); else super(fakeNow); }
  static now(){ return fakeNow; }
};

const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:false, value:'' };
global.document = { addEventListener(){}, querySelector: () => el, createElement: () => ({ ...el, remove(){} }) };
global.window = {}; global.location = { hash:'' }; global.localStorage = { getItem: () => null, setItem(){} }; global.scrollTo = () => {}; global.setInterval = () => 0;

const W = JSON.parse(fs.readFileSync(path.join(__dirname, 'writes.json'), 'utf8'));
let src = fs.readFileSync(path.join(__dirname, 'chk.js'), 'utf8').replace(/\nboot\(\);\s*$/, '\n');
src += '\nglobalThis.__S = S; globalThis.__ACT = ACT; globalThis.__setToast = f => { toast = f; };\n';   // const는 eval 밖에서 안 보여서 따로 꺼냄
eval(src);
const S = globalThis.__S, ACT = globalThis.__ACT;

(async () => {
  const R = await import('../supabase/functions/tc-notyet-check/rules.mjs');

  // 예시 데이터 + 바뀐 상황들: 휴무 처리, 퇴사자, 입사 전, 야간 근무, 기록에 근무표가 따로 붙은 경우
  const config = { ...W.find(w => w.collection === 'config').data, graceMin: 5 };
  const staff = W.filter(w => w.collection === 'staff').map(w => ({ id:w.doc_id, ...w.data }));
  const base = staff[0];
  const allDays = [0,1,2,3,4,5,6].map(() => ({ on:true, start:'09:00', end:'18:00', brk:60 }));
  staff.push({ ...base, id:'night', name:'야간', sched: allDays.map(() => ({ on:true, start:'22:00', end:'06:00', brk:30 })), hireDate:'2026-01-01', endDate:null, active:true });
  staff.push({ ...base, id:'gone', name:'퇴사자', sched: allDays, active:false });
  staff.push({ ...base, id:'future', name:'입사예정', sched: allDays, hireDate:'2026-11-20', active:true });
  staff.push({ ...base, id:'ended', name:'퇴사일지남', sched: allDays, endDate:'2026-11-05', active:true });
  staff.push({ ...base, id:'leave', name:'휴무처리', sched: allDays, hireDate:'2026-01-01', active:true });
  staff.push({ ...base, id:'ovr', name:'근무표덮어씀', sched: allDays, hireDate:'2026-01-01', active:true });

  const punchesAll = {};
  W.filter(w => w.collection.startsWith('months')).forEach(w => { punchesAll[w.doc_id] = w.data; });
  for (const d of ['2026-11-08', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']) {
    punchesAll['leave_' + d] = { staffId:'leave', date:d, kind:'leave' };
    punchesAll['ovr_' + d] = { staffId:'ovr', date:d, kind:'work', sched:{ start:'13:00', end:'20:00', brk:0 } };   // in 없음
  }

  S.config = config; S.staff = staff;
  const months = new Map(Object.entries(punchesAll).map(([id, p]) => [id, { id, ...p }]));
  S.months['2026-11'] = months; S.monthLoaded['2026-11'] = true;

  let checked = 0, notyetSeen = 0;
  const reasons = new Set();
  for (const ds of ['2026-11-08', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']) {
    for (let m = 0; m < 24 * 60; m += 7) {   // 7분 간격으로 하루 전체
      const now = new RealDate(`${ds}T00:00:00+09:00`).getTime() + m * 60000;
      fakeNow = now;
      const app = new Set(staff.filter(st => st.active !== false && dayCalc(st, ds, now).status === 'notyet').map(st => st.id));
      const srv = new Set(R.notyetList({ config, staff, punches: punchesAll, now }).map(i => i.st.id));
      assert.deepStrictEqual([...srv].sort(), [...app].sort(), `${ds} ${R.fmtT(now)} 앱과 서버 판단이 달라요`);
      checked++; notyetSeen += srv.size; srv.forEach(id => reasons.add(id));
    }
  }
  assert.ok(notyetSeen > 0, '미출근 경우가 실제로 나와야 의미 있는 시험');
  assert.ok(reasons.has('ovr'), '기록에 붙은 근무표(13:00) 기준으로도 판단');
  assert.ok(!reasons.has('gone') && !reasons.has('leave') && !reasons.has('future'), '퇴사·휴무·입사 전은 제외: ' + [...reasons]);
  console.log(`앱과 같은 판단: ${checked}개 시각 확인, 미출근 ${notyetSeen}건 (직원: ${[...reasons].join(', ')})`);

  // 지각 봐주는 분 경계: 09:05까지는 아님, 09:05 넘으면 미출근
  const one = [{ id:'a', name:'가', sched: allDays, active:true }];
  const t = hm => new RealDate(`2026-11-12T${hm}:00+09:00`).getTime();
  assert.strictEqual(R.notyetList({ config:{ graceMin:5 }, staff:one, punches:{}, now:t('09:05') }).length, 0);
  assert.strictEqual(R.notyetList({ config:{ graceMin:5 }, staff:one, punches:{}, now:t('09:06') }).length, 1);
  assert.strictEqual(R.notyetList({ config:{}, staff:one, punches:{}, now:t('09:04') }).length, 0, '설정 없으면 기본 5분');
  assert.strictEqual(R.notyetList({ config:{ graceMin:5 }, staff:one, punches:{ 'a_2026-11-12':{ in:t('09:03') } }, now:t('10:00') }).length, 0, '출근했으면 아님');
  assert.strictEqual(R.notyetList({ config:{ graceMin:5 }, staff:one, punches:{}, now:t('18:01') }).length, 0, '퇴근 시각 지나면 더 안 보냄');

  // UTC 자정 근처(한국 오전 9시)에도 날짜를 한국 기준으로
  assert.strictEqual(R.kstDate(new RealDate('2026-11-12T23:30:00Z').getTime()), '2026-11-13');
  assert.strictEqual(R.weekday('2026-11-12'), 4, '2026-11-12는 목요일');

  // 메시지
  const msg = R.notyetMessage('우리 가게', R.notyetList({ config:{ graceMin:5 }, staff:one, punches:{}, now:t('09:12') }), t('09:12'));
  assert.ok(msg.includes('가 미출근') && msg.includes('09:00 예정') && msg.includes('09:12 현재'));
  console.log(msg.split('\n')[0], '/', msg.split('\n')[1]);
  // 현황 화면의 슬랙 칸 + 시험 알림 버튼
  const calls = [], toasts = [];
  window.tcStore = { invoke: async (n, b) => { calls.push([n, b]); return { ok:true }; } };
  __setToast(a => toasts.push(a));
  S.db = { doc: () => ({ set: async d => { S.config = d; } }) };
  S.mode = 'owner'; S.unlocked = true; S.tab = 'now'; S.ready.staff = true; S.ready.config = true;
  render(true);
  assert.ok(/슬랙 미출근 알림 꺼짐/.test(el.innerHTML) && /시험 알림 보내기/.test(el.innerHTML), '슬랙 칸 보임');
  const keepStaff = S.staff; S.staff = []; render(true);
  assert.ok(/직원을 먼저 등록해 주세요/.test(el.innerHTML) && /시험 알림 보내기/.test(el.innerHTML), '직원이 없어도 슬랙 칸 보임');
  S.staff = keepStaff; render(true);
  await ACT.slackTest();
  assert.deepStrictEqual(calls, [['tc-notyet-check', { test:true }]], '시험 알림은 서버 함수 호출');
  await ACT.slackToggle();
  assert.strictEqual(S.config.slack.on, true, '켜기 저장');
  S.alertStatus = { at: Date.now(), ok:false, err:'슬랙이 거절했어요' }; render(true);
  assert.ok(/슬랙 알림을 못 보냈어요 — 슬랙이 거절했어요/.test(el.innerHTML), '실패 표시');
  console.log('슬랙 화면 확인:', toasts.join(' | '));
  console.log('미출근 규칙 시험 통과');
})().catch(e => { console.error('Error', e); process.exit(1); });
