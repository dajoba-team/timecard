// public/storage.js 시험: 가짜 Supabase로 db(컬렉션/문서/실시간)와 사진 URL이 앱이 기대하는 모양으로 동작하는지
const fs = require('fs');
const assert = require('assert');

// ----- 가짜 Supabase (docs 테이블 + Realtime + Storage) -----
let clock = Date.parse('2026-11-12T00:00:00Z');
const ts = () => new Date(clock += 1000).toISOString();
const table = new Map();   // "collection\u0000id" → row
let realtime = null, failNext = null, offline = false;
const NET = { message:'TypeError: Failed to fetch' };
const key = (c, id) => c + '\u0000' + id;
function query(){
  const q = { f: [], range: null, op: 'select', single: false, maybe: false };
  const b = {
    select(){ return b; }, order(){ return b; },
    eq(col, v){ q.f.push(r => r[col] === v); return b; },
    is(col, v){ q.f.push(r => (r[col] ?? null) === v); return b; },
    range(a, z){ q.range = [a, z]; return b; },
    single(){ q.single = true; return b; }, maybeSingle(){ q.maybe = true; return b; },
    upsert(row){ q.op = 'upsert'; q.row = row; return b; },
    update(patch){ q.op = 'update'; q.patch = patch; return b; },
    then(res, rej){ return Promise.resolve().then(run).then(res, rej); },
  };
  function run(){
    if (offline) return { data:null, error:NET };
    if (failNext){ const e = failNext; failNext = null; return { data:null, error:e }; }
    if (q.op === 'upsert'){
      const k = key(q.row.collection, q.row.id), old = table.get(k);
      const row = { ...q.row, updated_at: ts() };
      table.set(k, row);
      return { data: q.single ? { ...row } : [row], error:null };
    }
    let rows = [...table.values()].filter(r => q.f.every(f => f(r))).sort((a, b) => a.id < b.id ? -1 : 1);
    if (q.op === 'update'){
      rows.forEach(r => Object.assign(r, q.patch, { updated_at: ts() }));
      return { data: rows.map(r => ({ ...r })), error:null };
    }
    if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
    if (q.maybe) return { data: rows[0] ? { ...rows[0] } : null, error:null };
    return { data: rows.map(r => ({ ...r })), error:null };
  }
  return b;
}
const fakeClient = {
  auth: { getSession: async () => ({ data:{ session:{ user:{ email:'owner@example.com', app_metadata:{ apps:['jangbu','timecard'] } } } } }), onAuthStateChange(){}, signOut: async () => {} },
  from: () => query(),
  rpc: async (fn, { p_collection, p_id, p_patch }) => {
    if (offline) return { data:null, error:NET };
    const r = table.get(key(p_collection, p_id));
    if (!r || r.deleted_at) return { data:null, error:{ code:'P0002', message:'not_found' } };
    r.data = { ...r.data, ...p_patch }; r.updated_at = ts();
    return { data:{ ...r }, error:null };
  },
  channel(){ const ch = { on(_t, _f, cb){ realtime = cb; return ch; }, subscribe(cb){ setTimeout(() => cb('SUBSCRIBED')); return ch; } }; return ch; },
  storage: { from: () => ({ createSignedUrls: async paths => ({ data: paths.map(p => ({ signedUrl: p.startsWith('gone') ? null : 'https://signed/' + p })), error:null }) }) },
};

// ----- 브라우저 흉내 -----
const imgs = [];
const wl = {};
global.window = { supabase: { createClient: () => fakeClient }, addEventListener(t, f){ (wl[t] = wl[t] || []).push(f); } };
global.document = { addEventListener(){}, body:{ appendChild(){} }, getElementById: () => null, querySelectorAll: () => imgs };
global.crypto = require('crypto').webcrypto;

