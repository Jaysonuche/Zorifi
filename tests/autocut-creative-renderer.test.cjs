const test=require('node:test');
const assert=require('node:assert/strict');
const Renderer=require('../zorifi-autocut-renderer.js');

const assets=[
  {id:'a',type:'video',url:'blob:a',duration:10},
  {id:'b',type:'video',url:'blob:b',duration:20},
  {id:'c',type:'image',url:'blob:c',duration:5},
  {id:'d',type:'image',url:'blob:d'},
  {id:'e',type:'image',url:'blob:e'},
  {id:'music',type:'audio',url:'blob:music',duration:30}
];
const shot=(id,start=0,duration=2,extra={})=>({id:`shot-${id}-${start}`,mediaId:id,type:'video',start,duration,...extra});
const layer=(id,index,start=0,duration=2,extra={})=>shot(id,start,duration,{
  track:index,sourceStart:index,volume:100,
  collage:{id:`group-${start}`,cell:{left:50*index,top:0,width:50,height:100}},...extra
});

test('collage layers share a scene duration and keep source offsets while secondary audio is muted',()=>{
  const input={clips:[layer('b',1),shot('c',2,3),layer('a',0),shot('music',0,5,{type:'audio',volume:60})]};
  const original=JSON.stringify(input);
  const result=Renderer.preparePlan(input,assets);
  assert.equal(result.duration,5);
  assert.equal(result.scenes.length,2);
  assert.deepEqual(result.scenes.map(scene=>[scene.start,scene.duration,scene.items.length]),[[0,2,2],[2,3,1]]);
  assert.deepEqual(result.scenes[0].items.map(({clip})=>[clip.mediaId,clip.sourceStart,clip.volume]),[['a',0,100],['b',1,0]]);
  assert.equal(result.audio[0].clip.volume,60);
  result.scenes[0].items[0].clip.collage.cell.left=25;
  assert.equal(JSON.stringify(input),original);
});

test('scene grouping rejects unrelated overlaps, mismatched durations and gaps',()=>{
  assert.throws(()=>Renderer.preparePlan({clips:[layer('a',0),layer('b',1,0,3)]},assets),/continuous/);
  assert.throws(()=>Renderer.preparePlan({clips:[layer('a',0),layer('b',1,0,2,{collage:{id:'other',cell:{left:50,top:0,width:50,height:100}}})]},assets),/continuous/);
  assert.throws(()=>Renderer.preparePlan({clips:[layer('a',0),shot('b')]},assets),/continuous/);
  assert.throws(()=>Renderer.preparePlan({clips:[layer('a',0),layer('b',1),shot('c',2.5,1)]},assets),/continuous/);
  assert.throws(()=>Renderer.preparePlan({clips:[layer('a',0),layer('b',1),shot('c',1,1)]},assets),/continuous/);
});

test('collages require distinct sources, distinct tracks and complete bounded layouts',()=>{
  assert.throws(()=>Renderer.preparePlan({clips:[layer('a',0),layer('a',1)]},assets),/distinct sources/);
  assert.throws(()=>Renderer.preparePlan({clips:[layer('a',0),layer('b',1,0,2,{track:0})]},assets),/distinct tracks/);
  assert.throws(()=>Renderer.preparePlan({clips:[layer('a',0,0,2,{track:1}),layer('b',1,0,2,{track:2})]},assets),/primary track/);
  assert.throws(()=>Renderer.preparePlan({clips:[layer('a',0)]},assets),/two to four/);
  assert.throws(()=>Renderer.preparePlan({clips:[layer('a',0),layer('b',1,0,2,{collage:{id:'group-0',cell:{left:60,top:0,width:50,height:100}}})]},assets),/invalid collage/);
  const five=['a','b','c','d','e'].map((id,index)=>layer(id,index,0,2,{collage:{id:'large',cell:{left:index*20,top:0,width:20,height:100}}}));
  assert.throws(()=>Renderer.preparePlan({clips:five},assets),/two to four/);
});

test('source-range checks include playback speed and every collage layer',()=>{
  assert.throws(()=>Renderer.preparePlan({clips:[layer('a',0),layer('b',1,0,2,{sourceStart:18,playbackRate:2})]},assets),/ends before/);
  assert.throws(()=>Renderer.preparePlan({clips:[shot('a',0,2,{sourceStart:9})]},assets),/ends before/);
  assert.throws(()=>Renderer.preparePlan({clips:[shot('a',0,2,{playbackRate:NaN})]},assets),/invalid shot timing/);
  assert.throws(()=>Renderer.preparePlan({clips:[shot('a',0,2,{sourceStart:Infinity})]},assets),/invalid shot timing/);
  assert.equal(Renderer.preparePlan({clips:[shot('a',0,2,{sourceStart:6,playbackRate:2})]},assets).duration,2);
  // A still image's library display duration is not a source-media limit.
  assert.equal(Renderer.preparePlan({clips:[shot('c',0,8)]},assets).duration,8);
});

test('renderer limits apply to individual layers and distinct visual source counts',()=>{
  const stills=Array.from({length:17},(_,index)=>({id:`still${index}`,type:'image',url:`blob:${index}`}));
  assert.throws(()=>Renderer.preparePlan({clips:stills.map((asset,index)=>shot(asset.id,index,1))},stills),/16 visual/);
  const tooMany=Array.from({length:Renderer.LIMITS.clips+1},(_,index)=>shot('c',index*.5,.5));
  assert.throws(()=>Renderer.preparePlan({clips:tooMany},assets),/too many shots/);
  const maximum=Array.from({length:Renderer.LIMITS.clips},(_,index)=>shot('c',index*.5,.5));
  assert.equal(Renderer.preparePlan({clips:maximum},assets).scenes.length,Renderer.LIMITS.clips);
});

test('soundtrack timing stays within edit and cannot reuse an active visual decoder',()=>{
  assert.throws(()=>Renderer.preparePlan({clips:[shot('a'),shot('music',0,3,{type:'audio'})]},assets),/extends past/);
  assert.throws(()=>Renderer.preparePlan({clips:[shot('a'),shot('a',0,2,{type:'audio'})]},assets),/separate soundtrack/);
  assert.throws(()=>Renderer.preparePlan({clips:[shot('a'),shot('c',0,2,{type:'audio'})]},assets),/photo cannot/);
});
