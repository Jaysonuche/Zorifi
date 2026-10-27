// Real official Firestore emulator. No production credentials or writes.
const {test,before,beforeEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8085',project='demo-zorifi-social';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host))throw Error('Use a loopback emulator.');
const origin='http://'+host,name=`projects/${project}/databases/(default)/documents`,base=origin+'/v1/'+name;
function token(uid){const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);return encode({alg:'none',typ:'JWT'})+'.'+encode({iss:'https://securetoken.google.com/'+project,aud:project,auth_time:now-60,user_id:uid,sub:uid,iat:now-60,exp:now+3600,firebase:{identities:{},sign_in_provider:'custom'}})+'.';}
async function call(path,{uid='alice',method='GET',body,admin=false,absolute=false}={}){const response=await fetch((absolute?origin:base)+path,{method,headers:{'content-type':'application/json',...(admin?{authorization:'Bearer owner'}:uid?{authorization:'Bearer '+token(uid)}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const text=await response.text();return {status:response.status,text};}
const encode=x=>typeof x==='number'?{integerValue:String(x)}:x?.timestampValue?x:{stringValue:String(x)};
function write(path,data,{create=false,timestamps=['updatedAt']}={}){return {update:{name:name+'/'+path,fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,encode(v)]))},...(create?{currentDocument:{exists:false}}:{}),updateTransforms:timestamps.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'}))};}
const commit=(writes,uid='alice',admin=false)=>call(':commit',{uid,admin,method:'POST',body:{writes}});
async function allow(p){const r=await p;assert.equal(r.status,200,r.text);return JSON.parse(r.text);}
async function deny(p){const r=await p;assert.equal(r.status,403,r.text);}
const path='users/alice/sessions/session',limit='users/alice/vanessaLimits/chat';
const pending=()=>({uid:'alice',projectId:'local-project',sequence:1,requestId:'request1',requestHash:'a'.repeat(64),resultSignature:'',status:'pending',historyJson:'[]',resultJson:''});
async function read(path){return JSON.parse((await call('/'+path)).text);}
async function complete(){const doc=await read(path),fields=Object.fromEntries(Object.entries(doc.fields).map(([k,v])=>[k,v.timestampValue?{timestampValue:v.timestampValue}:v.integerValue?Number(v.integerValue):v.stringValue]));return {...fields,status:'complete',resultJson:'{"reply":"Hello"}',resultSignature:'b'.repeat(64)};}
before(()=>allow(call(`/emulator/v1/projects/${project}:securityRules`,{absolute:true,admin:true,method:'PUT',body:{rules:{files:[{content:fs.readFileSync('firestore.rules','utf8')}]}}})));
beforeEach(()=>allow(call(`/emulator/v1/projects/${project}/databases/(default)/documents`,{absolute:true,admin:true,method:'DELETE'})));
test('sessions are owner-only, exact-field, server-timestamped and cannot be listed',async()=>{
 await allow(commit([write(path,pending(),{create:true,timestamps:['startedAt','updatedAt']})]));await allow(call('/'+path));
 await deny(call('/'+path,{uid:'bob'}));await deny(call('/'+path,{uid:null}));await deny(call('/users/alice/sessions'));await deny(commit([write(path,{...pending(),uid:'bob'})],'bob'));
 await deny(commit([write('users/alice/sessions/extra',{...pending(),projectMedia:'secret-file'},{timestamps:['startedAt','updatedAt']})]));
 await deny(commit([write('users/alice/sessions/not-first',{...pending(),sequence:2},{timestamps:['startedAt','updatedAt']})]));
 await deny(commit([write('users/alice/sessions/fake-time',{...pending(),startedAt:{timestampValue:'2020-01-01T00:00:00Z'}})]));
});
test('session turn order, pending lock, immutable project and signed reply fields are enforced',async()=>{
 await allow(commit([write(path,pending(),{create:true,timestamps:['startedAt','updatedAt']})]));
 await deny(commit([write(path,{...pending(),sequence:2,requestId:'request2'},{timestamps:['startedAt','updatedAt']})]));
 const finished=await complete();await allow(commit([write(path,finished)]));
 await deny(commit([write(path,{...pending(),sequence:3,requestId:'request3'},{timestamps:['startedAt','updatedAt']})]));
 await deny(commit([write(path,{...pending(),projectId:'other',sequence:2,requestId:'request2'},{timestamps:['startedAt','updatedAt']})]));
 await allow(commit([write(path,{...pending(),sequence:2,requestId:'request2'},{timestamps:['startedAt','updatedAt']})]));
 await deny(commit([write(path,{...await complete(),requestHash:'changed'})]));
 await allow(call('/'+path,{method:'DELETE'}));await deny(call('/'+path,{uid:'bob',method:'DELETE'}));
});
test('durable rate records allow exactly twenty increments, cannot reset early, and are isolated',async()=>{
 await allow(commit([write(limit,{uid:'alice',count:1},{create:true,timestamps:['startedAt','updatedAt']})]));const startedAt=(await read(limit)).fields.startedAt;
 for(let count=2;count<=20;count++)await allow(commit([write(limit,{uid:'alice',count,startedAt})]));
 await deny(commit([write(limit,{uid:'alice',count:21,startedAt})]));await deny(commit([write(limit,{uid:'alice',count:1},{timestamps:['startedAt','updatedAt']})]));
 await deny(call('/'+limit,{uid:'bob'}));await deny(call('/'+limit,{method:'DELETE'}));await deny(call('/users/alice/vanessaLimits'));
 await allow(commit([write(limit,{uid:'alice',count:20,startedAt:{timestampValue:'2020-01-01T00:00:00Z'}},{timestamps:[]})],'alice',true));
 await allow(commit([write(limit,{uid:'alice',count:1},{timestamps:['startedAt','updatedAt']})]));
});
test('conversation permissions never authorize Studio project/media storage',async()=>{
 for(const target of ['users/alice/projects/local-project','users/alice/media/source','projects/local-project','projectMedia/source'])await deny(commit([write(target,{uid:'alice',file:'private device file'})]));
});
