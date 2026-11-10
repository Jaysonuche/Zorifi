const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const path=require('node:path');
const {assess,OPTIONAL_FLAGS}=require('../scripts/check-openai-production.cjs');
const secret='DO-NOT-PRINT-SENSITIVE-FIXTURE-SECRET-0123456789';
const uid='private_fixture_uid_not_for_output';
const valid=()=>({OPENAI_API_KEY:secret,OPENAI_STATE_SIGNING_KEY:secret+'signing',FIREBASE_WEB_API_KEY:secret+'public-config',FIREBASE_PROJECT_ID:'fixture-production',OPENAI_STATE_BACKEND:'firestore',OPENAI_HOSTED_ENABLED:'true',OPENAI_ALLOWED_USER_UIDS:uid,OPENAI_RESPONSES_MODEL:'gpt-5-nano'});
test('empty preflight is safe and never declares production verified or authorized',()=>{
  const result=assess();assert.equal(result.configurationComplete,false);assert.equal(result.hostedOpenAIEnabled,false);assert.equal(result.productionVerified,false);assert.equal(result.deploymentAuthorized,false);assert.equal(result.needsLiveVerification,true);assert(result.blockers.some(x=>x.code==='OPENAI_SECRET_MISSING'));assert(result.blockers.some(x=>x.code==='HOSTED_OPENAI_DISABLED'));assert(result.warnings.some(x=>x.code==='TESTED_MODEL_DEPRECATED'));assert(result.warnings.some(x=>x.code==='APP_CHECK_REQUIRED_FOR_BROADER_ROLLOUT'));
});
test('valid private preview configuration exposes names/presence/counts only',()=>{
  const result=assess(valid()),output=JSON.stringify(result);assert.equal(result.configurationComplete,true);assert.equal(result.allowedUserCount,1);assert.equal(result.productionVerified,false);assert.equal(result.deploymentAuthorized,false);for(const hidden of [secret,uid,'fixture-production','gpt-5-nano'])assert(!output.includes(hidden));assert(result.checks.find(x=>x.name==='OPENAI_STATE_SIGNING_KEY').valid);assert(result.warnings.some(x=>x.code==='TESTED_MODEL_DEPRECATED'));
});
test('strict allowlists reject wildcard and malformed IDs without echoing values',()=>{
  for(const bad of ['*','somebody@example.test','name with spaces','a,b,*','<VERIFIED_UID>']){const result=assess({...valid(),OPENAI_ALLOWED_USER_UIDS:bad});assert.equal(result.configurationComplete,false);assert(result.blockers.some(x=>x.code==='EXACT_AUTHENTICATED_UID_ALLOWLIST_REQUIRED'));assert(!JSON.stringify(result).includes(bad));}
  const result=assess({...valid(),OPENAI_ALLOWED_USER_UIDS:uid+','+uid});assert.equal(result.allowedUserCount,1);
});
test('invalid or unbounded quotas cannot pass readiness',()=>{
  for(const [name,bad]of [['OPENAI_REQUESTS_PER_MINUTE','1000000'],['OPENAI_MAX_CONCURRENT_REQUESTS','20'],['OPENAI_MAX_REQUESTS_PER_DAY','0'],['OPENAI_DAILY_TOKEN_LIMIT','Infinity'],['OPENAI_MAX_OUTPUT_TOKENS','20001'],['OPENAI_MAX_OUTPUT_TOKENS','127']]){const result=assess({...valid(),[name]:bad});assert(result.blockers.some(x=>x.name===name&&x.code==='INVALID_QUOTA_CONFIGURATION'));}
  assert.equal(assess({...valid(),OPENAI_MAX_OUTPUT_TOKENS:'20000'}).configurationComplete,true);
});
test('production emulator or temporary SQLite configuration is rejected',()=>{
  for(const config of [{ZORIFI_FIREBASE_EMULATORS:'true'},{FIREBASE_PROJECT_ID:'demo-zorifi-openai'},{OPENAI_STATE_BACKEND:'sqlite'},{OPENAI_STATE_SIGNING_KEY:'short'}])assert.equal(assess({...valid(),...config}).configurationComplete,false);
});
test('optional capabilities remain explicit and require a media UID allowlist',()=>{
  const initial=assess(valid());assert.equal(initial.optionalCapabilityCount,0);assert(OPTIONAL_FLAGS.every(name=>initial.checks.find(x=>x.name===name).enabled===false));const missing=assess({...valid(),OPENAI_ENABLE_IMAGES:'true'});assert(missing.blockers.some(x=>x.code==='OPTIONAL_CAPABILITY_UID_ALLOWLIST_REQUIRED'));const enabled=assess({...valid(),OPENAI_ENABLE_REALTIME:'true',OPENAI_ENABLE_VOICE:'true',OPENAI_ALLOWED_MEDIA_UIDS:uid});assert.equal(enabled.configurationComplete,false);assert(enabled.blockers.some(x=>x.code==='REALTIME_PRODUCTION_NOT_READY'));assert(enabled.warnings.some(x=>x.code==='REALTIME_ACTIVE_SESSION_COST_BOUNDARY_UNVERIFIED'));assert(enabled.warnings.some(x=>x.code==='LEGACY_SPEECH_MODEL_RETIREMENT'));assert.equal(enabled.productionVerified,false);
});
test('all six creation-operation ceilings default safely and validate bounded daily counts',()=>{
  const names=['OPENAI_DAILY_VOICE_LIMIT','OPENAI_DAILY_IMAGE_LIMIT','OPENAI_DAILY_VIDEO_LIMIT','OPENAI_DAILY_REALTIME_LIMIT','OPENAI_DAILY_FILE_LIMIT','OPENAI_DAILY_VECTOR_LIMIT'];
  for(const name of names){const base=assess(valid()).checks.find(x=>x.name===name);assert.equal(base.valid,true);assert.equal(base.defaulted,true);for(const bad of ['-1','101','1.5','NaN'])assert(assess({...valid(),[name]:bad}).blockers.some(x=>x.name===name));for(const count of ['0','1','100'])assert.equal(assess({...valid(),[name]:count}).checks.find(x=>x.name===name).valid,true);}
});
test('optional App Check identifies missing app identity without exposing identity values',()=>{
  const missing=assess({...valid(),OPENAI_REQUIRE_APP_CHECK:'true'});assert(missing.blockers.some(x=>x.code==='APP_CHECK_APP_ID_REQUIRED'));assert(missing.blockers.some(x=>x.code==='APP_CHECK_PROJECT_NUMBER_REQUIRED'));
  const appId='1:123456789:web:private_app_marker',configured=assess({...valid(),OPENAI_REQUIRE_APP_CHECK:'true',FIREBASE_APP_ID:appId});assert.equal(configured.configurationComplete,true);assert.equal(configured.checks.find(x=>x.name==='FIREBASE_PROJECT_NUMBER').derivedFromAppId,true);assert(!JSON.stringify(configured).includes(appId));assert(!JSON.stringify(configured).includes('123456789'));assert(configured.warnings.some(x=>x.code==='APP_CHECK_CLIENT_INTEGRATION_UNVERIFIED'));
});
test('CLI never echoes secret arguments or secret environment values and strict mode fails missing config',()=>{
  const command=path.resolve(__dirname,'../scripts/check-openai-production.cjs'),env={...process.env,...valid()};let result=spawnSync(process.execPath,[command],{env,encoding:'utf8'});assert.equal(result.status,0);assert(!result.stdout.includes(secret));assert(!result.stdout.includes(uid));assert(!result.stderr.includes(secret));result=spawnSync(process.execPath,[command,'--strict'],{env:{...env,OPENAI_HOSTED_ENABLED:'false'},encoding:'utf8'});assert.equal(result.status,1);result=spawnSync(process.execPath,[command,'--key='+secret],{env,encoding:'utf8'});assert.equal(result.status,2);assert(!result.stdout.includes(secret));assert(!result.stderr.includes(secret));
});
