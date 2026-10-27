const test=require('node:test'),assert=require('node:assert/strict');
const {firebaseTransport}=require('./helpers/firebase-provider.cjs');
async function fixture(run){
 const oldFetch=global.fetch,oldEnv=global.Netlify;let generation=0,answer={reply:'Here is the proposed split.',actions:[{command:'clip.split',target:'clip',parameters:{time:2}}]};
 const config={FIREBASE_WEB_API_KEY:'public-test-key',FIREBASE_PROJECT_ID:'fixture-project',OPENAI_LANGUAGE_API_KEY:'private-fixture-key',VANESSA_SESSION_SIGNING_KEY:'private-test-signing-key'};
 global.Netlify={env:{get:key=>config[key]||''}};
 global.fetch=firebaseTransport(async(url,init)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert(init.signal);generation++;return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(answer)}]}]});});
 const input={sessionId:'session',requestId:'request-1',sequence:1,project:{id:'project',ownerUid:'fixture-user'},message:'Split at two seconds',intent:'editing',context:{clips:[{id:'clip',start:0,duration:5}]}};
 const request=(body=input,token='fixture-token',signal)=>new Request('https://zorifi.example/api/vanessa/chat',{method:'POST',headers:token?{authorization:'Bearer '+token}:{},body:JSON.stringify(body),signal});
 try{const {chat,validateProposal}=await import('../netlify/functions/_shared/vanessa-router.mjs'),{ChatSessionStore}=await import('../netlify/functions/_shared/chat-session-store.mjs');await run({chat,validateProposal,ChatSessionStore,input,request,setAnswer:value=>answer=value,generation:()=>generation});}
 finally{global.fetch=oldFetch;global.Netlify=oldEnv;}
}
test('private chat requires actual auth even on localhost; project identity mismatches cannot generate',()=>fixture(async({chat,input,request,generation})=>{
 assert.equal((await chat(request(input,null))).status,401);
 assert.equal((await chat(new Request('http://127.0.0.1:4173/api/vanessa/chat',{method:'POST',body:JSON.stringify(input)}))).status,401);
 const denied=await chat(request({...input,project:{id:'project',ownerUid:'someone-else'}}));assert.equal(denied.status,403);assert.equal(generation(),0);
 const malformed=await chat(new Request('https://zorifi.example/api/vanessa/chat',{method:'POST',headers:{authorization:'Bearer fixture-token'},body:'{'}));assert.equal(malformed.status,400);
}));
test('authenticated proposal is correlated, signed and idempotent; altered replay input or forged result fails',()=>fixture(async({chat,input,request,generation,ChatSessionStore})=>{
 const response=await chat(request()),data=await response.json();assert.equal(response.status,200,JSON.stringify(data));assert.deepEqual(data.actions,[{command:'clip.split',target:'clip',parameters:{time:2}}]);assert.equal(data.status,'proposal');
 assert.deepEqual(await(await chat(request())).json(),data);assert.equal(generation(),1,'Idempotent replay does not spend generation again.');
 assert.equal((await chat(request({...input,message:'Different request'}))).status,409);
 const store=new ChatSessionStore({project:'fixture-project',uid:'fixture-user',token:'fixture-token'}),path=store.path('sessions','session'),old=await store.read(path);
 await store.call(':commit',{method:'POST',body:{writes:[store.write(path,{...old.data,startedAt:{timestampValue:old.data.startedAt},resultJson:JSON.stringify({...data,reply:'Forged',actions:[]})},old)]}});
 const forged=await chat(request());assert.equal(forged.status,409);assert.equal((await forged.json()).code,'INVALID_SESSION_SIGNATURE');assert.equal(generation(),1);
}));
test('schema permits only native bounded initial operations and rejects arbitrary fields or invented clips',()=>fixture(async({validateProposal,chat,input,request,setAnswer})=>{
 for(const action of [{command:'eval',parameters:{}},{command:'clip.trim',target:'clip',parameters:{duration:-2}},{command:'clip.split',target:'clip',parameters:{time:'2'}},{command:'history.undo',parameters:{code:'evil'}},{command:'clip.split',target:'clip',parameters:{time:2},state:{arbitrary:true}}])assert.throws(()=>validateProposal([action]),error=>error.code==='INVALID_PROPOSAL');
 assert.throws(()=>validateProposal([{command:'history.undo',parameters:{}},{command:'project.save',parameters:{}}]));
 setAnswer({reply:'Proposal',actions:[{command:'clip.split',target:'invented',parameters:{time:2}}]});assert.equal((await chat(request())).status,502);
 setAnswer({reply:'Hello',actions:[{command:'history.undo',parameters:{}}]});assert.equal((await chat(request({...input,sessionId:'conversation',intent:'conversation'}))).status,502);
}));
test('durable session store enforces pending locks, monotonic sequence, project binding, and cancelled-turn completion',()=>fixture(async({ChatSessionStore,input})=>{
 const store=new ChatSessionStore({project:'fixture-project',uid:'fixture-user',token:'fixture-token'});
 const first=await store.start(input);await assert.rejects(store.start({...input,requestId:'request-2',sequence:2}),error=>error.code==='REQUEST_PENDING');
 await store.finish(first,{},'cancelled');await assert.rejects(store.start({...input,requestId:'request-3',sequence:3}),error=>error.expectedSequence===2);
 await assert.rejects(store.start({...input,requestId:'request-2',sequence:2,project:{id:'other',ownerUid:'fixture-user'}}),error=>error.code==='PROJECT_MISMATCH');
 const second=await store.start({...input,requestId:'request-2',sequence:2});await store.clear(input.sessionId);assert.equal(await store.finish(second,{},'failed'),false,'A cleared session cannot be recreated by a late provider result.');
}));
test('persistent per-UID quota rejects request 21 and resets only after its window',()=>fixture(async({ChatSessionStore})=>{
 let now=Date.now();const store=new ChatSessionStore({project:'fixture-project',uid:'alice',token:'fixture-token',now:()=>now});
 for(let i=0;i<20;i++)await store.limit();await assert.rejects(store.limit(),error=>error.status===429&&error.retryAfter===60);
 const other=new ChatSessionStore({project:'fixture-project',uid:'bob',token:'fixture-token',now:()=>now});await other.limit();now+=61000;await store.limit();
 assert.equal((await store.read(store.path('vanessaLimits','chat'))).data.count,1);
}));
test('Stop abort reaches an in-flight provider and never stores a completed reply',()=>fixture(async({chat,input,request,ChatSessionStore})=>{
 let started,aborted=false;const ready=new Promise(resolve=>started=resolve);
 global.fetch=firebaseTransport(async(_url,init)=>{started();return new Promise((resolve,reject)=>{const stop=()=>{aborted=true;reject(init.signal.reason);};if(init.signal.aborted)stop();else init.signal.addEventListener('abort',stop,{once:true});});});
 const controller=new AbortController(),pending=chat(request(input,'fixture-token',controller.signal));await ready;controller.abort();const response=await pending;assert.notEqual(response.status,200);assert.equal(aborted,true);
 const store=new ChatSessionStore({project:'fixture-project',uid:'fixture-user',token:'fixture-token'}),doc=await store.read(store.path('sessions',input.sessionId));assert.equal(doc.data.status,'cancelled');assert.equal(doc.data.resultJson,'');
}));
test('concurrent session attempts commit one pending turn and share a durable quota',()=>fixture(async({ChatSessionStore,input})=>{
 const make=()=>new ChatSessionStore({project:'fixture-project',uid:'fixture-user',token:'fixture-token'}),a=make(),b=make();
 const starts=await Promise.allSettled([a.start(input),b.start({...input,requestId:'other'})]);assert.equal(starts.filter(r=>r.status==='fulfilled').length,1);assert.equal(starts.find(r=>r.status==='rejected').reason.code,'REQUEST_PENDING');
 await Promise.all([a.limit(),b.limit()]);assert.equal((await a.read(a.path('vanessaLimits','chat'))).data.count,2);
}));
