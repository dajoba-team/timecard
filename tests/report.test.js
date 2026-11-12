const el={innerHTML:'',textContent:'',prepend(){},hidden:true,checked:false,value:''};
let last='', vals={}, toasts=[], calls=[];
global.document={addEventListener(){},querySelector:s=>s==='#view'?{set innerHTML(v){last=v}}:s==='#toasts'?{prepend(){}}:({...el,value:vals[s]??'',checked:vals[s]===true}),createElement:()=>({...el,remove(){}})};
global.window={tcStore:{use:async n=>n==='mcp'?{callTool:async(s,t,i)=>{calls.push(i);return {}}}:null}};
global.FileReader=class{readAsDataURL(b){this.result='data:text/csv;base64,QUJD';setTimeout(()=>this.onload(),0)}};
global.location={hash:''};global.localStorage={getItem:()=>null,setItem(){}};global.scrollTo=()=>{};global.setInterval=()=>0;
let src=require('fs').readFileSync('chk.js','utf8').replace(/\nboot\(\);\s*$/,'\n');
src+=`
S.config={storeName:'다잡아 식당', tax:{email:'tax@example.com',auto:true}};
const sched=Array.from({length:7},(_,i)=>({on:i>=1&&i<=5,start:'09:00',end:'18:00',brk:60}));
S.staff=[
 {id:'a',name:'정직원',payType:'month',monthly:2500000,wage:0,hireDate:'2022-10-02',deduct:'ins',sched,active:true},
 {id:'b',name:'중도입사',payType:'month',monthly:3100000,wage:0,hireDate:'2026-10-17',deduct:'ins',sched,active:true,rrn:'900101-1234567'},
 {id:'c',name:'알바',wage:12000,hireDate:'2026-10-01',deduct:'none',sched,active:true,rrn:'000101-3234567'},
 {id:'d',name:'예시',wage:12000,hireDate:'2026-10-01',deduct:'none',sched,active:true,sample:true}];
const oct=new Map();
for(let d=1;d<=31;d++){const ds='2026-10-'+String(d).padStart(2,'0');const w=parseDate(ds).getDay();if(w>=1&&w<=5){oct.set('c_'+ds,{id:'c_'+ds,staffId:'c',date:ds,kind:'work',in:at(ds,'09:00'),out:at(ds,'18:00'),sched:{start:'09:00',end:'18:00',brk:60},lateMin:0});}}
S.months['2026-10']=oct;S.months['2026-11']=new Map();S.months['2026-09']=new Map();S.monthLoaded['2026-10']=S.monthLoaded['2026-11']=S.monthLoaded['2026-09']=true;S.ready.staff=true;S.ready.reports=true;S.ready.contracts=true;
const docs={};
S.db={doc:p=>({get:async()=>({exists:!!docs[p],data:()=>docs[p]}),set:async d=>{docs[p]=d;if(p.startsWith('reports/'))S.reports[p.slice(8)]=d;}}),collection:c=>({doc:id=>({}),onSnapshot:()=>()=>{}})};
toast=(a,b)=>toasts.push(a+(b?' / '+b:''));
const NL=String.fromCharCode(10), CRLF=String.fromCharCode(13,10);
(async()=>{
  const rows=reportRows('2026-10');
  console.log(rows.map(r=>[r.st.name,r.ins,r.amount,r.newHire,r.withRrn].join(':')).join(' | '));
  console.log('----'+NL+reportText('2026-10'));
  console.log('---- masked preview has full rrn?', reportText('2026-10',rows,true).includes('1234567'));
  console.log(reportCSV('2026-10').split(CRLF).slice(0,3).join(NL));
  // payroll view render
  S.mode='owner';S.unlocked=true;S.tab='payroll';S.month='2026-10';render(true);console.log('payroll has panel', /세무사 전달용 급여 내역/.test(last), /월 2,500,000/.test(last));
  // edit amounts
  S.editing='report:2026-10'; render(true); console.log('edit form', /rp-amt-a/.test(last));
  vals={'#rp-amt-a':'2800000','#rp-amt-b':String(rows[1].amount),'#rp-amt-c':String(rows[2].amount),'#rp-rrn-b':true,'#rp-rrn-c':false,'#rp-note':'정직원 상여 30만 포함'};
  await ACT.rpSave({ym:'2026-10'}); console.log('saved', JSON.stringify(S.reports['2026-10']));
  console.log(reportText('2026-10').split(NL).filter(l=>/급여|참고|900101|000101/.test(l)).join(' / '));
  // manual mail
  await ACT.rpMail({ym:'2026-10'}); console.log('mail', calls.length, calls[0].to, calls[0].subject, calls[0].attachments[0].filename, !!S.reports['2026-10'].sentAt);
  // auto send for prev month (Oct) from kiosk: already sent -> no send
  S.mode='kiosk'; await autoReport(); console.log('auto after manual (should stay 1):', calls.length);
  delete S.reports['2026-10'].sentAt; delete docs['reports/2026-10'].sentAt; await autoReport(); console.log('auto send:', calls.length, S.reports['2026-10'].auto, new Date().getHours()>=9);
  await autoReport(); console.log('no double:', calls.length);
  // reminder
  S.mode='owner'; S.reports={}; S.tab='now'; render(true); console.log('reminder', /을 아직 세무사에게/.test(last));
  // monthly summary & costs
  const a=S.staff[0], b=S.staff[1]; const oa=monthSummary(a,'2026-10'), ob=monthSummary(b,'2026-10');
  console.log('monthly full', oa.gross, oa.holiday, 'prorated', ob.gross, Math.floor(3100000*15/31));
  const nov=monthSummary(a,'2026-11'); console.log('nov so far', nov.gross, 'proj', nov.projGross);
  console.log(toasts.join(' | '));
})();
`;eval(src);
