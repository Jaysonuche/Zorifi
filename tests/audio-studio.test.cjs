const test=require('node:test');
const assert=require('node:assert/strict');
require('../zorifi-audio-engine.js');
const music=require('../zorifi-music-studio.js');
const {ZorifiAudioStudio}=globalThis;
function context(){
 const sources=[];
 const param=()=>({value:1,setValueAtTime(value){this.value=value;}});
 const node=()=>({connect(){},disconnect(){this.disconnected=true;}});
 return {sources,state:'running',currentTime:10,destination:{},createGain:()=>({...node(),gain:param()}),createStereoPanner:()=>({...node(),pan:param()}),
  createBufferSource(){const source={...node(),start(time){assert.equal(this.started,undefined);this.started=time;},stop(){this.stopped=true;}};sources.push(source);return source;},
  async close(){this.state='closed';}};
}
function buffer(data,sampleRate=1000){return {length:data.length,numberOfChannels:1,sampleRate,getChannelData:()=>new Float32Array(data)};}
test('stem playback shares a clock, restarts with fresh sources and cleans up replaced tracks',async()=>{
 const ctx=context(),studio=new ZorifiAudioStudio({audioContext:ctx});
 await studio.addStemTrack('vocals',buffer([1,0]),'vocals');
 const old=await studio.addStemTrack('lead',buffer([1,0]),'leads');
 studio.setTrackVolume('lead',.4);studio.setTrackPan('lead',-.5);
 assert.equal(old.gainNode.gain.value,.4);assert.equal(old.panNode.pan.value,-.5);assert.equal(old.stemType,'lead');
 await studio.playAll();assert.deepEqual(ctx.sources.map(s=>s.started),[10.02,10.02]);
 await studio.playAll();assert.equal(ctx.sources.length,2);
 studio.stopAll();await studio.playAll();assert.equal(ctx.sources.length,4);
 ctx.sources[2].onended();assert.equal(studio.tracks.get('vocals').isPlaying,false);
 await studio.addStemTrack('lead',buffer([.5]),'lead');assert.ok(old.gainNode.disconnected);assert.ok(ctx.sources[3].stopped);
 await studio.dispose();await studio.dispose();assert.equal(ctx.state,'running');assert.equal(studio.tracks.size,0);
 await assert.rejects(studio.playAll(),/disposed/);
});
test('stop during suspended-context resume prevents delayed playback',async()=>{
 const ctx=context();ctx.state='suspended';let resume;
 ctx.resume=()=>new Promise(resolve=>resume=resolve);
 const studio=new ZorifiAudioStudio({audioContext:ctx});await studio.addStemTrack('a',buffer([1]));
 const playing=studio.playAll();studio.stopAll();resume();await playing;assert.equal(ctx.sources.length,0);await studio.dispose();
});
test('analysis terminates on empty and short audio and reports spaced transient onsets',async()=>{
 const studio=new ZorifiAudioStudio({audioContext:context()});
 assert.deepEqual(studio.analyzeBeatsAndWaveforms(buffer([])),{peaks:[],estimatedBeats:[]});
 assert.deepEqual(studio.analyzeBeatsAndWaveforms(buffer([0,1,0])).peaks,[0,1,0]);
 const data=new Float32Array(1000);data.fill(.9,100,120);data.fill(.9,500,520);
 assert.deepEqual(studio.analyzeBeatsAndWaveforms(buffer(data)).estimatedBeats,[.1,.5]);await studio.dispose();
});
test('AI brief validates numeric input and feeds existing provider payload fields',()=>{
 const brief=music.buildAIMusicPrompt({tempoBpm:'128',musicalKey:'D Minor',durationSeconds:'45'});
 assert.equal(brief.parameters.bpm,128);assert.equal(brief.parameters.duration,45);
 assert.throws(()=>music.buildAIMusicPrompt({tempoBpm:NaN}),/Tempo/);
 assert.throws(()=>music.buildAIMusicPrompt({durationSeconds:Infinity}),/Duration/);
 assert.throws(()=>music.buildAIMusicPrompt({timeSignature:'oops'}),/signature/);
 const payload=music.providerPayload({prompt:'Warm piano melody',bpm:128,key:'D',scaleMode:'minor',duration:45});
 assert.equal(payload.bpm,128);assert.equal(payload.key,'D');assert.equal(payload.scaleMode,'minor');assert.equal(payload.duration,45);
});
