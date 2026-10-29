const test=require('node:test'),assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const Learning=require('../zorifi-vanessa-creative-learning.js');
const project='fixture-project',signingKey='fixture-feedback-signing-key';
function event(index=0,changes={}){return {id:`event-fixture-${String(index).padStart(4,'0')}`,schema:Learning.SCHEMA,strategy:'cinematic-v1',style:'cinematic',outcome:'accepted',issue:'none',quality:'unknown',duration:'30-60s',turns:'0-1',elapsed:'30-120s',...changes};}
function firestore(){
  const documents=new Map();let clock=Date.now(),beforeCommit=null;
  const transport=async(url,options={})=>{
    const address=String(url);if(address.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup?')){const token=JSON.parse(options.body).idToken;if(token==='revoked')return Response.json({error:{message:'INVALID_ID_TOKEN'}},{status:400});return Response.json({users:[{localId:token==='second-token'?'second-user':'fixture-user'}]});}
    assert(address.startsWith('https://firestore.googleapis.com/v1/'),'Feedback never calls AI providers.');assert.match(new Headers(options.headers).get('authorization')||'',/^Bearer /);const name=address.replace('https://firestore.googleapis.com/v1/','');
    if(name.endsWith(':runQuery')){const query=JSON.parse(options.body).structuredQuery;assert.equal(query.limit,100);const prefix=name.slice(0,-':runQuery'.length)+'/'+query.from[0].collectionId+'/';return Response.json([...documents.values()].filter(doc=>doc.name.startsWith(prefix)).slice(0,query.limit).map(document=>({document})));}
    if(!name.endsWith(':commit'))return documents.has(name)?Response.json(documents.get(name)):Response.json({error:{status:'NOT_FOUND'}},{status:404});
    const writes=JSON.parse(options.body).writes;if(beforeCommit)await beforeCommit(writes);
    for(const write of writes){const old=documents.get(write.update?.name||write.delete);if(write.currentDocument?.exists===false&&old||write.currentDocument?.updateTime&&old?.updateTime!==write.currentDocument.updateTime)return Response.json({error:{status:'FAILED_PRECONDITION'}},{status:409});}
    for(const write of writes){if(write.delete){documents.delete(write.delete);continue;}const document=structuredClone(write.update),time=new Date(++clock).toISOString();for(const transform of write.updateTransforms||[])document.fields[transform.fieldPath]={timestampValue:time};document.updateTime=time;documents.set(document.name,document);}return Response.json({commitTime:new Date(clock).toISOString()});
  };return {transport,documents,setBeforeCommit:callback=>beforeCommit=callback};
}
async function fixture(run){
  const oldFetch=global.fetch,oldNetlify=global.Netlify,db=firestore();global.fetch=db.transport;global.Netlify={env:{get:key=>({FIREBASE_PROJECT_ID:project,FIREBASE_WEB_API_KEY:'fixture-public-key',VANESSA_SESSION_SIGNING_KEY:signingKey})[key]||''}};
  try{const api=await import('../netlify/functions/_shared/creative-feedback.mjs'),{ChatSessionStore}=await import('../netlify/functions/_shared/chat-session-store.mjs');const request=(body,token='fixture-token',signal)=>new Request('https://zorifi.example/api/vanessa/creative-feedback',{method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},body:JSON.stringify(body),signal});const makeStore=uid=>new api.CreativeFeedbackStore({uid,project,signingKey,store:new ChatSessionStore({project,uid,token:'fixture-token',transport:db.transport})});await run({...api,db,request,makeStore});}finally{global.fetch=oldFetch;global.Netlify=oldNetlify;}
}

test('feedback requires verified Firebase identity, explicit prior consent, and refuses client UID/raw private fields',()=>fixture(async({feedback,request,db})=>{
  assert.equal((await feedback(request({operation:'consent',consent:true},null))).status,401);assert.equal((await feedback(request({operation:'consent',consent:true},'revoked'))).status,401);
  const denied=await feedback(request({operation:'share',consent:true,events:[event()]}));assert.equal(denied.status,403);assert.equal((await denied.json()).code,'LEARNING_CONSENT_REQUIRED');
  assert.equal((await feedback(request({operation:'consent',consent:true,uid:'another-user'}))).status,400);
  assert.equal((await feedback(request({operation:'consent',consent:true}))).status,200);
  assert.equal((await feedback(request({operation:'share',consent:true,events:[{...event(),message:'PRIVATE CONVERSATION'}]}))).status,400);
  assert.equal([...db.documents.keys()].filter(key=>key.includes('/creativeFeedback/')).length,0);
}));

