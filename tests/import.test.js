// scripts/lib.mjs backupToDocs 시험: 앱의 '전체 백업'으로 만든 파일을 docs 행으로 바꾸면 원래 저장소 문서와 같아야 해요
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:false, value:'' };
let saved = [];
global.document = { addEventListener(){}, querySelector: () => el, createElement: () => ({ ...el, remove(){} }) };
global.window = { tcStore:{ use: async n => n === 'downloads' ? { save: async o => { saved.push(o); return { status:'saved' }; } } : null } };
global.location = { hash:'' }; global.localStorage = { getItem: () => null, setItem(){} }; global.scrollTo = () => {}; global.setInterval = () => 0;

// 원래 저장소 문서 (예시 데이터 + 서명·계약서·세무사 내역)
const W = JSON.parse(fs.readFileSync(path.join(__dirname, 'writes.json'), 'utf8'));
const DOCS = {};   // collection → [{ id, data }]
const put = (c, id, data) => (DOCS[c] = DOCS[c] || []).push({ id, data });
W.forEach(w => put(w.collection, w.doc_id, w.data));
put('months/2026-10/punches', 'ex-1_2026-10-31', { staffId:'ex-1', name:'김민준(예시)', date:'2026-10-31', kind:'work', in:1793400000000, out:1793430000000, inPhoto:'f'.repeat(32), edited:false, note:'' });
put('contracts', 'ex-1_v1', { staffId:'ex-1', v:1, terms:{ wage:10030 }, sign:{ emp:'data:image/png;base64,AAAA' } });
put('reports', '2026-10', { amounts:{ 'ex-1':{ gross:1000 } }, note:'메모', sentAt:1793500000000 });
const SIGN = 'data:image/png;base64,QUJD';

let src = fs.readFileSync(path.join(__dirname, 'chk.js'), 'utf8').replace(/\nboot\(\);\s*$/, '\n');
src += `
S.config = DOCS.config.find(d => d.id === 'main').data;
S.staff = DOCS.staff.map(d => ({ id:d.id, ...d.data }));
S.contracts = DOCS.contracts.map(d => ({ id:d.id, ...d.data }));
S.reports = Object.fromEntries(DOCS.reports.map(d => [d.id, d.data]));
S.ownerSign = SIGN;
S.months['2026-11'] = new Map(); S.months['2026-10'] = new Map([['x', {}]]); S.monthLoaded['2026-11'] = true;
S.ready.staff = true;
S.db = { doc: () => ({ set: async () => {} }),
  collection: c => ({ limit: () => ({ get: async () => ({ docs: (DOCS[c] || []).map(d => ({ id:d.id, data: () => d.data })) }) }), onSnapshot: () => () => {} }) };
toast = () => {};
globalThis.__runBackup = async () => { await ACT.bkAll(); return JSON.parse(saved[0].data); };
`;
eval(src);

(async () => {
  const backup = await __runBackup();
  const { backupToDocs, canon, staleDocs } = await import('../scripts/lib.mjs');
  const { rows, problems, notes } = backupToDocs(backup);
  assert.deepStrictEqual(problems, [], '문제 없음');
  console.log('notes', notes);

  // 원래 문서와 1:1로 같아야 함 (status/*, mails 제외)
  const want = new Map();
  for (const [c, list] of Object.entries(DOCS)) for (const d of list) want.set(c + '/' + d.id, canon(d.data));
  want.set('config/sign', null);   // at은 백업 시각으로 채워지므로 따로 확인
  const got = new Map(rows.map(r => [r.collection + '/' + r.id, r]));
  for (const [k, v] of want) {
    assert.ok(got.has(k), '빠짐: ' + k);
    if (v !== null) assert.strictEqual(canon(got.get(k).data), v, '내용 다름: ' + k);
  }
  assert.strictEqual(got.size, want.size, '남는 문서 없음');
  assert.strictEqual(got.get('config/sign').data.data, SIGN);
  assert.ok(got.get('config/sign').data.at > 0);
  assert.ok(notes.some(n => n.includes('사진 번호 1개')), '사진 안내');
  console.log('docs', rows.length, [...new Set(rows.map(r => r.collection))].join(', '));

  // 잘못된 파일은 막음
  assert.ok(backupToDocs({ app:'다른 앱' }).problems.length);
  assert.ok(backupToDocs({ ...backup, counts:{ ...backup.counts, punches: 999 } }).problems.some(p => p.includes('출퇴근 기록 수')));
  assert.ok(backupToDocs({ ...backup, staff:[...backup.staff, backup.staff[0]], counts:{} }).problems.some(p => p.includes('중복')));

  // 다시 옮길 때(--force) 지울 문서: 새 백업에 없는 것만, 서버가 쓰는 status·alerts는 그대로
  const serverNow = [...rows, { collection:'staff', id:'deleted-in-old-app' }, { collection:'months/2026-11/punches', id:'ex-1_2026-11-30' },
    { collection:'status', id:'alert' }, { collection:'months/2026-11/alerts', id:'ex-1_2026-11-12' }];
  const stale = staleDocs(serverNow, rows).map(r => r.collection + '/' + r.id);
  assert.deepStrictEqual(stale, ['staff/deleted-in-old-app', 'months/2026-11/punches/ex-1_2026-11-30'], '지울 문서');
  assert.deepStrictEqual(staleDocs(rows, rows), [], '같은 백업이면 지울 것 없음');

  // import.mjs --dry-run 실제 실행 (서버 접속 없음)
  const tmp = path.join(__dirname, 'tmp-import-backup.json');
  fs.writeFileSync(tmp, JSON.stringify(backup));
  try {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'import.mjs'), tmp, '--dry-run'], { encoding:'utf8' });
    console.log(r.stdout.trim());
    assert.strictEqual(r.status, 0, 'dry-run 성공: ' + r.stderr);
    assert.ok(/파일 검사 통과/.test(r.stdout));
  } finally { fs.unlinkSync(tmp); }

  console.log('import 시험 통과');
})().catch(e => { console.error('Error', e); process.exit(1); });
