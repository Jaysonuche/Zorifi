const test=require('node:test');
const assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const {ZorifiResourceManager,AudioWorkerPipeline,SecureAIService}=require('../zorifi-optimization.js');
const {waveformPeaks}=require('../zorifi-audio-worker.js');

class WorkerAdapter{
 constructor(){
  this.native=new Worker(`const {parentPort,workerData}=require('node:worker_threads');global.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};require(workerData);parentPort.on('message',data=>self.onmessage({data}));`,{eval:true,workerData:path.resolve(__dirname,'../zorifi-audio-worker.js')});
  this.native.on('message',data=>this.onmessage?.({data}));this.native.on('error',error=>this.onerror?.(error));
 }
 postMessage(...args){this.native.postMessage(...args);}
 terminate(){this.native.terminate();}
}

test('resource cleanup is idempotent and does not seize or destroy a shared canvas',()=>{
 let created=0;const revoked=[],urlApi={createObjectURL:()=>`blob:${++created}`,revokeObjectURL:url=>revoked.push(url)},canvas={width:400,height:300,getContext(){throw Error('Must not acquire context');}};
 const resources=new ZorifiResourceManager(canvas,{urlApi});
 resources.createManagedUrl({});resources.createManagedUrl({});resources.revokeUrl('blob:1');resources.dispose();resources.dispose();
 assert.deepEqual(revoked,['blob:1','blob:2']);assert.equal(canvas.width,400);assert.throws(()=>resources.createManagedUrl({}),/disposed/);
 let lost=0;const owned=new ZorifiResourceManager(canvas,{urlApi,ownsCanvas:true,gl:{getExtension:()=>({loseContext:()=>lost++})}});owned.dispose();assert.equal(lost,1);assert.equal(canvas.width,0);
});

test('worker finds peaks between bucket starts, handles empty and invalid samples',()=>{
 assert.deepEqual(Array.from(waveformPeaks([new Float32Array([0,1,0,0,0,0,0,0]).buffer],2)),[1,0]);
 assert.equal(waveformPeaks([new ArrayBuffer(0)]).length,0);
 assert.deepEqual(Array.from(waveformPeaks([new Float32Array([NaN,Infinity,.5]).buffer],1)),[.5]);
});

test('concurrent real worker jobs preserve caller buffers and resolve their own results',async t=>{
 const pipeline=new AudioWorkerPipeline({workerFactory:()=>new WorkerAdapter()});t.after(()=>pipeline.terminate());
 const a=new Float32Array([0,1,0,0]),b=new Float32Array([.5,.5]);
 const [first,second]=await Promise.all([pipeline.analyzeAudio(a.buffer,{sampleCount:2}),pipeline.analyzeAudio(b.buffer,{sampleCount:1})]);
 assert.deepEqual(first,[1,0]);assert.deepEqual(second,[.5]);assert.equal(a.byteLength,16);assert.equal(b.byteLength,8);assert.equal(pipeline.pending.size,0);
});

test('termination and timeouts reject pending jobs instead of leaving callers hanging',async()=>{
 const fake=()=>({postMessage(){},terminate(){}}),pipeline=new AudioWorkerPipeline({workerFactory:fake});
 const cancelled=assert.rejects(pipeline.analyzeAudio(new Float32Array([1]).buffer),/cancelled/);pipeline.terminate();await cancelled;
 await assert.rejects(pipeline.analyzeAudio(new ArrayBuffer(0)),/terminated/);
 const timed=new AudioWorkerPipeline({workerFactory:fake,timeoutMs:5});await assert.rejects(timed.analyzeAudio(new Float32Array([1]).buffer),/timed out/);assert.equal(timed.closed,false);assert.equal(timed.pending.size,0);timed.terminate();
});

test('proxy routes through supplied consent transport and rejects arbitrary endpoints',async()=>{
 const calls=[],service=new SecureAIService({resolveEndpoint:name=>`/.netlify/functions/${name}`,transport:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({reply:'Hello'})};}});
 assert.deepEqual(await service.generateAIResponse('vanessa-global',{message:'hello'}),{reply:'Hello'});
 assert.equal(calls[0].url,'/.netlify/functions/vanessa-global');assert.equal(calls[0].options.redirect,'error');
 await assert.rejects(service.generateAIResponse('https://elsewhere.example',{}),/Unsupported/);assert.equal(calls.length,1);
 const denied=new SecureAIService({resolveEndpoint:name=>name,transport:async()=>{throw Object.assign(new Error('Consent required'),{code:'PRIVACY_CONSENT_REQUIRED'});}});
 await assert.rejects(denied.generateAIResponse('vanessa-image',{}),error=>error.code==='PRIVACY_CONSENT_REQUIRED');
});

