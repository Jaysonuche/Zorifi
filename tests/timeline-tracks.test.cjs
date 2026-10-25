const test=require('node:test');
const assert=require('node:assert/strict');
const Tracks=require('../zorifi-timeline-tracks.js');
require('../zorifi-project-model.js');
const Project=globalThis.ZorifiProjectModel;
const {ZorifiAutoCaptionsEngine}=require('../zorifi-phase8.js');

test('existing project track identities and labels stay compatible',()=>{
  for(const [track,type,number] of [[0,'video',1],[4,'video',2],[99,'video',97],[1,'audio',1],[100,'audio',2],[199,'audio',101],[2,'text',1],[200,'text',2],[299,'text',101],[3,'effect',1],[300,'effect',2],[450,'effect',152]]){
    assert.equal(Tracks.kind(track),type);assert.equal(Tracks.number(track),number);assert.equal(Tracks.id(type,number),track);
  }
});

test('a thousand layers of every type stay distinct through project serialization',()=>{
  const clips=[],ids=new Set();
  for(let ordinal=1;ordinal<=1000;ordinal++)for(const type of Tracks.KINDS){
    const track=Tracks.next(clips,type);
    assert(Number.isSafeInteger(track)&&track>=0);assert(!ids.has(track));ids.add(track);
    assert.equal(Tracks.kind(track),type);assert.equal(Tracks.number(track),ordinal);
    clips.push({id:`${type}-${ordinal}`,type,track,start:0,duration:1});
  }
  const restored=Project.migrateProject(JSON.parse(JSON.stringify({id:'many-layers',clips,duration:1,mediaAssets:[]})));
  for(const type of Tracks.KINDS){
    const layers=restored.clips.filter(clip=>Tracks.kind(clip.track)===type);
    assert.equal(layers.length,1000);assert.equal(Tracks.number(Tracks.next(restored.clips,type)),1001);
  }
});

test('captions create additional editable text tracks beyond the previous range',()=>{
  const engine=new ZorifiAutoCaptionsEngine();
  engine.captions=[{start:0,end:1,text:'A real caption'}];
  const state={clips:[],duration:1};
  for(let i=1;i<=130;i++){
    engine.applyToTimeline(state);
    const clip=state.clips.at(-1);
    assert.equal(Tracks.kind(clip.track),'text');assert.equal(Tracks.number(clip.track),i);
  }
  assert.equal(new Set(state.clips.map(clip=>clip.track)).size,130);
});
