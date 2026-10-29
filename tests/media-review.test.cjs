const test=require('node:test');
const assert=require('node:assert/strict');
const Review=require('../zorifi-vanessa-media-review.js');
const Director=require('../zorifi-autocut-director.js');

const image='data:image/jpeg;base64,/9j/2Q==';
function frame(time,value=128){const data=new Uint8ClampedArray(4*4*4);for(let index=0;index<data.length;index+=4){data[index]=data[index+1]=data[index+2]=value;data[index+3]=255;}return {time,width:4,height:4,data};}
function wav(duration=.5,{pulse=false,clipped=false}={}){
  const length=Math.floor(duration*16000),data=new ArrayBuffer(44+length*2),view=new DataView(data),text=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,data.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*2,true);
  for(let i=0;i<length;i++){const value=clipped?32767:pulse&&i%8000<160?24000:1000;view.setInt16(44+2*i,value,true);}return {start:0,duration,dataUrl:'data:audio/wav;base64,'+Buffer.from(data).toString('base64')};
}
function evidence(overrides={}){return {version:1,method:'zorifi-decoded-samples-v1',samplesOnly:true,media:[{id:'video',type:'video',name:'Original',duration:10,width:1920,height:1080,frames:[{time:1,image,metrics:{luma:.5,score:.8}},{time:8,image,metrics:{luma:.4,score:.7}}],...overrides}],warnings:[]};}
function state(overrides={}){return {projectId:'project',duration:10,currentTime:2,ratio:'16 / 9',selected:'clip',trackStates:{},mediaAssets:[{id:'video',type:'video',url:'blob:local-only',duration:10}],clips:[{id:'clip',mediaId:'video',type:'video',start:0,duration:10,sourceStart:0,playbackRate:1,track:0,volume:100}],...overrides};}