test('proxy hides upstream error bodies and supports request cancellation',async()=>{
 const service=new SecureAIService({resolveEndpoint:name=>name,transport:async()=>({ok:false,status:502,json:async()=>({error:'secret-provider-key'})})});
 await assert.rejects(service.generateAIResponse('vanessa-image',{}),error=>error.message==='AI service request failed (502).');
 let calls=0;const stopped=new SecureAIService({resolveEndpoint:name=>name,transport:async()=>{calls++;}}),controller=new AbortController();controller.abort();
 await assert.rejects(stopped.generateAIResponse('vanessa-global',{},{signal:controller.signal}));assert.equal(calls,0);
});

test('cleanup continues through driver and URL errors and releases owned references',()=>{
 const revoked=[],canvas={width:16,height:16};const resources=new ZorifiResourceManager(canvas,{ownsCanvas:true,gl:{getExtension(){throw Error('driver unavailable');}},urlApi:{createObjectURL:value=>value,revokeObjectURL:url=>{revoked.push(url);if(url==='bad')throw Error('URL cleanup failed');}}});
 resources.createManagedUrl('bad');resources.createManagedUrl('good');resources.dispose();resources.dispose();assert.deepEqual(revoked,['bad','good']);assert.equal(canvas.width,0);assert.equal(canvas.height,0);assert.equal(resources.canvas,null);assert.equal(resources.gl,null);assert.equal(resources.activeObjectURLs.size,0);assert.equal(resources.cleanupErrors.length,2);
});

test('large real worker jobs transfer bounded tiles and preserve timeline bucket alignment',async t=>{
 const input=new Float32Array(10003);input[0]=.1;input[2499]=.3;input[5001]=.7;input[10002]=1;let largest=0,tiles=0;
 const pipeline=new AudioWorkerPipeline({maxTransferBytes:4096,workerFactory:()=>{const adapter=new WorkerAdapter(),post=adapter.postMessage.bind(adapter);adapter.postMessage=(message,transfer)=>{largest=Math.max(largest,transfer.reduce((sum,buffer)=>sum+buffer.byteLength,0));tiles++;post(message,transfer);};return adapter;}});t.after(()=>pipeline.terminate());
 const actual=await pipeline.analyzeChannels([input,input],4);assert.deepEqual(actual,[.3,0,.7,1]);assert.ok(largest<=4096);assert.ok(tiles>10);assert.equal(input.byteLength,40012);assert.deepEqual(actual,Array.from(waveformPeaks([input.buffer,input.buffer],4),value=>Math.round(value*1000)/1000));
});

test('cancelling one job preserves another and late responses cannot resurrect pending work',async()=>{
 const messages=[],worker={postMessage(message){messages.push(message);},terminate(){}};const pipeline=new AudioWorkerPipeline({workerFactory:()=>worker}),controller=new AbortController();
 const first=assert.rejects(pipeline.analyzeAudio(new Float32Array([1]).buffer,{signal:controller.signal}),/cancelled/),second=pipeline.analyzeAudio(new Float32Array([.5]).buffer);controller.abort(new Error('cancelled by user'));await first;assert.equal(pipeline.closed,false);assert.equal(pipeline.pending.size,1);
 worker.onmessage({data:{id:messages[0].id,offset:0,peaks:new Float32Array([1]).buffer}});assert.equal(pipeline.pending.size,1);
 worker.onmessage({data:{id:messages[1].id,offset:0,peaks:new Float32Array([.5]).buffer}});assert.deepEqual(await second,[.5]);assert.equal(pipeline.pending.size,0);pipeline.terminate();
});

test('worker failure and transfer failure settle requests and clear pending state',async()=>{
 for(const event of ['onerror','onmessageerror']){const worker={postMessage(){},terminate(){}};const pipeline=new AudioWorkerPipeline({workerFactory:()=>worker});const a=assert.rejects(pipeline.analyzeAudio(new Float32Array([1]).buffer),/worker/i),b=assert.rejects(pipeline.analyzeAudio(new Float32Array([1]).buffer),/worker/i);worker[event]();await Promise.all([a,b]);assert.equal(pipeline.pending.size,0);assert.equal(pipeline.closed,true);}
 const pipeline=new AudioWorkerPipeline({workerFactory:()=>({postMessage(){throw Error('transfer failed');},terminate(){}})});await assert.rejects(pipeline.analyzeAudio(new Float32Array([1]).buffer),/transfer failed/);assert.equal(pipeline.pending.size,0);pipeline.terminate();
});

test('makeRequest compatibility keeps the same authenticated endpoint restrictions',async()=>{
 let calls=0;const client=SecureAIService.configure({transport:async()=>{calls++;return {ok:true,json:async()=>({ok:true})};},resolveEndpoint:name=>`/api/${name}`});assert.deepEqual(await client.makeRequest('vanessa-global',{}),{ok:true});assert.deepEqual(await SecureAIService.makeRequest('vanessa-global',{}),{ok:true});await assert.rejects(SecureAIService.makeRequest('../private',{}),/Unsupported/);assert.equal(calls,2);
});
