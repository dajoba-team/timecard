// 직원 휴대폰 1회용 연결 서버 함수(tc-phone-join/index.ts) 시험 (v39): 가짜 Supabase로 실제로 돌려 봐요
//   사장님만 코드 발급 · 공용 계정은 한 번 만들고 장부 권한 없음 · 코드는 한 번만·10분 · 저장은 해시 · 모두 끊기
const assert = require('assert');
const { register } = require('node:module');
const FAKE = 'file:///fake-supabase.mjs';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next){ if (spec.startsWith('npm:@supabase/supabase-js')) return { url:'${FAKE}', shortCircuit:true }; return next(spec, ctx); }
export async function load(url, ctx, next){ if (url === '${FAKE}') return { format:'module', source:'export const createClient = () => globalThis.__fakeClient;', shortCircuit:true }; return next(url, ctx); }
`));

// ----- 가짜 저장소 (tc_docs) -----
const rows = new Map(); const K = (c, id) => c + '|' + id;
function query(){
  const f = []; let op = 'select', payload = null;
  const match = r => f.every(([k, kind, v]) => kind === 'eq' ? r[k] === v : kind === 'is' ? (r[k] ?? null) === v : true);
  const run = () => {
    if (op === 'upsert'){ rows.set(K(payload.collection, payload.id), { deleted_at:null, ...payload }); return { data:null, error:null }; }
    const hit = [...rows.values()].filter(match);
    if (op === 'delete'){ hit.forEach(r => rows.delete(K(r.collection, r.id))); return { data:null, error:null }; }
    return { data: hit.map(r => ({ ...r })), error:null };
  };
  const b = {
    select(){ return b; }, eq(k, v){ f.push([k, 'eq', v]); return b; }, is(k, v){ f.push([k, 'is', v]); return b; },
    upsert(p){ op = 'upsert'; payload = p; return b; }, delete(){ op = 'delete'; return b; },
    maybeSingle: async () => { const r = run(); return { data: r.data?.[0] || null, error: r.error }; },
    then(res, rej){ return Promise.resolve(run()).then(res, rej); },
  };
  return b;
}
const users = { 'owner-token': { id:'u1', app_metadata:{ apps:['timecard', 'jangbu'] } }, 'jangbu-token': { id:'u2', app_metadata:{ apps:['jangbu'] } }, 'phone-token': { id:'u3', app_metadata:{ apps:['timecard'], tc_role:'phone' } } };
const authUsers = new Map(); let created = 0, deleted = 0, links = 0;
globalThis.__fakeClient = {
  from: () => query(),
  auth: {
    getUser: async t => users[t] ? { data:{ user:users[t] }, error:null } : { data:{ user:null }, error:{ message:'bad' } },
    admin: {
      getUserById: async id => ({ data:{ user: authUsers.get(id) || null } }),
      createUser: async o => { created++; const u = { id:'pu' + created, email:o.email, app_metadata:o.app_metadata }; authUsers.set(u.id, u); globalThis.__lastCreate = o; return { data:{ user:u }, error:null }; },
      deleteUser: async id => { deleted++; authUsers.delete(id); return { error:null }; },
      generateLink: async o => { links++; globalThis.__lastLink = o; return { data:{ properties:{ hashed_token:'th' + links } }, error:null }; },
    },
  },
};
let handler = null;
globalThis.Deno = { env: { get: k => ({ SUPABASE_URL:'x', SUPABASE_SERVICE_ROLE_KEY:'x' })[k] }, serve: h => { handler = h; } };
const call = async (body, token) => {
  const res = await handler(new Request('http://f/', { method:'POST', headers:{ 'content-type':'application/json', ...(token ? { authorization:'Bearer ' + token } : {}) }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const put = (c, id, data) => rows.set(K(c, id), { collection:c, id, data, deleted_at:null });

(async () => {
  try { await import('../supabase/functions/tc-phone-join/index.ts'); }
  catch (e) { if (e && e.code === 'ERR_UNKNOWN_FILE_EXTENSION') { console.log('Node가 오래돼 건너뜀'); process.exit(0); } throw e; }
  assert.ok(handler, '서버 함수 시작');
  put('staff', 's1', { name:'성실', active:true }); put('staff', 'gone', { name:'퇴사', active:false });

  // 1. 코드 발급은 사장님만 (로그인 없음·장부 전용·직원용 공용 계정은 거절)
  for (const t of [null, 'jangbu-token', 'phone-token']) assert.strictEqual((await call({ action:'issue', staffId:'s1' }, t)).status, 401, '발급 거절: ' + t);
  assert.strictEqual((await call({ action:'issue', staffId:'nobody' }, 'owner-token')).status, 404, '없는 직원');
  assert.strictEqual((await call({ action:'issue', staffId:'gone' }, 'owner-token')).status, 404, '퇴사한 직원');
  let r = await call({ action:'issue', staffId:'s1' }, 'owner-token');
  assert.ok(r.status === 200 && /^[A-HJ-NP-Z2-9]{8}$/.test(r.body.code) && r.body.exp > Date.now(), '코드 발급 (8자리, 헷갈리는 글자 없음)');
  const code1 = r.body.code;
  assert.strictEqual(created, 1, '공용 계정 처음 한 번 만듦');
  assert.deepStrictEqual(globalThis.__lastCreate.app_metadata, { apps:['timecard'], tc_role:'phone' }, '공용 계정: 타임카드만 (장부 없음), 표시 phone');
  assert.ok(globalThis.__lastCreate.email_confirm && globalThis.__lastCreate.password.length >= 40, '확인 처리, 아무도 모르는 긴 비밀번호');
  assert.ok(![...rows.keys()].some(k => k.includes(code1)), '코드는 그대로 저장하지 않음 (해시만)');
  await call({ action:'issue', staffId:'s1' }, 'owner-token'); assert.strictEqual(created, 1, '두 번째부터는 있는 계정 사용');

  // 2. 사용: 로그인 없이, 한 번만
  assert.strictEqual((await call({ action:'redeem', code:'x' })).status, 400, '모양이 이상한 코드');
  assert.strictEqual((await call({ action:'redeem', code:'a'.repeat(24) })).status, 404, '없는 코드');
  r = await call({ action:'redeem', code:(code1.slice(0, 4) + '-' + code1.slice(4)).toLowerCase() });   // 손으로 넣은 '소문자 + 대시'도 받음
  assert.ok(r.status === 200 && r.body.token_hash === 'th1' && r.body.staffId === 's1', '코드 → 로그인 토큰 + 직원');
  assert.ok(globalThis.__lastLink.type === 'magiclink' && globalThis.__lastLink.email.includes('tc-phone@'), '공용 계정 1회용 로그인 링크');
  assert.strictEqual((await call({ action:'redeem', code:code1 })).status, 410, '한 번 쓴 코드는 다시 못 씀');
  // 시간 지난 코드
  r = await call({ action:'issue', staffId:'s1' }, 'owner-token');
  for (const row of rows.values()) if (row.collection === 'phone_join' && !row.data.used) row.data.exp = Date.now() - 1;
  assert.strictEqual((await call({ action:'redeem', code:r.body.code })).status, 410, '10분 지나면 못 씀');

  // 3. 상태·모두 끊기
  r = await call({ action:'status' }, 'owner-token'); assert.ok(r.body.exists, '공용 계정 있음');
  assert.strictEqual((await call({ action:'revoke' }, 'phone-token')).status, 401, '직원 휴대폰은 끊기 못 함');
  put('phone_links', 's1', { staffId:'s1', first:1, last:1 });
  r = await call({ action:'revoke' }, 'owner-token');
  assert.ok(r.body.ok && r.body.removed && deleted === 1, '공용 계정 지움 (연결된 휴대폰 모두 로그아웃)');
  assert.ok(![...rows.values()].some(x => ['phone_join', 'phone_links'].includes(x.collection) || (x.collection === 'config' && x.id === 'phone_account')), '코드·연결 기록·계정 기록 지움');
  r = await call({ action:'issue', staffId:'s1' }, 'owner-token'); assert.ok(r.body.code && created === 2, '다시 발급하면 새 공용 계정');
  assert.strictEqual((await call({ action:'nope' }, 'owner-token')).status, 400);
  console.log('휴대폰 1회용 연결 서버 함수 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
