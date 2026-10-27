const test=require('node:test');
const assert=require('node:assert/strict');
require('../zorifi-advanced-editing.js');
const Timeline=require('../zorifi-timeline-edit-api.js');

function fixture(){
  return {projectId:'owned-project',selected:'clip',currentTime:13,duration:20,trackStates:{0:{locked:false}},
    mediaAssets:[{id:'source',type:'video',duration:30,url:'blob:local-video'}],
    clips:[{id:'clip',name:'Source clip',type:'video',mediaId:'source',track:0,start:10,duration:10,sourceStart:2,playbackRate:2,
      audioFadeIn:8,audioFadeOut:9,visualEffects:{filter:{id:'cinematic',intensity:25}},
      keyframes:{scale:[{time:10,value:100,easing:'linear'},{time:15,value:150,easing:'linear'},{time:20,value:200,easing:'linear'}]}}]};
}
const serialize=state=>JSON.stringify(state);

test('native split updates real supplied clips with rate-aware source timing and preserves the playhead',()=>{
  const state=fixture(),original=structuredClone(state.clips[0]);
  const result=Timeline.splitClip(state,{clipId:'clip',time:14,id:'right'});
  assert.equal(result.changed,true);assert.equal(state.clips.length,2);assert.equal(state.currentTime,13);
  const left=state.clips.find(clip=>clip.id==='clip'),right=state.clips.find(clip=>clip.id==='right');
  assert.deepEqual([left.start,left.duration,left.sourceStart],[10,4,2]);
  assert.deepEqual([right.start,right.duration,right.sourceStart],[14,6,10]);
  assert.equal(state.selected,'right');assert.equal(left.duration+right.duration,original.duration);
  assert.equal(right.sourceStart+right.duration*right.playbackRate,original.sourceStart+original.duration*original.playbackRate);
});

test('split segments and all nested editing data are independent and animation values match at the cut',()=>{
  const state=fixture(),original=state.clips[0];
  Timeline.splitClip(state,{clipId:'clip',time:14,id:'right'});
  const [left,right]=state.clips;
  assert.notEqual(left,original);assert.notEqual(right,original);
  assert.notEqual(left.visualEffects,right.visualEffects);assert.notEqual(left.keyframes.scale,right.keyframes.scale);
  assert.deepEqual(left.keyframes.scale.map(frame=>[frame.time,frame.value]),[[10,100],[14,140]]);
  assert.deepEqual(right.keyframes.scale.map(frame=>[frame.time,frame.value]),[[14,140],[15,150],[20,200]]);
  right.visualEffects.filter.intensity=80;right.keyframes.scale[0].value=700;
  assert.equal(left.visualEffects.filter.intensity,25);assert.equal(original.visualEffects.filter.intensity,25);
  assert.equal(left.keyframes.scale.at(-1).value,140);assert.equal(original.keyframes.scale[0].value,100);
  assert.deepEqual([left.audioFadeIn,left.audioFadeOut,right.audioFadeIn,right.audioFadeOut],[4,4,6,6]);
});

test('native split samples eased boundary values through the actual editing evaluator',()=>{
  const state=fixture();state.clips[0].keyframes.scale=[{time:10,value:100,easing:'ease-in'},{time:20,value:200,easing:'linear'}];
  const expected=globalThis.ZorifiAdvancedEditing.ZorifiEasingCurves.interpolateKeyframes(state.clips[0].keyframes.scale,14);
  Timeline.splitClip(state,{clipId:'clip',time:14,id:'right'});
  assert.equal(state.clips[0].keyframes.scale.at(-1).value,expected);assert.equal(state.clips[1].keyframes.scale[0].value,expected);
});

test('end trim bounds animation and fades while retaining source offset and live placement',()=>{
  const state=fixture(),result=Timeline.trimClip(state,{clipId:'clip',duration:4,from:'end'}),clip=state.clips[0];
  assert.equal(result.changed,true);assert.deepEqual([clip.start,clip.duration,clip.sourceStart],[10,4,2]);
  assert.deepEqual(clip.keyframes.scale.map(frame=>[frame.time,frame.value]),[[10,100],[14,140]]);
  assert.equal(clip.audioFadeIn,4);assert.equal(clip.audioFadeOut,4);assert.equal(state.currentTime,13);
});

