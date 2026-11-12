const el={innerHTML:'',textContent:'',prepend(){},hidden:true,checked:true,value:'',dataset:{}};
let last='', vals={}, toasts=[];
global.document={addEventListener(){},querySelector:s=>s==='#view'?{set innerHTML(v){last=v}}:s==='#toasts'?{prepend(){}}:({...el,value:vals[s]??'',checked:vals[s]!==false}),createElement:()=>({...el,remove(){},getContext:()=>({drawImage(){}}),toDataURL:()=>'data:image/png;base64,QUJD'})};
global.window={};global.location={hash:''};global.localStorage={getItem:()=>null,setItem(){}};global.scrollTo=()=>{};global.setInterval=()=>0;
global.crypto=require('crypto').webcrypto;
let src=require('fs').readFileSync('chk.js','utf8').replace(/\nboot\(\);\s*$/,'\n');
src+=`
const W=JSON.parse(require('fs').readFileSync('writes.json','utf8'));
S.config={...W[0].data, ownerPin:'4321', contract:{on:true}, biz:{ceo:'이진성',addr:'서울시 어딘가 1',phone:'02-000-0000'}};
S.staff=W.filter(w=>w.collection==='staff').map(w=>({id:w.doc_id,...w.data}));
const mp=new Map();S.months['2026-11']=mp;S.months['2026-10']=new Map();S.monthLoaded['2026-11']=true;S.monthLoaded['2026-10']=true;S.ready.staff=true;S.ready.contracts=true;
const docs={};
const mkdoc=p=>({set:async d=>{docs[p]=d;const id=p.split('/').pop();if(p.includes('punches'))mp.set(id,{id,...d});},update:async d=>{docs[p]={...docs[p],...d};const id=p.split('/').pop();if(p.includes('punches'))mp.set(id,{...mp.get(id),...d});}});
S.db={doc:p=>mkdoc(p),collection:c=>({doc:id=>mkdoc(c+'/'+id)})};
toast=(a,b)=>toasts.push(a);
// fake signature
SIG['sig-emp']={n:20}; SIG['sig-owner']={n:20};
(async()=>{
  S.mode='kiosk'; const st=S.staff[2]; mp.delete(st.id+'_2026-11-11');
  Object.assign(S.kiosk,{staffId:st.id,step:'action'});
  await ACT.kIn();
  console.log('after first clock-in step:', S.kiosk.step, 'contracts:', S.contracts.map(c=>c.id+':'+cStatus(c)));
  console.log('has contract text:', /표준근로계약서/.test(last), /사업주/.test(last), /주휴일 매주/.test(last), /sig-emp/.test(last));
  // validation: missing addr
  vals={'#k-addr':'','#k-phone':'010-1111-2222','#k-email':'a@b.com'}; await ACT.kSign(); console.log('toast1', toasts.at(-1));
  vals={'#k-addr':'부산 해운대','#k-phone':'010-1111-2222','#k-email':'a@b.com','#k-agree':false}; await ACT.kSign(); console.log('toast2', toasts.at(-1));
  vals={'#k-addr':'부산 해운대','#k-phone':'010-1111-2222','#k-email':'a@b.com'}; await ACT.kSign();
  let c=S.contracts[0]; console.log('signed by emp:', cStatus(c), c.emp, S.kiosk.step, S.kiosk.result.msg);
  // owner signs (no registered sign yet)
  S.mode='owner'; S.unlocked=true; S.tab='contract'; S.editing=null; render(true); console.log('tab has row:', /사장님 서명 대기/.test(last), /서명 등록하기/.test(last));
  await ACT.cOwnerSign({id:c.id}); console.log('editing->', S.editing);
  await ACT.cSignSave(); console.log('ownerSign set', !!S.ownerSign);
  await ACT.cOwnerSign({id:c.id}); c=S.contracts[0]; console.log('status', cStatus(c), 'hash', c.hash, c.biz.name);
  // second clock-in: no contract prompt
  S.mode='kiosk'; resetKiosk(); mp.delete(st.id+'_2026-11-11'); Object.assign(S.kiosk,{staffId:st.id,step:'action'}); await ACT.kIn(); console.log('second clock-in step', S.kiosk.step);
  // edit signed contract -> new version
  S.mode='owner'; S.editing='cedit:'+c.id; render(true); console.log('form signed warn', /변경 계약서/.test(last));
  vals={'#ce-start':'2026-11-01','#ce-end':'','#ce-place':'우리 가게','#ce-job':'홀 서빙','#ce-wage':'12000','#ce-hol':'1','#ce-bonus':'','#ce-extra':'','#ce-payday':'10','#ce-paym':PAY_METHODS[0],'#ce-special':'수습 3개월'};
  await ACT.cSave({id:c.id}); console.log('versions', contractsOf(st.id).map(x=>x.ver+':'+cStatus(x)+':'+x.terms.wage), 'current', currentContract(st.id).ver, 'signed', signedContract(st.id).ver);
  // edit unsigned draft in place
  const d2=currentContract(st.id); S.editing='cedit:'+d2.id; vals['#ce-wage']='12500'; await ACT.cSave({id:d2.id}); console.log('draft in place', contractsOf(st.id).length, currentContract(st.id).terms.wage);
  // auto owner sign on employee sign
  S.mode='kiosk'; resetKiosk(); mp.delete(st.id+'_2026-11-11'); Object.assign(S.kiosk,{staffId:st.id,step:'action'}); await ACT.kIn(); console.log('3rd clock-in step (change contract)', S.kiosk.step, /다시 서명이 필요/.test(last));
  vals={'#k-addr':'부산','#k-phone':'010','#k-email':''}; await ACT.kSign(); console.log('auto signed', cStatus(currentContract(st.id)));
  // sign later path
  const st2=S.staff[0]; resetKiosk(); mp.delete(st2.id+'_2026-11-11'); Object.assign(S.kiosk,{staffId:st2.id,step:'action'}); await ACT.kIn(); console.log('st2 step', S.kiosk.step); ACT.kSignLater(); console.log('later ->', S.kiosk.step, S.kiosk.result.kind);
  // file
  const f=contractFile(currentContract(st.id)); console.log('file ok', f.length, /문서 지문/.test(f), f.includes('data:image/png'));
  S.mode='owner'; S.editing='cview:'+currentContract(st.id).id; render(true); console.log('preview', /인쇄용 파일 받기/.test(last));
  S.editing=null; S.tab='staff'; render(true); console.log('staff list contract', /근로계약서 서명 완료/.test(last));
  S.config.contract.on=false; resetKiosk(); S.mode='kiosk'; const st3=S.staff[1]; mp.delete(st3.id+'_2026-11-11'); Object.assign(S.kiosk,{staffId:st3.id,step:'action'}); await ACT.kIn(); console.log('off -> step', S.kiosk.step);
  console.log('toasts', toasts.join(' | '));
})();
`;eval(src);
