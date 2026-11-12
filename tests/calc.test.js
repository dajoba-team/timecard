const el={innerHTML:'',textContent:'',prepend(){},hidden:true};
global.document={addEventListener(){},querySelector:()=>el,createElement:()=>({...el,remove(){}})};
global.window={};global.location={hash:''};global.localStorage={getItem:()=>null,setItem(){}};global.scrollTo=()=>{};
global.setInterval=()=>0;
let src=require('fs').readFileSync('chk.js','utf8').replace(/\nboot\(\);\s*$/,'\n');
src+=`
const W=JSON.parse(require('fs').readFileSync('writes.json','utf8'));
S.config=W[0].data;S.staff=W.filter(w=>w.collection==='staff').map(w=>({id:w.doc_id,...w.data}));
const m=new Map();W.filter(w=>w.collection.startsWith('months')).forEach(w=>m.set(w.doc_id,{id:w.doc_id,...w.data}));
S.months['2026-11']=m;S.months['2026-10']=new Map();S.monthLoaded['2026-11']=true;S.monthLoaded['2026-10']=true;S.ready.staff=true;
for(const st of S.staff){const o=monthSummary(st,'2026-11');console.log(tcText(o));console.log('  base',o.base,'ot',o.otPay,'hol',o.holiday,'gross',o.gross,'ded',o.ded.total,'net',o.net,'proj',o.projGross);}
const s=costSeries('2026-11');console.log('day10',s[9],'day20',s[19],'day30',s[29]);
S.mode='owner';S.unlocked=true;for(const t of ['now','records','timecard','payroll','staff']){S.tab=t;render(true);}
S.recSub='month';S.tab='records';render(true);S.mode='kiosk';render(true);console.log('render ok');
`;
eval(src);
