const test=require('node:test'),assert=require('node:assert/strict');
const {FirebaseGateway}=require('../zorifi-firebase.js');
const config={apiKey:'test-key',projectId:'test-project'};
const session=()=>({uid:'user-one',idToken:'old-token',refreshToken:'old-refresh',expiresAt:Date.now()-1000});
const refreshed=()=>Response.json({id_token:'fresh-token',refresh_token:'rotated-refresh',user_id:'user-one',expires_in:'3600'});
test('concurrent expired-token requests share one refresh and use rotated credentials',async()=>{
 let refreshes=0,requests=0;const gateway=new FirebaseGateway(config,async(url,options)=>{
  if(url.includes('securetoken')){refreshes++;assert.equal(new URLSearchParams(options.body).get('refresh_token'),'old-refresh');await new Promise(r=>setTimeout(r,10));return refreshed();}
  requests++;assert.equal(options.headers.get('authorization'),'Bearer fresh-token');return Response.json({ok:true});
 });gateway.session=session();
 await Promise.all([gateway.authenticatedFetch('/api/test'),gateway.authenticatedFetch('/api/test'),gateway.getIdToken()]);
 assert.equal(refreshes,1);assert.equal(requests,2);assert.equal(gateway.session.refreshToken,'rotated-refresh');
 await gateway.getIdToken();assert.equal(refreshes,1);
});
test('401 refresh retries once; other errors are not replayed',async()=>{
 let calls=0,refreshes=0;const gateway=new FirebaseGateway(config,async url=>{if(url.includes('securetoken')){refreshes++;return refreshed();}calls++;return new Response('',{status:401});});
 gateway.session={...session(),expiresAt:Date.now()+3600000};
 assert.equal((await gateway.authenticatedFetch('/api/test',{method:'POST',body:'{}'})).status,401);assert.equal(calls,2);assert.equal(refreshes,1);
 gateway.transport=async()=>{calls++;return new Response('',{status:503});};
 assert.equal((await gateway.authenticatedFetch('/api/test')).status,503);assert.equal(calls,3);
});
test('logout and account switching cannot be undone by a late refresh',async()=>{
 let resolve;const gateway=new FirebaseGateway(config,()=>new Promise(r=>resolve=r));gateway.session=session();
 const pending=gateway.getIdToken();gateway.signOut();resolve(refreshed());await assert.rejects(pending,/session changed/);assert.equal(gateway.session,null);
 gateway.session=session();const later=gateway.getIdToken();gateway.signOut();gateway.session={...session(),uid:'other-user'};resolve(refreshed());await assert.rejects(later,/session changed/);assert.equal(gateway.session.uid,'other-user');
});
test('revoked refresh clears auth; transient failure retains credentials for recovery',async()=>{
 const gateway=new FirebaseGateway(config,async()=>Response.json({error:{message:'USER_DISABLED'}},{status:400}));gateway.session=session();
 await assert.rejects(gateway.getIdToken());assert.equal(gateway.session,null);
 gateway.session=session();gateway.transport=async()=>Response.json({error:{message:'temporary'}},{status:503});await assert.rejects(gateway.getIdToken());assert.equal(gateway.session.refreshToken,'old-refresh');
});
test('startup restores tab session, refreshes once, logs only after success, and logout clears storage',async()=>{
 const values=new Map([['zorifi-firebase-session:test-project',JSON.stringify(session())]]),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 let logged=0;const gateway=new FirebaseGateway(config,async()=>refreshed());
 const stop=gateway.initAuthTokenManager({storage,onRefresh:()=>logged++});
 await gateway.getIdToken();assert.equal(logged,1);assert.equal(JSON.parse(values.values().next().value).refreshToken,'rotated-refresh');assert(gateway.refreshTimer);
 gateway.signOut();assert.equal(values.size,0);assert.equal(gateway.refreshTimer,null);stop();
});
test('cloud documents and roles also await refresh',async()=>{
 const tokens=[];const gateway=new FirebaseGateway(config,async(url,options)=>{if(url.includes('securetoken'))return refreshed();tokens.push(options.headers.get('authorization'));return Response.json(url.includes('account-permissions')?{uid:'user-one',role:'admin'}:{fields:{}});});
 gateway.session=session();assert.equal(await gateway.getAccountRole(),'admin');await gateway.document('users/user-one');assert.deepEqual(tokens,['Bearer fresh-token','Bearer fresh-token']);
});
