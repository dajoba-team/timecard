// storage.js 권한 시험: 같은 Supabase 프로젝트의 장부 전용 계정(app_metadata.apps에 timecard 없음)은 타임카드에 못 들어와야 해요
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let created = null;
const mkEl = () => ({ style:{}, innerHTML:'', id:'', querySelector: () => ({}), remove(){} });
global.window = { supabase: { createClient: () => ({
  auth: { getSession: async () => ({ data:{ session:{ user:{ email:'jangbu@example.com', app_metadata:{ apps:['jangbu'] } } } } }), onAuthStateChange(){}, signOut: async () => {} },
  from(){ throw new Error('권한 없는 계정이 저장소에 접근함'); },
  channel(){ throw new Error('권한 없는 계정이 실시간 연결함'); },
}) }, addEventListener(){} };
global.document = { addEventListener(){}, body:{ appendChild: el => { created = el; } }, getElementById: () => created, createElement: mkEl, querySelectorAll: () => [] };

eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'storage.js'), 'utf8'));

(async () => {
  let resolved = false;
  window.tcStore.use('db').then(() => { resolved = true; });
  await new Promise(r => setTimeout(r, 50));
  assert.strictEqual(resolved, false, '권한 없으면 db를 넘겨주지 않음');
  assert.ok(created && /타임카드 권한이 없는 계정이에요/.test(created.innerHTML), '안내 화면');
  assert.ok(created.innerHTML.includes('jangbu@example.com'), '어떤 계정인지 보여줌');
  console.log('권한 없는 계정 차단 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