let src = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'storage.js'), 'utf8');
eval(src);

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
(async () => {
  const db = await window.tcStore.use('db');

  // 경로 나누기: 'months/2026-11/punches/s1_2026-11-12' → collection + id
  await db.doc('months/2026-11/punches/s1_2026-11-12').set({ staffId:'s1', in:1, out:null, skip:undefined });
  const row = table.get(key('months/2026-11/punches', 's1_2026-11-12'));
  assert.ok(row, 'collection/id로 저장');
  assert.ok(!('skip' in row.data), 'undefined 필드는 빠짐');
  console.log('set →', row.collection, row.id);

  // get / exists
  let g = await db.collection('months/2026-11/punches').doc('s1_2026-11-12').get();
  assert.strictEqual(g.exists, true); assert.strictEqual(g.data().in, 1);
  assert.strictEqual((await db.doc('config/main').get()).exists, false);

  // 컬렉션 구독: 처음 불러오기 + 내가 쓴 값 바로 반영
  const seen = [];
  const unsub = db.collection('months/2026-11/punches').onSnapshot(s => seen.push(s.docs.map(d => d.id + ':' + JSON.stringify(d.data().out))));
  await tick(5);
  assert.deepStrictEqual(seen.at(-1), ['s1_2026-11-12:null'], '처음 불러오기');
  await db.doc('months/2026-11/punches/s1_2026-11-12').update({ out:2 });
  assert.deepStrictEqual(seen.at(-1), ['s1_2026-11-12:2'], 'update 바로 반영 (부분 수정)');
  assert.strictEqual(table.get(key('months/2026-11/punches', 's1_2026-11-12')).data.staffId, 's1', 'update는 다른 필드를 지우지 않음');

  // 없는 문서 update → not_found
  await assert.rejects(db.doc('staff/none').update({ a:1 }), e => e.code === 'not_found');

  // 다른 기기에서 온 실시간 변경
  const other = { collection:'months/2026-11/punches', id:'s2_2026-11-12', data:{ staffId:'s2', out:null }, updated_at: ts(), deleted_at:null };
  table.set(key(other.collection, other.id), other);
  realtime({ new: other });
  assert.deepStrictEqual(seen.at(-1), ['s1_2026-11-12:2', 's2_2026-11-12:null'], '실시간 추가');

  // 늦게 도착한 옛 이벤트는 무시
  realtime({ new: { ...other, data:{ staffId:'s2', out:'OLD' }, updated_at: new Date(clock - 60000).toISOString() } });
  assert.deepStrictEqual(seen.at(-1), ['s1_2026-11-12:2', 's2_2026-11-12:null'], '옛 이벤트 무시');

  // 삭제 = 소프트 삭제, 구독에서 빠짐
  await db.doc('months/2026-11/punches/s2_2026-11-12').delete();
  assert.ok(table.get(key(other.collection, other.id)).deleted_at, 'deleted_at 기록');
  assert.deepStrictEqual(seen.at(-1), ['s1_2026-11-12:2'], '삭제 반영');
  assert.strictEqual((await db.doc('months/2026-11/punches/s2_2026-11-12').get()).exists, false);

  // set은 삭제된 문서를 되살림
  await db.doc('months/2026-11/punches/s2_2026-11-12').set({ staffId:'s2', out:3 });
  assert.strictEqual(seen.at(-1).length, 2, '다시 set하면 되살아남');

  // 문서 구독 (config/main): 없을 때 exists:false, 쓰면 반영
  const cfgSeen = [];
  db.doc('config/main').onSnapshot(s => cfgSeen.push(s.exists ? s.data().storeName : null));
  await tick(5);
  assert.strictEqual(cfgSeen.at(-1), null);
  await db.doc('config/main').set({ storeName:'우리 가게' });
  assert.strictEqual(cfgSeen.at(-1), '우리 가게');

  // limit().get()
  const lim = await db.collection('months/2026-11/punches').limit(1).get();
  assert.strictEqual(lim.docs.length, 1);

  // 쓰기 실패 → 앱이 알아듣는 code
  failNext = { message:'TypeError: Failed to fetch' };
  await assert.rejects(db.doc('config/main').set({}), e => e.code === 'unavailable');
  failNext = { code:'42501', message:'new row violates row-level security policy' };
  await assert.rejects(db.doc('config/main').set({}), e => e.code === 'invalid_argument');

  // ----- 전송 대기 목록 (인터넷 끊김) -----
  const ls = {}; const events = [];
  global.localStorage = { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
  window.dispatchEvent = e => events.push(e.detail);
  global.CustomEvent = class { constructor(t, o){ this.type = t; this.detail = o.detail; } };
  const pseen = [];
  const unsubP = db.collection('months/2026-12/punches').onSnapshot(s => pseen.push(s.docs.map(d => d.id + ':' + JSON.stringify(d.data().out))));
  await tick(5);
  offline = true;
  await db.doc('months/2026-12/punches/s1_2026-12-01').set({ staffId:'s1', in:10, out:null });   // 실패하지 않고 보관
  await db.doc('months/2026-12/punches/s1_2026-12-01').update({ out:20 });                       // 순서대로 뒤에 줄 섬
  assert.strictEqual(window.tcStore.pendingCount(), 2, '2건 대기');
  assert.strictEqual(JSON.parse(ls.tc_pending_v1).length, 2, '기기에 보관');
  assert.deepStrictEqual(pseen.at(-1), ['s1_2026-12-01:20'], '화면에는 바로 반영 (출근+퇴근)');
  assert.ok(!table.has(key('months/2026-12/punches', 's1_2026-12-01')), '서버엔 아직 없음');
  // 끊긴 동안 서버에서 다시 불러와도 대기분이 화면에서 사라지지 않음
  const s9 = { collection:'months/2026-12/punches', id:'s9_2026-12-01', data:{ out:null }, updated_at: ts(), deleted_at:null };
  table.set(key(s9.collection, s9.id), s9);
  realtime({ new: s9 });
  assert.deepStrictEqual(pseen.at(-1), ['s1_2026-12-01:20', 's9_2026-12-01:null']);
  await tick(5);
  assert.strictEqual(window.tcStore.pendingCount(), 2, '끊긴 동안은 그대로 대기');
  // 다시 연결 → 'online' 이벤트로 순서대로 전송
  offline = false;
  (wl.online || []).forEach(f => f());
  for (let i = 0; i < 20 && window.tcStore.pendingCount(); i++) await tick(10);
  assert.strictEqual(window.tcStore.pendingCount(), 0, '모두 보냄: ' + window.tcStore.pendingCount());
  const sent = table.get(key('months/2026-12/punches', 's1_2026-12-01'));
  assert.deepStrictEqual([sent.data.in, sent.data.out], [10, 20], '서버에 출근·퇴근 모두 반영');
  assert.ok(!('tc_pending_v1' in ls), '보관함 비움');
  assert.strictEqual(events.at(-1), 0, '대기 0건 알림');
  assert.deepStrictEqual(pseen.at(-1), ['s1_2026-12-01:20', 's9_2026-12-01:null']);
  // 대기 중일 때 새 쓰기는 앞의 것보다 먼저 가지 않음
  offline = true;
  await db.doc('months/2026-12/punches/s2_2026-12-01').set({ out:null });
  offline = false;
  await db.doc('months/2026-12/punches/s2_2026-12-01').update({ out:30 });   // 온라인이지만 줄 뒤에 섬
  for (let i = 0; i < 20 && window.tcStore.pendingCount(); i++) await tick(10);
  assert.strictEqual(table.get(key('months/2026-12/punches', 's2_2026-12-01')).data.out, 30, '순서 지켜 반영');
  // 없는 문서 update는 버림 (계속 막히지 않게)
  const realErr = console.error, logged = [];
  console.error = (...a) => logged.push(String(a[0]));
  offline = true;
  await db.doc('months/2026-12/punches/ghost').update({ out:1 });
  offline = false;
  for (let i = 0; i < 20 && window.tcStore.pendingCount(); i++) await tick(10);
  console.error = realErr;
  assert.strictEqual(window.tcStore.pendingCount(), 0, '없는 문서 수정은 버림');
  assert.ok(logged.some(l => l.includes('버림')), '버린 기록은 콘솔에 남김');
  unsubP();
  console.log('전송 대기 목록 통과');

  // 불러오는 도중 도착한 실시간 변경이 사라지지 않음 (불러온 결과에는 아직 없는 문서)
  const staffSeen = [];
  db.collection('staff').onSnapshot(s => staffSeen.push(s.docs.map(d => d.id)));
  realtime({ new: { collection:'staff', id:'late', data:{ name:'늦게 온 변경' }, updated_at: ts(), deleted_at:null } });
  await tick(5);
  assert.deepStrictEqual(staffSeen.at(-1), ['late'], '불러오는 중 받은 변경 유지');
  realtime({ new: { collection:'nobody', id:'y', data:{}, updated_at: ts() } });   // 구독 안 한 컬렉션은 무시
  unsub();

  // 사진 임시 URL: 처음엔 null, 받은 뒤 <img data-photo>에 넣고 다음부터 바로 돌려줌
  const img = { attrs:{ 'data-photo':'abc' }, getAttribute(k){ return this.attrs[k] ?? null; }, setAttribute(k, v){ this.attrs[k] = v; } };
  imgs.push(img);
  assert.strictEqual(window.tcStore.photoUrl('abc'), null);
  await tick(50);
  assert.strictEqual(img.attrs.src, 'https://signed/abc.jpg', '화면의 img에 URL 넣음');
  assert.strictEqual(window.tcStore.photoUrl('abc'), 'https://signed/abc.jpg', '캐시');
  assert.strictEqual(window.tcStore.photoUrl('../x'), null, '이상한 id 거부');

  // mcp(메일)는 아직 없음
  assert.strictEqual(await window.tcStore.use('mcp'), null);

  console.log('storage.js 시험 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
