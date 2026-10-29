const {test,before,beforeEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8085',project='demo-zorifi-social';if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host))throw Error('Use a loopback emulator.');
const origin='http://'+host,name=`projects/${project}/databases/(default)/documents`,base=origin+'/v1/'+name;
function token(uid){const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);return encode({alg:'none',typ:'JWT'})+'.'+encode({iss:'https://securetoken.google.com/'+project,aud:project,auth_time:now-60,user_id:uid,sub:uid,iat:now-60,exp:now+3600,firebase:{identities:{},sign_in_provider:'custom'}})+'.';}
async function call(path,{uid='alice',method='GET',body,admin=false,absolute=false}={}){const response=await fetch((absolute?origin:base)+path,{method,headers:{'content-type':'application/json',...(admin?{authorization:'Bearer owner'}:uid?{authorization:'Bearer '+token(uid)}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return {status:response.status,text:await response.text()};}
const encode=x=>typeof x==='boolean'?{booleanValue:x}:typeof x==='number'?{integerValue:String(x)}:{stringValue:x};
const write=(path,data,timestamps=['updatedAt'])=>({update:{name:name+'/'+path,fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,encode(v)]))},updateTransforms:timestamps.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'}))});
const commit=(writes,uid='alice')=>call(':commit',{uid,method:'POST',body:{writes}});
async function allow(p){const r=await p;assert.equal(r.status,200,r.text);return r;}async function deny(p){const r=await p;assert.equal(r.status,403,r.text);}
const consent='users/alice/private/creativeLearning',path='users/alice/creativeFeedback/event-fixture-0001';
const event=()=>({id:'event-fixture-0001',schema:'zorifi.creative-learning/1',strategy:'cinematic-v1',style:'cinematic',outcome:'accepted',issue:'none',quality:'unknown',duration:'30-60s',turns:'0-1',elapsed:'30-120s',uid:'alice',signature:'a'.repeat(64)});
before(()=>allow(call(`/emulator/v1/projects/${project}:securityRules`,{absolute:true,admin:true,method:'PUT',body:{rules:{files:[{content:fs.readFileSync('firestore.rules','utf8')}]}}})));
beforeEach(()=>allow(call(`/emulator/v1/projects/${project}/databases/(default)/documents`,{absolute:true,admin:true,method:'DELETE'})));
test('categorical feedback requires owner consent; an atomic opted-in receipt is readable only by its owner',async()=>{
 await deny(commit([write(path,event(),['createdAt'])]));await allow(commit([write(consent,{uid:'alice',sharedFeedback:true}),write(path,event(),['createdAt'])]));await allow(call('/'+path));await allow(call('/users/alice/creativeFeedback'));await deny(call('/'+path,{uid:'bob'}));await deny(call('/users/alice/creativeFeedback',{uid:'bob'}));await deny(call('/'+path,{uid:null}));await deny(call('/'+consent,{uid:'bob'}));
});
test('private text, media, unknown enums, altered owner and unsigned receipts are denied',async()=>{
 await allow(commit([write(consent,{uid:'alice',sharedFeedback:true})]));for(const changes of [{prompt:'PRIVATE'},{projectId:'PRIVATE'},{image:'data:image/png;base64,PRIVATE'},{outcome:'hacked'},{quality:'perfect'},{uid:'bob'},{signature:''}])await deny(commit([write(path,{...event(),...changes},['createdAt'])]));await deny(commit([write(consent,{uid:'alice',sharedFeedback:true,conversation:'PRIVATE'})]));
});
test('receipts are immutable; consent withdrawal prevents new writes and permits complete owner deletion',async()=>{
 await allow(commit([write(consent,{uid:'alice',sharedFeedback:true}),write(path,event(),['createdAt'])]));await deny(commit([write(path,{...event(),outcome:'rejected'},['createdAt'])]));await allow(commit([write(consent,{uid:'alice',sharedFeedback:false})]));await deny(commit([write(path+'2',{...event(),id:'event-fixture-00012'},['createdAt'])]));await deny(call('/'+path,{uid:'bob',method:'DELETE'}));await allow(call('/'+path,{method:'DELETE'}));await deny(commit([write('users/alice/projects/private',{secret:'project'})]));await deny(commit([write('users/alice/media/private',{secret:'media'})]));
});
