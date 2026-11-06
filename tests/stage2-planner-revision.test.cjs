const test=require('node:test');
const assert=require('node:assert/strict');

// Exercise the real planner and Gemini SDK with a deterministic transport.
// No request can leave this fixture, and no editor state is supplied for mutation.
async function fixture(run){
 const previousFetch=global.fetch,previousNetlify=global.Netlify,previousFallback=process.env.GEMINI_FALLBACK_MODEL;
 const calls=[];let respond;
 delete process.env.GEMINI_FALLBACK_MODEL;
 global.Netlify={env:{get:key=>({GEMINI_API_KEY:'fixture-private-revision-key',GEMINI_MODEL:'gemini-3.6-flash'})[key]||''}};
 global.fetch=async(url,options)=>{
  assert.equal(String(url),'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
  assert.equal(new Headers(options.headers).get('x-goog-api-key'),'fixture-private-revision-key');
  const body=JSON.parse(options.body);assert(body.generationConfig.responseJsonSchema);
  assert(!options.body.includes('fixture-private-revision-key'));
  calls.push({body,signal:options.signal});
  if(!respond)throw Error('Unexpected provider request');
  return respond(calls.length,options);
 };
 try{
  const {createProfessionalPlan}=await import('../netlify/functions/_shared/professional-planner.mjs');
  const jpeg=await require('sharp')({create:{width:4,height:4,channels:3,background:'#452568'}}).jpeg().toBuffer();
  const input={message:'Create a premium 45-second cinematic fashion commercial using these clips.',context:{exactDuration:45,targetDuration:45,ratio:'16:9',catalog:{},manifest:{clips:[],selection:[],trackStates:{},mediaAssets:[0,1,2].map(index=>({id:'source-'+index,type:'video',duration:15.2,width:480,height:270,available:true}))},evidence:{version:1,method:'zorifi-decoded-samples-v1',media:[0,1,2].map(index=>({id:'source-'+index,type:'video',duration:15.2,width:480,height:270,frames:[{time:0,image:'data:image/jpeg;base64,'+jpeg.toString('base64')}]}))}}};
  const proposal=duration=>({reply:'I prepared a reviewable edit.',title:'Fashion in motion',strategy:'Use three supported source windows in sequence.',actions:[0,1,2].map(index=>({command:'clip.add',target:null,parameters:{id:'shot-'+index,mediaId:'source-'+index,start:index*duration/3,duration:duration/3,sourceStart:0,track:0}})),observations:[{mediaId:'source-0',time:0,note:'A supplied source frame supports this shot.'}],warnings:[]});
  const response=(duration,usage)=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(proposal(duration))}]}}],usageMetadata:usage});
  await run({input,createProfessionalPlan,calls,setTransport:handler=>{respond=handler;},response,request:signal=>new Request('https://zorifi.example/api/vanessa/chat',{signal})});
 }finally{
  global.fetch=previousFetch;global.Netlify=previousNetlify;
  if(previousFallback===undefined)delete process.env.GEMINI_FALLBACK_MODEL;else process.env.GEMINI_FALLBACK_MODEL=previousFallback;
 }
}

test('a short proposal gets one bounded revision and combines both passes of usage metadata',()=>fixture(async f=>{
 const before=structuredClone(f.input);
 f.setTransport(call=>call===1?f.response(40.5,{promptTokenCount:1000,candidatesTokenCount:200,thoughtsTokenCount:50}):f.response(45,{promptTokenCount:1500,candidatesTokenCount:250,thoughtsTokenCount:75}));
 const result=await f.createProfessionalPlan(f.input,f.request());
 assert.equal(f.calls.length,2);
 assert.equal(result.metadata.plannerPasses,2);
 assert.deepEqual(result.metadata.usage,{inputTokens:2500,outputTokens:450,thinkingTokens:125});
 const rate=Date.now()<Date.UTC(2027,0,1)?1:2;
 assert.equal(result.metadata.costEstimateUSD,rate*(2500*.75+575*3.75)/1e6);
 assert.equal(Math.max(...result.actions.map(action=>action.parameters.start+action.parameters.duration)),45);
 const revision=JSON.parse(f.calls[1].body.contents[0].parts.at(-1).text);
 assert(revision.requiredRevision.some(issue=>issue.includes('40.500')));
 assert.equal(revision.previousProposal.actions.length,3);
 assert.match(result.reply,/prepared.*proposal/);
 assert.deepEqual(f.input,before,'Planning and revision cannot mutate the supplied manifest.');
}));

test('a second short proposal fails without a third provider attempt or an actionable result',()=>fixture(async f=>{
 const before=structuredClone(f.input);
 f.setTransport(()=>f.response(40.5,{promptTokenCount:1000,candidatesTokenCount:200,thoughtsTokenCount:50}));
 await assert.rejects(f.createProfessionalPlan(f.input,f.request()),error=>error.code==='BRIEF_NOT_SATISFIED'&&error.status===502&&/project is unchanged/i.test(error.message));
 assert.equal(f.calls.length,2);
 assert.deepEqual(f.input,before);
}));

test('invalid exact durations are rejected before any provider request',()=>fixture(async f=>{
 f.setTransport(()=>{throw Error('Invalid duration reached the provider');});
 for(const exactDuration of [0,-1,181,Infinity,NaN,'45',{},true]){
  const input={...f.input,context:{...f.input.context,exactDuration}};
  await assert.rejects(f.createProfessionalPlan(input,f.request()),error=>error.status===400&&error.code==='INVALID_REQUEST'&&/between 1 and 180/.test(error.message));
 }
 assert.equal(f.calls.length,0);
}));

test('Stop aborts a pending revision without returning actions or changing the manifest',()=>fixture(async f=>{
 const before=structuredClone(f.input),controller=new AbortController();
 let revisionStarted,aborted=false;
 const ready=new Promise(resolve=>{revisionStarted=resolve;});
 f.setTransport((call,options)=>{
  if(call===1)return f.response(40.5,{promptTokenCount:1000,candidatesTokenCount:200,thoughtsTokenCount:50});
  revisionStarted();
  return new Promise((resolve,reject)=>{
   const stop=()=>{aborted=true;reject(options.signal.reason);};
   if(options.signal.aborted)stop();else options.signal.addEventListener('abort',stop,{once:true});
  });
 });
 const pending=f.createProfessionalPlan(f.input,f.request(controller.signal));
 await ready;controller.abort();
 await assert.rejects(pending,error=>error.status===499&&error.code==='REVISION_UNAVAILABLE'&&/project is unchanged/i.test(error.message));
 assert.equal(aborted,true);
 assert.equal(f.calls.length,2);
 assert.deepEqual(f.input,before,'Cancelled planning never commits an editor change.');
}));
