const test=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');

const IMAGE='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6XuQAAAAASUVORK5CYII=';
function wav(seconds=1){
  const dataBytes=Math.round(seconds*16000)*2,buffer=Buffer.alloc(44+dataBytes);
  buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVE',8);buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(16000,24);buffer.writeUInt32LE(32000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(dataBytes,40);
  return 'data:audio/wav;base64,'+buffer.toString('base64');
}
const input=()=>({prompt:'A coherent motivational story with readable titles',targetDuration:6,style:'motivational',ratio:'9:16',media:[{id:'clip-a',name:'Opaque file name.mp4',type:'video',duration:12,width:1920,height:1080,frames:[{time:0,image:IMAGE},{time:6,image:IMAGE}],audio:{start:1,duration:1,dataUrl:wav()}}],soundtrack:{id:'music-a',duration:10,beatTimes:[0,1,2,3,4,5,6]}});
const plan=()=>({title:'Build momentum',story:'A wide introduction establishes the setting before a tighter finish.',shots:[{mediaId:'clip-a',sourceStart:0,duration:3,speed:1,reason:'Use the opening view as the hook.',fit:'cover',motion:'push-in',transition:'cut',grade:'cinematic',caption:'Make a start',captionPosition:'bottom',layout:'single',secondaryMediaIds:[],focalPoint:{x:0.6,y:0.4}},{mediaId:'clip-a',sourceStart:6,duration:3,speed:1,reason:'Finish on the later source sample.',fit:'contain',motion:'none',transition:'dissolve',grade:'natural',caption:'',captionPosition:'center',layout:'single',secondaryMediaIds:[]}],warnings:['This plan uses sampled frames and a short audio excerpt.']});
const response=body=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'Do not return this private reasoning.'},{text:JSON.stringify(body)}]}}]});
async function mocked(fetchImpl,run,overrides={}){
  const oldFetch=global.fetch,oldNetlify=global.Netlify;
  const keys=['GEMINI_API_KEY','GEMINI_MODEL','GEMINI_FALLBACK_MODEL','FIREBASE_WEB_API_KEY','FIREBASE_PROJECT_ID'];
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  for(const key of keys)delete process.env[key];
  const configuration={GEMINI_API_KEY:'mock-private-autocut-key',GEMINI_MODEL:'gemini-2.5-flash',FIREBASE_WEB_API_KEY:'public-auth-test',FIREBASE_PROJECT_ID:'test-project',...overrides};
  global.Netlify={env:{get:key=>configuration[key]||''}};global.fetch=fetchImpl;
  try{return await run(await import('../netlify/functions/_shared/autocut-planner.mjs'));}
  finally{global.fetch=oldFetch;global.Netlify=oldNetlify;for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
}
function localRequest(body=input()){return new Request('http://127.0.0.1:4173/.netlify/functions/vanessa-autocut',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}

test('AutoCut sends actual labelled frames and bounded audio to native Gemini and validates the story plan',async()=>{
  let sent;
  await mocked(async(url,options)=>{
    assert.equal(String(url),'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    assert.equal(new Headers(options.headers).get('x-goog-api-key'),'mock-private-autocut-key');
    sent=JSON.parse(options.body);return response(plan());
  },async module=>{
    const result=await module.autoCutPlan(localRequest());assert.equal(result.status,200);
    const body=await result.json();assert.equal(body.plan.title,'Build momentum');assert.equal(body.plan.shots.length,2);assert.deepEqual(body.plan.shots[1].focalPoint,{x:0.5,y:0.5});
    assert.deepEqual(body.metadata,{provider:'Gemini',model:'gemini-2.5-flash',analyzedFrames:2,audioSamples:1});
    assert(!JSON.stringify(body).includes('mock-private-autocut-key'));assert(!JSON.stringify(body).includes('private reasoning'));
    const parts=sent.contents[0].parts,inline=parts.filter(part=>part.inlineData).map(part=>part.inlineData);
    assert.deepEqual(inline.map(part=>part.mimeType),['image/png','image/png','audio/wav']);
    assert.equal(inline[0].data,IMAGE.split(',')[1]);assert.match(parts.map(part=>part.text).join('\n'),/AUDIO EXCERPT ONLY: source 1 to 2 seconds/);
    assert(!JSON.stringify(JSON.parse(parts[0].text)).includes('base64'));
    assert.equal(sent.generationConfig.responseMimeType,'application/json');assert(sent.generationConfig.responseJsonSchema.properties.shots);
    const system=sent.systemInstruction.parts[0].text;assert.match(system,/untrusted source content/);assert.match(system,/never claim to have listened to the full source/);assert.match(system,/Keep dialogue clips at speed 1/);assert.match(system,/anime-impact/);assert.match(system,/motivational/);assert.match(system,/not a purported verbatim subtitle/);
  });
});

test('AutoCut rejects invalid frames, source timing, unbounded payloads and forged WAV metadata before contacting Gemini',async()=>{
  await mocked(async()=>{throw Error('No invalid request may contact a provider');},async({autoCutPlan})=>{
    const bad=[];
    let value=input();value.media[0].frames[0].image='https://untrusted.example/frame.jpg';bad.push([value,400]);
    value=input();value.media[0].frames[0].time=13;bad.push([value,400]);
    value=input();value.media[0].frames[0].image='data:image/png;base64,'+Buffer.from('not an image').toString('base64');bad.push([value,400]);
    value=input();value.media.push({...value.media[0]});bad.push([value,400]);
    value=input();value.targetDuration=181;bad.push([value,400]);
    value=input();value.media[0].audio.duration=9;bad.push([value,400]);
    value=input();value.media[0].audio={start:0,duration:13,dataUrl:wav(13)};bad.push([value,400]);
    value=input();value.media[0].audio.dataUrl='https://untrusted.example/audio.wav';bad.push([value,400]);
    value=input();value.extra='x'.repeat(4000000);bad.push([value,413]);
    value=input();value.soundtrack.beatTimes=[1,0];bad.push([value,400]);
    for(const [payload,status] of bad){const result=await autoCutPlan(localRequest(payload));assert.equal(result.status,status,JSON.stringify(await result.json()));}
  });
});

test('AutoCut enforces 48-second aggregate audio and rejects malformed output instead of substituting a local plan',async()=>{
  await mocked(async()=>response(plan()),async({validateAutoCutInput,validateAutoCutPlan})=>{
    const original=input();original.media[0].duration=20;original.media[0].audio={start:0,duration:12,dataUrl:wav(12)};
    original.media=Array.from({length:5},(_,index)=>({...original.media[0],id:`clip-${index}`}));
    assert.throws(()=>validateAutoCutInput(original),error=>error.status===413);
    const valid=validateAutoCutInput(input());
    const invalid=[];let p=plan();p.shots[0].mediaId='invented';invalid.push(p);
    p=plan();p.shots[0].sourceStart=11;invalid.push(p);
    p=plan();p.shots[0].speed=Infinity;invalid.push(p);
    p=plan();p.shots[0].transition='rotoscope';invalid.push(p);
    p=plan();p.shots[0].duration=-1;invalid.push(p);
    p=plan();p.shots[0].duration=7;invalid.push(p);
    p=plan();p.shots[0].layout='grid';invalid.push(p);
    p=plan();p.shots[0].focalPoint={x:1.1,y:0.5};invalid.push(p);
    p=plan();p.shots[0].caption='x'.repeat(161);invalid.push(p);
    p=plan();p.shots=[];invalid.push(p);
    for(const result of invalid)assert.throws(()=>validateAutoCutPlan(result,valid),error=>error.status===502&&error.code==='INVALID_PROVIDER_RESPONSE');
  });
});

test('AutoCut validates each collage panel duration and supports still images with readable framing',async()=>{
  await mocked(async()=>response(plan()),async({validateAutoCutInput,validateAutoCutPlan})=>{
    const payload=input();payload.media.push({...payload.media[0],id:'second',duration:2,frames:[{time:0,image:IMAGE}],audio:undefined});
    const normalized=validateAutoCutInput(payload),p=plan();p.shots[0].layout='split';p.shots[0].secondaryMediaIds=['second'];
    assert.throws(()=>validateAutoCutPlan(p,normalized),/secondary footage/);
    payload.media[1].type='image';payload.media[1].duration=5;
    const still=validateAutoCutPlan(p,validateAutoCutInput(payload));assert.deepEqual(still.shots[0].secondaryMediaIds,['second']);
    p.shots[0].mediaId='second';p.shots[0].layout='single';p.shots[0].secondaryMediaIds=[];p.shots[0].fit='contain';p.shots[0].motion='none';
    assert.equal(validateAutoCutPlan(p,validateAutoCutInput(payload)).shots[0].fit,'contain');
    p.shots[0].speed=0.5;assert.throws(()=>validateAutoCutPlan(p,validateAutoCutInput(payload)),/still-image timing/);
  });
});

test('AutoCut rejects truncated or malformed Gemini results and sanitizes provider failures',async()=>{
  let mockResponse;
  await mocked(async()=>mockResponse.clone(),async({autoCutPlan})=>{
    for(const data of [{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:JSON.stringify(plan())}]}}]},{promptFeedback:{blockReason:'SAFETY'}},{candidates:[{finishReason:'STOP',content:{parts:[{text:'not json'}]}}]}]){
      mockResponse=Response.json(data);const result=await autoCutPlan(localRequest());assert.equal(result.status,502);assert.equal((await result.json()).code,'INVALID_PROVIDER_RESPONSE');
    }
    for(const [status,expectedStatus,code] of [[403,502,'PROVIDER_REJECTED'],[429,429,'PROVIDER_RATE_LIMIT'],[503,503,'PROVIDER_BUSY']]){
      mockResponse=Response.json({error:{message:'mock-private-autocut-key PRIVATE_UPSTREAM_DATA'}},{status});
      const result=await autoCutPlan(localRequest());assert.equal(result.status,expectedStatus);const body=await result.json();assert.equal(body.code,code);assert(!JSON.stringify(body).includes('PRIVATE_UPSTREAM_DATA'));assert(!JSON.stringify(body).includes('mock-private-autocut-key'));assert(!body.plan);
    }
  });
});

