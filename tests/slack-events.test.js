// 슬랙 알림 시험: 서버 함수(tc-notyet-check/index.ts)를 가짜 저장소·가짜 슬랙으로 실제로 돌려 봐요
//   미출근 · 출근 · 퇴근 · 업무 보고 도착 · 업무 마감 지남, 한 번만 보내기, 종류별 끄기, 실패하면 다음에 다시
// + 업무 규칙(assignees / appliesOn)이 앱(public/index.html)과 같은 답을 내는지
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { register } = require('node:module');

// 'npm:@supabase/supabase-js@…'(Deno 방식) 대신 가짜 저장소를 쓰게
const FAKE = 'file:///fake-supabase.mjs';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next){ if (spec.startsWith('npm:@supabase/supabase-js')) return { url:'${FAKE}', shortCircuit:true }; return next(spec, ctx); }
export async function load(url, ctx, next){ if (url === '${FAKE}') return { format:'module', source:'export const createClient = () => globalThis.__fakeClient;', shortCircuit:true }; return next(url, ctx); }
`));

// ----- 가짜 저장소 (tc_docs 한 표) -----
const rows = new Map();   // "collection|id" → { collection, id, data, deleted_at }
const K = (c, id) => c + '|' + id;
function query() {
  const f = []; let op = 'select', payload = null, lim = 0;
  const run = () => {
    const match = r => f.every(([k, kind, v]) => kind === 'eq' ? r[k] === v : kind === 'is' ? (r[k] ?? null) === v : kind === 'in' ? v.includes(r[k])
      : kind === 'like' ? new RegExp('^' + v.replace(/[.*+?^${}()|[\]]/g, m => m === '%' ? m : '\\' + m).replace(/\\\\_/g, '_').replace(/%/g, '.*') + '$').test(r[k]) : true);
    if (op === 'insert') { const k = K(payload.collection, payload.id); if (rows.has(k)) return { data:null, error:{ code:'23505', message:'duplicate' } }; rows.set(k, { deleted_at:null, ...payload }); return { data:null, error:null }; }
    if (op === 'upsert') { rows.set(K(payload.collection, payload.id), { deleted_at:null, ...payload }); return { data:null, error:null }; }
    const hit = [...rows.values()].filter(match);
    if (op === 'delete') { hit.forEach(r => rows.delete(K(r.collection, r.id))); return { data:null, error:null }; }
    return { data: (lim ? hit.slice(0, lim) : hit).map(r => ({ ...r })), error:null };
  };
  const b = {
    select(){ return b; }, eq(k, v){ f.push([k, 'eq', v]); return b; }, is(k, v){ f.push([k, 'is', v]); return b; },
    in(k, v){ f.push([k, 'in', v]); return b; }, like(k, v){ f.push([k, 'like', v]); return b; }, limit(n){ lim = n; return b; },
    insert(p){ op = 'insert'; payload = p; return b; }, upsert(p){ op = 'upsert'; payload = p; return b; }, delete(){ op = 'delete'; return b; },
    maybeSingle: async () => { const r = run(); return { data: r.data?.[0] || null, error: r.error }; },
    then(res, rej){ return Promise.resolve(run()).then(res, rej); },
  };
  return b;
}
const users = { 'owner-token': { id:'u1', app_metadata:{ apps:['timecard'] } }, 'jangbu-token': { id:'u2', app_metadata:{ apps:['jangbu'] } } };
globalThis.__fakeClient = { from: () => query(), auth: { getUser: async t => users[t] ? { data:{ user:users[t] }, error:null } : { data:{ user:null }, error:{ message:'bad' } } } };

// ----- 가짜 Deno·슬랙 -----
let handler = null, slack = [], slackFail = false;
globalThis.Deno = { env: { get: k => ({ SUPABASE_URL:'x', SUPABASE_SERVICE_ROLE_KEY:'x', TC_SLACK_WEBHOOK_URL:'https://hooks.slack/x', TC_CRON_SECRET:'cron' })[k] }, serve: h => { handler = h; } };
globalThis.fetch = async (url, opt) => { if (slackFail) return { ok:false, status:500, text: async () => 'down' }; slack.push(JSON.parse(opt.body).text); return { ok:true }; };
const call = async (body = {}, headers = { 'x-cron-secret':'cron' }) => {
  const res = await handler(new Request('http://f/', { method:'POST', headers:{ 'content-type':'application/json', ...headers }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const put = (c, id, data) => rows.set(K(c, id), { collection:c, id, data, deleted_at:null });

(async () => {
  const R = await import('../supabase/functions/tc-notyet-check/rules.mjs');
  try { await import('../supabase/functions/tc-notyet-check/index.ts'); }
  catch (e) {   // .ts를 바로 못 여는 옛 Node (22.18 미만)
    if (e && e.code === 'ERR_UNKNOWN_FILE_EXTENSION') { console.log('Node가 오래돼 서버 함수 시험은 건너뜀 (Node 22.18 이상 필요)'); process.exit(0); }
    throw e;
  }
  assert.ok(handler, '서버 함수 시작');

  const now = Date.now(), ds = R.kstDate(now), ym = ds.slice(0, 7), min = 60000;
  const kstMin = Math.floor((now + 9 * 3600000) % 86400000 / min);
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const allDay = Array(7).fill({ on:true, start:'00:00', end:'23:59', brk:0 });
  put('config', 'main', { storeName:'시험 가게', graceMin:5, slack:{ on:true } });
  put('staff', 'a', { name:'김하늘', position:'주방', sched:allDay, active:true });
  put('staff', 'b', { name:'박도윤', position:'홀', sched:allDay, active:true });
  put('staff', 'c', { name:'이서연', position:'홀', sched:allDay, active:true });
  const P = `months/${ym}/punches`;
  put(P, `a_${ds}`, { staffId:'a', name:'김하늘', date:ds, kind:'work', in: now - 10 * min, out:null, lateMin:3, inVia:'phone', inPhoto:'p1', inGeo:{ out:false, ex:true, far:true } });
  put(P, `b_${ds}`, { staffId:'b', name:'박도윤', date:ds, kind:'work', in: now - 50 * min, out: now - 2 * min, lateMin:0, inPhoto:null, outGeo:{ out:true, dist:850 } });
  put(P, `b_old`, { staffId:'b', name:'박도윤', date:'2026-01-01', kind:'work', in: now - 300 * min, out:null });   // 1시간 넘은 기록은 알리지 않음
  const dueM = kstMin - 30, canDue = dueM > 0;
  put('tasks', 't1', { kind:'task', title:'그린홍합 손질', target:{ mode:'pos', pos:'주방' }, repeat:'daily', due: canDue ? hhmm(dueM) : '23:59', minPhotos:1, active:true, start:ds, createdAt: now - 86400000 });
  put('tasks', 't2', { kind:'task', title:'홀 바닥 사진', target:{ mode:'pos', pos:'홀' }, repeat:'daily', due:'23:59', minPhotos:1, active:true, start:ds, createdAt: now - 86400000 });
  put(`months/${ym}/task_reports`, `t2_b_${ds}`, { taskId:'t2', staffId:'b', date:ds, photos:['w_1', 'w_2'], note:'다 닦았어요', sentAt: now - 5 * min, status:'sent', round:1 });

  // 1. 예약 실행
  let r = await call();
  assert.strictEqual(r.status, 200);
  const all = slack.join('\n---\n');
  if (kstMin > 6) assert.ok(/이서연 미출근/.test(all), '미출근 (출근 안 한 직원)');
  assert.ok(/김하늘 \(주방\): 출근 \d\d:\d\d · 지각 3분 · 휴대폰 · 외근/.test(all), '출근 알림 (지각·휴대폰·외근 표시): ' + all);
  assert.ok(/박도윤 \(홀\): 출근 \d\d:\d\d · 사진 없음/.test(all), '출근 알림 (사진 없음)');
  assert.ok(/박도윤 \(홀\): 퇴근 \d\d:\d\d \(출근 \d\d:\d\d\) · 가게 밖 850m/.test(all), '퇴근 알림 (가게 밖)');
  assert.ok(!/2026-01-01/.test(all) && (all.match(/박도윤 \(홀\): 출근/g) || []).length === 1, '오래된 기록은 알리지 않음');
  assert.ok(/박도윤 업무 보고 도착/.test(all) && /홀 바닥 사진 · 사진 2장/.test(all) && /다 닦았어요/.test(all), '보고 도착');
  if (canDue) assert.ok(/업무 마감 지남/.test(all) && /그린홍합 손질 \(\d\d:\d\d까지\): 김하늘 아직 안 보냄/.test(all), '마감 지남');
  assert.ok(!/홀 바닥 사진 \(23:59까지\)/.test(all), '마감 전 업무는 알리지 않음');
  console.log(slack.map(m => m.split('\n')[0]).join(' | '));
  const st = rows.get(K('status', 'alert')).data;
  assert.ok(st.ok && st.kind === 'events' && /퇴근/.test(st.text), '현황 화면용 결과 기록');

  // 2. 다시 실행 → 같은 알림은 다시 안 감
  const n1 = slack.length;
  r = await call();
  assert.strictEqual(slack.length, n1, '한 번만 보냄');

  // 3. 다시 보내기(회차 2) → 보고 도착 다시, 다시 요청 받은 직원은 마감 지남에 포함
  put(`months/${ym}/task_reports`, `t2_b_${ds}`, { taskId:'t2', staffId:'b', date:ds, photos:['w_3'], sentAt: now - min, status:'sent', round:2 });
  await call();
  assert.ok(/2번째/.test(slack.at(-1)), '다시 보낸 보고도 알림');

  // 4. 종류별 끄기: 출근 알림 끄면 새 출근이 와도 안 보냄
  put('config', 'main', { storeName:'시험 가게', graceMin:5, slack:{ on:true, ev:{ in:false } } });
  put(P, `c_${ds}`, { staffId:'c', name:'이서연', date:ds, kind:'work', in: now - min, out:null, lateMin:0 });
  const n2 = slack.length;
  await call();
  assert.strictEqual(slack.length, n2, '출근 알림 끔');

  // 5. 슬랙이 실패하면 표시를 지워서 다음 실행에 다시 보냄
  put('config', 'main', { storeName:'시험 가게', graceMin:5, slack:{ on:true } });
  slackFail = true;
  r = await call();
  assert.strictEqual(r.status, 500); assert.ok(!rows.has(K(`months/${ym}/alerts`, `in_c_${ds}`)), '실패하면 표시 지움');
  assert.strictEqual(rows.get(K('status', 'alert')).data.ok, false, '실패 기록');
  slackFail = false;
  await call();
  assert.ok(/이서연 \(홀\): 출근/.test(slack.at(-1)), '다음 실행에 다시 보냄');

  // 6. 앱의 바로 확인(kick)·시험 알림·권한
  assert.strictEqual((await call({ kick:true }, { Authorization:'Bearer owner-token' })).status, 200, '사장님 계정으로 바로 확인');
  assert.strictEqual((await call({ kick:true }, { Authorization:'Bearer jangbu-token' })).status, 401, '장부 전용 계정은 거절');
  assert.strictEqual((await call({ kick:true }, {})).status, 401, '로그인 없으면 거절');
  await call({ test:true }, { Authorization:'Bearer owner-token' });
  assert.ok(/알림 시험/.test(slack.at(-1)) && /출근·퇴근·업무 보고/.test(slack.at(-1)), '시험 알림');
  // 슬랙 꺼짐 → 아무것도 안 보냄
  put('config', 'main', { slack:{ on:false } });
  put(P, `a2_${ds}`, { staffId:'a', date:ds, kind:'work', in: now - min });
  const n3 = slack.length; await call(); assert.strictEqual(slack.length, n3, '슬랙 꺼지면 안 보냄');
  console.log('서버 함수 알림 시험 통과');

  // ----- 앱과 서버의 업무 규칙이 같은지 -----
  const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:false, value:'' };
  global.document = { addEventListener(){}, querySelector: () => el, querySelectorAll: () => [], createElement: () => ({ ...el, remove(){} }) };
  global.window = {}; global.location = { hash:'' }; global.localStorage = { getItem: () => null, setItem(){} }; global.scrollTo = () => {}; global.setInterval = () => 0;
  let src = fs.readFileSync(path.join(__dirname, 'chk.js'), 'utf8').replace(/\nboot\(\);\s*$/, '\n');
  src += '\nglobalThis.__app = { S, assignees, appliesOn };\n';
  eval(src);
  const A = globalThis.__app;
  const staff = [{ id:'s1', position:'홀' }, { id:'s2', position:'주방' }, { id:'s3', position:'홀', active:false }, { id:'s4' }];
  A.S.staff = staff;
  const tasks = [
    { kind:'task', target:{ mode:'all' }, repeat:'daily', start:'2026-11-10' },
    { kind:'task', target:{ mode:'pos', pos:'홀' }, repeat:'days', days:[1, 3, 5], start:'2026-11-01' },
    { kind:'task', target:{ mode:'staff', ids:['s2', 's3'] }, repeat:'once', start:'2026-11-12' },
    { kind:'notice', target:{ mode:'all' }, start:'2026-11-01' },
    { kind:'task', repeat:'daily' },
  ];
  let n = 0;
  for (const t of tasks) {
    assert.deepStrictEqual(R.assignees(t, staff).map(s => s.id), A.assignees(t).map(s => s.id), '담당 같음');
    for (let d = 1; d <= 30; d++) { const day = `2026-11-${String(d).padStart(2, '0')}`; assert.strictEqual(R.appliesOn(t, day), A.appliesOn(t, day), `${day} 해당 여부 같음`); n++; }
  }
  console.log(`앱과 같은 업무 규칙: ${n}개 확인`);
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
