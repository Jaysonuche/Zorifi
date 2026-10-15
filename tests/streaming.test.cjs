const test=require('node:test'),assert=require('node:assert/strict');
const Router=require('../zorifi-vanessa-router.js');
const encoder=new TextEncoder();
test('SSE reader handles fragmented Unicode, completion, errors and truncated streams',async()=>{
 const bytes=encoder.encode('data: {"text":"Hello 🌊"}\r\n\r\ndata: {"text":" world"}\n\ndata: [DONE]\n\n');let i=0;const updates=[];
 const result=await Router.requestStream(async()=>new Response(new ReadableStream({pull(c){if(i===bytes.length)c.close();else c.enqueue(bytes.slice(i,i+=1));}}),{headers:{'content-type':'text/event-stream'}}),'/',{},text=>updates.push(text));assert(result.ok);assert.equal(result.data.text,'Hello 🌊 world');assert.deepEqual(updates,['Hello 🌊','Hello 🌊 world']);
 for(const body of ['data: {"text":"partial"}\n\n','data: {"text":"partial"}\n\ndata: {"error":"failed"}\n\n','data: broken\n\n']){const failed=await Router.requestStream(async()=>new Response(body,{headers:{'content-type':'text/event-stream'}}),'/');assert.equal(failed.ok,false);assert.equal(failed.data,null);}
});
test('Gemini SSE emits before completion, hides thoughts/errors and enforces authorization',async()=>{
 const old=global.fetch,oldEnv=global.Netlify;global.Netlify={env:{get:k=>k==='GEMINI_API_KEY'?'private-stream-key':''}};
 try{
  const {conversation}=await import('../netlify/functions/_shared/services.mjs');const request=(url='http://localhost/api/test')=>new Request(url,{method:'POST',headers:{accept:'text/event-stream'},body:JSON.stringify({prompt:'Hello',stream:true})});
  global.fetch=()=>{throw Error('Unauthorized request reached provider');};const denied=await conversation(request('https://example.com/api/test'));assert.equal(denied.status,401);assert(denied.headers.get('content-type').includes('application/json'));
  let release;const gate=new Promise(r=>release=r);global.fetch=async(url,options)=>{assert(url.endsWith(':streamGenerateContent?alt=sse'));assert.equal(new Headers(options.headers).get('x-goog-api-key'),'private-stream-key');return new Response(new ReadableStream({async start(c){c.enqueue(encoder.encode('data: '+JSON.stringify({candidates:[{content:{parts:[{thought:true,text:'hidden'},{text:'First'}]}}]})+'\n\n'));await gate;c.enqueue(encoder.encode('data: '+JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:' second'}]}}]})+'\n\n'));c.close();}}),{headers:{'content-type':'text/event-stream'}});};
  const result=await conversation(request()),reader=result.body.getReader();const first=new TextDecoder().decode((await reader.read()).value);assert(first.includes('First'));assert(!first.includes('hidden'));release();let rest='';while(true){const n=await reader.read();if(n.done)break;rest+=new TextDecoder().decode(n.value);}assert(rest.includes('second'));assert(rest.includes('[DONE]'));
  global.fetch=async()=>Response.json({error:{message:'private-stream-key'}},{status:503});const failed=await (await conversation(request())).text();assert(failed.includes('PROVIDER_BUSY'));assert(!failed.includes('private-stream-key'));assert(!failed.includes('[DONE]'));
 }finally{global.fetch=old;global.Netlify=oldEnv;}
});
test('Node response relay sends first chunk before stream finishes',async()=>{
 const http=require('node:http'),relay=require('../netlify/functions/_shared/stream-response.cjs');let release;const gate=new Promise(r=>release=r);const server=http.createServer(async(req,res)=>{await relay(new Response(new ReadableStream({async start(c){c.enqueue(encoder.encode('data: {"text":"first"}\n\n'));await gate;c.enqueue(encoder.encode('data: [DONE]\n\n'));c.close();}}),{headers:{'content-type':'text/event-stream'}}),res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const response=await fetch(`http://127.0.0.1:${server.address().port}`);const reader=response.body.getReader();const first=await reader.read();assert(new TextDecoder().decode(first.value).includes('first'));release();let rest='';while(true){const next=await reader.read();if(next.done)break;rest+=new TextDecoder().decode(next.value);}assert(rest.includes('[DONE]'));}finally{release();await new Promise(r=>server.close(r));}
});

test('Vercel gateway preserves authenticated SSE routing and rejects anonymous streams',async()=>{
 const http=require('node:http'),gateway=require('../api/vanessa-provider.js'),original=global.fetch,oldEnv=global.Netlify;
 global.Netlify={env:{get:k=>({GEMINI_API_KEY:'private-stream-key',FIREBASE_WEB_API_KEY:'firebase-public',FIREBASE_PROJECT_ID:'project'}[k]||'')}};
 global.fetch=async(url,options)=>{const address=String(url);if(address.includes('accounts:lookup'))return Response.json({users:[{localId:'stream-user'}]});if(address.includes('firestore.googleapis.com'))return new Response(null,{status:404});if(address.includes('generativelanguage.googleapis.com'))return new Response('data: '+JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'Stream ready'}]}}]})+'\n\n',{headers:{'content-type':'text/event-stream'}});return original(url,options);};
 const server=http.createServer((req,res)=>{req.headers.host='zorifi.example';res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value));};res.send=value=>res.end(value);gateway(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const url=`http://127.0.0.1:${server.address().port}/api/vanessa-provider`;const options={method:'POST',headers:{'content-type':'application/json',accept:'text/event-stream'},body:JSON.stringify({prompt:'Hello',stream:true})};const denied=await original(url,options);assert.equal(denied.status,401);const response=await original(url,{...options,headers:{...options.headers,authorization:'Bearer user-token'}});assert.equal(response.status,200);assert(response.headers.get('content-type').includes('text/event-stream'));const body=await response.text();assert(body.includes('Stream ready'));assert(body.includes('[DONE]'));assert(!body.includes('private-stream-key'));}
 finally{global.fetch=original;global.Netlify=oldEnv;await new Promise(r=>server.close(r));}
});

test('disconnect cancels the relayed response stream',async()=>{
 const http=require('node:http'),relay=require('../netlify/functions/_shared/stream-response.cjs');let cancelled;const cancellation=new Promise(r=>cancelled=r);
 const server=http.createServer((req,res)=>relay(new Response(new ReadableStream({start(c){c.enqueue(encoder.encode('data: {"text":"started"}\n\n'));},cancel(){cancelled();}}),{headers:{'content-type':'text/event-stream'}}),res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let timer;try{const controller=new AbortController(),response=await fetch(`http://127.0.0.1:${server.address().port}`,{signal:controller.signal});const reader=response.body.getReader();await reader.read();controller.abort();await Promise.race([cancellation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Stream was not cancelled')),3000);})]);}finally{clearTimeout(timer);server.closeAllConnections();await new Promise(r=>server.close(r));}
});
