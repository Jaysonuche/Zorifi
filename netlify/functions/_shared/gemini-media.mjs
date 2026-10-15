import {env,needed,ServiceError,text} from './provider.mjs';

const ENDPOINT='https://generativelanguage.googleapis.com/v1beta/interactions';
const MODELS={image:'gemini-nano-banana-2.1',music:'lyria-3-clip-preview'};
const MAX_RESULT_BYTES=3_000_000; // Keep the JSON response below Vercel's function payload limit.

export function geminiMediaModel(type){
 const model=env(type==='image'?'GEMINI_IMAGE_MODEL':'GEMINI_MUSIC_MODEL')||MODELS[type];
 if(!/^[a-zA-Z0-9._-]+$/.test(model))throw new ServiceError('Invalid Gemini media model configuration.',503,'NOT_CONFIGURED');
 return model;
}

async function interact(kind,body){
 let response;
 try{response=await fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':needed('GEMINI_API_KEY')},body:JSON.stringify(body),signal:AbortSignal.timeout(115000)});}
 catch{throw new ServiceError(`Gemini ${kind} generation could not be reached or timed out. Please retry.`,502,'PROVIDER_UNAVAILABLE');}
 if(!response.ok){
  // Never return Google's raw error: it may contain credentials or user input.
  if(response.status===429)throw new ServiceError(`Gemini ${kind} generation reached its quota. Check paid-tier access and limits.`,429,'PROVIDER_RATE_LIMIT');
  if([400,401,403,404].includes(response.status))throw new ServiceError(`Gemini ${kind} generation is unavailable for this key. Check paid-tier access, model availability and key restrictions.`,502,'PROVIDER_REJECTED');
  throw new ServiceError(`Gemini ${kind} generation is temporarily unavailable. Please retry.`,502,'PROVIDER_UNAVAILABLE');
 }
 let data;
 try{data=await response.json();}catch{throw new ServiceError(`Gemini returned an invalid ${kind} response.`,502,'INVALID_PROVIDER_RESPONSE');}
 if(!Array.isArray(data.steps))throw new ServiceError(`Gemini returned no ${kind} result.`,502,'INVALID_PROVIDER_RESPONSE');
 return data;
}

function outputBlock(data,type,mimes){
 for(const step of data.steps){
  if(step?.type!=='model_output'||!Array.isArray(step.content))continue;
  for(const block of step.content){
   if(block?.type!==type||typeof block.data!=='string'||!block.data)continue;
   const mime=String(block.mime_type||block.mimeType||mimes[0]).toLowerCase();
   if(!mimes.includes(mime)||!/^[A-Za-z0-9+/]+={0,2}$/.test(block.data))throw new ServiceError('Gemini returned an unsupported media format.',502,'INVALID_PROVIDER_RESPONSE');
   const bytes=Buffer.from(block.data,'base64');
   if(!bytes.length||bytes.length>MAX_RESULT_BYTES)throw new ServiceError('Gemini returned media too large for this download. Try a shorter or smaller result.',502,'INVALID_PROVIDER_RESPONSE');
   return {url:`data:${mime};base64,${block.data}`,mimeType:mime};
  }
 }
 throw new ServiceError(`Gemini returned no ${type} file. Try another prompt.`,502,'INVALID_PROVIDER_RESPONSE');
}

export async function generateGeminiImage(input,description){
 const ratio=['1:1','16:9','9:16','4:5'].includes(input.ratio)?input.ratio:'1:1';
 const instructions=[description,text(input.characterGuide,2000),input.style?`Style: ${text(input.style,80)}`:''].filter(Boolean).join('\n');
 const parts=[{type:'text',text:instructions}];
 if(input.mode==='variation'){
  const reference=input.reference?.url||input.reference;
  const match=typeof reference==='string'&&reference.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match)throw new ServiceError('Image variations require an uploaded PNG, JPEG, or WebP reference.');
  if(Buffer.from(match[2],'base64').length>2_500_000)throw new ServiceError('The reference image must be smaller than 2.5 MB.',413);
  parts.push({type:'image',mime_type:match[1],data:match[2]});
 }
 const data=await interact('image',{model:geminiMediaModel('image'),input:parts,response_format:{type:'image',aspect_ratio:ratio,image_size:'1K'}});
 const result=outputBlock(data,'image',['image/png','image/jpeg','image/webp']);
 return {status:'complete',url:result.url,imageUrl:result.url,mimeType:result.mimeType,metadata:{provider:'Gemini',model:geminiMediaModel('image')}};
}

export async function generateGeminiMusic(input,description){
 const model=geminiMediaModel('music');
 if(model!=='lyria-3-clip-preview')throw new ServiceError('Zorifi currently supports the 30-second Lyria Clip model only.',503,'NOT_CONFIGURED');
 const direction=[description,`Genre: ${text(input.genre,50)||'cinematic'}`,`Mood: ${text(input.mood,50)||'energetic'}`,input.instrumentation?`Instruments: ${text(input.instrumentation,200)}`:'',Number.isFinite(Number(input.tempo))?`Tempo: ${Math.max(40,Math.min(220,Number(input.tempo)))} BPM`:'',input.key?`Key: ${text(input.key,8)}`:'',input.timeSignature?`Time signature: ${text(input.timeSignature,8)}`:'',input.vocals==='instrumental'?'Instrumental, no vocals.':input.vocals==='vocal'?'Include vocals.':''].filter(Boolean).join('\n');
 const data=await interact('music',{model,input:direction});
 const result=outputBlock(data,'audio',['audio/mpeg','audio/mp3']);
 return {status:'complete',url:result.url,audioUrl:result.url,mimeType:'audio/mpeg',duration:30,stems:{},metadata:{provider:'Gemini Lyria',model}};
}
