const test=require('node:test');
const assert=require('node:assert/strict');
const AutoCut=require('../zorifi-autocut.js');
const fs=require('node:fs');
const vm=require('node:vm');

function frame(time,r,g,b,{pattern=false}={}){
  const width=48,height=27,data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++){
    const shade=pattern&&((i%width>>2)+(i/width>>2))%2?38:0;
    data[i*4]=Math.max(0,r-shade);data[i*4+1]=Math.max(0,g-shade);data[i*4+2]=Math.max(0,b-shade);data[i*4+3]=255;
  }
  return {time,width,height,data};
}

test('AutoCut samples the uploaded footage, records actual scene changes, and keeps pixels private',async()=>{
  const asset={id:'uploaded-clip',name:'Real footage.mp4',type:'video',duration:8,width:1920,height:1080,url:'blob:real'};
  const analyses=await AutoCut.analyzeMediaAssets([asset],{sampleVideoFrames:async()=>({duration:8,width:1920,height:1080,frames:[frame(0,175,130,95,{pattern:true}),frame(1,174,129,94,{pattern:true}),frame(2,173,128,93,{pattern:true}),frame(3,48,111,181,{pattern:true}),frame(4,49,110,180,{pattern:true}),frame(5,48,111,180,{pattern:true}),frame(6,47,112,182,{pattern:true}),frame(7,49,112,180,{pattern:true})]})});
  assert.equal(analyses.length,1);
  assert.equal(analyses[0].analysis,'sampled-frames');
  assert(analyses[0].cuts.some(cut=>Math.abs(cut-3)<.01),'major visual change should mark a scene boundary');
  assert.equal(analyses[0].frameSamples.length,8);
  assert(!JSON.stringify(analyses).includes('rgb'),'raw frame bytes must not be stored in the project');
});

test('AutoCut makes non-overlapping timeline clips with valid source offsets and measured evidence',async()=>{
  const assets=[{id:'wide',name:'Wide.mp4',type:'video',duration:12,url:'blob:wide'},{id:'detail',name:'Detail.mp4',type:'video',duration:9,url:'blob:detail'}];
  const sampler=async(asset)=>({duration:asset.duration,width:1280,height:720,frames:Array.from({length:asset.duration},(_,index)=>frame(index+.05,asset.id==='wide'?180:72,asset.id==='wide'?130:174,asset.id==='wide'?88:180,{pattern:true}))});
  const plan=await AutoCut.createAutoCutPlan(assets,{sampleVideoFrames:sampler,prompt:'energetic edit',targetDuration:9,idPrefix:'testcut'});
  assert(plan.clips.length>=3);
  assert.equal(plan.evidence.method,'local-frame-analysis');
  assert.equal(plan.evidence.sampledFrames,21);
  assert(plan.clips.some(clip=>clip.mediaId==='wide'));
  assert(plan.clips.some(clip=>clip.mediaId==='detail'));
  const byId=new Map(assets.map(asset=>[asset.id,asset]));
  plan.clips.forEach((clip,index)=>{
    assert.equal(clip.type,'video');assert.equal(clip.track,0);assert(clip.duration>0);
    assert(clip.sourceStart+clip.duration<=byId.get(clip.mediaId).duration+.001);
    if(index)assert.equal(clip.start,+(plan.clips[index-1].start+plan.clips[index-1].duration).toFixed(3));
  });
  assert.equal(plan.duration,+(plan.clips.at(-1).start+plan.clips.at(-1).duration).toFixed(3));
});

test('AutoCut reports when footage cannot be decoded and does not claim scene or beat analysis',async()=>{
  const analyses=await AutoCut.analyzeMediaAssets([{id:'offline',name:'Unavailable.mov',type:'video',duration:6,url:''}],{sampleVideoFrames:async()=>{throw new Error('Codec unavailable');}});
  const plan=AutoCut.planEdit(analyses,{targetDuration:5});
  assert.equal(analyses[0].analysis,'metadata-only');
  assert.equal(plan.evidence.sampledFrames,0);
  assert.equal(plan.evidence.detectedSceneCuts,0);
  assert.equal(plan.evidence.beatCount,0);
  assert(plan.warnings.some(item=>/Frame analysis was unavailable/.test(item)));
  assert(plan.clips.length>0,'metadata-only plan can be reviewed, without pretending it analyzed frames');
});

test('Audio beat detection uses measured waveform only',()=>{
  assert.deepEqual(AutoCut.audioBeatTimes({duration:4,peaks:[0,.1,.9,.1,0,.05,.85,.08,0,.1,.95,.1]}),[.667,2,3.333]);
  assert.deepEqual(AutoCut.audioBeatTimes(null),[]);
  assert.deepEqual(AutoCut.audioBeatTimes({duration:4}),[]);
});

