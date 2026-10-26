const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {waveformPeaks}=require('../zorifi-audio-worker.js');
const source=fs.readFileSync(path.resolve(__dirname,'../zorifi-audio-engine.js'),'utf8');
function engine(overrides={}){
 const sandbox={setTimeout,clearTimeout,...overrides};vm.runInNewContext(source,sandbox);
 return sandbox.ZorifiAudioEngine;
}
function decoded(channels){return {numberOfChannels:channels.length,length:channels[0].length,duration:channels[0].length/48000,sampleRate:48000,getChannelData:index=>channels[index]};}
function audioContext(buffer){
 const contexts=[];
 class Context{constructor(){contexts.push(this);}async decodeAudioData(){return buffer;}async close(){this.closed=true;}}
 return {Context,contexts};
}
function workerPeaks(channels,count){return Array.from(waveformPeaks(channels.map(channel=>channel.buffer.slice(channel.byteOffset,channel.byteOffset+channel.byteLength)),count),value=>Math.round(value*1000)/1000);}

test('sync and cooperative waveforms use balanced bins and ignore non-finite samples like the worker',async()=>{
 const api=engine(),channels=[new Float32Array([NaN,1,0,0,.75,0,Infinity,1]),new Float32Array([Infinity,0,0,0,.25,0,-Infinity,1])];
 const expected=[.5,.5,1];
 assert.deepEqual(Array.from(api.waveformFromChannels(channels,3)),expected);
 assert.deepEqual(Array.from(await api.waveformFromChannelsAsync(channels,3)),expected);
 assert.deepEqual(workerPeaks(channels,3),expected);
 assert.deepEqual(Array.from(await api.waveformFromChannelsAsync([],3)),[]);
 assert.deepEqual(Array.from(await api.waveformFromChannelsAsync([new Float32Array()],3)),[]);
 for(const invalid of [NaN,Infinity,0,-1]){
  assert.throws(()=>api.waveformFromChannels(channels,invalid),/sample count/);
  await assert.rejects(api.waveformFromChannelsAsync(channels,invalid),/sample count/);
 }
});

test('long one-bucket fallback allows queued UI tasks to run while matching the worker without mutating channels',async()=>{
 const api=engine(),left=new Float32Array(524289),right=new Float32Array(left.length);left[400001]=.8;right[400001]=.6;
 const channels=[left,right],before=channels.map(channel=>channel.slice());let timerFired=false;
 const timer=setTimeout(()=>{timerFired=true;},0);
 try{
  const result=await api.waveformFromChannelsAsync(channels,1);
  assert.equal(timerFired,true,'A queued UI task must run before analysis completes, even within one bucket.');
  assert.deepEqual(Array.from(result),workerPeaks(channels,1));
  channels.forEach((channel,index)=>assert.deepEqual(channel,before[index]));
 }finally{clearTimeout(timer);}
});

test('decode uses cooperative fallback both without workers and after a worker job fails',async()=>{
 for(const workerAvailable of [false,true]){
  let terminated=0,called=0,timerFired=false;
  const worker=workerAvailable?{Worker:function(){},ZorifiOptimization:{AudioWorkerPipeline:class{async analyzeChannels(){called++;throw new Error('Job timed out.');}terminate(){terminated++;}}}}:{};
  const api=engine(worker),channels=[new Float32Array(196609)];channels[0][190000]=.65;
  const {Context,contexts}=audioContext(decoded(channels)),timer=setTimeout(()=>{timerFired=true;},0);
  try{
   const result=await api.decodeWaveform({arrayBuffer:async()=>new ArrayBuffer(0)},Context,3);
   assert.equal(timerFired,true);assert.deepEqual(Array.from(result.peaks),workerPeaks(channels,3));
   assert.equal(result.sampleRate,48000);assert.equal(result.channels,1);assert.equal(contexts[0].closed,true);
   assert.equal(called,workerAvailable?1:0);assert.equal(terminated,0,'A failed job must not terminate other shared worker requests.');
  }finally{clearTimeout(timer);api.disposeWaveformWorker();}
 }
});

test('cancelling fallback preserves the abort reason and closes its decoder',async()=>{
 const api=engine(),{Context,contexts}=audioContext(decoded([new Float32Array(524289)])),controller=new AbortController(),reason=new DOMException('Changed media selection','AbortError');
 const pending=api.decodeWaveform({arrayBuffer:async()=>new ArrayBuffer(0)},Context,1,{signal:controller.signal});
 const timer=setTimeout(()=>controller.abort(reason),0);
 try{await assert.rejects(pending,error=>error===reason);assert.equal(contexts[0].closed,true);}
 finally{clearTimeout(timer);}
 const stopped=new AbortController();stopped.abort(reason);
 await assert.rejects(api.decodeWaveform({arrayBuffer:async()=>new ArrayBuffer(0)},Context,1,{signal:stopped.signal}),error=>error===reason);
 assert.equal(contexts.length,1,'An already-cancelled request must not open another audio context.');
});

test('decode forwards per-job cancellation without terminating another request on the shared worker',async()=>{
 let terminated=0,finishSecond,forwardedSignal;
 const api=engine({Worker:function(){},ZorifiOptimization:{AudioWorkerPipeline:class{
  analyzeChannels(channels,count,{signal}={}){
   if(!signal)return new Promise(resolve=>{finishSecond=()=>resolve([.5]);});
   forwardedSignal=signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  }
  terminate(){terminated++;}
 }}}),{Context,contexts}=audioContext(decoded([new Float32Array([.5])])),controller=new AbortController(),reason=new DOMException('Selection changed','AbortError');
 const cancelled=api.decodeWaveform({arrayBuffer:async()=>new ArrayBuffer(0)},Context,1,{signal:controller.signal});
 const surviving=api.decodeWaveform({arrayBuffer:async()=>new ArrayBuffer(0)},Context,1);
 while(!finishSecond||!forwardedSignal)await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(forwardedSignal,controller.signal);controller.abort(reason);
 await assert.rejects(cancelled,error=>error===reason);assert.equal(terminated,0);
 finishSecond();assert.deepEqual(Array.from((await surviving).peaks),[.5]);assert.equal(contexts.every(context=>context.closed),true);
 api.disposeWaveformWorker();assert.equal(terminated,1);
});
