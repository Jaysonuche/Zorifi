// Offline production-policy tests: public-key fixtures and mocked transports only.
const test=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {firebaseTransport}=require('./helpers/firebase-provider.cjs');
const keypair=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...keypair.publicKey.export({format:'jwk'}),kid:'policy-test-key',alg:'RS256',use:'sig'};
const APP_ID='1:123456789:web:policy-test',PROJECT_NUMBER='123456789';
const hosted=(headers={})=>new Request('https://zorifi.example/api/vanessa/openai',{method:'POST',headers});
async function configured(run,values={}){const previous={netlify:global.Netlify,fetch:global.fetch},settings={NODE_ENV:'test',OPENAI_HOSTED_ENABLED:'false',OPENAI_REQUIRE_APP_CHECK:'false',OPENAI_STATE_SIGNING_KEY:'test-only-stable-signing-secret-32-bytes',...values};global.Netlify={env:{get:name=>settings[name]||''}};try{return await run(settings);}finally{global.Netlify=previous.netlify;global.fetch=previous.fetch;}}
const enabled={OPENAI_HOSTED_ENABLED:'true',OPENAI_ALLOWED_USER_UIDS:'alice-allowed,bob-allowed'};
const denial=code=>error=>error.code===code;

test('hosted OpenAI is default-off, exact-account allowlisted and protected by a stable signing secret',()=>configured(async settings=>{
 const {assertOpenAIAccess,hostedRequest}=await import('../netlify/functions/_shared/openai-policy.mjs');
 assert(hostedRequest(hosted()));assert.equal(hostedRequest(new Request('http://127.0.0.1:4175/')),false);
 await assert.rejects(assertOpenAIAccess(hosted(),'alice-allowed','responses'),denial('OPENAI_HOSTED_DISABLED'));
 Object.assign(settings,enabled);await assertOpenAIAccess(hosted(),'alice-allowed','responses');
 for(const uid of ['alice','alice-allowed-extra','ALICE-ALLOWED','other'])await assert.rejects(assertOpenAIAccess(hosted(),uid,'responses'),denial('OPENAI_ACCOUNT_DISABLED'));
 settings.OPENAI_STATE_SIGNING_KEY='too-short';await assert.rejects(assertOpenAIAccess(hosted(),'alice-allowed','responses'),denial('STABLE_SIGNING_KEY_REQUIRED'));
 settings.OPENAI_STATE_SIGNING_KEY='';await assert.rejects(assertOpenAIAccess(hosted(),'alice-allowed','connection.test'),denial('STABLE_SIGNING_KEY_REQUIRED'));
}));

test('production environment flags prevent loopback requests from bypassing hosted rollout controls',()=>configured(async settings=>{
 const {assertOpenAIAccess}=await import('../netlify/functions/_shared/openai-policy.mjs');
 await assertOpenAIAccess(new Request('http://localhost:4175/'),'demo-user','responses');
 settings.NODE_ENV='production';await assert.rejects(assertOpenAIAccess(new Request('http://localhost:4175/'),'demo-user','responses'),denial('OPENAI_HOSTED_DISABLED'));
}));

test('legacy image/audio paths share media permissions; hosted Realtime remains blocked even when enabled',()=>configured(async settings=>{
 const {assertOpenAIAccess}=await import('../netlify/functions/_shared/openai-policy.mjs');Object.assign(settings,enabled);
 for(const operation of ['voice.generate','images.generate','provider-/v1/audio/transcriptions','provider-/v1/images/generations'])await assert.rejects(assertOpenAIAccess(hosted(),'alice-allowed',operation),denial('CAPABILITY_DISABLED'));
 settings.OPENAI_ENABLE_IMAGES=settings.OPENAI_ENABLE_VOICE='true';settings.OPENAI_ALLOWED_MEDIA_UIDS='alice-allowed';
 for(const operation of ['provider-/v1/audio/transcriptions','provider-/v1/images/generations'])await assertOpenAIAccess(hosted(),'alice-allowed',operation);
 await assert.rejects(assertOpenAIAccess(hosted(),'bob-allowed','images.generate'),denial('CAPABILITY_DISABLED'));
 settings.OPENAI_ENABLE_REALTIME='true';await assert.rejects(assertOpenAIAccess(hosted(),'alice-allowed','realtime.create'),denial('REALTIME_PRODUCTION_NOT_READY'));
}));