test('A full soundtrack gets one audio track while short soundtracks preserve source sound',()=>{
  const source=[{mediaId:'scene',name:'Scene',type:'video',duration:8,cuts:[],frameSamples:[{time:0,score:.8,difference:0},{time:2,score:.8,difference:.1},{time:4,score:.8,difference:.1},{time:6,score:.8,difference:.1}],analysis:'sampled-frames'}];
  const full=AutoCut.planEdit(source,{targetDuration:5,soundtrack:{id:'music',name:'Score',duration:12},idPrefix:'full'});
  const music=full.clips.find(clip=>clip.type==='audio');
  assert(music);assert.equal(music.mediaId,'music');assert.equal(music.duration,full.duration);
  assert(full.clips.filter(clip=>clip.type==='video').every(clip=>clip.volume===0));
  const short=AutoCut.planEdit(source,{targetDuration:5,soundtrack:{id:'short',name:'Short',duration:1},idPrefix:'short'});
  assert.equal(short.clips.filter(clip=>clip.type==='audio').length,0);
  assert(short.clips.filter(clip=>clip.type==='video').every(clip=>clip.volume===100&&clip.audioFadeIn>0&&clip.audioFadeOut>0));
  assert(short.warnings.some(item=>item.includes('shorter')));
});

test('AutoCut can cover a requested source duration without repeating or dropping usable frames',()=>{
  for(const duration of [4,6,8,12,30]){
    const analysis={mediaId:'full-source',name:'Full source',type:'video',duration,cuts:[],frameSamples:Array.from({length:Math.ceil(duration)},(_,index)=>({time:index,score:.8,difference:0})),analysis:'sampled-frames'};
    const plan=AutoCut.planEdit([analysis],{targetDuration:duration});
    assert(Math.abs(plan.duration-duration)<.01,`${duration}s of footage should support a ${duration}s edit, got ${plan.duration}s`);
    const windows=plan.clips.filter(clip=>clip.type==='video').sort((a,b)=>a.sourceStart-b.sourceStart);
    assert.equal(windows[0].sourceStart,0);
    for(let index=1;index<windows.length;index++)assert(Math.abs(windows[index].sourceStart-windows[index-1].sourceStart-windows[index-1].duration)<.002,'source windows should meet without repeats or gaps');
    assert(!plan.warnings.some(message=>message.includes('distinct source intervals')));
  }
});

test('Candidate bounds retain the end of a long recording',()=>{
  const candidates=AutoCut.candidatesFor({mediaId:'long',name:'Long recording',type:'video',duration:900,cuts:[],frameSamples:[]},AutoCut.pacing('balanced'));
  assert.equal(candidates.length,150);
  assert.equal(candidates[0].sourceStart,0);
  assert(Math.abs(candidates.at(-1).sourceStart+candidates.at(-1).duration-900)<.002);
});

test('Image-only edits use the full assigned still durations without duplicate shots',()=>{
  const sources=Array.from({length:3},(_,index)=>({mediaId:`photo-${index}`,name:`Photo ${index}`,type:'image',duration:5,cuts:[],frameSamples:[{time:0,score:.8,difference:0}],analysis:'sampled-frames'}));
  const single=AutoCut.planEdit(sources.slice(0,1),{targetDuration:5});
  assert.equal(single.duration,5);assert.equal(single.clips.length,1);assert.equal(single.clips[0].duration,5);
  const sequence=AutoCut.planEdit(sources,{targetDuration:15});
  assert.equal(sequence.duration,15);assert.equal(sequence.clips.length,3);
  assert.equal(new Set(sequence.clips.map(clip=>clip.mediaId)).size,3);
  assert(sequence.clips.every(clip=>clip.sourceStart===0&&clip.duration===5));
  assert(!sequence.warnings.some(message=>message.includes('distinct source intervals')));
});

test('Short montages reserve time for each selected source instead of using only one photo',()=>{
  const sources=Array.from({length:3},(_,index)=>({mediaId:`photo-${index}`,name:`Photo ${index}`,type:'image',duration:5,cuts:[],frameSamples:[{time:0,score:index===0?.95:.3,difference:0}]}));
  const plan=AutoCut.planEdit(sources,{targetDuration:4});
  assert.equal(plan.duration,4);
  assert.equal(new Set(plan.clips.map(clip=>clip.mediaId)).size,3);
  assert(plan.clips.every(clip=>clip.duration>=1&&clip.sourceStart===0));
});

test('Cancelling pending video metadata releases the decoder immediately',async()=>{
  const video={paused:0,unloaded:0,src:'',pause(){this.paused++;},removeAttribute(name){if(name==='src')this.src='';},load(){this.unloaded++;}};
  const sandbox={module:{exports:{}},document:{createElement(type){assert.equal(type,'video');return video;}},setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(require.resolve('../zorifi-autocut.js'),'utf8'),sandbox);
  const controller=new AbortController(),pending=sandbox.module.exports.analyzeMediaAssets([{id:'pending',type:'video',duration:10,url:'blob:pending'}],{signal:controller.signal});
  assert.equal(video.src,'blob:pending');
  controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(video.src,'');assert.equal(video.unloaded,1);assert.equal(video.paused,1);
});

test('Cancellation after the final sampler resolves cannot return a plan',async()=>{
  const controller=new AbortController();
  await assert.rejects(AutoCut.createAutoCutPlan([{id:'last',type:'image',duration:4}],{signal:controller.signal,sampleImageFrame:async()=>{controller.abort();return {duration:4,frames:[frame(0,128,128,128)]};}}),{name:'AbortError'});
});
