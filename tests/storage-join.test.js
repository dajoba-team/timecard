// storage.js 직원 휴대폰 1회용 연결 시험 (v39): 주소 끝 #join=코드 → 서버 함수로 로그인 토큰 받기 → 로그인 → 이 휴대폰을 그 직원 것으로 기억 → #phone으로 다시 열기
//   실패하면 이유와 '사장님 계정으로 로그인' 안내
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function setup({ invokeOk, hash = '#join=' + 'A'.repeat(24), seed = {} }){
  const calls = { invoke:[], verify:[], replace:null, reload:0, signOut:[] };
  let created = null;
  const ls = new Map(Object.entries(seed));
  const mkEl = () => ({ style:{}, innerHTML:'', id:'', querySelector: () => ({ set onclick(f){ calls.btn = f; } }), remove(){} });
  const client = {
    auth: {
      getSession: async () => ({ data:{ session:null } }),
      verifyOtp: async o => { calls.verify.push(o); return { data:{ session:{ user:{ email:'tc-phone@staff', app_metadata:{ apps:['timecard'], tc_role:'phone' } } } }, error:null }; },
      onAuthStateChange(){}, signOut: async o => { calls.signOut.push(o); }, signInWithPassword: async () => ({ error:{ message:'no' } }),
    },
    functions: { invoke: async (name, o) => { calls.invoke.push([name, o.body]); return invokeOk ? { data:{ token_hash:'th1', staffId:'s1' }, error:null } : { data:null, error:{ message:'fail', context:{ json: async () => ({ error:'이미 쓴 연결 코드예요' }) } } }; } },
    from(){ throw new Error('아직 저장소에 가면 안 됨'); }, channel(){ throw new Error('아직'); },
  };
  global.localStorage = { getItem: k => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
  Object.defineProperty(global.localStorage, 'length', { get: () => ls.size });
  global.localStorage.key = i => [...ls.keys()][i] ?? null;
  global.history = { replaceState(){} };
  global.window = { supabase:{ createClient: () => client }, addEventListener(){}, location:{ hash, pathname:'/', replace: u => { calls.replace = u; }, reload: () => { calls.reload++; } } };
  global.document = { addEventListener(){}, body:{ appendChild: el => { created = el; } }, getElementById: () => created, createElement: mkEl, querySelectorAll: () => [] };
  eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'storage.js'), 'utf8'));
  return { calls, ls, overlay: () => created };
}

(async () => {
  // 1. 성공
  let t = setup({ invokeOk:true });
  window.tcStore.use('db').catch(() => {});
  await new Promise(r => setTimeout(r, 50));
  assert.deepStrictEqual(t.calls.invoke[0], ['tc-phone-join', { action:'redeem', code:'A'.repeat(24) }], '코드를 서버 함수로');
  assert.ok(t.calls.verify[0] && t.calls.verify[0].token_hash === 'th1' && t.calls.verify[0].type === 'magiclink', '받은 토큰으로 로그인');
  assert.ok(t.ls.get('tc.phoneStaff') === 's1' && t.ls.get('tc.device') === 'phone', '이 휴대폰 = 그 직원');
  assert.ok(t.calls.replace === '/#phone' && t.calls.reload === 1, '#phone으로 다시 열기');
  assert.strictEqual(t.ls.get('tc.phoneAcct'), '1', '이 기기는 공용 계정으로 쓰였다는 표시');
  console.log('1회용 연결 성공 통과');

  // 2. 실패 (이미 쓴 코드 등): 이유 + 사장님 로그인 안내
  t = setup({ invokeOk:false });
  window.tcStore.use('db').catch(() => {});
  await new Promise(r => setTimeout(r, 50));
  assert.ok(t.calls.verify.length === 0 && !t.ls.get('tc.phoneStaff') && t.calls.reload === 0, '실패하면 로그인·기억 안 함');
  assert.ok(t.overlay() && t.overlay().innerHTML.includes('이미 쓴 연결 코드예요') && t.overlay().innerHTML.includes('사장님 계정으로 로그인') && t.overlay().innerHTML.includes('새 QR'), '실패 안내');
  console.log('1회용 연결 실패 안내 통과');

  // 3. 공용 계정이 끊긴 휴대폰 (사장님이 [모두 끊기] → 로그인 풀림): 남은 것 지우고 다시 연결 안내
  t = setup({ invokeOk:true, hash:'#phone', seed:{ 'tc.phoneAcct':'1', 'tc.phoneStaff':'s1', 'tc.uilang':'vi', tc_pending_v1:'[{"op":"set"}]', other_app:'keep' } });
  window.tcStore.use('db').catch(() => {});
  await new Promise(r => setTimeout(r, 50));
  assert.ok(!t.ls.has('tc.phoneAcct') && !t.ls.has('tc.phoneStaff') && !t.ls.has('tc.uilang') && !t.ls.has('tc_pending_v1'), '타임카드 설정·못 보낸 기록 지움');
  assert.strictEqual(t.ls.get('other_app'), 'keep', '다른 것은 그대로');
  assert.ok(t.calls.signOut.some(o => o && o.scope === 'local'), '이 기기 로그인 정보도 지움');
  assert.ok(t.overlay().innerHTML.includes('휴대폰 연결이 끊겼어요') && t.overlay().innerHTML.includes('새 QR'), '다시 연결 안내');
  // 공용 계정으로 쓴 적 없는 기기(태블릿·사장님)는 아무것도 안 지움
  t = setup({ invokeOk:true, hash:'', seed:{ 'tc.phoneStaff':'s1', 'tc.mode':'owner' } });
  window.tcStore.use('db').catch(() => {});
  await new Promise(r => setTimeout(r, 50));
  assert.ok(t.ls.has('tc.phoneStaff') && t.ls.has('tc.mode') && !t.calls.signOut.length && t.overlay().innerHTML.includes('사장님 계정으로 로그인해 주세요'), '사장님·태블릿 기기는 그대로, 보통 로그인 화면');
  console.log('끊긴 휴대폰 자동 정리 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
