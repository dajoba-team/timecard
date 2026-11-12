const el={innerHTML:'',textContent:'',prepend(){},hidden:true,checked:false,value:''};
let last='', toasts=[], vals={};
global.document={addEventListener(){},querySelector:s=>s==='#view'?{set innerHTML(v){last=v}}:s==='#toasts'?{prepend(){}}:({...el,value:vals[s]??'',checked:false}),createElement:()=>({...el,remove(){}})};
global.window={};global.location={hash:''};global.localStorage={getItem:()=>null,setItem(){}};global.scrollTo=()=>{};global.setInterval=()=>0;
let src=require('fs').readFileSync('chk.js','utf8').replace(/\nboot\(\);\s*$/,'\n');
src+=`
const W=JSON.parse(require('fs').readFileSync('writes.json','utf8'));
S.config={...W[0].data, ownerPin:'4321', masterPin:'9999'};S.staff=W.filter(w=>w.collection==='staff').map(w=>({id:w.doc_id,...w.data}));
const mp=new Map();S.months['2026-11']=mp;S.months['2026-10']=new Map();S.monthLoaded['2026-11']=true;S.monthLoaded['2026-10']=true;S.ready.staff=true;
const mkdoc=p=>({set:async d=>{const id=p.split('/').pop();mp.set(id,{id,...d});},update:async d=>{const id=p.split('/').pop();mp.set(id,{...mp.get(id),...d});}});
S.db={doc:p=>({set:async d=>{toasts.push('SAVED '+p)}}),collection:c=>({doc:id=>mkdoc(c+'/'+id)})};
const _t=toast; toast=(a,b)=>toasts.push(a);
(async()=>{
  S.mode='kiosk'; const st=S.staff[2];
  Object.assign(S.kiosk,{staffId:st.id,step:'pin'});
  for(const d of '1234') padPress('staff',d); console.log('wrong ->',S.kiosk.step,S.kiosk.err);
  for(const d of '9999') padPress('staff',d); console.log('master ->',S.kiosk.step,S.kiosk.master,/마스터 번호로 들어왔어요/.test(last));
  await ACT.kIn(); const p=mp.get(st.id+'_2026-11-11'); console.log('punch inBy',p.inBy, statusChips(dayCalc(st,'2026-11-11')).includes('사장님 대리 입력'));
  resetKiosk(); console.log('reset master',S.kiosk.master);
  Object.assign(S.kiosk,{staffId:st.id,step:'pin'}); for(const d of String(st.pin)) padPress('staff',d); console.log('own pin ->',S.kiosk.step,S.kiosk.master);
  await ACT.kOut(); console.log('outBy', mp.get(st.id+'_2026-11-11').outBy);
  // staff save with owner pin
  S.editing='staff:'+st.id; vals={'#f-name':'x','#f-pin':'4321','#f-wage':'11000'}; await saveStaff(); 
  vals['#f-pin']='9999'; await saveStaff();
  // config with master == staff pin
  vals={'#c-pin':'4321','#c-master':String(S.staff[0].pin)}; await saveConfig();
  vals={'#c-pin':'4321','#c-master':'99a9'}; await saveConfig();
  console.log(toasts);
})();
`;eval(src);
