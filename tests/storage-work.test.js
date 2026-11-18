// storage.js 업무 사진: 앞머리(w_/r_)로 폴더 나누기, 60일 지난 업무 사진만 지우기
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const uploaded = [], removed = [], signed = [];
const DAY = 86400000, now = Date.now();
const files = {   // 폴더별 사진 (created_at)
  work: [{ id:'1', name:'w_old.jpg', created_at:new Date(now - 61 * DAY).toISOString() }, { id:'2', name:'w_new.jpg', created_at:new Date(now - 5 * DAY).toISOString() }, { id:null, name:'sub' }],
};
const bucket = {
  upload: async (p) => { uploaded.push(p); return { error:null }; },
  remove: async ps => { removed.push(...ps); return { error:null }; },
  list: async (folder) => ({ data: files[folder] || [], error:null }),
  createSignedUrls: async ps => { signed.push(...ps); return { data: ps.map(p => ({ signedUrl:'https://s/' + p })), error:null }; },
};
global.window = { supabase: { createClient: () => ({
  auth: { getSession: async () => ({ data:{ session:{ user:{ email:'o@x', app_metadata:{ apps:['timecard'] } } } } }), onAuthStateChange(){}, signOut: async () => {} },
  storage: { from: () => bucket },
}) }, addEventListener(){}, dispatchEvent(){} };
global.CustomEvent = class {};
global.document = { addEventListener(){}, body:{ appendChild(){} }, getElementById: () => null, querySelectorAll: () => [] };
global.crypto = require('crypto').webcrypto;
eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'storage.js'), 'utf8'));

(async () => {
  const a = await window.tcStore.use('assets');
  const face = await a.upload({}, {}), work = await a.upload({}, { prefix:'w_' }), refp = await a.upload({}, { prefix:'r_' }), bad = await a.upload({}, { prefix:'../' });
  assert.ok(/^[0-9a-f]+$/.test(face.id) && uploaded[0] === face.id + '.jpg', '출퇴근 사진은 맨 위');
  assert.ok(work.id.startsWith('w_') && uploaded[1] === 'work/' + work.id + '.jpg', '업무 사진은 work/');
  assert.ok(refp.id.startsWith('r_') && uploaded[2] === 'taskref/' + refp.id + '.jpg', '참고 사진은 taskref/');
  assert.ok(uploaded[3] === bad.id + '.jpg', '모르는 앞머리는 무시');
  window.tcStore.photoUrl(work.id);
  await new Promise(r => setTimeout(r, 60));
  assert.ok(signed.includes('work/' + work.id + '.jpg'), '사진 주소도 폴더 경로로');
  const n = await a.cleanOld('w_', 60);
  assert.strictEqual(n, 1); assert.deepStrictEqual(removed, ['work/w_old.jpg'], '60일 지난 것만 지움');
  assert.strictEqual(await a.cleanOld('x_', 60), 0, '모르는 폴더는 안 지움');
  await a.delete(work.id);
  assert.strictEqual(removed.at(-1), 'work/' + work.id + '.jpg', '지우기도 폴더 경로로');
  console.log('업무 사진 저장 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });
