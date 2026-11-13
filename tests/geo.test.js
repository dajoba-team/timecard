// 위치 확인: 가게 위치 저장, 출퇴근 때 거리 기록, '가게 밖' 표시, 위치 막힘
const el = { innerHTML:'', textContent:'', prepend(){}, hidden:true, checked:false, value:'' };
let last = '', toasts = [], calls = [], pos = null, denied = false;
global.document = { addEventListener(){}, querySelector: s => s === '#view' ? { set innerHTML(v){ last = v; } } : s === '#toasts' ? { prepend(){} } : el, createElement: () => ({ ...el, remove(){} }) };
Object.defineProperty(globalThis, 'navigator', { configurable:true, value: { geolocation: { getCurrentPosition: (ok, fail) => setTimeout(() => denied ? fail({ code:1 }) : ok({ coords:{ latitude:pos[0], longitude:pos[1], accuracy:15 } }), 5) } } });
global.window = { tcStore: { use: async n => n === 'mcp' ? { callTool: async (s, t, i) => { calls.push(i); return {}; } } : null } };
global.location = { hash:'' }; global.localStorage = { getItem: () => null, setItem(){} }; global.scrollTo = () => {}; global.setInterval = () => 0;
let src = require('fs').readFileSync('chk.js', 'utf8').replace(/\nboot\(\);\s*$/, '\n');
src += `
const W = JSON.parse(require('fs').readFileSync('writes.json', 'utf8'));
S.config = { ...W[0].data, biz:{ addr:'서울시 중구 세종대로 110' }, mail:{ on:true, to:'boss@example.com', ev:{ in:true, late:true, out:true, notyet:false } } };
S.staff = W.filter(w => w.collection === 'staff').map(w => ({ id:w.doc_id, ...w.data }));
const mp = new Map(); S.months[ymOf(todayStr())] = mp; S.months[shiftYM(ymOf(todayStr()), -1)] = new Map(); S.monthLoaded[ymOf(todayStr())] = true; S.ready.staff = true;
const mkdoc = p => ({ set: async d => { if (p === 'config/main') S.config = d; const id = p.split('/').pop(); if (p.includes('punches')) mp.set(id, { id, ...d }); }, update: async d => { const id = p.split('/').pop(); if (p.includes('punches')) mp.set(id, { ...mp.get(id), ...d }); } });
S.db = { doc: p => mkdoc(p), collection: c => ({ doc: id => mkdoc(c + '/' + id), onSnapshot: () => () => {} }) };
toast = (a, b) => toasts.push(a + (b ? ' / ' + b : ''));
const st = S.staff[2], key = st.id + '_' + todayStr();
const punch = async kind => { resetKiosk(); S.mode = 'kiosk'; Object.assign(S.kiosk, { staffId:st.id, step:'action' }); startGeo(); await ACT[kind](); return mp.get(key); };
(async () => {
  // 가게 위치 저장
  pos = [37.5665, 126.9780]; S.mode = 'owner'; S.unlocked = true;
  await ACT.geoToggle(); await ACT.geoSet();
  console.log('store', JSON.stringify(cfg().geo));
  // 가게 근처(약 22m)에서 출근
  pos = [37.5667, 126.9780];
  let p = await punch('kIn');
  console.log('near', JSON.stringify(p.inGeo), '|', geoLine(p.inGeo));
  console.log('near chip', JSON.stringify(statusChips(dayCalc(st, todayStr())).match(/가게 밖|위치 없음/g)));
  console.log('mail', calls.at(-1).body.split(String.fromCharCode(10)).find(l => l.startsWith('위치')));
  // 1km 떨어진 곳에서 퇴근
  pos = [37.5755, 126.9780];
  p = await punch('kOut');
  console.log('far', JSON.stringify(p.outGeo), '|', geoLine(p.outGeo));
  console.log('far chip', statusChips(dayCalc(st, todayStr())).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' '));
  // 외근 직원: 1km 밖이어도 '가게 밖' 아님
  st.geoExempt = true; mp.delete(key);
  p = await punch('kIn');
  console.log('exempt', JSON.stringify(p.inGeo), '|', geoLine(p.inGeo), '|', statusChips(dayCalc(st, todayStr())).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  S.mode = 'owner'; S.tab = 'staff'; S.editing = 'staff:' + st.id; render(true); console.log('form checkbox', /id="f-geoex" checked/.test(last));
  S.editing = null; render(true); console.log('list label', /외근 직원/.test(last));
  st.geoExempt = false;
  // 위치가 막힌 경우: 출근은 되고 '위치 없음'
  mp.delete(key); denied = true;
  p = await punch('kIn');
  console.log('denied', JSON.stringify(p.inGeo), '| step', S.kiosk.step, '|', geoLine(p.inGeo));
  // 위치 확인을 끄면 기록 안 함
  denied = false; await ACT.geoToggle(); mp.delete(key);
  p = await punch('kIn'); console.log('off', 'inGeo' in p);
  // 설정 화면·출퇴근 화면 안내
  S.config.geo.on = true; S.mode = 'owner'; S.tab = 'staff'; S.editing = null; render(true);
  console.log('settings', /위치 확인 끄기/.test(last), /가게 위치 저장됨/.test(last));
  resetKiosk(); S.mode = 'kiosk'; render(true); console.log('kiosk hint', /위치도 함께 기록돼요/.test(last));
  console.log(toasts.join(' | '));
})();
`;
eval(src);
