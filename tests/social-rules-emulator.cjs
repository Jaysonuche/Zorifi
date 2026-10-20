// Integration tests against the official Firestore emulator. No Firebase SDK,
// production credentials or production writes are used. Run with the emulator
// on port 8085, or set FIRESTORE_EMULATOR_HOST to another loopback host/port.
// node --test tests/social-rules-emulator.cjs
const {test,before,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8085';
const project=process.env.SOCIAL_RULES_PROJECT_ID||'demo-zorifi-social';
if(!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)||!/^demo-[-a-z0-9]+$/.test(project))throw new Error('These destructive emulator fixtures require a loopback host and a demo-* project ID.');
const origin='http://'+host,base=origin+'/v1/projects/'+project+'/databases/(default)/documents',name='projects/'+project+'/databases/(default)/documents/';
const old='2020-01-01T00:00:00.000Z';
function jwt(uid){const now=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');return encode({alg:'none',typ:'JWT'})+'.'+encode({iss:'https://securetoken.google.com/'+project,aud:project,auth_time:now-60,user_id:uid,sub:uid,iat:now-60,exp:now+3600,firebase:{identities:{},sign_in_provider:'custom'}})+'.';}
function value(item){if(typeof item==='boolean')return {booleanValue:item};if(typeof item==='number')return Number.isInteger(item)?{integerValue:String(item)}:{doubleValue:item};if(Array.isArray(item))return {arrayValue:{values:item.map(value)}};if(item&&typeof item==='object')return item;return {stringValue:String(item)};}
function write(documentPath,data,{create=false,created=false,updated=false,mask}={}){const result={update:{name:name+documentPath,fields:Object.fromEntries(Object.entries(data).map(([key,item])=>[key,value(item)]))}};if(create)result.currentDocument={exists:false};if(mask)result.updateMask={fieldPaths:mask};const transforms=[...(created?['createdAt']:[]),...(updated?['updatedAt']:[])];if(transforms.length)result.updateTransforms=transforms.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'}));return result;}
function rate(uid,kind,documentPath){const field='last'+kind;return {...write('socialRates/'+uid,{[field+'Path']:documentPath},{mask:[field+'Path']}),updateTransforms:[{fieldPath:field+'At',setToServerValue:'REQUEST_TIME'}]};}
function message(documentPath,sender='alice',text='Hello from the emulator'){return write(documentPath,{sender,text},{create:true,created:true});}
function request(a='alice',b='carol',id=[a,b].sort().join('~')){return write('socialConnections/'+id,{members:id.split('~'),requester:a,recipient:b,status:'pending'},{create:true,created:true,updated:true});}
function report(id='report-one',reporter='alice'){return write('socialReports/'+id,{reporter,targetUid:'bob',reason:'A specific issue to review',connectionId:'alice~bob'},{create:true,created:true});}
async function call(suffix,{uid='alice',method='GET',body,admin=false,absolute=false}={}){const response=await fetch((absolute?origin:base)+suffix,{method,headers:{'Content-Type':'application/json',...(admin?{Authorization:'Bearer owner'}:uid?{Authorization:'Bearer '+jwt(uid)}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}return {status:response.status,data};}
const commit=(uid,writes)=>call(':commit',{uid,method:'POST',body:{writes}});
async function allowed(promise){const result=await promise;assert.equal(result.status,200,JSON.stringify(result));return result.data;}
async function denied(promise){const result=await promise;assert.equal(result.status,403,JSON.stringify(result));return result.data;}
async function seed(documents){await allowed(call(':commit',{admin:true,method:'POST',body:{writes:Object.entries(documents).map(([documentPath,data])=>write(documentPath,data))}}));}
const profile=(uid,discoverable=true)=>({uid,name:uid+' creator',bio:'',craft:'Video',discoverable,createdAt:{timestampValue:old},updatedAt:{timestampValue:old}});
const accepted={members:['alice','bob'],requester:'alice',recipient:'bob',status:'accepted',createdAt:{timestampValue:old},updatedAt:{timestampValue:old}};
before(async()=>{
 const rules=fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8');
 await allowed(call('/emulator/v1/projects/'+project+':securityRules',{absolute:true,admin:true,method:'PUT',body:{rules:{files:[{content:rules}]}}}));
});
beforeEach(async()=>{
 await allowed(call('/emulator/v1/projects/'+project+'/databases/(default)/documents',{absolute:true,admin:true,method:'DELETE'}));
 await seed({'socialProfiles/alice':profile('alice'),'socialProfiles/bob':profile('bob'),'socialProfiles/carol':profile('carol'),'socialProfiles/hidden':profile('hidden',false),'socialConnections/alice~bob':accepted,'users/alice/private/subscription':{status:'active'}});
});

test('private profiles, rates and billing records remain owner-only; unauthenticated reads fail',async()=>{
 await allowed(call('/socialProfiles/bob'));await allowed(call('/socialProfiles/hidden',{uid:'hidden'}));
 await denied(call('/socialProfiles/hidden'));await denied(call('/socialProfiles/bob',{uid:null}));
 await allowed(call('/users/alice/private/subscription'));await denied(call('/users/alice/private/subscription',{uid:'bob'}));
 await denied(commit('alice',[write('users/alice/private/subscription',{status:'forged'})]));
 await denied(commit('alice',[{delete:name+'users/alice/private/subscription'}]));
 await denied(call('/users/alice/private'));await denied(call('/users/alice'));
 await seed({'socialRates/alice':{lastMessageAt:{timestampValue:old},lastMessagePath:'socialConnections/alice~bob/messages/old'}});
 await allowed(call('/socialRates/alice'));await denied(call('/socialRates/alice',{uid:'bob'}));await denied(call('/socialRates'));
});

test('profile writes whitelist fields and require genuine server timestamps',async()=>{
 const data={uid:'newcreator',name:'New Creator',bio:'I create films',craft:'Video',discoverable:false};
 await allowed(commit('newcreator',[write('socialProfiles/newcreator',data,{create:true,created:true,updated:true})]));
 await denied(commit('alice',[write('socialProfiles/newcreator',{...data,uid:'alice'},{created:true,updated:true})]));
 await denied(commit('alice',[write('socialProfiles/alice',{...profile('alice'),email:'private@example.invalid'},{updated:true})]));
 await denied(commit('alice',[write('socialProfiles/alice',profile('alice'))]));
 await allowed(commit('alice',[write('socialProfiles/alice',{...profile('alice'),name:'Alice Updated'},{updated:true})]));
});

test('profile and connection queries require their visibility filter and bounded limits',async()=>{
 const query=structuredQuery=>call(':runQuery',{method:'POST',body:{structuredQuery}});
 await allowed(query({from:[{collectionId:'socialProfiles'}],where:{fieldFilter:{field:{fieldPath:'discoverable'},op:'EQUAL',value:{booleanValue:true}}},limit:40}));
 await denied(query({from:[{collectionId:'socialProfiles'}],limit:40}));
 await denied(query({from:[{collectionId:'socialProfiles'}],where:{fieldFilter:{field:{fieldPath:'discoverable'},op:'EQUAL',value:{booleanValue:true}}},limit:51}));
 await allowed(query({from:[{collectionId:'socialConnections'}],where:{fieldFilter:{field:{fieldPath:'members'},op:'ARRAY_CONTAINS',value:{stringValue:'alice'}}},limit:50}));
 await denied(query({from:[{collectionId:'socialConnections'}],limit:50}));
});

test('a public connection request needs its bound server rate; only its recipient can accept',async()=>{
 const documentPath='socialConnections/alice~carol';
 await allowed(commit('alice',[rate('alice','Request',documentPath),request()]));
 await denied(commit('alice',[write(documentPath,{status:'accepted'},{mask:['status'],updated:true})]));
 await denied(commit('bob',[write(documentPath,{status:'accepted'},{mask:['status'],updated:true})]));
 await denied(commit('carol',[write(documentPath,{members:['carol','bob'],status:'accepted'},{mask:['members','status'],updated:true})]));
 await denied(commit('alice',[rate('alice','Message',documentPath+'/messages/pending-msg'),message(documentPath+'/messages/pending-msg')]));
 await allowed(commit('carol',[write(documentPath,{status:'accepted'},{mask:['status'],updated:true})]));
 await allowed(call('/'+documentPath,{uid:'carol'}));await denied(call('/'+documentPath,{uid:'bob'}));
});

test('unbound, incorrectly bound and multi-request batches fail atomically',async()=>{
 await denied(commit('alice',[request()]));
 await denied(commit('alice',[rate('alice','Request','socialConnections/alice~wrong'),request()]));
 await seed({'socialProfiles/dave':profile('dave')});
 await denied(commit('alice',[rate('alice','Request','socialConnections/alice~carol'),request(),request('alice','dave')]));
 assert.equal((await call('/socialConnections/alice~carol',{admin:true})).status,404);
 await denied(commit('alice',[rate('alice','Request','socialConnections/alice~hidden'),request('alice','hidden')]));
});

test('inverse connection IDs cannot duplicate either ordering of an existing pair',async()=>{
 await denied(commit('alice',[rate('alice','Request','socialConnections/bob~alice'),request('alice','bob','bob~alice')]));
 await seed({'socialConnections/carol~alice':{...accepted,members:['carol','alice'],requester:'carol',recipient:'alice'}});
 await denied(commit('alice',[rate('alice','Request','socialConnections/alice~carol'),request()]));
});

test('accepted members can create a bounded immutable message with one uniquely bound rate',async()=>{
 const documentPath='socialConnections/alice~bob/messages/message-one';
 await allowed(commit('alice',[rate('alice','Message',documentPath),message(documentPath)]));
 await allowed(call('/'+documentPath,{uid:'bob'}));await denied(call('/'+documentPath,{uid:'carol'}));
 await denied(commit('alice',[write(documentPath,{text:'Edited'},{mask:['text']})]));
 await denied(commit('alice',[{delete:name+documentPath}]));
 await denied(commit('carol',[rate('carol','Message','socialConnections/alice~bob/messages/outsider-msg'),message('socialConnections/alice~bob/messages/outsider-msg','carol')]));
});

test('messages reject sender impersonation, oversized text and spoofed createdAt',async()=>{
 const documentPath='socialConnections/alice~bob/messages/invalid-message';
 await denied(commit('alice',[rate('alice','Message',documentPath),message(documentPath,'bob')]));
 await denied(commit('alice',[rate('alice','Message',documentPath),message(documentPath,'alice','x'.repeat(2001))]));
 await denied(commit('alice',[rate('alice','Message',documentPath),write(documentPath,{sender:'alice',text:'Spoofed time',createdAt:{timestampValue:old}},{create:true})]));
 await denied(commit('alice',[message(documentPath)]));
});

test('one rate cannot authorize two messages in one atomic batch',async()=>{
 const first='socialConnections/alice~bob/messages/batch-one',second='socialConnections/alice~bob/messages/batch-two';
 await denied(commit('alice',[rate('alice','Message',first),message(first),message(second)]));
 assert.equal((await call('/'+first,{admin:true})).status,404);
 assert.equal((await call('/'+second,{admin:true})).status,404);
});

test('a 500-write attack is rejected atomically even if emulator error metadata exceeds HTTP/2 limits',async t=>{
 const paths=Array.from({length:499},(_,i)=>'socialConnections/alice~bob/messages/batch-'+i);
 const result=await commit('alice',[rate('alice','Message',paths[0]),...paths.map(documentPath=>message(documentPath))]);
 // Emulator1.22 emits one verbose rules error per write. Its REST-to-gRPC bridge
 // may overflow HTTP/2 error metadata for this maximum-sized rejected batch.
 // The smaller exploit above must still return403; verify the whole large
 // batch leaves no messages rather than interpreting an INTERNAL as success.
 if(result.status===500&&result.data?.error?.message==='http2 exception')t.diagnostic('Emulator could not transport its verbose500-write rules denial; verified zero committed messages.');
 else assert.equal(result.status,403,JSON.stringify(result));
 const stored=await allowed(call('/socialConnections/alice~bob/messages',{admin:true}));
 assert.equal(stored.documents?.length||0,0);
 assert.equal((await call('/socialRates/alice',{admin:true})).status,404);
});

test('rate bindings include the parent conversation and enforce the server cooldown',async()=>{
 const documentPath='socialConnections/alice~bob/messages/reused-id',second='socialConnections/alice~carol/messages/reused-id';
 await seed({'socialConnections/alice~carol':{...accepted,members:['alice','carol'],recipient:'carol'}});
 await denied(commit('alice',[rate('alice','Message',documentPath),message(documentPath),message(second)]));
 await seed({'socialRates/alice':{lastMessageAt:{timestampValue:new Date(Date.now()+60000).toISOString()},lastMessagePath:'socialConnections/alice~bob/messages/previous'}});
 await denied(commit('alice',[rate('alice','Message',documentPath),message(documentPath)]));
 await denied(commit('alice',[write('socialRates/alice',{lastMessageAt:{timestampValue:old},lastMessagePath:documentPath})]));
});

test('legacy timestamps without a path migrate through a correctly bound operation',async()=>{
 const documentPath='socialConnections/alice~bob/messages/migrated-rate';
 await seed({'socialRates/alice':{lastMessageAt:{timestampValue:old},lastRequestAt:{timestampValue:old},lastReportAt:{timestampValue:old}}});
 await allowed(commit('alice',[rate('alice','Message',documentPath),message(documentPath)]));
});

test('a block by either member denies new requests and message reads/writes',async()=>{
 const documentPath='socialConnections/alice~bob/messages/blocked-message';
 await seed({[documentPath]:{sender:'alice',text:'Earlier message',createdAt:{timestampValue:old}},'socialBlocks/bob/blocked/alice':{owner:'bob',blockedUid:'alice',createdAt:{timestampValue:old}},'socialBlocks/alice/blocked/carol':{owner:'alice',blockedUid:'carol',createdAt:{timestampValue:old}}});
 await denied(call('/'+documentPath));await denied(call('/'+documentPath,{uid:'bob'}));
 await denied(commit('alice',[rate('alice','Message',documentPath+'-new'),message(documentPath+'-new')]));
 await denied(commit('alice',[rate('alice','Request','socialConnections/alice~carol'),request()]));
 await denied(call('/socialBlocks/bob/blocked/alice'));await allowed(call('/socialBlocks/bob/blocked/alice',{uid:'bob'}));
});

test('reports stay reporter-readable and one rate cannot create several reports',async()=>{
 const documentPath='socialReports/report-one';
 await denied(commit('alice',[rate('alice','Report',documentPath),report(),report('report-two')]));
 await allowed(commit('alice',[rate('alice','Report',documentPath),report()]));
 await allowed(call('/'+documentPath));await denied(call('/'+documentPath,{uid:'bob'}));await denied(call('/socialReports'));
 await denied(commit('alice',[write(documentPath,{reason:'Changed report'},{mask:['reason']})]));
 await denied(commit('alice',[{delete:name+documentPath}]));
});

test('rate documents deny foreign writes, unknown fields and deletion of existing fields',async()=>{
 await seed({'socialRates/alice':{lastMessageAt:{timestampValue:old},lastMessagePath:'socialConnections/alice~bob/messages/old'}});
 await denied(commit('bob',[rate('alice','Message','socialConnections/alice~bob/messages/forged')]));
 await denied(commit('alice',[write('socialRates/alice',{lastMessageAt:{timestampValue:old},lastMessagePath:'socialConnections/alice~bob/messages/old',admin:true})]));
 await denied(commit('alice',[write('socialRates/alice',{lastMessageAt:{timestampValue:old}})]));
 await denied(commit('alice',[{delete:name+'socialRates/alice'}]));
});

async function claimUsername(uid,username,previous){
 const writes=[write('socialProfiles/'+uid,{username},{mask:['username'],updated:true}),write('socialUsernames/'+username,{uid},{create:true,created:true})];
 if(previous)writes.push({delete:name+'socialUsernames/'+previous});
 return commit(uid,writes);
}
const post=(uid='alice',id='post-first',overrides={})=>({uid,mediaPath:'social-media/'+uid+'/'+id+'/video',caption:'A finished edit I chose to share',status:'uploading',bytes:1024,mime:'video/mp4',duration:12.5,width:1080,height:1920,...overrides});
async function draft(uid='alice',id='post-first',overrides={}){return commit(uid,[rate(uid,'Post','socialPosts/'+id),write('socialPosts/'+id,post(uid,id,overrides),{create:true,created:true})]);}
function publishPost(id='post-first',overrides={}){const result=write('socialPosts/'+id,{status:'published',...overrides},{mask:['status',...Object.keys(overrides)]});result.updateTransforms=[{fieldPath:'publishedAt',setToServerValue:'REQUEST_TIME'}];return result;}

test('usernames are claimed atomically, unique, and cannot be impersonated or enumerated',async()=>{
 await allowed(claimUsername('alice','alice_edits'));
 await allowed(call('/socialUsernames/alice_edits',{uid:'bob'}));
 await denied(call('/socialUsernames'));await denied(call('/socialUsernames/alice_edits',{uid:null}));
 const collision=await claimUsername('bob','alice_edits');assert([403,409].includes(collision.status),'A claimed username must be rejected by rules or the create precondition');
 const bob=await allowed(call('/socialProfiles/bob',{uid:'bob'}));assert.equal(bob.fields.username,undefined,'A failed claim must leave the other profile unchanged');
 await denied(commit('alice',[write('socialUsernames/spare_alias',{uid:'alice'},{create:true,created:true})]));
 await denied(commit('bob',[write('socialProfiles/bob',{username:'alice_edits'},{mask:['username'],updated:true})]));
 await denied(claimUsername('carol','Invalid Name'));
 await denied(commit('alice',[write('socialUsernames/alice_edits',{uid:'bob'},{mask:['uid']})]));
 await denied(commit('bob',[{delete:name+'socialUsernames/alice_edits'}]));
});

test('renaming and deleting profiles releases the old username in the same atomic batch',async()=>{
 await allowed(claimUsername('alice','alice_edits'));
 await denied(claimUsername('alice','alice_films'));
 await allowed(claimUsername('alice','alice_films','alice_edits'));
 assert.equal((await call('/socialUsernames/alice_edits',{admin:true})).status,404);
 await denied(commit('alice',[{delete:name+'socialUsernames/alice_films'}]));
 await denied(commit('alice',[{delete:name+'socialProfiles/alice'}]));
 await allowed(commit('alice',[{delete:name+'socialProfiles/alice'},{delete:name+'socialUsernames/alice_films'}]));
});

test('private profiles conceal their username registry while preserving their owner access',async()=>{
 await allowed(claimUsername('hidden','private_name'));
 await allowed(call('/socialUsernames/private_name',{uid:'hidden'}));
 await denied(call('/socialUsernames/private_name'));
});

test('draft video posts are owner-only and publish only with a genuine server timestamp',async()=>{
 await allowed(claimUsername('alice','alice_edits'));await allowed(draft());
 await allowed(call('/socialPosts/post-first'));await denied(call('/socialPosts/post-first',{uid:'bob'}));
 await denied(call('/socialPosts/post-first',{uid:null}));
 await denied(commit('bob',[publishPost()]));
 await denied(commit('alice',[write('socialPosts/post-first',{status:'published'},{mask:['status']})]));
 await denied(commit('alice',[write('socialPosts/post-first',{status:'published',publishedAt:{timestampValue:old}},{mask:['status','publishedAt']})]));
 await allowed(commit('alice',[publishPost()]));
 await allowed(call('/socialPosts/post-first',{uid:'bob'}));await denied(call('/socialPosts/post-first',{uid:null}));
 await denied(commit('alice',[publishPost('post-first',{caption:'Edited after publication'})]));
 await denied(commit('alice',[publishPost()]));
 await denied(commit('bob',[{delete:name+'socialPosts/post-first'}]));
 await allowed(commit('alice',[{delete:name+'socialPosts/post-first'}]));
});

test('video posts reject metadata, source path, privacy, owner and timestamp bypasses',async()=>{
 await allowed(claimUsername('alice','alice_edits'));
 for(const overrides of [{mediaPath:'projects/alice/private/video'},{uid:'bob'},{bytes:62914561},{bytes:1},{bytes:100.5},{mime:'text/html'},{duration:181},{width:7681},{width:0},{height:2.5},{caption:'a'.repeat(1201)},{privateProject:'source'}, {publishedAt:{timestampValue:old}},{status:'published'}])await denied(draft('alice','post-first',overrides));
 await denied(commit('alice',[rate('alice','Post','socialPosts/post-first'),write('socialPosts/post-first',{...post(),createdAt:{timestampValue:old}},{create:true})]));
 await denied(draft('bob'));
 await allowed(claimUsername('hidden','hidden_edits'));await denied(draft('hidden'));
});

test('a post rate is bound to one draft, with a server enforced cooldown',async()=>{
 await allowed(claimUsername('alice','alice_edits'));
 await denied(commit('alice',[write('socialPosts/post-first',post(),{create:true,created:true})]));
 await denied(commit('alice',[rate('alice','Post','socialPosts/post-wrong'),write('socialPosts/post-first',post(),{create:true,created:true})]));
 await denied(commit('alice',[rate('alice','Post','socialPosts/post-first'),write('socialPosts/post-first',post(),{create:true,created:true}),write('socialPosts/post-second',post('alice','post-second'),{create:true,created:true})]));
 assert.equal((await call('/socialPosts/post-first',{admin:true})).status,404);
 await allowed(draft());await denied(draft('alice','post-second'));
 await denied(commit('alice',[publishPost('post-first',{bytes:2000})]));
 await denied(commit('alice',[write('socialPosts/post-first',{uid:'bob'},{mask:['uid']})]));
});

test('feed queries require bounded publication or owner filters; private Studio paths remain closed',async()=>{
 const query=structuredQuery=>call(':runQuery',{uid:'bob',method:'POST',body:{structuredQuery}});
 await allowed(claimUsername('alice','alice_edits'));await allowed(draft());await allowed(commit('alice',[publishPost()]));
 const published={fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'published'}}};
 await allowed(query({from:[{collectionId:'socialPosts'}],where:published,orderBy:[{field:{fieldPath:'publishedAt'},direction:'DESCENDING'}],limit:20}));
 await denied(query({from:[{collectionId:'socialPosts'}],limit:20}));
 await denied(query({from:[{collectionId:'socialPosts'}],where:published,limit:21}));
 await denied(commit('alice',[write('projects/private-source',{uid:'alice',media:'source file'})]));
 await denied(call('/projects/private-source'));
});
