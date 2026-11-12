const el={innerHTML:'',textContent:'',prepend(){},hidden:true,checked:true,value:'',scrollIntoView(){}};
let lastView='';
global.document={addEventListener(){},querySelector:s=>s==='#view'?{set innerHTML(v){lastView=v},get innerHTML(){return lastView}}:el,createElement:()=>({...el,remove(){}})};
const calls=[], dbw={}, ups=[];
global.window={claude:{use:async n=>n==='mcp'?{callTool:async(s,t,i)=>{calls.push(i);return {}}}:n==='assets'?{upload:async(b,o)=>{ups.push(o);if(ups.length===2)throw {code:'quota_or_state'};return {id:'a'.repeat(32),url:'/_blob/x'}}}:null}};
global.navigator={};global.URL={createObjectURL:()=>'blob:fake',revokeObjectURL(){}};
global.FileReader=class{readAsDataURL(){this.result='data:image/jpeg;base64,QUJD';setTimeout(()=>this.onload(),0)}};
global.location={hash:''};global.localStorage={getItem:()=>null,setItem(){}};global.scrollTo=()=>{};global.setInterval=()=>0;
let src=require('fs').readFileSync('chk.js','utf8').replace(/\nboot\(\);\s*$/,'\n');
src+=`
const W=JSON.parse(require('fs').readFileSync('writes.json','utf8'));
S.config={...W[0].data, photo:{on:true}, mail:{on:true,to:'boss@naver.com',ev:{in:true,late:true,out:true,notyet:false}}};
S.staff=W.filter(w=>w.collection==='staff').map(w=>({id:w.doc_id,...w.data}));
const mp=new Map();S.months['2026-11']=mp;S.months['2026-10']=new Map();S.monthLoaded['2026-11']=true;S.monthLoaded['2026-10']=true;S.ready.staff=true;S.ready.config=true;
const mkdoc=p=>({get:async()=>({exists:!!dbw[p]}),set:async d=>{dbw[p]=d;const id=p.split('/').pop();if(p.includes('punches'))mp.set(id,{id,...d});},update:async d=>{dbw[p]={...dbw[p],...d};const id=p.split('/').pop();if(p.includes('punches'))mp.set(id,{...mp.get(id),...d});},delete:async()=>{}});
S.db={doc:p=>mkdoc(p),collection:c=>({doc:id=>mkdoc(c+'/'+id),onSnapshot:()=>()=>{}})};
(async()=>{
  S.mode='kiosk'; const st=S.staff[2]; // ex-3 no punch today? 
  mp.delete(st.id+'_2026-11-11');
  Object.assign(S.kiosk,{staffId:st.id,step:'action'});
  await ACT.kIn(); await new Promise(r=>setTimeout(r,10));
  console.log('step',S.kiosk.step,S.kiosk.cam,'|',S.kiosk.camErr, /카메라로 찍고 출근하기/.test(lastView), /사진 없이 출근하기/.test(lastView));
  await ACT.kNoPhoto();
  const p1=mp.get(st.id+'_2026-11-11'); console.log('nophoto punch', p1.inPhoto, p1.inPhotoNote, S.kiosk.step);
  console.log('bits', photoBits(p1,'in'));
  // with blob, upload ok
  resetKiosk(); mp.delete(st.id+'_2026-11-11'); Object.assign(S.kiosk,{staffId:st.id,step:'photo',kind:'in'});
  await kioskPunch('in',{blob:{size:1},t:Date.now()}); await new Promise(r=>setTimeout(r,20));
  const p2=mp.get(st.id+'_2026-11-11'); console.log('photo punch', p2.inPhoto, JSON.stringify(p2.inPhotoNote), S.kiosk.step, /kphoto/.test(lastView));
  console.log('bits2', photoBits(p2,'in'));
  console.log('mail attach', calls.at(-1).attachments?.[0]?.filename, calls.at(-1).attachments?.[0]?.content);
  // out with quota failure
  resetKiosk(); Object.assign(S.kiosk,{staffId:st.id,step:'photo',kind:'out'});
  await kioskPunch('out',{blob:{size:1},t:Date.now()+3600000}); 
  const p3=mp.get(st.id+'_2026-11-11'); console.log('out', p3.outPhoto, p3.outPhotoNote, S.kiosk.result.photoErr, /사진: /.test(lastView));
  // owner edit keeps photos
  S.mode='owner';S.unlocked=true;S.editing='punch:'+st.id+'|2026-11-11';
  global.document.querySelector=s=>({...el,value:s==='#ed-in'?'10:00':s==='#ed-out'?'19:00':'',checked:false});
  await savePunchEdit('work'); const p4=mp.get(st.id+'_2026-11-11'); console.log('after edit', p4.inPhoto, p4.outPhoto, p4.outPhotoNote, p4.edited);
  // photo off -> direct punch
  S.config.photo.on=false; S.mode='kiosk'; resetKiosk(); mp.delete(st.id+'_2026-11-11'); Object.assign(S.kiosk,{staffId:st.id,step:'action'});
  global.document.querySelector=s=>s==='#view'?{set innerHTML(v){lastView=v},get innerHTML(){return lastView}}:el;
  await ACT.kIn(); const p5=mp.get(st.id+'_2026-11-11'); console.log('off', S.kiosk.step, 'inPhoto' in p5);
  S.mode='owner'; S.tab='records'; S.recSub='day'; S.viewDate='2026-11-11'; S.editing=null; render(true); S.tab='now'; render(true); S.tab='staff'; render(true); console.log('render ok');
})();
`;
eval(src);
