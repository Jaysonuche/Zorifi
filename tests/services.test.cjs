const {firebaseTransport,firebaseEnv}=require('./helpers/firebase-provider.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const request=(name,input,headers={})=>new Request(`http://localhost/api/${name}`,{method:'POST',headers:{authorization:'Bearer fixture-token','content-type':'application/json',...headers},body:JSON.stringify(input)});
async function run(name,input){return (await import(`../netlify/functions/${name}.mjs`)).default(request(name,input));}
test('all recovered services fail clearly without credentials and never fabricate media',async()=>{
 const saved=global.Netlify;global.Netlify={env:{get:()=>''}};
 // Use an isolated process environment view so developer credentials cannot cause requests.
 const previous={...process.env};for(const key of Object.keys(process.env))if(/^(OPENAI_|VANESSA_|GEMINI_|ELEVENLABS_|XAI_|FIREBASE_|GMAIL_)/.test(key))delete process.env[key];
 try{for(const [name,input] of [['vanessa-global',{message:'Hello Vanessa'}],['vanessa-image',{prompt:'A landscape'}],['vanessa-motion',{prompt:'A moving landscape'}],['vanessa-music',{prompt:'A cinematic score'}],['vanessa-voice',{prompt:'Hello world'}],['vanessa-provider-test',{type:'image'}],['support-email',{}]]){const response=await run(name,input),body=await response.json();assert.equal(response.status,401,name);assert.equal(body.code,'AUTH_REQUIRED');assert.ok(!body.url);assert.ok(!body.progress);}}
 finally{process.env=previous;global.Netlify=saved;}
});
test('language handler extracts provider text and disables provider storage',async()=>{
 const originalFetch=global.fetch,originalNetlify=global.Netlify;let payload;
 global.Netlify={env:{get:firebaseEnv(key=>key==='OPENAI_LANGUAGE_API_KEY'?'unit-test-key':'')}};
 global.fetch=firebaseTransport(async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'Hello, creator.'}]}]});});
 try{const response=await run('vanessa-global',{message:'Hello'});assert.equal(response.status,200);assert.equal((await response.json()).text,'Hello, creator.');assert.equal(payload.store,false);}
 finally{global.fetch=originalFetch;global.Netlify=originalNetlify;}
});
test('video polling maps actual provider status and never invents progress',async()=>{
 const originalFetch=global.fetch,originalNetlify=global.Netlify;global.Netlify={env:{get:firebaseEnv(key=>key==='XAI_API_KEY'?'unit-test-key':'')}};
 global.fetch=firebaseTransport(async()=>Response.json({status:'done',video:{url:'https://media.example/video.mp4'}}));
 try{const response=await run('vanessa-motion',{action:'status',requestId:'job-123'}),body=await response.json();assert.equal(body.status,'done');assert.equal(body.videoUrl,'https://media.example/video.mp4');assert.equal(body.progress,null);}
 finally{global.fetch=originalFetch;global.Netlify=originalNetlify;}
});
test('untrusted remote callers and cross-origin localhost calls cannot spend provider credentials',async()=>{
 const handler=(await import('../netlify/functions/vanessa-global.mjs')).default;
 const response=await handler(new Request('https://zorifi.example/.netlify/functions/vanessa-global',{method:'POST',body:JSON.stringify({message:'Hello'})}));assert.equal(response.status,401);
 const cross=await handler(request('vanessa-global',{message:'Hello'},{origin:'https://untrusted.example'}));assert.equal(cross.status,403);
});
test('malformed requests and methods are rejected before any generation',async()=>{
 const handler=(await import('../netlify/functions/vanessa-image.mjs')).default;
 assert.equal((await handler(new Request('http://localhost/api/image'))).status,405);
 assert.equal((await handler(new Request('http://localhost/api/image',{headers:{authorization:'Bearer fixture-token'},method:'POST',body:'{'}))).status,401);
});
test('provider errors do not leak upstream secrets',async()=>{
 const originalFetch=global.fetch,originalNetlify=global.Netlify;global.Netlify={env:{get:firebaseEnv(key=>key==='OPENAI_IMAGE_API_KEY'?'unit-test-key':'')}};global.fetch=firebaseTransport(async()=>new Response('token=do-not-leak',{status:401}));
 try{const response=await run('vanessa-image',{prompt:'A landscape'});assert.equal(response.status,502);assert.ok(!(await response.text()).includes('do-not-leak'));}
 finally{global.fetch=originalFetch;global.Netlify=originalNetlify;}
});

