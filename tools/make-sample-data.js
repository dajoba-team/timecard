// 예시 직원 3명과 2026년 11월 출퇴근 기록을 만들어 tests/writes.json에 저장해요 (시험용 데이터).
const pad=n=>String(n).padStart(2,'0');
const at=(ds,hm)=>{const [y,m,d]=ds.split('-').map(Number);const [h,mi]=hm.split(':').map(Number);return new Date(y,m-1,d,h,mi,Math.floor(Math.random()*50)).getTime();};
const sched=(days,start,end,brk)=>Array.from({length:7},(_,i)=>({on:days.includes(i),start,end,brk}));
const staff=[
 {id:'ex-1',name:'김하늘(예시)',position:'홀',pin:'1111',wage:10320,hireDate:'2026-11-01',birth:'',deduct:'none',active:true,sample:true,order:1,sched:sched([1,2,3,4,5],'11:00','20:00',60)},
 {id:'ex-2',name:'박도윤(예시)',position:'주방',pin:'2222',wage:11000,hireDate:'2026-11-01',birth:'',deduct:'biz',active:true,sample:true,order:2,sched:sched([1,2,3,4,5,6],'09:00','15:00',30)},
 {id:'ex-3',name:'이서연(예시)',position:'홀',pin:'3333',wage:10500,hireDate:'2026-11-01',birth:'',deduct:'ins',active:true,sample:true,order:3,sched:sched([0,6],'10:00','19:00',60)},
];
// [staff, date, in, out|null]
const P=[
 ['ex-1','02','10:56','20:03'],['ex-1','03','10:58','20:01'],['ex-1','04','11:08','20:00'],['ex-1','05','10:55','21:32'],['ex-1','06','10:59','20:04'],['ex-1','09','10:57','20:02'],['ex-1','11','11:12',null],
 ['ex-2','02','08:55','15:02'],['ex-2','03','09:20','15:01'],['ex-2','04','08:58','15:05'],['ex-2','05','08:57','15:00'],['ex-2','06','08:59','15:03'],['ex-2','07','08:56','16:04'],['ex-2','09','08:54','15:01'],['ex-2','10','08:58','15:02'],['ex-2','11','08:57',null],
 ['ex-3','01','09:58','19:01'],['ex-3','07','09:55','19:00'],['ex-3','08','10:02','20:33'],
];
const writes=[{op:'set',collection:'config',doc_id:'main',data:{storeName:'우리 가게',ownerPin:'0000',graceMin:5,otUnit:10,earlyClamp:true,otPremium:false,weeklyHoliday:true,rates:{np:4.75,hi:3.595,ltc:13.14,ei:0.9}}}];
for(const s of staff){const {id,...d}=s;writes.push({op:'set',collection:'staff',doc_id:id,data:d});}
for(const [sid,d,i,o] of P){const st=staff.find(s=>s.id===sid);const ds='2026-11-'+d;const dow=new Date(2026,10,+d).getDay();const sc=st.sched[dow];const scs=sc.on?{start:sc.start,end:sc.end,brk:sc.brk}:null;
 const inMs=at(ds,i);const late=scs&&inMs>at(ds,scs.start)+5*60000?Math.round((inMs-at(ds,scs.start))/60000):0;
 writes.push({op:'set',collection:'months/2026-11/punches',doc_id:`${sid}_${ds}`,data:{staffId:sid,name:st.name,date:ds,kind:'work',in:inMs,out:o?at(ds,o):null,sched:scs,lateMin:late,edited:false,note:''}});}
console.log(writes.length);require('fs').writeFileSync(require('path').join(__dirname,'..','tests','writes.json'),JSON.stringify(writes));
