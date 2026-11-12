const el={innerHTML:'',textContent:'',prepend(){},hidden:true,checked:true,value:'',scrollIntoView(){}};
global.document={addEventListener(){},querySelector:()=>el,createElement:()=>({...el,remove(){}})};
const calls=[], dbw={};
global.window={tcStore:{use:async n=>n==='mcp'?{callTool:async(s,t,i,o)=>{calls.push({s,t,i,o});if(i.to.includes('bad@x.com')){throw {code:'needs_reauth'}}return {payload:{id:'1'}}}}:null}};
global.location={hash:''};global.localStorage={getItem:()=>null,setItem(){}};global.scrollTo=()=>{};global.setInterval=()=>0;
let src=require('fs').readFileSync('chk.js','utf8').replace(/\nboot\(\);\s*$/,'\n');
src+=`
const W=JSON.parse(require('fs').readFileSync('writes.json','utf8'));
S.config={...W[0].data, mail:{on:true,to:'boss@naver.com, 잘못된주소',ev:{in:true,late:true,out:true,notyet:true}}};
S.staff=W.filter(w=>w.collection==='staff').map(w=>({id:w.doc_id,...w.data}));
S.months['2026-11']=new Map();S.months['2026-10']=new Map();S.monthLoaded['2026-11']=true;S.monthLoaded['2026-10']=true;S.ready.staff=true;
const mkdoc=p=>({get:async()=>({exists:!!dbw[p]}),set:async d=>{dbw[p]=d;},update:async d=>{dbw[p]={...dbw[p],...d};},delete:async()=>{delete dbw[p];}});
S.db={doc:p=>mkdoc(p),collection:c=>({doc:id=>mkdoc(c+'/'+id)})};
(async()=>{
  S.mode='kiosk';
  const st=S.staff[0]; mailPunch(st,'in',Date.now(),{late:12,sc:{start:'11:00'}});
  mailPunch(st,'out',Date.now(),{worked:500});
  await checkNotyetMail(); await checkNotyetMail();
  await new Promise(r=>setTimeout(r,50));
  calls.forEach(c=>console.log(c.s,c.t,JSON.stringify(c.i.to),c.i.subject,'|',c.i.body.split(String.fromCharCode(10))[0],c.o));
  console.log('status',dbw['status/mail']); console.log('marks',Object.keys(dbw).filter(k=>k.includes('mails')));
  S.config.mail.on=false; const n=calls.length; mailPunch(st,'in',Date.now(),{late:0,sc:null}); await checkNotyetMail(); console.log('off sends',calls.length-n);
  S.config.mail.on=true; S.mode='owner'; mailPunch(st,'in',Date.now(),{late:0,sc:null}); console.log('owner-mode sends',calls.length-n);
  const r=await sendMail('시험',['x'],{test:true,mail:{to:'bad@x.com'}}); console.log('err',r, dbw['status/mail'].ok);
  S.unlocked=true;S.tab='now';render(true);S.tab='staff';S.editing='config';render(true);console.log('render ok');
})();
`;
eval(src);