test('AutoCut requires hosted Firebase authorization and disallows cross-origin local access',async()=>{
  let count=0;
  await mocked(async()=>{count++;throw Error('Unauthenticated traffic must not reach a provider');},async({autoCutPlan})=>{
    const missing=await autoCutPlan(new Request('https://zorifi.vercel.app/api/vanessa-provider?service=vanessa-autocut',{method:'POST',body:JSON.stringify(input())}));
    assert.equal(missing.status,401);assert.equal((await missing.json()).code,'AUTH_REQUIRED');
    const crossOrigin=await autoCutPlan(new Request('http://127.0.0.1:4173/api/vanessa-autocut',{method:'POST',headers:{origin:'https://untrusted.example'},body:JSON.stringify(input())}));assert.equal(crossOrigin.status,403);assert.equal(count,0);
  });
});

test('AutoCut configuration uses the server model, safely defaults it, and requires a Gemini credential',async()=>{
  await mocked(async()=>{throw Error('Missing credential must not make a request');},async({autoCutPlan})=>{const result=await autoCutPlan(localRequest());assert.equal(result.status,503);assert.equal((await result.json()).code,'NOT_CONFIGURED');},{GEMINI_API_KEY:''});
  await mocked(async(url)=>{assert.match(String(url),/\/gemini-2\.5-flash:generateContent$/);return response(plan());},async({autoCutPlan})=>{assert.equal((await autoCutPlan(localRequest())).status,200);},{GEMINI_MODEL:''});
  await mocked(async()=>{throw Error('Invalid model must not make a request');},async({autoCutPlan})=>{assert.equal((await autoCutPlan(localRequest())).status,503);},{GEMINI_MODEL:'https://untrusted.example/model'});
});

