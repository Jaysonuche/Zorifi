const test=require('node:test');
const assert=require('node:assert/strict');
const {ZorifiCloudSyncEngine:Engine,FirebaseGateway}=require('../zorifi-firebase.js');
function storage(){const data=new Map();return {data,getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
const session={uid:'user-a',idToken:'protected-token'};
const project=()=>({projectId:'project-a',currentProject:'My edit',clips:[{id:'clip',type:'video',start:0,duration:2,mediaId:'asset'}],mediaAssets:[{id:'asset',name:'clip.mp4',url:'blob:local',file:{private:'binary'},path:'C:/private/file',remoteObjectId:'stored-media'}],markers:[],apiKey:'never-upload'});
function acknowledgement(body,extra={}){return {ok:true,json:async()=>({projectId:body.projectId,requestId:body.requestId,revision:'r1',commentId:'c1',...extra})};}
test('disabled or unauthenticated sync cannot send requests, and endpoints stay same-origin',async()=>{
 let called=false;const engine=new Engine('/api/teamspace',{storage:storage(),transport:async()=>{called=true;}});
 await assert.rejects(engine.pushProjectSnapshot(project()),/not configured/);engine.enabled=true;await assert.rejects(engine.pushProjectSnapshot(project()),/Sign in/);assert.equal(called,false);
 assert.throws(()=>new Engine('//externalhost'),/same-origin/);
 const gateway=new FirebaseGateway();assert.equal(gateway.createTeamspaceSync().enabled,false);
});
test('snapshot uses authentication, removes local media secrets and checks revision acknowledgements',async()=>{
 const store=storage();const engine=new Engine('/api/teamspace',{enabled:true,storage:store,getSession:()=>session,transport:async(url,options)=>{
  assert.equal(options.headers.authorization,'Bearer protected-token');assert.equal(options.redirect,'error');const body=JSON.parse(options.body);
  assert.equal(body.baseRevision,'old-revision');assert.equal(body.project.mediaAssets[0].remoteObjectId,'stored-media');assert.equal(body.project.mediaAssets[0].url,undefined);assert.equal(body.project.mediaAssets[0].file,undefined);assert.equal(body.project.mediaAssets[0].path,undefined);assert.equal(body.project.apiKey,undefined);
  return acknowledgement(body);
 }});assert.equal((await engine.pushProjectSnapshot({...project(),cloudRevision:'old-revision'})).revision,'r1');assert.deepEqual(engine.readQueue(session),[]);
});
test('network failures persist a token-free queue across instances and retry the same idempotency key',async()=>{
 const store=storage();let key;
 const first=new Engine('/api/teamspace',{enabled:true,storage:store,getSession:()=>session,transport:async(url,options)=>{key=options.headers['idempotency-key'];throw new TypeError('offline');}});
 assert.equal((await first.pushProjectSnapshot(project())).status,'offline-queued');assert.ok(![...store.data.values()].join('').includes(session.idToken));
 const second=new Engine('/api/teamspace',{enabled:true,storage:store,getSession:()=>session,transport:async(url,options)=>{assert.equal(options.headers['idempotency-key'],key);return acknowledgement(JSON.parse(options.body));}});
 assert.equal((await second.flushPending())[0].status,'synced');assert.deepEqual(second.readQueue(session),[]);
});
test('storage failure never claims queued and HTTP access/config errors are not offline success',async()=>{
 let calls=0;const engine=new Engine('/api/teamspace',{enabled:true,getSession:()=>session,storage:{getItem:()=>null,setItem(){throw new Error('quota');}},transport:async()=>calls++});
 await assert.rejects(engine.pushProjectSnapshot(project()),/quota/);assert.equal(calls,0);
 for(const status of [401,403,404]){
  const client=new Engine('/api/teamspace',{enabled:true,getSession:()=>session,storage:storage(),transport:async()=>({ok:false,status})});
  await assert.rejects(client.pushProjectSnapshot(project()),/denied|configured/);assert.deepEqual(client.readQueue(session),[]);
 }
});
test('conflicts block later snapshots for that project and queues are account scoped',async()=>{
 const store=storage();let identity=session,calls=0;
 const engine=new Engine('/api/teamspace',{enabled:true,storage:store,getSession:()=>identity,transport:async()=>{calls++;return {ok:false,status:409};}});
 await assert.rejects(engine.pushProjectSnapshot(project()),/conflict/);assert.equal((await engine.pushProjectSnapshot(project())).status,'pending');assert.equal(calls,1);
 assert.equal((await engine.flushPending())[0].status,'conflict');assert.equal(calls,2);
 identity={uid:'user-b',idToken:'b'};assert.deepEqual(await engine.flushPending(),[]);assert.equal(calls,2);assert.equal(engine.readQueue(session).length,2);
});
test('comments use frame indices and omit client-supplied authorship',async()=>{
 const engine=new Engine('/api/teamspace',{enabled:true,storage:storage(),getSession:()=>session,transport:async(url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.frame,61);assert.equal(body.fps,60);assert.equal(body.timestamp,61/60);assert.equal(body.author,undefined);assert.equal(body.text,'Review this cut');return acknowledgement(body);
 }});assert.equal((await engine.addReviewComment('project-a',1.01,'Spoofed author','Review this cut',{fps:60})).status,'synced');
 await assert.rejects(engine.addReviewComment('project-a',NaN,'name','text'),/timestamp/);
});