test('accepted events are own-UID categorical records with server timestamps and verifiable signatures; retries are idempotent',()=>fixture(async({feedback,request,db,verifyFeedbackRecord})=>{
  await feedback(request({operation:'consent',consent:true}));const input={operation:'share',consent:true,events:[event(1),event(2)]},response=await feedback(request(input));assert.equal(response.status,200);assert.deepEqual((await response.json()).accepted,[event(1).id,event(2).id]);
  const documents=[...db.documents.values()].filter(document=>document.name.includes('/creativeFeedback/'));assert.equal(documents.length,2);const checked=verifyFeedbackRecord(documents[0],{project,signingKey});assert.equal(checked.uid,'fixture-user');assert.deepEqual(checked.event,event(1));assert.equal(documents[0].fields.uid.stringValue,'fixture-user');assert.ok(documents[0].fields.createdAt.timestampValue);
  const replay=await feedback(request(input));assert.equal(replay.status,200);assert.equal((await replay.json()).alreadyCollected,2);assert.equal([...db.documents.keys()].filter(key=>key.includes('/creativeFeedback/')).length,2);
  assert.equal((await feedback(request({...input,events:[event(1,{outcome:'rejected'})]}))).status,409);
}));

test('account isolation is derived from the verified token, never a submitted owner namespace',()=>fixture(async({feedback,request,db})=>{
  await feedback(request({operation:'consent',consent:true}));await feedback(request({operation:'share',consent:true,events:[event(1)]}));
  assert.equal((await feedback(request({operation:'share',consent:true,events:[event(2)]},'second-token'))).status,403);
  await feedback(request({operation:'consent',consent:true},'second-token'));await feedback(request({operation:'share',consent:true,events:[event(2)]},'second-token'));
  assert([...db.documents.keys()].some(key=>key.includes('/users/second-user/creativeFeedback/')));const response=await feedback(request({operation:'clear',consent:false},'second-token'));assert.equal(response.status,200);assert.equal((await response.json()).removed,1);assert([...db.documents.keys()].some(key=>key.includes('/users/fixture-user/creativeFeedback/')));
}));

test('revoking consent deletes collected events and an old queued share cannot re-enable it',()=>fixture(async({feedback,request,db})=>{
  await feedback(request({operation:'consent',consent:true}));await feedback(request({operation:'share',consent:true,events:[event(1),event(2)]}));const revoked=await feedback(request({operation:'clear',consent:false}));assert.equal(revoked.status,200);assert.deepEqual(await revoked.json(),{consent:false,removed:2,complete:true});
  const stale=await feedback(request({operation:'share',consent:true,events:[event(3)]}));assert.equal(stale.status,403);assert.equal([...db.documents.values()].find(doc=>doc.name.endsWith('/private/creativeLearning')).fields.sharedFeedback.booleanValue,false);
}));

test('atomic consent compare-and-set prevents in-flight batches from committing after revocation',()=>fixture(async({db,makeStore})=>{
  const store=makeStore('fixture-user');await store.consent(true);let intercepted=false;db.setBeforeCommit(async writes=>{if(intercepted||!writes.some(write=>write.update?.name.includes('/creativeFeedback/')))return;intercepted=true;await store.consent(false);});
  await assert.rejects(store.share([event(1)]),error=>error.code==='CONFLICT');assert.equal([...db.documents.keys()].filter(key=>key.includes('/creativeFeedback/')).length,0);await assert.rejects(store.share([event(2)]),error=>error.code==='LEARNING_CONSENT_REQUIRED');
}));

test('generation quota limits feedback submissions, while consent deletion remains available after quota exhaustion',()=>fixture(async({feedback,request})=>{
  await feedback(request({operation:'consent',consent:true}));for(let i=0;i<19;i++)assert.equal((await feedback(request({operation:'share',consent:true,events:[event(i)]}))).status,200);assert.equal((await feedback(request({operation:'share',consent:true,events:[event(30)]}))).status,429);assert.equal((await feedback(request({operation:'clear',consent:false}))).status,200);
}));

