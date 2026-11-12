const el={innerHTML:'',textContent:'',prepend(){},hidden:true,checked:false,value:''};
let last='', saved=[], toasts=[];
global.document={addEventListener(){},querySelector:s=>s==='#view'?{set innerHTML(v){last=v}}:s==='#toasts'?{prepend(){}}:el,createElement:()=>({...el,remove(){}})};
global.window={claude:{use:async n=>n==='downloads'?{save:async o=>{saved.push(o);return {status:'saved'}}}:null}};
global.location={hash:''};global.localStorage={getItem:()=>null,setItem(){}};global.scrollTo=()=>{};global.setInterval=()=>0;
let src=require('fs').readFileSync('chk.js','utf8').replace(/\nboot\(\);\s*$/,'\n');
src+=`
const W=JSON.parse(require('fs').readFileSync('writes.json','utf8'));
S.config=W[0].data;S.staff=W.filter(w=>w.collection==='staff').map(w=>({id:w.doc_id,...w.data}));
S.staff[0].hireDate='2026-08-15';
const nov=W.filter(w=>w.collection.startsWith('months')).map(w=>({id:w.doc_id,...w.data}));
const store2={'months/2026-11/punches':nov,'months/2026-09/punches':[{id:'ex-1_2026-09-01',staffId:'ex-1',date:'2026-09-01',kind:'work',in:Date.now()-1e10,out:Date.now()-1e10+3e7}]};
const reads=[], docs={};
S.db={doc:p=>({set:async d=>{docs[p]=d}}),collection:c=>({limit:()=>({get:async()=>{reads.push(c);return {docs:(store2[c]||[]).map(x=>({id:x.id,data:()=>x}))}}}),onSnapshot:()=>()=>{}})};
S.ready.staff=true;S.months['2026-11']=new Map();S.monthLoaded['2026-11']=true;
toast=(a,b)=>toasts.push(a+' / '+(b||''));
(async()=>{
  S.mode='owner';S.unlocked=true;S.tab='staff';render(true);console.log('panel', /전체 백업 파일 받기/.test(last), /아직 백업한 적이 없어요/.test(last));
  await ACT.bkAll(); console.log('months read', reads.join(','));
  const j=JSON.parse(saved[0].data); console.log(saved[0].filename, j.counts, Object.keys(j));
  console.log('status', docs['status/backup']);
  reads.length=0; await ACT.bkCsv(); console.log(saved[1].filename); console.log(saved[1].data.split(String.fromCharCode(13,10)).slice(0,3).join(' || '));
  S.backupStatus={at:Date.now()-40*864e5,kind:'json'}; render(true); console.log('old warn', last.includes('새로 받아 두세요'));
  console.log(toasts.join(' | '));
})();
`;eval(src);
