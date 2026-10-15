import {createHmac,timingSafeEqual} from 'node:crypto';
import {env,needed,ServiceError,accountRole} from './provider.mjs';

export const MODEL='wan-video/wan-2.1-1.3b';
export const VIDEO_TOOL={name:'generate_ai_video',description:'Render one original silent text-to-video clip with Wan 2.1 1.3B on Replicate. Use only for an explicit request to generate footage, not scripts, advice, or editing existing footage. Supports 1–5 seconds, 480p, landscape or portrait.',parameters:{type:'OBJECT',properties:{prompt:{type:'STRING',description:'Visual description of the requested footage.'},duration:{type:'INTEGER',description:'Duration in seconds, default 5.'},ratio:{type:'STRING',enum:['16:9','9:16']}},required:['prompt']}};
export function localVideoPayload(args,reason){
 return {status:'local_required',executionMode:'local',reason,message:'Cloud rendering is unavailable. A local Wan execution payload is ready; no video has been generated. Run it with a compatible local Wan/Diffusers runner and model weights.',url:'',videoUrl:'',localExecution:{schemaVersion:1,model:'Wan-AI/Wan2.1-T2V-1.3B-Diffusers',task:'text-to-video',input:{prompt:args.prompt,num_frames:args.duration*16+1,fps:16,width:args.ratio==='9:16'?480:832,height:args.ratio==='9:16'?832:480},requirements:['Compatible local GPU and sufficient memory','Python, PyTorch and Diffusers','Downloaded Wan 2.1 model weights']}};
}
export function validateVideo(input={}){
 const prompt=typeof input.prompt==='string'?input.prompt.trim():'';
 if(prompt.length<3||prompt.length>1500)throw new ServiceError('Describe the video in 3 to 1500 characters.');
 const duration=input.duration??5,ratio=input.ratio??'16:9';
 if(!Number.isInteger(duration)||duration<1||duration>5)throw new ServiceError('Wan 2.1 supports clips from 1 to 5 seconds.');
 if(!['16:9','9:16'].includes(ratio))throw new ServiceError('Choose landscape (16:9) or portrait (9:16).');
 if(input.mode&&input.mode!=='text'||input.image||input.references?.length)throw new ServiceError('This Wan model supports text-to-video only.');
 if(input.sound===true)throw new ServiceError('This Wan model generates silent footage. Add audio separately.');
 if(input.resolution&&input.resolution!=='480p')throw new ServiceError('This Wan model supports 480p output.');
 return {prompt,duration,ratio};
}
function sign(payload){return createHmac('sha256',needed('REPLICATE_API_TOKEN')).update('zorifi-video-job:'+payload).digest('base64url');}
export function jobTicket(id,uid,duration){
 const payload=Buffer.from(JSON.stringify({id,uid,duration,exp:Date.now()+24*60*60*1000})).toString('base64url');
 return payload+'.'+sign(payload);
}
export function readTicket(ticket,uid){
 if(typeof ticket!=='string'||ticket.length>1500)throw new ServiceError('Invalid video job.',403,'FORBIDDEN');
 const [payload,mac,...extra]=ticket.split('.');
 const expected=Buffer.from(sign(payload||'')),actual=Buffer.from(mac||'');
 if(extra.length||expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new ServiceError('Invalid video job.',403,'FORBIDDEN');
 let data;try{data=JSON.parse(Buffer.from(payload,'base64url'));}catch{throw new ServiceError('Invalid video job.',403,'FORBIDDEN');}
 if(data.uid!==uid||!Number.isFinite(data.exp)||data.exp<Date.now()||!/^[a-zA-Z0-9_-]{1,100}$/.test(data.id))throw new ServiceError('This video job is expired or belongs to another account.',403,'FORBIDDEN');
 return data;
}
async function replicate(path,body){
 let response;try{response=await fetch('https://api.replicate.com/v1/'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+needed('REPLICATE_API_TOKEN'),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(30000)});}catch(error){if(error instanceof ServiceError)throw error;throw new ServiceError('Replicate could not be reached. Check job status before starting another render.',502,'PROVIDER_UNAVAILABLE');}
 if(!response.ok)throw new ServiceError(response.status===402?'Replicate requires credit before it can render.':'Replicate rejected the request. Check the token, model access and account limits.',response.status===429?429:502,response.status===402?'INSUFFICIENT_CREDIT':'PROVIDER_REJECTED');
 try{return await response.json();}catch{throw new ServiceError('Replicate returned an invalid response.',502,'INVALID_PROVIDER_RESPONSE');}
}
export function normalizePrediction(data,requestId,duration){
 const status=({starting:'queued',processing:'running',succeeded:'complete',failed:'failed',canceled:'cancelled'})[data.status];
 if(!status)throw new ServiceError('Replicate returned an unknown job status.',502,'INVALID_PROVIDER_RESPONSE');
 let url='';
 if(status==='complete'){
  url=Array.isArray(data.output)?data.output[0]:data.output;
  let parsed;try{parsed=new URL(url);}catch{throw new ServiceError('Replicate returned no completed video.',502,'INVALID_PROVIDER_RESPONSE');}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||!(parsed.hostname==='replicate.delivery'||parsed.hostname.endsWith('.replicate.delivery')))throw new ServiceError('Replicate returned an unsupported video location.',502,'INVALID_PROVIDER_RESPONSE');
 }
 return {requestId,status,url,videoUrl:url,duration,progress:null,mimeType:'video/mp4',...(status==='failed'?{error:'Replicate could not complete this video.'}:{}),metadata:{provider:'Replicate',model:MODEL,temporaryUrl:true}};
}
export async function renderVideo(input,request){
 const {uid}=await accountRole(request),action=input.action||'start';
 if(action==='start'){
  const args=validateVideo(input);
  if((env('VANESSA_VIDEO_EXECUTION_MODE')==='local'||env('ZORIFI_LOCAL_VIDEO_FALLBACK')==='true'))return localVideoPayload(args,'LOCAL_MODE');
  if(!env('REPLICATE_API_TOKEN'))return localVideoPayload(args,'MISSING_TOKEN');
  let data;try{data=await replicate('models/'+MODEL+'/predictions',{input:{prompt:args.prompt,frame_num:args.duration*16+1,resolution:'480p',aspect_ratio:args.ratio}});}catch(error){if(error.code==='INSUFFICIENT_CREDIT')return localVideoPayload(args,'INSUFFICIENT_CREDIT');throw error;}
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(data.id||''))throw new ServiceError('Replicate returned no job ID.',502,'INVALID_PROVIDER_RESPONSE');
  return normalizePrediction(data,jobTicket(data.id,uid,args.duration),args.duration);
 }
 if(!['status','cancel'].includes(action))throw new ServiceError('Unsupported video operation.');
 const job=readTicket(input.requestId,uid);
 const data=await replicate('predictions/'+job.id+(action==='cancel'?'/cancel':''),action==='cancel'?{}:undefined);
 return normalizePrediction(data,input.requestId,job.duration);
}
export async function planVideoTool(input){
 const message=typeof input.message==='string'?input.message.trim():'';
 if(!message||message.length>4000)throw new ServiceError('Describe the video you want to generate.');
 const {GoogleGenAI}=await import('@google/genai');
 const ai=new GoogleGenAI({apiKey:needed('GEMINI_API_KEY'),vertexai:false,httpOptions:{timeout:60000,retryOptions:{attempts:1}}});
 let result;try{result=await ai.models.generateContent({model:env('GEMINI_MODEL')||'gemini-2.5-flash',contents:message,config:{systemInstruction:'You are Vanessa. For explicit requests to render new footage, call generate_ai_video once with the requested visual prompt. Do not call it for scripts, explanations or edits. Do not silently shorten longer videos, change requested resolution, promise audio, or substitute an image-to-video model. Explain those limitations instead. Never claim a render has started; this call only proposes parameters.',tools:[{functionDeclarations:[VIDEO_TOOL]}],maxOutputTokens:1024}});}catch{throw new ServiceError('Vanessa could not prepare the video request.',502,'PROVIDER_UNAVAILABLE');}
 const calls=result.functionCalls||[];
 if(calls.length===1&&calls[0].name==='generate_ai_video')return {toolCall:{name:'generate_ai_video',arguments:validateVideo(calls[0].args)}};
 if(calls.length)throw new ServiceError('Vanessa returned an invalid video tool call.',502,'INVALID_PROVIDER_RESPONSE');
 return {reply:result.text||'Describe a silent 1–5 second video in landscape or portrait.'};
}