test('malformed signatures, forged records, foreign project paths and extra fields cannot enter offline aggregates',()=>fixture(async({makeStore,db,verifyFeedbackRecord})=>{
  const store=makeStore('fixture-user');await store.consent(true);await store.share([event(1)]);const document=[...db.documents.values()].find(doc=>doc.name.includes('/creativeFeedback/'));assert.doesNotThrow(()=>verifyFeedbackRecord(document,{project,signingKey}));
  for(const mutate of [doc=>doc.fields.outcome.stringValue='rejected',doc=>doc.fields.signature.stringValue='-'.repeat(64),doc=>doc.name=doc.name.replace(project,'other-project'),doc=>doc.fields.uid.stringValue='other-user',doc=>doc.fields.secret={stringValue:'PRIVATE'},doc=>doc.fields.createdAt.timestampValue='invalid']){const forged=structuredClone(document);mutate(forged);assert.throws(()=>verifyFeedbackRecord(forged,{project,signingKey}));}
}));

function exportedRecord(uid,eventValue){const data=Learning.sharedEvent(eventValue),signature=createHmac('sha256',signingKey).update(JSON.stringify(['zorifi-creative-feedback-v1',`projects/${project}/databases/(default)/documents`,uid,data])).digest('hex');return {name:`projects/${project}/databases/(default)/documents/users/${uid}/creativeFeedback/${data.id}`,fields:Object.fromEntries(Object.entries({...data,uid,signature}).map(([key,value])=>[key,{stringValue:value}]).concat([['createdAt',{timestampValue:'2026-10-28T12:00:00.000Z'}]]))};}
function evaluationInput(users=10){const documents=[];let index=100;for(let account=0;account<users;account++)for(const strategy of ['baseline-v1','cinematic-v1'])for(let n=0;n<5;n++){const outcome=strategy==='baseline-v1'&&n===4?'failed':'succeeded',quality=outcome==='succeeded'?'pass':'fail';documents.push(exportedRecord(`private-account-${account}`,event(index++,{strategy,outcome,quality})));documents.push(exportedRecord(`private-account-${account}`,event(index++,{strategy,outcome:strategy==='baseline-v1'&&n===4?'rejected':'accepted'})));}return {documents,manifest:{schema:'zorifi.creative-strategies/1',active:'baseline-v1',versions:[{version:'baseline-v1',strategy:'baseline-v1'},{version:'cinematic-1.1',strategy:'cinematic-v1'}],history:[]},candidateVersion:'cinematic-1.1',candidateStrategy:'cinematic-v1',baselineStrategy:'baseline-v1',regression:{total:328,passed:328,criticalChecksPassed:true}};}

test('offline CLI verifies receipts, counts distinct accounts privately, suppresses small cohorts and never deploys',async()=>{
  const {evaluateExport}=require('../scripts/evaluate-creative-strategies.cjs'),input=evaluationInput(10),report=await evaluateExport(input,{project,signingKey});assert.equal(report.evaluation.eligible,true);assert.equal(report.productionChanged,false);assert.equal(report.activeStrategy,'baseline-v1');assert.equal(report.requiresHumanReview,true);assert.equal(report.aggregates['cinematic-v1'].distinctUsers,10);assert(!JSON.stringify(report).includes('private-account-'));assert(!JSON.stringify(report).includes('event-fixture-'));
  const {prepareRelease}=require('../scripts/release-creative-strategy.cjs');await assert.rejects(prepareRelease({manifest:input.manifest,operation:'promote',version:'cinematic-1.1',input,project,signingKey}),/review/);const promoted=await prepareRelease({manifest:input.manifest,operation:'promote',version:'cinematic-1.1',input,project,signingKey,reviewed:true});assert.equal(promoted.active,'cinematic-1.1');assert.equal((await prepareRelease({manifest:promoted,operation:'rollback',version:'baseline-v1',reviewed:true})).active,'baseline-v1');await assert.rejects(evaluateExport({...input,candidateStrategy:'baseline-v1'},{project,signingKey}),/registered candidate/);
  const small=await evaluateExport(evaluationInput(9),{project,signingKey});assert.equal(small.aggregates['cinematic-v1'].suppressed,true);assert.equal(small.evaluation.eligible,false);const forged=structuredClone(input);forged.documents[0].fields.signature.stringValue='a'.repeat(64);await assert.rejects(evaluateExport(forged,{project,signingKey}),/signature/);
});
