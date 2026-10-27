const test=require('node:test'),assert=require('node:assert/strict');
require('../zorifi-vanessa-actions.js');
const Director=require('../zorifi-director-timeline.js');
const context={capabilities:{transitions:['dissolve'],filters:['cinematic'],effects:['glow'],animations:['push-in']}};
function fixture(){return {projectId:'test',selected:'a',trackStates:{},mediaAssets:[{id:'v',type:'video',duration:30,url:'blob:video'},{id:'music',type:'audio',duration:30,url:'blob:music'}],clips:[{id:'a',mediaId:'v',type:'video',track:0,start:0,duration:5,sourceStart:0,playbackRate:1},{id:'b',mediaId:'v',type:'video',track:0,start:5,duration:5,sourceStart:5,playbackRate:1},{id:'music-clip',mediaId:'music',type:'audio',track:1,start:0,duration:10,audioEffects:{role:'music'}}]};}
const plan=(command,target,parameters)=>({actions:[{command,target,parameters}]});
test('local Director pass adds only supported untouched joins and dedicated music fades',()=>{
 const state=fixture(),before=JSON.stringify(state),draft=Director.localPlan('Take over and make this professional',state,context),valid=Director.validatePlan(draft,state,context);
 assert.deepEqual(valid.actions.map(action=>action.command),['transition.apply','audio.fade']);assert.equal(valid.actions[0].target,'b');assert.equal(JSON.stringify(state),before);
 state.clips[1].transition='dissolve';state.clips[2].audioFadeIn=.6;assert.equal(Director.localPlan('Take over',state,context).actions.length,0);
 assert.equal(Director.localPlan('Take over without transitions',fixture(),context).actions.some(action=>action.command==='transition.apply'),false);
});
test('Director permits a bounded last-clip trim and refuses new gaps or stranded keyframes',()=>{
 const state=fixture();assert.throws(()=>Director.validatePlan(plan('clip.trim','a',{duration:3}),state,context),/new gap/);
 const valid=Director.validatePlan(plan('clip.trim','b',{duration:3}),state,context);assert.equal(valid.actions.length,1);
 state.clips[1].keyframes={scale:[{time:9,value:120}]};assert.throws(()=>Director.validatePlan(plan('clip.trim','b',{duration:3}),state,context),/keyframes/);
 state.clips=[state.clips[0]];assert.equal(Director.localPlan('Trim the opening to 3 seconds',state,context).actions[0].parameters.duration,3);
});
test('Director blocks locked, ending, unsupported, wrong-type and unbounded edits',()=>{
 const state=fixture();state.trackStates[0]={locked:true};assert.throws(()=>Director.validatePlan(plan('visual.filter','a',{id:'cinematic',intensity:35}),state,context),/Unlock/);state.trackStates={};
 state.clips[0].zorifiEnding=true;assert.throws(()=>Director.validatePlan(plan('clip.trim','a',{duration:3}),state,context),/ending/);delete state.clips[0].zorifiEnding;
 for(const draft of [plan('clip.delete','a',{}),plan('clip.set','a',{property:'playbackRate',value:2}),plan('clip.move','a',{start:0,track:1}),plan('transition.apply','missing',{id:'dissolve'}),plan('transition.apply','music-clip',{id:'dissolve'})])assert.throws(()=>Director.validatePlan(draft,state,context));
 assert.throws(()=>Director.validatePlan({actions:Array(13).fill({command:'clip.trim'})},state,context),/at most 12/);
 state.trackStates[4]={locked:true};assert.throws(()=>Director.validatePlan(plan('clip.move','a',{start:0,track:4}),state,context),/destination track is locked/);
});
test('Director validates source bounds and rejects new overlaps while preserving existing overlaps',()=>{
 const state=fixture();assert.throws(()=>Director.validatePlan(plan('clip.move','b',{start:3,track:0}),state,context),/overlap/);
 const prior=structuredClone(state);state.clips[1].start=3;assert.equal(Director.validateResult(state,state),true);assert.throws(()=>Director.validateResult(state,prior),/overlap/);
 state.clips[1].sourceStart=29;assert.throws(()=>Director.validateResult(state),/source media/);
 state.mediaAssets[0].type='image';state.clips[1].sourceStart=0;assert.equal(Director.validateResult(state,state),true,'still images can last beyond their nominal media duration');
});
test('Director resolves selection and removes true no-op actions',()=>{
 const state=fixture(),draft={actions:[{command:'clip.set',target:'selected_clip',parameters:{property:'scale',value:120}},{command:'clip.set',target:'selected_clip',parameters:{property:'scale',value:120}}]};
 const valid=Director.validatePlan(draft,state,context);assert.equal(valid.actions.length,1);assert.equal(valid.actions[0].target,'a');assert.equal(state.clips[0].scale,undefined);
});
test('Director retimes existing keyframes when moving a clip more than once',()=>{
 const state=fixture();state.clips=[state.clips[0]];state.clips[0].keyframes={scale:[{time:0,value:100},{time:5,value:120}]};
 const draft={actions:[{command:'clip.move',target:'a',parameters:{start:10,track:0}},{command:'clip.move',target:'a',parameters:{start:20,track:0}}]};
 assert.equal(Director.validatePlan(draft,state,context).actions.length,2);assert.equal(state.clips[0].keyframes.scale[0].time,0);
});
test('local Director respects explicit exclusions and requests limited to one treatment',()=>{
 for(const instruction of ['Take over but do not add transitions','Take over with no new transitions','Take over without any transitions','Take over and never add transitions'])assert.equal(Director.localPlan(instruction,fixture(),context).actions.some(action=>action.command==='transition.apply'),false,instruction);
 for(const instruction of ['Take over but do not change the music','Take over without fades','Take over and never change audio'])assert.equal(Director.localPlan(instruction,fixture(),context).actions.some(action=>action.command==='audio.fade'),false,instruction);
 for(const instruction of ['Take over but do not make it cinematic','Take over without a cinematic filter','Take over and never apply cinematic'])assert.equal(Director.localPlan(instruction,fixture(),context).actions.some(action=>action.command==='visual.filter'),false,instruction);
 const terminal=fixture();terminal.clips=[terminal.clips[0]];assert.equal(Director.localPlan('Do not trim the opening to 3 seconds',terminal,context).actions.some(action=>action.command==='clip.trim'),false);
 assert.deepEqual(Director.localPlan('Take over and add transitions only',fixture(),context).actions.map(action=>action.command),['transition.apply']);
 assert.deepEqual(Director.localPlan('Take over and fade music only',fixture(),context).actions.map(action=>action.command),['audio.fade']);
});
test('Director signatures detect timeline, track and source changes without retaining large media in the signature',()=>{
 const state=fixture();state.mediaAssets[0].url='data:image/png;base64,'+'a'.repeat(100000);const first=Director.signature(state);assert(first.length<3000);assert.equal(Director.signature(state),first);
 state.mediaAssets[0].url=state.mediaAssets[0].url.slice(0,50000)+'b'+state.mediaAssets[0].url.slice(50001);assert.notEqual(Director.signature(state),first);
 const next=Director.signature(state);state.clips[0].start=1;assert.notEqual(Director.signature(state),next);
});
