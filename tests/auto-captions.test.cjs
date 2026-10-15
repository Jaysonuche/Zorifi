const test=require('node:test');
const assert=require('node:assert/strict');
const {ZorifiAutoCaptionsEngine:Engine}=require('../zorifi-phase8.js');
const media=new Blob(['actual audio bytes for transport test']);
test('transcription passes media and options to the supplied transport and never invents fallback text',async()=>{
 const engine=new Engine({transcribe:async(audio,options)=>{assert.equal(audio,media);assert.equal(options.language,'fr');return {captions:[{start:1,end:2,text:'Bonjour'}]};}});
 await engine.generateCaptions(media,{language:'fr'});assert.equal(engine.captions[0].text,'Bonjour');
 engine.transcribe=async()=>{throw new Error('Consent required');};
 await assert.rejects(engine.generateCaptions(media),/Consent required/);assert.equal(engine.captions[0].text,'Bonjour');
 await assert.rejects(engine.generateCaptions({duration:20}),/actual audio/);
});
test('cancellation and older responses cannot replace newer captions',async()=>{
 const pending=[];const engine=new Engine({transcribe:()=>new Promise(resolve=>pending.push(resolve))});
 const first=engine.generateCaptions(media),oldRejected=assert.rejects(first,/newer/),second=engine.generateCaptions(media);
 pending[1]({captions:[{start:0,end:1,text:'New'}]});await second;
 pending[0]({captions:[{start:0,end:1,text:'Old'}]});await oldRejected;assert.equal(engine.captions[0].text,'New');
 const controller=new AbortController(),cancelled=engine.generateCaptions(media,{signal:controller.signal});controller.abort();pending[2]({captions:[{start:0,end:1,text:'Cancelled'}]});await assert.rejects(cancelled);assert.equal(engine.captions[0].text,'New');
});
test('SRT sorts captions, wraps lines and carries rounded milliseconds into minutes and hours',()=>{
 const engine=new Engine();engine.settings.maxCharsPerLine=10;engine.captions=[{start:3599.9996,end:3601,text:'Later caption'},{start:59.9996,end:61,text:'Hello world'}];
 const srt=engine.exportToSRT();assert.ok(srt.startsWith('1\n00:01:00,000 --> 00:01:01,000\nHello\nworld'));assert.ok(srt.includes('01:00:00,000'));assert.ok(!srt.includes(',1000'));
 assert.throws(()=>engine._formatTimestampSRT(NaN));
});
test('editing preserves valid word alignment and clears stale word text',()=>{
 const engine=new Engine();engine.captions=engine.normalizeSegments([{id:'a',start:1,end:2,text:'hello',words:[{start:1,end:1.5,text:'hello'}]}]);
 engine.updateCaptionTiming('a',2,4);assert.equal(engine.captions[0].words[0].end,3);
 assert.throws(()=>engine.updateCaptionTiming('a',4,3));assert.equal(engine.captions[0].start,2);
 engine.updateCaptionText('a','changed');assert.deepEqual(engine.captions[0].words,[]);
 assert.throws(()=>engine.updateCaptionText('a',' '));assert.throws(()=>engine.normalizeSegments([{start:0,end:Infinity,text:'bad'}]));
});
test('timeline overlays use actual caption text, numeric tracks and bounded fade keyframes',()=>{
 const engine=new Engine();engine.settings.animationStyle='fade';engine.captions=[{start:1,end:1.1,text:'Short caption'}];
 const state={clips:[{id:'original',type:'text',track:2,start:0,duration:1}],duration:1};engine.applyToTimeline(state);
 const clip=state.clips[1];assert.equal(clip.name,'Short caption');assert.equal(clip.track,200);assert.equal(clip.autoCaption,true);assert.ok(clip.duration<.11);assert.equal(clip.keyframes.opacity.at(-1).time,1.1);assert.equal(state.clips[0].id,'original');
});