test('Gemini image prompt and reference variation return real image bytes',async()=>{
 const savedFetch=global.fetch,savedNetlify=global.Netlify,requests=[];
 global.Netlify={env:{get:firebaseEnv(key=>key==='GEMINI_API_KEY'?'unit-test-key':'')}};
 global.fetch=firebaseTransport(async(url,options)=>{requests.push({url,options});return Response.json({steps:[{type:'model_output',content:[{type:'image',mime_type:'image/jpeg',data:Buffer.from('image-bytes').toString('base64')}]}]});});
 try{
  const first=await run('vanessa-image',{prompt:'A mountain at dawn',ratio:'16:9'}),body=await first.json();
  assert.equal(first.status,200);assert.equal(body.mimeType,'image/jpeg');assert.match(body.url,/^data:image\/jpeg;base64,/);
  assert.equal(requests[0].url,'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(requests[0].options.headers['x-goog-api-key'],'unit-test-key');
  const firstPayload=JSON.parse(requests[0].options.body);assert.equal(firstPayload.model,'gemini-nano-banana-2.1');assert.equal(firstPayload.response_format.aspect_ratio,'16:9');assert.equal(firstPayload.response_format.image_size,'1K');assert.match(firstPayload.input[0].text,/mountain at dawn/);
  const reference=`data:image/png;base64,${Buffer.from('reference-image').toString('base64')}`;
  const variation=await run('vanessa-image',{prompt:'Change the sky',mode:'variation',reference});assert.equal(variation.status,200);
  const secondPayload=JSON.parse(requests[1].options.body);assert.equal(secondPayload.input[1].type,'image');assert.equal(secondPayload.input[1].mime_type,'image/png');
 }finally{global.fetch=savedFetch;global.Netlify=savedNetlify;}
});

test('Gemini Lyria prompt returns a playable 30-second MP3 without polling or invented stems',async()=>{
 const savedFetch=global.fetch,savedNetlify=global.Netlify;let body;
 global.Netlify={env:{get:firebaseEnv(key=>key==='GEMINI_API_KEY'?'unit-test-key':'')}};
 global.fetch=firebaseTransport(async(url,options)=>{assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions');body=JSON.parse(options.body);return Response.json({steps:[{type:'model_output',content:[{type:'text',text:'Lyrics'},{type:'audio',mime_type:'audio/mpeg',data:Buffer.from('mp3-bytes').toString('base64')}]}]});});
 try{const response=await run('vanessa-music',{prompt:'A calm piano melody',genre:'ambient',vocals:'instrumental',duration:15}),result=await response.json();assert.equal(response.status,200);assert.equal(body.model,'lyria-3-clip-preview');assert.match(body.input,/calm piano melody/);assert.match(body.input,/Instrumental, no vocals/);assert.equal(result.duration,30);assert.match(result.url,/^data:audio\/mpeg;base64,/);assert.deepEqual(result.stems,{});}
 finally{global.fetch=savedFetch;global.Netlify=savedNetlify;}
});

test('Gemini Lyria keeps Studio key, scale and rhythm in its music direction',async()=>{
 const savedFetch=global.fetch,savedNetlify=global.Netlify;let body;
 global.Netlify={env:{get:firebaseEnv(key=>key==='GEMINI_API_KEY'?'unit-test-key':'')}};
 global.fetch=firebaseTransport(async(url,options)=>{body=JSON.parse(options.body);return Response.json({steps:[{type:'model_output',content:[{type:'audio',mime_type:'audio/mp3',data:Buffer.from('music-clip').toString('base64')}]}]});});
 try{
  const response=await run('vanessa-music',{prompt:'A driving synthwave soundtrack',genre:'Synthwave',mood:'Energetic & Driving',tempo:128,key:'D',scaleMode:'minor',timeSignature:'6/8',groove:'half-time',instrumentation:'synth lead, bass guitar',duration:90});
  const result=await response.json();assert.equal(response.status,200);assert.equal(result.duration,30);
  for(const expected of ['Genre: Synthwave','Mood: Energetic & Driving','Tempo: 128 BPM','Key: D','Scale: minor','Time signature: 6/8','Groove: half-time','Instruments: synth lead, bass guitar'])assert.ok(body.input.includes(expected),expected);
  assert.equal(body.model,'lyria-3-clip-preview');assert.equal(typeof body.input,'string');assert.ok(!body.parameters);assert.equal(result.mimeType,'audio/mpeg');
 }finally{global.fetch=savedFetch;global.Netlify=savedNetlify;}
});

test('Gemini media errors are safe and never claim a generated file',async()=>{
 const savedFetch=global.fetch,savedNetlify=global.Netlify;
 global.Netlify={env:{get:firebaseEnv(key=>key==='GEMINI_API_KEY'?'unit-test-key':'')}};
 global.fetch=firebaseTransport(async()=>new Response(JSON.stringify({error:{message:'secret provider detail',status:'PERMISSION_DENIED'}}),{status:403}));
 try{for(const name of ['vanessa-image','vanessa-music']){const response=await run(name,{prompt:'A bright garden'}),body=await response.json();assert.equal(response.status,502);assert.ok(!JSON.stringify(body).includes('secret provider detail'));assert.ok(!body.url);}}
 finally{global.fetch=savedFetch;global.Netlify=savedNetlify;}
});

test('hosted Gemini media calls cannot spend the key from a non-admin account',async()=>{
 const savedFetch=global.fetch,savedNetlify=global.Netlify;let generationCalls=0;
 global.Netlify={env:{get:firebaseEnv(key=>({GEMINI_API_KEY:'unit-test-key',FIREBASE_WEB_API_KEY:'public-test-key',FIREBASE_PROJECT_ID:'test-project',ZORIFI_ADMIN_UIDS:'admin-uid'})[key]||'')}};
 global.fetch=firebaseTransport(async url=>{if(String(url).includes('accounts:lookup'))return Response.json({users:[{localId:'ordinary-uid',disabled:false}]});if(String(url).includes('firestore.googleapis.com'))return new Response(null,{status:404});generationCalls++;throw new Error('Media generation should not run');});
 try{for(const name of ['vanessa-image','vanessa-music']){const route=(await import(`../netlify/functions/${name}.mjs`)).default;const response=await route(new Request(`https://zorifi.example/api/${name}`,{method:'POST',headers:{authorization:'Bearer test-token'},body:JSON.stringify({prompt:'A sunny garden'})}));assert.equal(response.status,403);assert.equal((await response.json()).code,'ADMIN_REQUIRED');}assert.equal(generationCalls,0);}
 finally{global.fetch=savedFetch;global.Netlify=savedNetlify;}
});
test('web research uses a real search tool and preserves source URLs',async()=>{
 const savedFetch=global.fetch,savedNetlify=global.Netlify;global.Netlify={env:{get:firebaseEnv(key=>key==='OPENAI_LANGUAGE_API_KEY'?'test-key':'')}};
 global.fetch=firebaseTransport(async(url,options)=>{assert.deepEqual(JSON.parse(options.body).tools,[{type:'web_search'}]);return Response.json({output:[{content:[{type:'output_text',text:'Verified answer.',annotations:[{type:'url_citation',title:'Source',url:'https://example.com/source'}]}]}]});});
 try{const response=await run('vanessa-global',{action:'research',message:'Research this topic'});assert.match((await response.json()).text,/https:\/\/example.com\/source/);}finally{global.fetch=savedFetch;global.Netlify=savedNetlify;}
});
test('support delivery uses only the configured recipient and requires a confirmed message ID',async()=>{
 const savedFetch=global.fetch,savedNetlify=global.Netlify;global.Netlify={env:{get:firebaseEnv(key=>({GMAIL_ACCESS_TOKEN:'mock-token',ZORIFI_SUPPORT_EMAIL:'support@example.com',ZORIFI_SUPPORT_SENDER:'sender@example.com'})[key]||'')}};
 global.fetch=firebaseTransport(async(url,options)=>{assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');const raw=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();assert.match(raw,/To: support@example.com/);assert.ok(!raw.includes('To: attacker@example.com'));return Response.json({id:'confirmed-message'});});
 try{const response=await run('support-email',{case:{description:'Export failed'},to:'attacker@example.com'});assert.deepEqual(await response.json(),{sent:true,messageId:'confirmed-message'});}finally{global.fetch=savedFetch;global.Netlify=savedNetlify;}
});
