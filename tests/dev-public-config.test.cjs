const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('../scripts/dev-server.cjs');

test('local preview exposes only the public Firebase web configuration',async()=>{
  const keys=['FIREBASE_WEB_API_KEY','FIREBASE_PROJECT_ID','FIREBASE_AUTH_DOMAIN','FIREBASE_APP_ID','GOOGLE_OAUTH_CLIENT_ID','FIREBASE_STORAGE_BUCKET','ZORIFI_SOCIAL_MEDIA_ENABLED','GEMINI_API_KEY'];
  const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  Object.assign(process.env,{FIREBASE_WEB_API_KEY:'fixture-public-key',FIREBASE_PROJECT_ID:'zorifi-fixture',FIREBASE_AUTH_DOMAIN:'zorifi-fixture.firebaseapp.com',FIREBASE_APP_ID:'public-app',GOOGLE_OAUTH_CLIENT_ID:'public-client.apps.googleusercontent.com',FIREBASE_STORAGE_BUCKET:'zorifi-fixture.firebasestorage.app',ZORIFI_SOCIAL_MEDIA_ENABLED:'false',GEMINI_API_KEY:'must-never-appear-in-html'});
  const server=createServer({localMedia:{dispose(){},enabled(){return false;}}});
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const response=await fetch(`http://127.0.0.1:${server.address().port}/index.html`),html=await response.text();
    assert.equal(response.status,200);
    const match=html.match(/<script>window\.__ZORIFI_FIREBASE_CONFIG__=(\{[^<]*\});<\/script>/);
    assert(match,'The local preview receives the Firebase bootstrap before app.js');
    assert.deepEqual(JSON.parse(match[1]),{apiKey:'fixture-public-key',projectId:'zorifi-fixture',authDomain:'zorifi-fixture.firebaseapp.com',appId:'public-app',googleClientId:'public-client.apps.googleusercontent.com',storageBucket:'zorifi-fixture.firebasestorage.app',socialMediaEnabled:false});
    assert(!html.includes('must-never-appear-in-html'));
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    for(const key of keys)if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];
  }
});