function token(claimChanges={},headerChanges={},privateKey=keypair.privateKey){const now=Math.floor(Date.now()/1000),header={alg:'RS256',typ:'JWT',kid:jwk.kid,...headerChanges},claims={iss:'https://firebaseappcheck.googleapis.com/'+PROJECT_NUMBER,aud:['projects/'+PROJECT_NUMBER],sub:APP_ID,iat:now-5,exp:now+300,...claimChanges},first=Buffer.from(JSON.stringify(header)).toString('base64url'),second=Buffer.from(JSON.stringify(claims)).toString('base64url'),body=first+'.'+second;return body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');}
function jwksTransport(){let calls=0;return {fetch:async(url,options)=>{calls++;assert.equal(url,'https://firebaseappcheck.googleapis.com/v1/jwks');assert.equal(options.redirect,'error');assert(options.signal);return Response.json({keys:[jwk]});},calls:()=>calls};}

test('RSA App Check validates issuer, audience, app, expiry and signature using mocked public JWKS',()=>configured(async()=>{
 const network=jwksTransport();global.fetch=network.fetch;const {verifyAppCheck}=await import('../netlify/functions/_shared/openai-app-check.mjs?policy-valid');
 assert.deepEqual(await verifyAppCheck(hosted({'x-firebase-appcheck':token()})),{appId:APP_ID});assert.equal(network.calls(),1);
 const now=Math.floor(Date.now()/1000),cases=[token({iss:'https://attacker.invalid'}),token({aud:['projects/other']}),token({aud:'projects/'+PROJECT_NUMBER}),token({sub:'1:123456789:web:other'}),token({exp:now-1}),token({iat:now+500}),token({}, {alg:'none'}),token({}, {kid:'unknown-key'})];
 const other=generateKeyPairSync('rsa',{modulusLength:2048});cases.push(token({}, {},other.privateKey));
 for(const invalid of cases)await assert.rejects(verifyAppCheck(hosted({'x-firebase-appcheck':invalid})),denial('APP_CHECK_REQUIRED'));
 await assert.rejects(verifyAppCheck(hosted()),denial('APP_CHECK_REQUIRED'));assert.equal(network.calls(),1,'Invalid claims and the public-key cache never require another network call.');
},{FIREBASE_APP_ID:APP_ID,FIREBASE_PROJECT_NUMBER:PROJECT_NUMBER}));

test('App Check fails closed when JWKS is unavailable and when Firebase app identity is missing',()=>configured(async settings=>{
 global.fetch=async()=>{throw Error('Offline public-key fixture');};const {verifyAppCheck}=await import('../netlify/functions/_shared/openai-app-check.mjs?policy-offline');
 await assert.rejects(verifyAppCheck(hosted({'x-firebase-appcheck':token()})),denial('APP_CHECK_UNAVAILABLE'));
 settings.FIREBASE_APP_ID='';await assert.rejects(verifyAppCheck(hosted({'x-firebase-appcheck':token()})),denial('APP_CHECK_NOT_CONFIGURED'));
},{FIREBASE_APP_ID:APP_ID,FIREBASE_PROJECT_NUMBER:PROJECT_NUMBER}));

test('the hosted access gate enforces opted-in App Check after account authorization',()=>configured(async settings=>{
 Object.assign(settings,enabled);settings.OPENAI_REQUIRE_APP_CHECK='true';global.fetch=jwksTransport().fetch;const {assertOpenAIAccess}=await import('../netlify/functions/_shared/openai-policy.mjs');
 await assert.rejects(assertOpenAIAccess(hosted(),'alice-allowed','responses'),denial('APP_CHECK_REQUIRED'));
 await assertOpenAIAccess(hosted({'x-firebase-appcheck':token()}),'alice-allowed','responses');
},{FIREBASE_APP_ID:APP_ID,FIREBASE_PROJECT_NUMBER:PROJECT_NUMBER}));

test('quotas independently enforce request rate, concurrent work, daily count and media-operation caps',()=>configured(async settings=>{
 const {enforceQuotas}=await import('../netlify/functions/_shared/openai-policy.mjs'),now=Date.now(),row=(changes={})=>({operation:'responses',status:'complete',started:now-2000,reserved:1,...changes});
 assert.throws(()=>enforceQuotas(Array.from({length:20},()=>row()),'responses',1,now),error=>error.code==='RATE_LIMITED'&&error.retryAfter===60);
 assert.throws(()=>enforceQuotas([row({status:'pending'})],'responses',1,now),error=>error.code==='CONCURRENCY_LIMIT'&&error.retryAfter===5);
 assert.doesNotThrow(()=>enforceQuotas([row({status:'pending',started:now-131000})],'responses',1,now));
 assert.throws(()=>enforceQuotas(Array.from({length:100},()=>row({started:now-120000})),'responses',1,now),denial('DAILY_REQUEST_LIMIT'));
 assert.throws(()=>enforceQuotas([row({operation:'images.generate',status:'failed'})],'images.generate',1,now),denial('DAILY_OPERATION_LIMIT'));
 settings.OPENAI_DAILY_IMAGE_LIMIT='0';assert.throws(()=>enforceQuotas([],'images.generate',1,now),denial('DAILY_OPERATION_LIMIT'));
 assert.doesNotThrow(()=>enforceQuotas([row({started:now-86400001})],'responses',1,now));
}));

test('legacy and new media routes cannot alternate to bypass the same daily operation cap',()=>configured(async()=>{
 const {enforceQuotas}=await import('../netlify/functions/_shared/openai-policy.mjs'),now=Date.now();
 for(const pair of [['images.generate','provider-/v1/images/generations'],['images.generate','provider-/v1/images/edits'],['voice.generate','provider-/v1/audio/speech'],['voice.generate','provider-/v1/audio/transcriptions']]){
  for(const [previous,next]of [pair,[...pair].reverse()])assert.throws(()=>enforceQuotas([{operation:previous,status:'complete',started:now-120000,reserved:1}],next,1,now),denial('DAILY_OPERATION_LIMIT'));
 }
}));

test('failed and low-usage requests never refund their reserved allowance, and higher actual usage is counted',()=>configured(async()=>{
 const {enforceQuotas}=await import('../netlify/functions/_shared/openai-policy.mjs'),now=Date.now();
 for(const status of ['failed','cancelled','complete'])assert.throws(()=>enforceQuotas([{operation:'responses',status,started:now-120000,reserved:80,total_tokens:3}],'responses',21,now),denial('DAILY_USAGE_LIMIT'));
 assert.throws(()=>enforceQuotas([{operation:'responses',status:'complete',started:now-120000,reserved:20,usage:{totalTokens:80}}],'responses',21,now),denial('DAILY_USAGE_LIMIT'));
 assert.doesNotThrow(()=>enforceQuotas([{operation:'responses',status:'complete',started:now-120000,reserved:80,total_tokens:3}],'responses',20,now));
 for(const invalid of [0,-1,1.1,'100',Infinity,NaN])assert.throws(()=>enforceQuotas([],'responses',invalid,now),denial('INVALID_REQUEST'));
},{OPENAI_DAILY_TOKEN_LIMIT:'100'}));

test('invalid quota configuration fails before starting a reservation',()=>configured(async settings=>{
 const {enforceQuotas}=await import('../netlify/functions/_shared/openai-policy.mjs');for(const [key,value]of [['OPENAI_REQUESTS_PER_MINUTE','61'],['OPENAI_MAX_REQUESTS_PER_DAY','0'],['OPENAI_MAX_CONCURRENT_REQUESTS','5'],['OPENAI_DAILY_TOKEN_LIMIT','99']]){settings[key]=value;assert.throws(()=>enforceQuotas([],'responses',1),denial('NOT_CONFIGURED'));delete settings[key];}
}));

test('SQLite rejects quota changes atomically while preserving independent account allowances',()=>configured(async()=>{
 const {OpenAIState}=await import('../netlify/functions/_shared/openai-runtime.mjs'),state=await OpenAIState.open(':memory:'),now=Date.now();
 try{const id=state.reserve('alice','responses',80,now);assert.throws(()=>state.reserve('alice','responses',1,now),denial('CONCURRENCY_LIMIT'));assert.equal(state.summary('alice')[0].requests,1);state.finish(id,{status:'failed',usage:{inputTokens:2,outputTokens:1,totalTokens:3}});assert.throws(()=>state.reserve('alice','responses',21,now),denial('DAILY_USAGE_LIMIT'));assert.equal(state.summary('alice')[0].requests,1);assert(state.reserve('bob','responses',21,now));}finally{state.close();}
},{OPENAI_DAILY_TOKEN_LIMIT:'100'}));

test('Firestore compare-and-set permits one competing reservation and does not mutate rejected quota attempts',()=>configured(async()=>{
 const {OpenAIFirestoreState}=await import('../netlify/functions/_shared/openai-firestore-state.mjs'),transport=firebaseTransport(async()=>{throw Error('No provider call is allowed in this ledger test.');}),make=()=>new OpenAIFirestoreState({uid:'alice',token:'test-only-token',project:'fixture-project',transport}),a=make(),b=make();
 const results=await Promise.allSettled([a.reserve('alice','responses',80),b.reserve('alice','responses',80)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'CONCURRENCY_LIMIT');const id=results.find(r=>r.status==='fulfilled').value;await a.finish(id,{status:'cancelled',usage:{inputTokens:2,outputTokens:1,totalTokens:3}});const before=await a.read();assert.equal(before.data.requests.length,1);await assert.rejects(b.reserve('alice','responses',21),denial('DAILY_USAGE_LIMIT'));assert.deepEqual(await a.read(),before);
},{OPENAI_DAILY_TOKEN_LIMIT:'100'}));
