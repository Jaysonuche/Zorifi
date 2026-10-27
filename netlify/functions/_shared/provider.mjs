import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const identity=require('../../../zorifi-vanessa-identity.js');
export class ServiceError extends Error { constructor(message,status=400,code='INVALID_REQUEST'){super(message);this.status=status;this.code=code;} }
export const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env[name]||'';
export const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export function text(value,max=1500){return String(value??'').trim().slice(0,max);}
export function needed(name){const value=env(name);if(!value)throw new ServiceError(`Configure ${name} before using this service.`,503,'NOT_CONFIGURED');return value;}
export const usesGemini=()=>Boolean(env('GEMINI_API_KEY'));
export const usesOpenRouter=()=>Boolean(env('AI_PROVIDER_KEY'));
function geminiModels(){
 // Dashboard environment values can acquire a trailing newline when pasted.
 // Normalize model identifiers before validation and before sending them upstream.
 const primary=env('GEMINI_MODEL').trim()||'gemini-3.8-flash',fallback=env('GEMINI_FALLBACK_MODEL').trim();
 const models=[...new Set([primary,fallback].filter(Boolean))];
 if(models.some(model=>!/^[a-zA-Z0-9._-]+$/.test(model)))throw new ServiceError('Invalid Gemini model configuration.',503,'NOT_CONFIGURED');
 return models;
}
const geminiTransient=error=>[408,500,502,503,504].includes(Number(error?.status))&&!(error instanceof ServiceError);
const geminiRetryPause=()=>new Promise(resolve=>setTimeout(resolve,500));
function geminiFailure(error,{aborted=false}={}){
 const status=Number(error?.status);
 if(aborted)return new ServiceError('Gemini took too long to respond. Please retry.',504,'PROVIDER_TIMEOUT');
 if(error instanceof ServiceError)return error;
 if([500,502,503,504].includes(status))return new ServiceError('Gemini is temporarily busy. Please retry shortly.',503,'PROVIDER_BUSY');
 if(status===429)return new ServiceError('Gemini has reached its current usage limit. Please retry later.',429,'PROVIDER_RATE_LIMIT');
 if(Number.isInteger(status)&&status>=400&&status<=599)return new ServiceError('Gemini rejected the request. Check credentials, model access, and account limits.',502,'PROVIDER_REJECTED');
 return new ServiceError('Gemini could not finish the response. Please retry.',502,'STREAM_FAILED');
}
export function configuration(){
 return {
  language:usesGemini()?{provider:'Gemini',model:geminiModels()[0],configured:true}:usesOpenRouter()?{provider:'OpenRouter',model:env('AI_PROVIDER_MODEL')||'openrouter/free',configured:true}:{provider:'OpenAI',model:env('VANESSA_MODEL')||'gpt-5-nano',configured:Boolean(env('OPENAI_LANGUAGE_API_KEY')||env('OPENAI_API_KEY'))},
  image:usesGemini()?{provider:'Gemini',model:env('GEMINI_IMAGE_MODEL')||'gemini-nano-banana-2.1',configured:true,supported:['prompt-to-image','reference edits','1K image']}:{provider:'OpenAI',model:env('VANESSA_IMAGE_MODEL')||'gpt-image-2',configured:Boolean(env('OPENAI_IMAGE_API_KEY')||env('OPENAI_API_KEY'))},
  video:env('REPLICATE_API_TOKEN')?{provider:'Replicate',model:'wan-video/wan-2.1-1.3b',configured:true}: {provider:env('VANESSA_GPU_URL')?'Vanessa GPU':'xAI',model:env('VANESSA_VIDEO_MODEL')||'grok-imagine-video-1.5',configured:Boolean(env('VANESSA_GPU_URL')&&env('VANESSA_GPU_KEY')||env('XAI_API_KEY'))},
  music:usesGemini()?{provider:'Gemini Lyria',model:env('GEMINI_MUSIC_MODEL')||'lyria-3-clip-preview',configured:true,supported:['prompt-to-music','30-second MP3']}:{provider:'Compatible music provider',model:env('VANESSA_MUSIC_MODEL'),configured:Boolean(env('VANESSA_MUSIC_URL')&&env('VANESSA_MUSIC_KEY'))},
  voice:{provider:'ElevenLabs',model:env('VANESSA_VOICE_MODEL')||'eleven_multilingual_v2',configured:Boolean(env('ELEVENLABS_API_KEY')&&env('VANESSA_VOICE_ID'))}
 };
}
export async function upstream(url,options={}){
 let response;try{response=await fetch(url,{...options,redirect:'error',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});}catch{if(options.signal?.aborted)throw new ServiceError('The request was cancelled.',499,'CANCELLED');throw new ServiceError('The provider could not be reached. Check its configuration and retry.',502,'PROVIDER_UNAVAILABLE');}
 if(!response.ok)throw new ServiceError(`The provider rejected the request (${response.status}). Check credentials, model access, and account limits.`,response.status===429?429:502,'PROVIDER_REJECTED');
 return response;
}
export async function upstreamJson(url,options={}){const response=await upstream(url,options);try{return await response.json();}catch{throw new ServiceError('The provider returned an invalid response.',502,'INVALID_PROVIDER_RESPONSE');}}
export function httpsUrl(value,{local=false}={}){
 let url;try{url=new URL(value);}catch{throw new ServiceError('A valid provider URL is required.');}
 if(url.username||url.password||!(url.protocol==='https:'||local&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new ServiceError('Use HTTPS for remote providers, or HTTP for a loopback GPU server.');
 return url.href.replace(/\/$/,'');
}
// Share an in-flight identity check only within this request. A subsequent request
// always checks Firebase again, so disabled accounts and revoked sessions are not
// kept alive by a cross-request token cache.
const requestIdentity=new WeakMap();
export async function verifiedAccount(request){
 const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1],apiKey=env('FIREBASE_WEB_API_KEY');
 if(!token||!apiKey)throw new ServiceError('Sign in with a configured Firebase account before using hosted AI services.',401,'AUTH_REQUIRED');
 const existing=requestIdentity.get(request);
 if(existing?.token===token&&existing.apiKey===apiKey)return existing.promise;
 const promise=(async()=>{
  let response,data;
  try{
   response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(apiKey),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(10000)])});
   if([400,401].includes(response.status))throw new ServiceError('Your online session expired. Sign in again.',401,'AUTH_REQUIRED');
   if(!response.ok)throw new ServiceError('Account verification is temporarily unavailable. Please retry.',503,'AUTH_UNAVAILABLE');
   data=await response.json();
  }catch(error){
   if(request.signal.aborted)throw new ServiceError('The request was cancelled.',499,'CANCELLED');
   if(error instanceof ServiceError)throw error;
   throw new ServiceError('Account verification is temporarily unavailable. Please retry.',503,'AUTH_UNAVAILABLE');
  }
  const account=data?.users?.[0];
  if(!account?.localId||typeof account.localId!=='string'||account.disabled)throw new ServiceError('Your online session could not be verified. Sign in again.',401,'AUTH_REQUIRED');
  return Object.freeze({uid:account.localId});
 })();
 requestIdentity.set(request,{token,apiKey,promise});
 return promise;
}
// Administrator identity is pinned to Firebase UID in server configuration only.
export async function accountRole(request){
 const {uid}=await verifiedAccount(request);
 const admin=env('ZORIFI_ADMIN_UIDS').split(',').map(v=>v.trim()).filter(Boolean).includes(uid);
 return {uid,role:admin?'admin':'member'};
}
export async function requireAdmin(request){
 const account=await accountRole(request);
 if(account.role!=='admin')throw new ServiceError('Administrator access is required.',403,'ADMIN_REQUIRED');
 return account;
}
export async function subscription(request){
 const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1],apiKey=env('FIREBASE_WEB_API_KEY'),project=env('FIREBASE_PROJECT_ID');
 if(!token||!apiKey||!project)return {pro:false,uid:null};
 const {uid}=await verifiedAccount(request);
 const url=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/users/${encodeURIComponent(uid)}/private/subscription`;
 try{
  const subscriptionResponse=await fetch(url,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
  if(!subscriptionResponse.ok)return {pro:false,uid};
  const record=await subscriptionResponse.json(),f=record.fields||{};
  return {uid,pro:f.uid?.stringValue===uid&&f.verified?.booleanValue===true&&f.plan?.stringValue==='PRO'&&['ACTIVE','TRIAL'].includes(f.status?.stringValue)};
 }catch{return {pro:false,uid};}
}
export async function authorize(request){return verifiedAccount(request);}
export function handler(run,{multipart=false,rateLimited=false,privateSession=false}={}){
 return async request=>{
  const callerSignal=request.signal;
  // Reserve time inside the 120-second host limit to finalize cancelled sessions.
  if(rateLimited)request=new Request(request,{signal:AbortSignal.any([callerSignal,AbortSignal.timeout(105000)])});
  const origin=request.headers.get('origin'),allowed=[new URL(request.url).origin,'https://localhost','http://localhost','capacitor://localhost',...env('ZORIFI_ALLOWED_ORIGINS').split(',').map(value=>value.trim()).filter(Boolean)];
  const reply=response=>{if(origin&&allowed.includes(origin)){response.headers.set('access-control-allow-origin',origin);response.headers.set('vary','Origin');response.headers.set('access-control-allow-methods','POST, OPTIONS');response.headers.set('access-control-allow-headers','content-type, authorization');}return response;};
  try{
   if(origin&&!allowed.includes(origin))throw new ServiceError('Origin is not allowed.',403,'FORBIDDEN');
   if(request.method==='OPTIONS')return reply(new Response(null,{status:204}));
   if(request.method!=='POST')return reply(json({error:'Method not allowed.'},405));
   const length=Number(request.headers.get('content-length')||0);if(length>25*1024*1024)throw new ServiceError('Upload is too large.',413);
   await authorize(request);
   let input;if(multipart)input=await request.formData();else{const raw=await request.text();if(raw.length>12*1024*1024)throw new ServiceError('Request is too large.',413);try{input=JSON.parse(raw||'{}');}catch{throw new ServiceError('Request must contain valid JSON.');}if(!input||Array.isArray(input)||typeof input!=='object')throw new ServiceError('A JSON object is required.');}
   if(rateLimited&&!(privateSession&&input.operation==='clear')){const {storeFor}=await import('./chat-session-store.mjs');const {uid}=await verifiedAccount(request);await storeFor(request,uid).limit(request.signal);}
   const result=await run(input,request);return reply(result instanceof Response?result:json(result));
  }catch(error){if(request.signal.aborted)error=callerSignal.aborted?new ServiceError('The request was cancelled.',499,'CANCELLED'):new ServiceError('Vanessa took too long to respond. Please retry.',504,'PROVIDER_TIMEOUT');const response=json({error:error instanceof ServiceError?error.message:'The service could not complete this request.',code:error.code||'SERVICE_FAILED',configured:error.code!=='NOT_CONFIGURED',...(error.expectedSequence?{expectedSequence:error.expectedSequence}:{})},error.status||500);if(error.retryAfter)response.headers.set('Retry-After',String(error.retryAfter));return reply(response);}
 };
}
export async function language(prompt,{instructions='',jsonMode=false,preferredLanguage,image,webSearch=false,signal}={}){
 if(usesGemini()){
  if(webSearch)throw new ServiceError('This Gemini integration does not have web search enabled.',400,'UNSUPPORTED_CAPABILITY');
  const parts=[{text:prompt}];
  if(image){const match=typeof image==='string'&&image.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);if(!match||match[2].length%4!==0||Buffer.from(match[2],'base64').length>2_500_000)throw new ServiceError('Use a compact PNG, JPEG or WebP preview for Gemini vision.');parts.push({inlineData:{mimeType:match[1],data:match[2]}});}
  const models=geminiModels();
  const {GoogleGenAI}=await import('@google/genai');
  const ai=new GoogleGenAI({apiKey:needed('GEMINI_API_KEY'),vertexai:false,httpOptions:{apiVersion:'v1beta',timeout:120000,retryOptions:{attempts:1}}});
  let data;
  for(const [index,model] of models.entries()){
   try{
    data=await ai.models.generateContent({model,contents:[{role:'user',parts}],config:{...(signal?{abortSignal:signal}:{}),systemInstruction:identity.providerInstructions({preferredLanguage})+'\n'+instructions,maxOutputTokens:8192,...(jsonMode?{responseMimeType:'application/json'}:{})}});
    break;
   }catch(error){
    if(signal?.aborted)throw new ServiceError('The creative request was cancelled or took too long. Please retry.',504,'PROVIDER_TIMEOUT');
    if(index<models.length-1&&geminiTransient(error)){await geminiRetryPause();continue;}
    throw geminiFailure(error);
   }
  }
  const candidate=data.candidates?.[0],output=candidate?.content?.parts?.filter(part=>!part.thought&&typeof part.text==='string').map(part=>part.text).join('');
  if(data.error||data.promptFeedback?.blockReason||candidate?.finishReason!=='STOP'||!output?.trim())throw new ServiceError('Gemini did not return a complete result.',502,'INVALID_PROVIDER_RESPONSE');
  if(!jsonMode)return output;
  try{const result=JSON.parse(output);if(!result||Array.isArray(result)||typeof result!=='object')throw Error();return result;}catch{throw new ServiceError('Gemini returned invalid structured output.',502,'INVALID_PROVIDER_RESPONSE');}
 }
 if(usesOpenRouter()){
  if(image||webSearch)throw new ServiceError('This OpenRouter integration supports text and structured planning. Image analysis and web research require a separately configured capability.',400,'UNSUPPORTED_CAPABILITY');
  const data=await upstreamJson('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${needed('AI_PROVIDER_KEY')}`,'content-type':'application/json','X-OpenRouter-Title':'Zorifi Media Suite'},signal,body:JSON.stringify({model:env('AI_PROVIDER_MODEL')||'openrouter/free',messages:[{role:'system',content:`${identity.providerInstructions({preferredLanguage})}\n${instructions}${jsonMode?'\nReturn a valid JSON object only.':''}`},{role:'user',content:prompt}],max_tokens:6000,stream:false,...(jsonMode?{response_format:{type:'json_object'}}:{})})});
  const choice=data.choices?.[0],output=choice?.message?.content;
  if(data.error||choice?.finish_reason!=='stop'||typeof output!=='string'||!output.trim())throw new ServiceError('The provider did not return a complete result.',502,'INVALID_PROVIDER_RESPONSE');
  if(!jsonMode)return output;
  try{const result=JSON.parse(output);if(!result||Array.isArray(result)||typeof result!=='object')throw new Error();return result;}catch{throw new ServiceError('The provider returned invalid structured output.',502,'INVALID_PROVIDER_RESPONSE');}
 }
 const key=env('OPENAI_LANGUAGE_API_KEY')||env('OPENAI_API_KEY');if(!key)throw new ServiceError('Configure the language provider in Vanessa settings.',503,'NOT_CONFIGURED');
 const payload={model:env('VANESSA_MODEL')||'gpt-5-nano',instructions:`${identity.providerInstructions({preferredLanguage})}\n${instructions}`,input:prompt,max_output_tokens:6000,store:false};
 if(jsonMode)payload.text={format:{type:'json_object'}};
 if(webSearch)payload.tools=[{type:'web_search'}];
 if(image){if(!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))throw new ServiceError('Upload a supported image for analysis.');payload.input=[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:image}]}];}
 const data=await upstreamJson('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(payload),signal});
 const output=data.output?.flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('\n');
 if(!output||data.status==='incomplete')throw new ServiceError('The language provider did not return a complete result.',502,'INVALID_PROVIDER_RESPONSE');
 if(!jsonMode){const citations=webSearch?data.output?.flatMap(item=>item.content||[]).flatMap(item=>item.annotations||[]).filter(item=>item.type==='url_citation'&&/^https:\/\//.test(item.url)).map(item=>`${item.title||'Source'}: ${item.url}`):[];return output+(citations?.length?`\n\nSources:\n${[...new Set(citations)].join('\n')}`:'');}
 try{return JSON.parse(output);}catch{throw new ServiceError('The language provider returned invalid structured output.',502,'INVALID_PROVIDER_RESPONSE');}
}
export function normalizeMedia(data,kind){
 const raw=data.url||data.imageUrl||data.videoUrl||data.audioUrl||data.video?.url||data.result?.url;
 const url=raw?httpsUrl(raw):'';
 const requestId=text(data.requestId||data.request_id||data.id,200),reported=text(data.status,40).toLowerCase();
 const failed=['failed','error','expired'].includes(reported),cancelled=['cancelled','canceled'].includes(reported);
 const stems=Object.fromEntries(Object.entries(data.stems||{}).filter(([name])=>['vocals','drums','bass','lead','fx'].includes(name)).map(([name,value])=>[name,httpsUrl(value)]));
 if(!url&&!requestId&&!failed&&!cancelled&&!Object.keys(stems).length)throw new ServiceError('The provider returned no media or job ID.',502,'INVALID_PROVIDER_RESPONSE');
 return {requestId,status:failed?'failed':cancelled?'cancelled':url||Object.keys(stems).length?'complete':'running',url,...(kind==='video'?{videoUrl:url}:{}),stems,progress:Number.isFinite(data.progress)?Math.max(0,Math.min(100,data.progress)):null,duration:Number(data.duration)||null};
}

// SSE is opt-in; complete JSON plans continue through language().
export function languageStreamResponse(prompt,{instructions='',preferredLanguage,signal}={}){
 if(!usesGemini())throw new ServiceError('Streaming requires the Gemini language provider.',400,'STREAM_UNSUPPORTED');
 const models=geminiModels();
 const abort=new AbortController(),encoder=new TextEncoder();let cancelled=false;
 const disconnect=()=>abort.abort(signal?.reason);if(signal?.aborted)disconnect();else signal?.addEventListener('abort',disconnect,{once:true});
 const timer=setTimeout(()=>abort.abort(),120000);
 async function* events(){
  let visibleLength=0,attemptedModel='',finishReason='';
  try{
   const {GoogleGenAI}=await import('@google/genai');
   const ai=new GoogleGenAI({apiKey:needed('GEMINI_API_KEY'),vertexai:false,httpOptions:{apiVersion:'v1beta',timeout:120000,retryOptions:{attempts:1}}});
   for(const [index,model] of models.entries()){
    attemptedModel=model;let complete=false;
    try{
     const chunks=await ai.models.generateContentStream({model,contents:[{role:'user',parts:[{text:prompt}]}],config:{abortSignal:abort.signal,systemInstruction:identity.providerInstructions({preferredLanguage})+'\n'+instructions,maxOutputTokens:8192}});
     for await(const chunk of chunks){
      if(abort.signal.aborted)throw Error('Aborted');
      const candidate=chunk.candidates?.[0],reason=candidate?.finishReason;
      if(reason)finishReason=reason;
      if(chunk.promptFeedback?.blockReason||reason&&reason!=='STOP'&&reason!=='FINISH_REASON_UNSPECIFIED')throw new ServiceError('Gemini stopped the response before it finished.',502,'INVALID_PROVIDER_RESPONSE');
      const text=candidate?.content?.parts?.filter(part=>!part.thought&&typeof part.text==='string').map(part=>part.text).join('')||'';
      visibleLength+=text.length;if(visibleLength>100000)throw new ServiceError('Gemini response was too large.',502,'INVALID_PROVIDER_RESPONSE');
      if(text)yield 'data: '+JSON.stringify({text})+'\n\n';
      if(reason==='STOP')complete=true;
     }
     if(!complete||!visibleLength)throw new ServiceError('Gemini did not return a complete result.',502,'INVALID_PROVIDER_RESPONSE');
     yield 'data: [DONE]\n\n';
     return;
    }catch(error){
     if(!abort.signal.aborted&&!visibleLength&&index<models.length-1&&geminiTransient(error)){await geminiRetryPause();continue;}
     throw error;
    }
   }
  }catch(error){
   if(!cancelled){
    const failure=geminiFailure(error,{aborted:abort.signal.aborted});
    console.warn('[Vanessa Gemini stream]',{code:failure.code,status:Number(error?.status)||0,model:attemptedModel,visibleChars:visibleLength,finishReason});
    yield 'data: '+JSON.stringify({error:failure.message,code:failure.code})+'\n\n';
   }
  }
  finally{clearTimeout(timer);signal?.removeEventListener('abort',disconnect);}
 }
 const iterator=events();
 return new Response(new ReadableStream({async pull(controller){const next=await iterator.next();if(cancelled)return;if(next.done)controller.close();else controller.enqueue(encoder.encode(next.value));},cancel(){cancelled=true;abort.abort();clearTimeout(timer);signal?.removeEventListener('abort',disconnect);void iterator.return();}}),{headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store, no-transform','x-accel-buffering':'no'}});
}
