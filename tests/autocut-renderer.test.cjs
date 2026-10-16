const test=require('node:test');
const assert=require('node:assert/strict');
const Renderer=require('../zorifi-autocut-renderer.js');

const assets=[{id:'photo',type:'image',url:'blob:photo'},{id:'video',type:'video',url:'blob:video'},{id:'music',type:'audio',url:'blob:music'}];
const shot=(mediaId,start,duration,extra={})=>({id:`${mediaId}-${start}`,mediaId,type:'video',start,duration,...extra});

test('standalone AutoCut renderer preserves source timing without mutating its plan',()=>{
  const plan={clips:[shot('video',2,3,{sourceStart:12,volume:0}),shot('photo',0,2),shot('music',0,5,{type:'audio',volume:85})]};
  const before=JSON.stringify(plan);
  const prepared=Renderer.preparePlan(plan,assets);
  assert.equal(prepared.duration,5);
  assert.deepEqual(prepared.visuals.map(item=>item.clip.mediaId),['photo','video']);
  assert.equal(prepared.visuals[1].clip.sourceStart,12);
  assert.equal(prepared.visuals[1].clip.volume,0);
  assert.equal(prepared.audio[0].clip.volume,85);
  prepared.visuals[0].clip.start=99;
  assert.equal(JSON.stringify(plan),before);
});

test('standalone AutoCut renderer rejects missing media, gaps, overlaps and unbounded edits',()=>{
  assert.throws(()=>Renderer.preparePlan({clips:[shot('missing',0,2)]},assets),/unavailable/);
  assert.throws(()=>Renderer.preparePlan({clips:[shot('video',0,2),shot('photo',3,2)]},assets),/continuous/);
  assert.throws(()=>Renderer.preparePlan({clips:[shot('video',0,2),shot('photo',1,2)]},assets),/continuous/);
  assert.throws(()=>Renderer.preparePlan({clips:[shot('video',0,181)]},assets),/3 minutes/);
  assert.throws(()=>Renderer.preparePlan({clips:[shot('video',0,2,{sourceStart:-1})]},assets),/invalid shot timing/);
  assert.throws(()=>Renderer.preparePlan({clips:[shot('music',0,2)]},assets),/cannot be used/);
});

test('AutoCut render dimensions stay within the supported pixel budget in either orientation',()=>{
  assert.deepEqual(Renderer.outputSize(3840,2160),{width:1920,height:1080});
  assert.deepEqual(Renderer.outputSize(2160,3840),{width:1080,height:1920});
  assert.deepEqual(Renderer.outputSize(1280,720),{width:1280,height:720});
  assert.throws(()=>Renderer.outputSize(0,720),/invalid/);
});

test('AutoCut source audio and soundtrack fade only inside their active interval',()=>{
  const clip={start:2,duration:4,volume:80,audioFadeIn:1,audioFadeOut:2};
  assert.equal(Renderer.audioLevel(clip,1.9),0);
  assert.equal(Renderer.audioLevel(clip,2),0);
  assert.equal(Renderer.audioLevel(clip,2.5),.4);
  assert.equal(Renderer.audioLevel(clip,3),.8);
  assert.equal(Renderer.audioLevel(clip,5),.4);
  assert.equal(Renderer.audioLevel(clip,6),0);
});

test('AutoCut renderer honors pre-cancelled jobs before accessing any media',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(Renderer.render({signal:controller.signal}),{name:'AbortError'});
});
