const {test}=require('node:test');
const assert=require('node:assert/strict');
const Social=require('../zorifi-social.js');
const {FirebaseGateway}=require('../zorifi-firebase.js');
function fixture(message,{status=404,details}={}){
  const requests=[];
  const gateway=new FirebaseGateway({apiKey:'public-test-config',projectId:'zorifi'},async(url,options)=>{requests.push({url,method:options.method});return Response.json({error:{message,...(details?{details}:{})}},{status});});
  gateway.session={uid:'alice',idToken:'fixture-token',refreshToken:'fixture-refresh',expiresAt:Date.now()+3600000};
  return {client:new Social.Client(gateway),requests};
}
test('first-time profile absence is a normal404 even when the Firestore path contains databases',async()=>{
  const f=fixture('Document "projects/zorifi/databases/(default)/documents/socialProfiles/alice" not found.');
  assert.equal(await f.client.myProfile(),null);
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].method,'GET');f.client.dispose();
});
test('a missing message preflight remains NOT_FOUND instead of a disabled database error',async()=>{
  const f=fixture('Document "projects/zorifi/databases/(default)/documents/socialConnections/alice~bob/messages/new-message" not found.');
  assert.equal(await f.client.get('socialConnections/alice~bob/messages/new-message',{missing:true}),null);
  await assert.rejects(f.client.get('socialConnections/alice~bob/messages/new-message'),e=>e.code==='NOT_FOUND');f.client.dispose();
});
test('a genuinely missing database still shows setup guidance',async()=>{
  for(const message of ['The database (default) does not exist for project zorifi.','Database not found: projects/zorifi/databases/(default)','Database projects/zorifi/databases/(default) was not found.']){
    const f=fixture(message);await assert.rejects(f.client.myProfile(),e=>e.code==='SETUP_REQUIRED');f.client.dispose();
  }
});
test('disabled Firestore is distinguished from ordinary permission denial',async()=>{
  for(const options of [{message:'Service disabled',details:[{reason:'SERVICE_DISABLED'}]},{message:'Cloud Firestore API has not been used in project zorifi before or it is disabled.'},{message:'Cloud Firestore API is disabled'}]){
    const f=fixture(options.message,{status:403,details:options.details});await assert.rejects(f.client.people(),e=>e.code==='SETUP_REQUIRED');f.client.dispose();
  }
  const f=fixture('Missing or insufficient permissions.',{status:403});await assert.rejects(f.client.people(),e=>e.code==='ACCESS_DENIED');f.client.dispose();
});