test('A bounded evidence package requires actual frame timestamps, identities, formats and audio budgets',()=>{
  assert.equal(Review.validateEvidence(evidence(),{assetIds:['video']}).frameCount,2);
  assert.throws(()=>Review.validateEvidence(evidence(),{assetIds:['other']}),/identity/);
  assert.throws(()=>Review.validateEvidence(evidence({frames:[{time:11,image}]})),/frame sample/);
  assert.throws(()=>Review.validateEvidence(evidence({frames:[{time:1,image:'https://example.com/private.jpg'}]})),/frame sample/);
  assert.throws(()=>Review.validateEvidence(evidence({frames:[{time:1,image:'data:image/jpeg;base64,aGVsbG8='}]})),/not a JPEG/);
  assert.throws(()=>Review.validateEvidence(evidence({audio:{...wav(),duration:4}})),/PCM samples/);
  const duplicate=evidence();duplicate.media.push({...duplicate.media[0]});assert.throws(()=>Review.validateEvidence(duplicate),/identity/);
});
test('Audio-only excerpts use their own source ID and appear as actual inline provider audio',async()=>{
  const result=await Review.collectEvidence([{id:'video',type:'video'},{id:'soundtrack',type:'audio',duration:2}],{collect:async()=>({media:evidence().media}),analyzeFrame:async source=>frame(source.time),analyzeAudio:async()=>({duration:2,audio:wav(2,{pulse:true})})});
  const audio=result.media.find(item=>item.id==='soundtrack');assert.equal(audio.type,'audio');assert.equal(audio.audio.metrics.sampleCount,32000);assert.equal(audio.coverage.audioSeconds,2);assert.ok(!audio.unknown.includes('audio content was not sampled for this request'));assert.equal(Review.providerMedia(result).length,1);const parts=Review.providerParts(result);assert.equal(parts.filter(part=>part.inlineData?.mimeType==='audio/wav').length,1);assert.match(parts.find(part=>part.text?.includes('AUDIO EXCERPT')).text,/soundtrack/);
});
test('PCM measurements use real samples and label transient estimates honestly',()=>{
  const result=Review.audioMetrics(wav(2,{pulse:true}));assert.equal(result.sampleCount,32000);assert.equal(result.sampleRate,16000);assert.equal(result.duration,2);assert.ok(result.samplePeak>.7);assert.ok(result.rmsDbfs<0);assert.ok(result.onsetTimes.includes(.5));assert.match(result.onsetInterpretation,/not a verified musical beat/);assert.equal(result.fullTrack,false);
  assert.equal(Review.audioMetrics(wav(.01,{clipped:true})).clippedSamples,160);
  assert.throws(()=>Review.audioMetrics(wav(13)),/bounded|limits/);
});
test('Full project understanding uses the existing state without exposing source URLs or copying it into a second store',()=>{
  const input=state();const before=JSON.stringify(input),manifest=Review.understandProject(input,{evidence:evidence(),brief:'Premium edit'});assert.deepEqual(manifest.selection,['clip']);assert.equal(manifest.playhead,2);assert.equal(manifest.media[0].readability,'decoded-samples');assert.equal(manifest.clips[0].sourceStart,0);assert.equal(manifest.brief,'Premium edit');assert.equal(JSON.stringify(input),before);assert.doesNotMatch(JSON.stringify(manifest),/blob:local-only/);
});
test('The extractor reuses real AutoCut collection, measures decoded pixels and preserves sparse coverage',async()=>{
  let calls=0;const result=await Review.collectEvidence([{id:'video',type:'video'}],{collect:async()=>{calls++;return {media:[{id:'video',type:'video',duration:10,width:1920,height:1080,frames:[{time:1,image},{time:8,image}],audio:wav()}],warnings:['Only sparse frames are sampled.']};},analyzeFrame:async source=>frame(source.time)});
  assert.equal(calls,1);assert.equal(result.media[0].frames.length,2);assert.equal(result.media[0].frames[0].metrics.luma,.502);assert.equal(result.media[0].coverage.sparse,true);assert.equal(result.media[0].coverage.audioSeconds,.5);assert.equal(result.media[0].audio.metrics.sampleCount,8000);assert.ok(result.media[0].unknown.includes('unsampled action'));assert.equal(Review.providerMedia(result)[0].frames[1].time,8);assert.equal(Review.providerMedia(result)[0].frames[0].metrics,undefined);
});
test('Unavailable pixel metrics never become invented technical candidate scores',async()=>{
  const result=await Review.collectEvidence([{id:'video',type:'video'}],{collect:async()=>({media:evidence().media}),analyzeFrame:async()=>{throw new Error('Decoder unavailable');}});
  assert.equal(result.media[0].frames[0].metrics,undefined);assert.equal(Review.strongestMoments(result).length,0);assert.match(result.warnings[0],/no local pixel metrics/);
});
test('Stop cancels review and does not wait for a noncooperative asynchronous collector',async()=>{
  const controller=new AbortController();let started;const ready=new Promise(resolve=>{started=resolve;});const pending=Review.collectEvidence([{id:'video',type:'video'}],{signal:controller.signal,collect:()=>{started();return new Promise(()=>{});}});await ready;controller.abort();await assert.rejects(pending,{name:'AbortError'});
});
test('Strongest moments rank measured exposure/detail and never claim semantic narrative strength',()=>{
  const moments=Review.strongestMoments(evidence(),{shotDuration:3,count:1});assert.equal(moments.length,1);assert.equal(moments[0].sampleTime,1);assert.equal(moments[0].technicalScore,.8);assert.match(moments[0].judgment,/narrative strength requires/);assert.ok(moments[0].sourceStart+moments[0].duration<=10);
});
test('Missing source assets and invalid source bounds block export before announcing readiness',()=>{
  const missing=Review.reviewProject(state({mediaAssets:[]}));assert.equal(missing.exportReady,false);assert.equal(missing.status,'blocked');assert.ok(missing.issues.some(item=>item.code==='missing_media'));
  const overrun=state();overrun.clips[0].sourceStart=5;assert.ok(Review.reviewProject(overrun,{evidence:evidence()}).issues.some(item=>item.code==='source_overrun'));
});
test('Review checks timeline gaps across all visible layers rather than treating an overlay as a gap',()=>{
  const input=state();input.clips=[{...input.clips[0],duration:3},{...input.clips[0],id:'end',start:7,duration:3,sourceStart:7}];let result=Review.reviewProject(input,{evidence:evidence()});assert.deepEqual(result.issues.find(item=>item.code==='timeline_gap').range,{from:3,to:7,duration:4});input.clips.push({...input.clips[0],id:'overlay',start:3,duration:4,sourceStart:3,track:4});result=Review.reviewProject(input,{evidence:evidence()});assert.ok(!result.issues.some(item=>item.code==='timeline_gap'));input.trackStates[4]={hidden:true};assert.ok(Review.reviewProject(input,{evidence:evidence()}).issues.some(item=>item.code==='timeline_gap'));
});
test('Review reports text readability, subtitle uncertainty and gain headroom using actual measurements',()=>{
  const input=state(),measured=evidence({audio:{...wav(.5,{clipped:true}),metrics:Review.audioMetrics(wav(.5,{clipped:true}))}});input.clips[0].volume=180;input.clips.push({id:'caption',type:'text',track:2,name:'This text has much too many words to read at this speed.',start:0,duration:1,fontSize:16,autoCaption:true});const result=Review.reviewProject(input,{evidence:measured});assert.ok(result.issues.some(item=>item.code==='small_text'));assert.ok(result.issues.some(item=>item.code==='fast_text'));assert.ok(result.issues.some(item=>item.code==='source_clipping'));assert.ok(result.issues.some(item=>item.code==='audio_headroom'));assert.ok(result.unassessed.some(item=>item.id==='subtitle_accuracy'));
});
test('A technical pass leaves creative and rendered-media checks explicitly unassessed',()=>{
  const input=state();input.clips[0].volume=0;const result=Review.reviewProject(input,{evidence:evidence(),targetDuration:10,ratio:'16:9'});assert.equal(result.exportReady,true);assert.equal(result.status,'review-required');assert.equal(result.needsCreativeApproval,true);assert.match(result.claims,/not certified/);assert.ok(result.unassessed.some(item=>item.id==='storytelling'));assert.ok(result.unassessed.some(item=>item.id==='final_audio_mix'));assert.ok(!result.issues.some(item=>item.code==='brief_ratio'));
});
test('Requested duration and aspect ratio mismatches remain visible in the quality report',()=>{
  const result=Review.reviewProject(state(),{targetDuration:45,ratio:'9:16'});assert.ok(result.issues.some(item=>item.code==='brief_duration'));assert.ok(result.issues.some(item=>item.code==='brief_ratio'));
});
test('Measured soundtrack transients map through clip source offsets and playback rate',()=>{
  const input=state();input.clips=[{...input.clips[0],duration:5},{...input.clips[0],id:'second',start:5,duration:5,sourceStart:5},{id:'sound',type:'audio',mediaId:'audio',start:0,duration:10,sourceStart:2,playbackRate:1,track:1}];input.mediaAssets.push({id:'audio',type:'audio',duration:12,url:'blob:audio'});const measured=evidence();measured.media.push({id:'audio',type:'audio',duration:12,frames:[],waveform:{onsetTimes:[7]}});const result=Review.reviewProject(input,{evidence:measured});const alignment=result.checks.find(item=>item.id==='transient_alignment');assert.equal(alignment.status,'measured-estimate');assert.equal(alignment.details.aligned,1);assert.equal(alignment.details.ratio,1);
});
test('Input projects remain unchanged by ranking, manifest and technical review',()=>{
  const input=state(),before=JSON.stringify(input),samples=evidence(),evidenceBefore=JSON.stringify(samples);Review.understandProject(input,{evidence:samples});Review.reviewProject(input,{evidence:samples});Review.strongestMoments(samples);assert.equal(JSON.stringify(input),before);assert.equal(JSON.stringify(samples),evidenceBefore);
});
