// storage.js 직원 휴대폰 1회용 연결 시험 (v39): 주소 끝 #join=코드 → 서버 함수로 로그인 토큰 받기 → 로그인 → 이 휴대폰을 그 직원 것으로 기억 → #phone으로 다시 열기
//   실패하면 이유와 '사장님 계정으로 로그인' 안내
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function setup({ invokeOk }){
  const calls = { invoke:[], verify:[], replace:null, reload:0 };
  let created = null;
  const ls = new Map();
  const mkEl = () => ({ style:{}, innerHTML:'', id:'', querySelector: () => ({ set onclick(f){ calls.btn = f; } }), remove(){} });
  const client = {
    auth: {
      getSession: async () => ({ data:{ session:null } }),
      verifyOtp: async o => { calls.verify.push(o); return { data:{ session:{ user:{ email:'tc-phone@staff', app_metadata:{ apps:['timecard'], tc_role:'phone' } } } }, error:null }; },
      onAuthStateChange(){}, signOut: async () => {}, signInWithPassword: async () => ({ error:{ message:'no' } }),
    },
    functions: { invoke: async (name, o) => { calls.invoke.push([name, o.body]); return invokeOk ? { data:{ token_hash:'th1', staffId:'s1' }, error:null } : { data:null, error:{ message:'fail', context:{ json: async () => ({ error:'이미 쓴 연결 코드예요' }) } } }; } },
    from(){ throw new Error('아직 저장소에 가면 안 됨'); }, channel(){ throw new Error('아직'); },
  };
  global.localStorage = { getItem: k => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
  global.history = { replaceState(){} };
  global.window = { supabase:{ createClient: () => client }, addEventListener(){}, location:{ hash:'#join=' + 'A'.repeat(24), pathname:'/', replace: u => { calls.replace = u; }, reload: () => { calls.reload++; } } };
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
  console.log('1회용 연결 성공 통과');

  // 2. 실패 (이미 쓴 코드 등): 이유 + 사장님 로그인 안내
  t = setup({ invokeOk:false });
  window.tcStore.use('db').catch(() => {});
  await new Promise(r => setTimeout(r, 50));
  assert.ok(t.calls.verify.length === 0 && !t.ls.get('tc.phoneStaff') && t.calls.reload === 0, '실패하면 로그인·기억 안 함');
  assert.ok(t.overlay() && t.overlay().innerHTML.includes('이미 쓴 연결 코드예요') && t.overlay().innerHTML.includes('사장님 계정으로 로그인') && t.overlay().innerHTML.includes('새 QR'), '실패 안내');
  console.log('1회용 연결 실패 안내 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
