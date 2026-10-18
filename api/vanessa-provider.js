// Gemini calls delegate to the shared GoogleGenAI SDK provider, which reads GEMINI_MODEL.
// Vercel Node adapter. Provider keys and upstream destinations stay server-side.
const services={'vanessa-director-tools':'directorTools','vanessa-autocut':'autoCutPlan','vanessa-video-tool':'videoTool','account-permissions':'accountPermissions',vanessa:'editor','vanessa-global':'conversation','vanessa-language':'languageStudio','vanessa-scenes':'scenePlan','vanessa-video':'videoPlan','vanessa-image':'imageGeneration','vanessa-scene-image':'imageGeneration','vanessa-motion':'motion','vanessa-music':'music','vanessa-stems':'stems','vanessa-voice':'voiceGeneration','vanessa-speech':'speech','vanessa-captions':'captions','vanessa-provider-test':'providerTest','support-email':'support'};
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const fail=(status,error)=>res.status(status).json({error});
 if(!['POST','OPTIONS'].includes(req.method))return fail(405,'Method not allowed.');
 const service=req.query?.service??'vanessa-global';
 if(typeof service!=='string'||!Object.hasOwn(services,service))return fail(404,'Unknown service.');
 try{
  const host=req.headers.host;
  if(typeof host!=='string'||!/^([a-z0-9-]+\.)+[a-z0-9-]+(?::\d+)?$/i.test(host))return fail(400,'Invalid hosted gateway hostname.');
  const url=new URL(`https://${host}/api/vanessa-provider`);
  if(url.hostname.endsWith('.localhost')||/^\d+(\.\d+){3}$/.test(url.hostname))return fail(400,'Use the local development server for local requests.');
  const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
  let body;
  if(req.method==='POST'){
   if(req.body!==undefined)body=Buffer.isBuffer(req.body)?req.body:Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body));
   else {const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>4*1024*1024)return fail(413,'Split this upload into smaller chunks.');chunks.push(Buffer.from(chunk));}body=Buffer.concat(chunks);}
   if(body.length>4*1024*1024)return fail(413,'Split this upload into smaller chunks.');
  }
  const request=new Request(url,{method:req.method,headers,...(body?{body}: {})});
  const handlers=service==='vanessa-director-tools'?await import('../netlify/functions/_shared/director-tools.mjs'):service==='vanessa-autocut'?await import('../netlify/functions/_shared/autocut-planner.mjs'):await import('../netlify/functions/_shared/services.mjs');
  const response=await handlers[services[service]](request);
  if(response.headers.get('content-type')?.includes('text/event-stream'))return await require('../netlify/functions/_shared/stream-response.cjs')(response,res);
  for(const [key,value] of response.headers)res.setHeader(key,value);
  return res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
 }catch{return fail(500,'The AI gateway could not complete this request.');}
};
