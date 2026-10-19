const test=require('node:test'),assert=require('node:assert/strict'),Social=require('../zorifi-social.js'),{FirebaseGateway}=require('../zorifi-firebase.js'),installFake=require('./helpers/social-firestore.cjs');

function fixture(){
  const fake=installFake({profiles:{bob:{name:'Bob'}}}),gateway=new FirebaseGateway({apiKey:'public-config',projectId:'zorifi'},fake.transport);
  gateway.session={uid:'alice',idToken:'test-user-token',refreshToken:'test-refresh',expiresAt:Date.now()+3600000};
  return {...fake,gateway,client:new Social.Client(gateway)};
}
function delayedBody(f){
  let release,started;
  const waiting=new Promise(resolve=>{started=resolve;});
  f.gateway.transport=async(...args)=>{
    const response=await f.transport(...args),json=response.json.bind(response);
    response.json=async()=>{const data=await json();started();await new Promise(resolve=>{release=resolve;});return data;};
    return response;
  };
  return {waiting,release:()=>release()};
}

test('Social rejects a previous account response when the account changes during response body parsing',async()=>{
  const f=fixture(),body=delayedBody(f),pending=f.client.people();
  await body.waiting;f.gateway.session={...f.gateway.session,uid:'another-account'};body.release();
  await assert.rejects(pending,error=>error.code==='ACCOUNT_CHANGED');f.client.dispose();
});

test('Social rejects cancelled responses even when the transport finishes parsing a body after abort',async()=>{
  const f=fixture(),body=delayedBody(f),controller=new AbortController(),pending=f.client.people({signal:controller.signal});
  await body.waiting;controller.abort();body.release();
  await assert.rejects(pending,error=>error.code==='CANCELLED');f.client.dispose();
});

test('Social accepts replacement tokens for the same Firebase UID during response body parsing and on later requests',async()=>{
  const f=fixture(),body=delayedBody(f),pending=f.client.people();
  await body.waiting;f.gateway.session={...f.gateway.session,idToken:'replacement-test-token'};body.release();
  assert.equal((await pending)[0].uid,'bob');f.client.assertSession();assert.equal(f.client.session,f.gateway.session);
  f.gateway.transport=f.transport;assert.equal((await f.client.people())[0].name,'Bob');
  assert.equal(f.records.at(-1).authorization,'Bearer replacement-test-token');f.client.dispose();
});

test('Social rejects an aborted successful response even if a custom transport ignores its signal',async()=>{
  const f=fixture(),controller=new AbortController();let release;
  f.gateway.transport=async(...args)=>{const response=await f.transport(...args);return new Promise(resolve=>{release=()=>resolve(response);});};
  const pending=f.client.people({signal:controller.signal});
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  controller.abort();release();await assert.rejects(pending,error=>error.code==='CANCELLED');f.client.dispose();
});
