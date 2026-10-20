const test=require('node:test'),assert=require('node:assert/strict');
const Provider=require('../zorifi-ai-provider.js');
test('chat routes explicit video renders, not scripts, questions, or negated requests',()=>{
 for(const text of ['Generate a 5-second video of a forest','Can you create a short clip of the ocean?','Render silent footage of a bird'])assert(Provider.isVideoGenerationRequest(text),text);
 for(const text of ['Write a video script','How do I generate a video?','Do not generate a video','Create a storyboard for my video','Make the clip brighter'])assert(!Provider.isVideoGenerationRequest(text),text);
});
test('Replicate validates inputs, binds jobs to accounts, and maps lifecycle truthfully',async()=>{
 const oldFetch=global.fetch,oldEnv=global.Netlify;
 global.Netlify={env:{get:key=>({REPLICATE_API_TOKEN:'private-replicate-token',FIREBASE_WEB_API_KEY:'test-key',GEMINI_API_KEY:'test-gemini'})[key]||''}};
 try{
  const {renderVideo,validateVideo,normalizePrediction,readTicket,planVideoTool}=await import('../netlify/functions/_shared/replicate-video.mjs');
  const req=new Request('https://zorifi.vercel.app/api/test',{headers:{authorization:'Bearer user-token'}});
  for(const input of [{duration:6},{ratio:'1:1'},{resolution:'720p'},{sound:true},{mode:'image'},{duration:2.2}])assert.throws(()=>validateVideo({prompt:'Ocean waves',...input}));
  let uid='user-one',mode='starting',predictionCalls=0;
  global.fetch=async(url,options)=>{
   if(url.includes('accounts:lookup'))return Response.json({users:[{localId:uid}]});
   predictionCalls++;assert.equal(options.headers.authorization,'Bearer private-replicate-token');
   if(url.endsWith('/models/wan-video/wan-2.1-1.3b/predictions')){const body=JSON.parse(options.body);assert.equal(body.input.frame_num,81);assert.equal(body.input.resolution,'480p');}
   return Response.json({id:'job123',status:mode,output:mode==='succeeded'?'https://video.replicate.delivery/result.mp4':'https://video.replicate.delivery/unfinished.mp4'});
  };
  const started=await renderVideo({prompt:'Ocean waves',duration:5},req);assert.equal(started.status,'queued');assert.equal(started.url,'');
  assert.equal(readTicket(started.requestId,'user-one').id,'job123');
  assert.throws(()=>readTicket(started.requestId+'x','user-one'));
  uid='other-user';const before=predictionCalls;await assert.rejects(renderVideo({action:'status',requestId:started.requestId},new Request(req)),e=>e.status===403);assert.equal(predictionCalls,before);
  uid='user-one';mode='succeeded';assert.equal((await renderVideo({action:'status',requestId:started.requestId},req)).status,'complete');
  mode='canceled';assert.equal((await renderVideo({action:'cancel',requestId:started.requestId},req)).status,'cancelled');
  assert.throws(()=>normalizePrediction({status:'succeeded',output:'https://evil.example/video.mp4'},'id',5));
  assert.equal(normalizePrediction({status:'failed',error:'private-provider-secret'},'id',5).error,'Replicate could not complete this video.');
  global.fetch=async(url,options)=>{assert(url.includes(':generateContent'));const body=JSON.parse(options.body);assert.equal(body.tools[0].functionDeclarations[0].name,'generate_ai_video');return Response.json({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{functionCall:{name:'generate_ai_video',args:{prompt:'Ocean waves',duration:5,ratio:'16:9'}}}]}}]});};
  const planned=await planVideoTool({message:'Generate a video of ocean waves'});assert.equal(planned.toolCall.name,'generate_ai_video');assert.equal(planned.toolCall.arguments.duration,5);
  global.Netlify={env:{get:key=>key==='FIREBASE_WEB_API_KEY'?'test-key':''}};
  global.fetch=async()=>Response.json({users:[{localId:'user-one'}]});
  const local=await renderVideo({prompt:'Ocean waves'},req);assert.equal(local.status,'local_required');assert.equal(local.reason,'MISSING_TOKEN');assert.equal(local.url,'');
  let calls=0;const job=new Provider.Job('video',{prompt:'Ocean waves',duration:5},{transport:async()=>{calls++;return local;}});assert.equal((await job.start()).status,'local_required');assert.equal(calls,1);
  global.Netlify={env:{get:key=>({FIREBASE_WEB_API_KEY:'test-key',REPLICATE_API_TOKEN:'test-token'})[key]||''}};
  global.fetch=async url=>url.includes('accounts:lookup')?Response.json({users:[{localId:'user-one'}]}):Response.json({}, {status:402});
  assert.equal((await renderVideo({prompt:'Ocean waves'},req)).reason,'INSUFFICIENT_CREDIT');
  global.fetch=async url=>url.includes('accounts:lookup')?Response.json({users:[{localId:'user-one'}]}):Response.json({}, {status:401});
  await assert.rejects(renderVideo({prompt:'Ocean waves'},req),e=>e.code==='PROVIDER_REJECTED');
  await assert.rejects(renderVideo({prompt:'Ocean waves'},new Request('https://zorifi.vercel.app/api/test')),e=>e.status===401);
 }finally{global.fetch=oldFetch;global.Netlify=oldEnv;}
});
