// 모든 시험을 한 번에 돌려요: node tests/run-all.js  (또는 npm test)
// public/index.html 안의 <script>를 꺼내 tests/chk.js로 만든 뒤, 각 시험을 tests 폴더에서 실행해요.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('public/index.html에서 <script>를 찾지 못했어요'); process.exit(1); }
fs.writeFileSync(path.join(__dirname, 'chk.js'), m[1]);

const check = spawnSync(process.execPath, ['--check', 'chk.js'], { cwd: __dirname, encoding: 'utf8' });
if (check.status !== 0) { console.error('문법 오류:\n' + check.stderr); process.exit(1); }
console.log('✓ 문법 검사 통과');

const tests = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let failed = 0;
for (const t of tests) {
  const r = spawnSync(process.execPath, [t], { cwd: __dirname, encoding: 'utf8', timeout: 60000 });
  const ok = r.status === 0 && !/Error|TypeError|ReferenceError/.test(r.stderr || '');
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${t}`);
  if (!ok || process.argv.includes('-v')) console.log((r.stdout || '') + (r.stderr || ''));
}
console.log(failed ? `\n${failed}개 실패` : `\n모든 시험 통과 (${tests.length}개)`);
process.exit(failed ? 1 : 0);
