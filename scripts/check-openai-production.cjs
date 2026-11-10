// Read-only configuration assessment. No .env loading, network, writes or secrets output.
'use strict';

const OPTIONAL_FLAGS=Object.freeze([
  'OPENAI_ENABLE_VOICE','OPENAI_ENABLE_REALTIME','OPENAI_ENABLE_IMAGES',
  'OPENAI_ENABLE_VIDEO','OPENAI_ENABLE_FILES','OPENAI_ENABLE_RETRIEVAL'
]);
const QUOTAS=Object.freeze({
  OPENAI_REQUESTS_PER_MINUTE:{fallback:20,min:1,max:60},
  OPENAI_MAX_CONCURRENT_REQUESTS:{fallback:1,min:1,max:4},
  OPENAI_MAX_REQUESTS_PER_DAY:{fallback:100,min:1,max:512},
  OPENAI_DAILY_TOKEN_LIMIT:{fallback:50000,min:100,max:10000000},
  OPENAI_MAX_OUTPUT_TOKENS:{fallback:6000,min:128,max:20000},
  OPENAI_DAILY_VOICE_LIMIT:{fallback:1,min:0,max:100},
  OPENAI_DAILY_IMAGE_LIMIT:{fallback:1,min:0,max:100},
  OPENAI_DAILY_VIDEO_LIMIT:{fallback:1,min:0,max:100},
  OPENAI_DAILY_REALTIME_LIMIT:{fallback:1,min:0,max:100},
  OPENAI_DAILY_FILE_LIMIT:{fallback:1,min:0,max:100},
  OPENAI_DAILY_VECTOR_LIMIT:{fallback:1,min:0,max:100}
});
const value=(config,name)=>typeof config[name]==='string'?config[name].trim():'';
const present=(config,name)=>Boolean(value(config,name));
function uidList(config,name){
  const source=value(config,name),items=source?source.split(',').map(x=>x.trim()).filter(Boolean):[];
  return {configured:Boolean(source),count:new Set(items).size,valid:items.length>0&&items.every(x=>/^[A-Za-z0-9_-]{1,128}$/.test(x))};
}
function assess(config={}){
  const checks=[],blockers=[],warnings=[];
  const add=(name,valid,code,extra={})=>{checks.push({name,present:present(config,name),valid,...extra});if(!valid)blockers.push({name,code});};
  add('OPENAI_API_KEY',present(config,'OPENAI_API_KEY'),'OPENAI_SECRET_MISSING');
  add('OPENAI_STATE_SIGNING_KEY',value(config,'OPENAI_STATE_SIGNING_KEY').length>=32,'STABLE_SIGNING_SECRET_REQUIRED');
  add('FIREBASE_WEB_API_KEY',present(config,'FIREBASE_WEB_API_KEY'),'FIREBASE_AUTH_CONFIGURATION_MISSING');
  const project=value(config,'FIREBASE_PROJECT_ID');
  add('FIREBASE_PROJECT_ID',Boolean(project)&&/^[a-zA-Z0-9-]+$/.test(project)&&!project.startsWith('demo-'),'REAL_FIREBASE_PROJECT_REQUIRED');
  add('OPENAI_STATE_BACKEND',value(config,'OPENAI_STATE_BACKEND')==='firestore','DURABLE_FIRESTORE_STATE_REQUIRED');
  const hosted=value(config,'OPENAI_HOSTED_ENABLED');
  add('OPENAI_HOSTED_ENABLED',hosted==='true',hosted==='false'||!hosted?'HOSTED_OPENAI_DISABLED':'INVALID_HOSTED_GATE');
  const users=uidList(config,'OPENAI_ALLOWED_USER_UIDS');
  add('OPENAI_ALLOWED_USER_UIDS',users.valid,'EXACT_AUTHENTICATED_UID_ALLOWLIST_REQUIRED',{count:users.count});
  for(const [name,rule]of Object.entries(QUOTAS)){
    const raw=value(config,name),numeric=raw?Number(raw):rule.fallback;
    add(name,Number.isInteger(numeric)&&numeric>=rule.min&&numeric<=rule.max,'INVALID_QUOTA_CONFIGURATION',{defaulted:!raw});
  }
  const emulator=value(config,'ZORIFI_FIREBASE_EMULATORS');
  add('ZORIFI_FIREBASE_EMULATORS',!emulator||emulator==='false','PRODUCTION_EMULATORS_FORBIDDEN');
  const model=value(config,'OPENAI_RESPONSES_MODEL')||value(config,'VANESSA_MODEL')||'gpt-5-nano';
  const knownDeprecatedModel=/^gpt-5-nano(?:-2025-08-07)?$/.test(model);
  add('OPENAI_RESPONSES_MODEL',/^[A-Za-z0-9._:-]{1,120}$/.test(model),'INVALID_MODEL_IDENTIFIER',{defaulted:!present(config,'OPENAI_RESPONSES_MODEL')&&!present(config,'VANESSA_MODEL'),knownDeprecatedModel});
  if(knownDeprecatedModel)warnings.push({code:'TESTED_MODEL_DEPRECATED',action:'Review the tested model lifecycle and separately evaluate a replacement before long-term production reliance.'});
  const appCheck=value(config,'OPENAI_REQUIRE_APP_CHECK');
  add('OPENAI_REQUIRE_APP_CHECK',!appCheck||['true','false'].includes(appCheck),'INVALID_APP_CHECK_FLAG');
  const appCheckRequested=appCheck==='true';
  if(!appCheckRequested)warnings.push({code:'APP_CHECK_REQUIRED_FOR_BROADER_ROLLOUT',action:'Configure and verify App Check before expanding beyond a private allowlisted preview.'});
  if(appCheckRequested){
    const appId=value(config,'FIREBASE_APP_ID'),projectNumber=value(config,'FIREBASE_PROJECT_NUMBER')||appId.match(/^1:(\d+):/)?.[1];
    add('FIREBASE_APP_ID',Boolean(appId),'APP_CHECK_APP_ID_REQUIRED');
    add('FIREBASE_PROJECT_NUMBER',Boolean(projectNumber)&&/^\d+$/.test(projectNumber),'APP_CHECK_PROJECT_NUMBER_REQUIRED',{derivedFromAppId:!present(config,'FIREBASE_PROJECT_NUMBER')&&Boolean(projectNumber)});
    warnings.push({code:'APP_CHECK_CLIENT_INTEGRATION_UNVERIFIED',action:'Backend attestation configuration alone does not verify client token acquisition or a live authenticated request.'});
  }
  const enabled=[];
  for(const name of OPTIONAL_FLAGS){
    const raw=value(config,name),valid=!raw||['true','false'].includes(raw);
    add(name,valid,'INVALID_OPTIONAL_CAPABILITY_FLAG',{enabled:raw==='true'});
    if(raw==='true')enabled.push(name);
  }
  const media=uidList(config,'OPENAI_ALLOWED_MEDIA_UIDS');
  checks.push({name:'OPENAI_ALLOWED_MEDIA_UIDS',present:media.configured,valid:!enabled.length||media.valid,count:media.count});
  if(enabled.length&&!media.valid)blockers.push({name:'OPENAI_ALLOWED_MEDIA_UIDS',code:'OPTIONAL_CAPABILITY_UID_ALLOWLIST_REQUIRED'});
  if(enabled.length)warnings.push({code:'OPTIONAL_CAPABILITIES_REQUIRE_INDIVIDUAL_LIVE_TESTS',count:enabled.length,action:'Enable and test one approved capability at a time; configuration alone does not verify provider permission, quality or billed usage.'});
  if(enabled.includes('OPENAI_ENABLE_REALTIME')){
    blockers.push({name:'OPENAI_ENABLE_REALTIME',code:'REALTIME_PRODUCTION_NOT_READY'});
    warnings.push({code:'REALTIME_ACTIVE_SESSION_COST_BOUNDARY_UNVERIFIED',action:'Hosted Realtime remains blocked until client session lifecycle and usage reconciliation are verified. Use the opt-in local adapter for an individually approved live test.'});
  }
  if(enabled.includes('OPENAI_ENABLE_VOICE')&&(!present(config,'OPENAI_TTS_MODEL')||/^gpt-4o-mini-tts(?:-.*)?$|^tts-1(?:-hd)?$/.test(value(config,'OPENAI_TTS_MODEL'))))warnings.push({code:'LEGACY_SPEECH_MODEL_RETIREMENT',action:'Verify the configured speech model lifecycle and Realtime migration before production voice enablement.'});
  return {
    assessment:'configuration-only',configurationComplete:blockers.length===0,
    hostedOpenAIEnabled:hosted==='true',allowedUserCount:users.count,
    optionalCapabilityCount:enabled.length,appCheckRequested,
    deploymentAuthorized:false,productionVerified:false,needsLiveVerification:true,
    checks,blockers,warnings,
    nextAction:blockers.length?'Resolve the named configuration blockers; do not deploy or change production without explicit approval.':'Request approval for a protected preview and bounded smoke tests. This assessment does not authorize deployment or certify production readiness.'
  };
}
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.some(arg=>arg!=='--strict')){
    console.error('Use no arguments or --strict. Supply configuration through environment variables; never pass secrets as command arguments.');
    process.exitCode=2;
  }else{
    const result=assess(process.env);console.log(JSON.stringify(result,null,2));
    if(args.includes('--strict')&&!result.configurationComplete)process.exitCode=1;
  }
}
module.exports={assess,OPTIONAL_FLAGS,QUOTAS};
