const test=require('node:test');
const assert=require('node:assert/strict');
const {correlate,ZorifiMulticamSyncEngine:Engine}=require('../zorifi-multicam.js');
function noise(length=501){let seed=17;return Float32Array.from({length},()=>{seed=(seed*16807)%2147483647;return seed/2147483647;});}
const envelope=data=>({envelope:data,sampleRate:100});
test('normalized correlation finds both offset signs, including gain differences and odd lengths',()=>{
 const master=noise(),delayed=new Float32Array(master.length+25);delayed.set(master.map(v=>v*3+.2),25);
 assert.equal(correlate(envelope(master),envelope(delayed)).offsetSeconds,-.25);
 assert.equal(correlate(envelope(master),envelope(master.slice(40))).offsetSeconds,.4);
 assert.throws(()=>correlate(envelope(master),{envelope:master,sampleRate:50}),/equal sample rates/);
});
test('silence, repetitive matches and unbounded workloads are rejected',()=>{
 assert.throws(()=>correlate(envelope(new Float32Array(500)),envelope(new Float32Array(500))),/reliable/);
 const periodic=Float32Array.from({length:500},(_,i)=>i%20/20);assert.throws(()=>correlate(envelope(periodic),envelope(periodic)),/ambiguous/);
 assert.throws(()=>correlate(envelope(noise(100000)),envelope(noise(100000))),/too large/);
});
test('envelopes include all channels, handle short buffers and do not allocate an AudioContext',async()=>{
 const engine=new Engine(),audio={length:4,sampleRate:4,numberOfChannels:2,getChannelData:i=>new Float32Array(i?[0,1,0,1]:[0,0,0,0])};
 assert.deepEqual(Array.from((await engine.extractWaveformEnvelope(audio,2)).envelope),[.25,.25]);assert.equal(engine.audioContext,null);await engine.dispose();
});
function project(){return {projectId:'p',duration:9,trackStates:{},mediaAssets:[{id:'m',file:new Blob(['master'])},{id:'t',file:new Blob(['target'])}],clips:[{id:'master',mediaId:'m',type:'video',track:0,start:2,duration:5,sourceStart:.2},{id:'target',mediaId:'t',type:'video',track:4,start:4,duration:5,sourceStart:.1,keyframes:{opacity:[{time:4,value:0},{time:5,value:100}]}},{id:'caption',type:'text',track:200,autoCaption:true,autoCaptionSourceId:'target',start:4.1,duration:1,captionWords:[{text:'hello',start:4.1,end:4.5}]}]};}
function mockEngine(){const engine=new Engine();engine.decode=async()=>envelope(noise());engine.matchEnvelopes=async()=>({offsetSeconds:-.25,confidence:.95});return engine;}
test('sync applies trims, moves linked timing, assigns separate tracks and records a group',async()=>{
 const state=project(),engine=mockEngine();let snapshots=0;engine.beforeApply=()=>snapshots++;
 await engine.synchronizeMulticamTracks(state,'master',['target']);const target=state.clips[1];
 assert.ok(Math.abs(target.start-1.65)<1e-8);assert.equal(target.track,5);assert.ok(Math.abs(target.keyframes.opacity[0].time-1.65)<1e-8);assert.ok(Math.abs(state.clips[2].start-1.75)<1e-8);assert.equal(target.multicamGroupId,state.clips[0].multicamGroupId);assert.equal(snapshots,1);
});
test('failed, stale, locked, negative-time and cancelled sync never partially apply',async()=>{
 for(const kind of ['negative','locked','failed','stale','cancelled']){
  const state=project(),engine=mockEngine(),controller=new AbortController();if(kind==='negative')state.clips[0].start=0;if(kind==='locked')state.trackStates[4]={locked:true};
  if(kind==='failed')engine.matchEnvelopes=async()=>{throw new Error('no match');};
  if(kind==='stale')engine.matchEnvelopes=async()=>{state.projectId='changed';return {offsetSeconds:0,confidence:1};};
  if(kind==='cancelled')controller.abort();const before=JSON.stringify(state.clips);
  await assert.rejects(engine.synchronizeMulticamTracks(state,'master',['target'],{signal:controller.signal}));assert.equal(JSON.stringify(state.clips),before);
 }
});
