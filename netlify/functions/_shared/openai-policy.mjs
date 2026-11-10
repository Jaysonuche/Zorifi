import {OpenAIServiceError} from './openai-responses.mjs';
const env=n=>globalThis.Netlify?.env?.get?.(n)||process.env[n]||'';
export const hostedRequest=request=>Boolean(env('VERCEL')||env('NETLIFY')||env('NODE_ENV')==='production'||!['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname));
const list=name=>env(name).split(',').map(s=>s.trim()).filter(Boolean);
// Legacy provider routes and the new adapters spend the same media allowance.
export const quotaOperation=operation=>operation.startsWith('provider-')?(operation.includes('/images/')?'images.generate':operation.includes('/audio/')?'voice.generate':operation):operation;
export async function assertOpenAIAccess(request,uid,operation){
 if(!hostedRequest(request))return;
 if(env('OPENAI_HOSTED_ENABLED')!=='true')throw new OpenAIServiceError('Hosted OpenAI is disabled pending rollout approval.',503,'OPENAI_HOSTED_DISABLED');
 if(!list('OPENAI_ALLOWED_USER_UIDS').includes(uid))throw new OpenAIServiceError('OpenAI is not enabled for this account.',403,'OPENAI_ACCOUNT_DISABLED');
 if(env('OPENAI_STATE_SIGNING_KEY').length<32)throw new OpenAIServiceError('Configure a stable server-only state-signing secret.',503,'STABLE_SIGNING_KEY_REQUIRED');
 const group=operation.startsWith('provider-')?(operation.includes('/images/')?'images':operation.includes('/audio/')?'voice':null):operation.split('.')[0];
 if(['voice','images','video','files','vector','realtime'].includes(group)){
  const flag={voice:'VOICE',images:'IMAGES',video:'VIDEO',files:'FILES',vector:'RETRIEVAL',realtime:'REALTIME'}[group];
  if(env('OPENAI_ENABLE_'+flag)!=='true'||!list('OPENAI_ALLOWED_MEDIA_UIDS').includes(uid))throw new OpenAIServiceError('This optional OpenAI capability is disabled for this account.',403,'CAPABILITY_DISABLED');
  if(group==='realtime')throw new OpenAIServiceError('Hosted Realtime remains disabled until session lifecycle and usage reconciliation are verified. Use the opt-in local adapter for individual testing.',503,'REALTIME_PRODUCTION_NOT_READY');
 }
 if(env('OPENAI_REQUIRE_APP_CHECK')==='true'){
  const {verifyAppCheck}=await import('./openai-app-check.mjs');await verifyAppCheck(request);
 }
}
export function quotaSettings(operation){
 const integer=(name,fallback,min,max)=>{const n=Number(env(name)||fallback);if(!Number.isSafeInteger(n)||n<min||n>max)throw new OpenAIServiceError('Configure valid server usage limits.',503,'NOT_CONFIGURED');return n;};
 const creates={ 'voice.generate':'VOICE','images.generate':'IMAGE','video.create':'VIDEO','realtime.create':'REALTIME','files.upload':'FILE','vector.create':'VECTOR'};operation=quotaOperation(operation);
 return {rpm:integer('OPENAI_REQUESTS_PER_MINUTE',20,1,60),daily:integer('OPENAI_DAILY_TOKEN_LIMIT',50000,100,10000000),maxRequests:integer('OPENAI_MAX_REQUESTS_PER_DAY',100,1,512),concurrent:integer('OPENAI_MAX_CONCURRENT_REQUESTS',1,1,4),operationLimit:creates[operation]?integer('OPENAI_DAILY_'+creates[operation]+'_LIMIT',1,0,100):null};
}
export function enforceQuotas(rows,operation,reserved,now=Date.now()){
 if(!Number.isSafeInteger(reserved)||reserved<1||reserved>10000000)throw new OpenAIServiceError('Invalid AI allowance reservation.',400,'INVALID_REQUEST');
 const limits=quotaSettings(operation),recent=rows.filter(r=>r.started>now-86400000),fail=(message,code,retry)=>{const e=new OpenAIServiceError(message,429,code);if(retry)e.retryAfter=retry;throw e;};
 if(recent.filter(r=>r.started>now-60000).length>=limits.rpm)fail('This account reached its AI request rate limit.','RATE_LIMITED',60);
 if(recent.filter(r=>r.status==='pending'&&r.started>now-130000).length>=limits.concurrent)fail('Wait for the active AI request or press Stop before starting another.','CONCURRENCY_LIMIT',5);
 if(recent.length>=limits.maxRequests)fail('This account reached its daily AI request limit.','DAILY_REQUEST_LIMIT');
 if(limits.operationLimit!==null&&recent.filter(r=>quotaOperation(r.operation)===quotaOperation(operation)).length>=limits.operationLimit)fail('This account reached the daily limit for this media operation.','DAILY_OPERATION_LIMIT');
 const charged=recent.reduce((sum,r)=>sum+Math.max(Number(r.total_tokens??r.usage?.totalTokens)||0,Number(r.reserved)||0),0);
 if(charged+reserved>limits.daily)fail('This account reached its daily AI allowance. Reservations are not refunded after failed requests.','DAILY_USAGE_LIMIT');
}
