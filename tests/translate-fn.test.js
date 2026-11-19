// 자동 번역 서버 함수(tc-translate/index.ts) 시험: 가짜 Claude API로 실제로 돌려 봐요
//   로그인 확인 · 키 없음 안내 · 요청 모양(모델·effort·대체 모델·JSON 형식) · 빈 칸 건너뛰기 · 거절/오류 처리
const assert = require('assert');
const { register } = require('node:module');

const FAKE_SB = 'file:///fake-supabase.mjs', FAKE_AI = 'file:///fake-anthropic.mjs';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next){
  if (spec.startsWith('npm:@supabase/supabase-js')) return { url:'${FAKE_SB}', shortCircuit:true };
  if (spec.startsWith('npm:@anthropic-ai/sdk')) return { url:'${FAKE_AI}', shortCircuit:true };
  return next(spec, ctx);
}
export async function load(url, ctx, next){
  if (url === '${FAKE_SB}') return { format:'module', source:'export const createClient = () => globalThis.__fakeClient;', shortCircuit:true };
  if (url === '${FAKE_AI}') return { format:'module', shortCircuit:true, source:\`
    class APIError extends Error { constructor(status, m){ super(m); this.status = status; } }
    class AuthenticationError extends APIError {}
    class RateLimitError extends APIError {}
    export default class Anthropic {
      static APIError = APIError; static AuthenticationError = AuthenticationError; static RateLimitError = RateLimitError;
      constructor(o){ this.key = o.apiKey; this.beta = { messages: { create: p => globalThis.__claude(p) } }; }
    }\` };
  return next(url, ctx);
}
`));

const users = { 'owner-token': { id:'u1', app_metadata:{ apps:['timecard'] } }, 'jangbu-token': { id:'u2', app_metadata:{ apps:['jangbu'] } } };
globalThis.__fakeClient = { auth: { getUser: async t => users[t] ? { data:{ user:users[t] }, error:null } : { data:{ user:null }, error:{ message:'bad' } } } };
let handler = null, env = { SUPABASE_URL:'x', SUPABASE_SERVICE_ROLE_KEY:'x', ANTHROPIC_API_KEY:'sk-test' };
globalThis.Deno = { env: { get: k => env[k] }, serve: h => { handler = h; } };
const calls = [];
let reply = p => {   // 기본: 받은 글 앞에 [vi] 붙여 돌려줌
  const arr = JSON.parse(p.messages[0].content.split('\n\n').slice(1).join('\n\n'));
  return { stop_reason:'end_turn', content:[{ type:'text', text: JSON.stringify({ translations: arr.map(s => '[vi] ' + s) }) }] };
};
globalThis.__claude = async p => { calls.push(p); return reply(p); };
const call = async (body, token = 'owner-token') => {
  const res = await handler(new Request('http://f/', { method:'POST', headers:{ 'content-type':'application/json', ...(token ? { authorization:'Bearer ' + token } : {}) }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

(async () => {
  try { await import('../supabase/functions/tc-translate/index.ts'); }
  catch (e) {
    if (e && e.code === 'ERR_UNKNOWN_FILE_EXTENSION') { console.log('Node가 오래돼 번역 함수 시험은 건너뜀 (Node 22.18 이상 필요)'); process.exit(0); }
    throw e;
  }
  assert.ok(handler, '서버 함수 시작');

  // 1. 로그인: 토큰 없음·장부 전용 계정은 거절
  assert.strictEqual((await call({ texts:['안녕'], to:'vi' }, null)).status, 401);
  assert.strictEqual((await call({ texts:['안녕'], to:'vi' }, 'jangbu-token')).status, 401, '장부 전용 계정 거절');

  // 2. 잘못된 요청
  assert.strictEqual((await call({ texts:[], to:'vi' })).status, 400);
  assert.strictEqual((await call({ texts:['a'], to:'en' })).status, 400, '언어는 vi/ko만');
  assert.strictEqual((await call({ texts:Array(21).fill('a'), to:'vi' })).status, 400, '한 번에 20개까지');
  assert.strictEqual((await call({ texts:['a'.repeat(4001)], to:'vi' })).status, 400, '4000자까지');

  // 3. 정상 번역: 빈 칸은 그대로, 순서 유지, 요청 모양 확인
  let r = await call({ texts:['그린홍합 손질', '', '15:00까지 사진 올려 주세요'], to:'vi' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.translations, ['[vi] 그린홍합 손질', '', '[vi] 15:00까지 사진 올려 주세요'], '빈 칸 건너뛰고 순서 그대로');
  const p = calls.at(-1);
  assert.strictEqual(p.model, 'claude-opus-5-5');
  assert.strictEqual(p.output_config.effort, 'low');
  assert.strictEqual(p.output_config.format.type, 'json_schema');
  assert.deepStrictEqual(p.betas, ['server-side-fallback-2026-07-01']); assert.strictEqual(p.fallbacks, 'default');
  assert.ok(p.system.includes('Vietnamese') && p.system.includes('names, numbers, times'), '베트남어로, 이름·숫자·시간 그대로');
  assert.ok(p.messages[0].content.includes('exactly 2 items'), '빈 칸은 보내지 않음');
  const n = calls.length;
  r = await call({ texts:['', '  '], to:'ko' });
  assert.deepStrictEqual(r.body.translations, ['', '  ']); assert.strictEqual(calls.length, n, '빈 칸만 있으면 Claude를 부르지 않음');
  await call({ texts:['Em xin nghỉ'], to:'ko' });
  assert.ok(calls.at(-1).system.includes('Korean') && calls.at(-1).system.includes('사장님'), '한국어로 (사장님용)');

  // 4. 거절·잘림·개수 틀림·키 오류·요청 많음 (서버 로그는 감춤)
  const err = console.error; console.error = () => {};
  reply = () => ({ stop_reason:'refusal', content:[] });
  assert.strictEqual((await call({ texts:['a'], to:'vi' })).status, 422, '거절');
  reply = () => ({ stop_reason:'max_tokens', content:[{ type:'text', text:'{"transl' }] });
  assert.strictEqual((await call({ texts:['a'], to:'vi' })).status, 422, '너무 김');
  reply = () => ({ stop_reason:'end_turn', content:[{ type:'text', text:'{"translations":["x","y"]}' }] });
  assert.strictEqual((await call({ texts:['a'], to:'vi' })).status, 500, '개수가 맞지 않으면 오류');
  const A = (await import('npm:@anthropic-ai/sdk')).default;
  reply = () => { throw new A.AuthenticationError(401, 'bad key'); };
  r = await call({ texts:['a'], to:'vi' }); assert.ok(r.status === 503 && r.body.error.includes('키'), '키 틀림');
  reply = () => { throw new A.RateLimitError(429, 'slow'); };
  assert.strictEqual((await call({ texts:['a'], to:'vi' })).status, 429);
  reply = () => { throw new A.APIError(500, 'down'); };
  assert.strictEqual((await call({ texts:['a'], to:'vi' })).status, 502);
  console.error = err;
  console.log('번역 서버 함수 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