test('the local and Vercel gateway adapters both dispatch the AutoCut planner',async()=>{
  const nativeFetch=global.fetch;let generated=0;
  await mocked(async(url,options)=>{
    if(String(url).startsWith('http://127.0.0.1:'))return nativeFetch(url,options);
    if(String(url).startsWith('https://identitytoolkit.googleapis.com/'))return Response.json({users:[{localId:'verified-user'}]});
    if(String(url).startsWith('https://firestore.googleapis.com/'))return new Response('',{status:404});
    assert.match(String(url),/^https:\/\/generativelanguage.googleapis.com\//);generated++;return response(plan());
  },async()=>{
    const {createServer}=require('../scripts/dev-server.cjs');
    const server=createServer({localMedia:{enabled:()=>false,dispose(){}}});server.listen(0,'127.0.0.1');await once(server,'listening');
    try{
      const result=await fetch(`http://127.0.0.1:${server.address().port}/.netlify/functions/vanessa-autocut`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input())});
      assert.equal(result.status,200);assert.equal((await result.json()).metadata.provider,'Gemini');
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    const adapter=require('../api/vanessa-provider.js');
    let output,status;
    const res={setHeader(){},status(value){status=value;return this;},send(value){output=JSON.parse(value.toString());return this;},json(value){output=value;return this;}};
    await adapter({method:'POST',query:{service:'vanessa-autocut'},headers:{host:'zorifi.vercel.app',authorization:'Bearer verified-id-token','content-type':'application/json'},body:input()},res);
    assert.equal(status,200);assert.equal(output.metadata.provider,'Gemini');assert.equal(generated,2);
  });
});

test('temporary Gemini failure uses only the explicitly configured fallback and reports the actual model',async()=>{
  const urls=[];
  await mocked(async(url,options)=>{urls.push(String(url));const payload=JSON.parse(options.body);assert(!JSON.stringify(payload.generationConfig.responseJsonSchema).includes('maxItems'));return urls.length===1?Response.json({error:{message:'Busy'}},{status:503}):response(plan());},async({autoCutPlan})=>{
    const result=await autoCutPlan(localRequest());assert.equal(result.status,200);assert.equal((await result.json()).metadata.model,'gemini-3.5-flash-lite');assert.equal(urls.length,2);assert.match(urls[0],/gemini-2\.5-flash:generateContent/);assert.match(urls[1],/gemini-3\.5-flash-lite:generateContent/);
  },{GEMINI_FALLBACK_MODEL:'gemini-3.5-flash-lite'});
});
