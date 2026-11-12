const el={innerHTML:'',textContent:'',prepend(){},hidden:true,checked:true,value:''};
let last='';global.document={addEventListener(){},querySelector:s=>s==='#view'?{set innerHTML(v){last=v}}:el,createElement:()=>({...el,remove(){}})};
global.window={};global.location={hash:''};global.localStorage={getItem:()=>null,setItem(){}};global.scrollTo=()=>{};global.setInterval=()=>0;
let src=require('fs').readFileSync('chk.js','utf8').replace(/\nboot\(\);\s*$/,'\n');
src+=`
const W=JSON.parse(require('fs').readFileSync('writes.json','utf8'));
S.config=W[0].data;S.staff=W.filter(w=>w.collection==='staff').map(w=>({id:w.doc_id,...w.data}));
const m=new Map();W.filter(w=>w.collection.startsWith('months')).forEach(w=>m.set(w.doc_id,{id:w.doc_id,...w.data}));
S.months['2026-11']=m;S.months['2026-10']=new Map();S.monthLoaded['2026-11']=true;S.monthLoaded['2026-10']=true;S.ready.staff=true;
const st=S.staff[0];
console.log(schedSummary(st.sched));
for (const ds of ['2026-10-31','2026-11-01','2026-11-07','2026-11-09']){ const r=dayCalc(st,ds); console.log(ds,r.status,r.regOff,statusChips(r).replace(/<[^>]+>/g,'')); }
console.log(tcText(monthSummary(st,'2026-11')));
S.mode='owner';S.unlocked=true;S.tab='timecard';render(true);console.log('tc rows 정기휴무', (last.match(/정기 휴무/g)||[]).length);
S.tab='records';S.recSub='month';render(true);console.log('grid 휴무 cells', (last.match(/>휴무</g)||[]).length);
S.tab='staff';S.editing='staff:'+st.id;render(true);console.log('form rest rows', (last.match(/<tr class="rest">/g)||[]).length, /id="sc-off-6" checked/.test(last), /id="sc-on-1" checked/.test(last));
`;eval(src);