test('start trim consumes the source at playback rate and retimes retained animation to the same timeline start',()=>{
  const state=fixture();Timeline.trimClip(state,{clipId:'clip',duration:4,from:'start'});const clip=state.clips[0];
  assert.deepEqual([clip.start,clip.duration,clip.sourceStart],[10,4,14]);
  assert.deepEqual(clip.keyframes.scale.map(frame=>[frame.time,frame.value]),[[10,160],[14,200]]);
  assert.equal(clip.sourceStart+clip.duration*clip.playbackRate,22);assert.equal(state.currentTime,13);
});

test('UI bounded trim clips absolute keyframes and deep-copies the resulting metadata',()=>{
  const state=fixture(),original=state.clips[0],next={...original,start:12,duration:5,sourceStart:6};
  const trimmed=Timeline.trimToBounds(original,next);
  assert.deepEqual(trimmed.keyframes.scale.map(frame=>[frame.time,frame.value]),[[12,120],[15,150],[17,170]]);
  assert.equal(trimmed.audioFadeIn,5);assert.equal(trimmed.audioFadeOut,5);
  trimmed.visualEffects.filter.intensity=91;assert.equal(original.visualEffects.filter.intensity,25);
  assert.equal(state.clips[0].start,10);assert.equal(next.start,12);
});

test('locked tracks, automatic endings, invalid split points and duplicate IDs never mutate the project',()=>{
  const cases=[
    [state=>{state.trackStates[0].locked=true;},{clipId:'clip',time:14,id:'right'},/Unlock/],
    [state=>{state.clips[0].zorifiEnding=true;},{clipId:'clip',time:14,id:'right'},/ending/],
    [()=>{},{clipId:'missing',time:14,id:'right'},/existing/],
    [()=>{},{clipId:'clip',time:10,id:'right'},/inside/],
    [()=>{},{clipId:'clip',time:20,id:'right'},/inside/],
    [()=>{},{clipId:'clip',time:'14',id:'right'},/inside/],
    [()=>{},{clipId:'clip',time:14,id:'clip'},/ID/]
  ];
  for(const [setup,options,error] of cases){const state=fixture();setup(state);const before=serialize(state);assert.throws(()=>Timeline.splitClip(state,options),error);assert.equal(serialize(state),before);}
});

test('no-op trim leaves project and clip identities unchanged; invalid trims reject before mutation',()=>{
  const state=fixture(),clip=state.clips[0],before=serialize(state);assert.equal(Timeline.trimClip(state,{clipId:'clip',duration:10}).changed,false);assert.equal(state.clips[0],clip);assert.equal(serialize(state),before);
  for(const options of [{duration:0},{duration:11},{duration:4,from:'middle'},{duration:'4'}]){assert.throws(()=>Timeline.trimClip(state,{clipId:'clip',...options}));assert.equal(serialize(state),before);}
});

for(const [name,setup] of [
  ['source overflow',state=>{state.mediaAssets[0].duration=21;}],
  ['missing source',state=>{state.mediaAssets=[];}],
  ['unknown source duration',state=>{state.mediaAssets[0].duration=undefined;}],
  ['negative source offset',state=>{state.clips[0].sourceStart=-1;}],
  ['zero playback rate',state=>{state.clips[0].playbackRate=0;}],
  ['invalid timeline start',state=>{state.clips[0].start=NaN;}]
])test(`native editing rejects ${name} instead of changing the supplied project`,()=>{
  const state=fixture();setup(state);const before=serialize(state);
  assert.throws(()=>Timeline.splitClip(state,{clipId:'clip',time:14,id:'right'}));assert.equal(serialize(state),before);
  assert.throws(()=>Timeline.trimClip(state,{clipId:'clip',duration:4}));assert.equal(serialize(state),before);
});

test('fades are clamped at both zero and the new clip duration',()=>{
  const state=fixture();state.clips[0].audioFadeIn=-3;state.clips[0].audioFadeOut=99;
  Timeline.trimClip(state,{clipId:'clip',duration:4});assert.equal(state.clips[0].audioFadeIn,0);assert.equal(state.clips[0].audioFadeOut,4);
});
