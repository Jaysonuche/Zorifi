const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const window={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../zorifi-scenes.js'),'utf8'),{window});
const {ZorifiScenePlanner,ZorifiScenes}=window;
test('planner accepts mediaItems and creates a commercial structure with derived duration',()=>{
 const planner=new ZorifiScenePlanner();const plan=planner.createScenePlan({prompt:'Introduce our product',direction:'commercial',mediaItems:[{id:'photo',type:'image'}]});
 assert.equal(planner.currentPlan,plan);assert.equal(plan.direction,'commercial');assert.equal(plan.scenes[3].purpose,'Call to Action');
 assert.equal(plan.totalDuration,plan.scenes.reduce((sum,s)=>sum+s.duration,0));
 const next=ZorifiScenes.applyPlanOperation(plan,{type:'set_scene_duration',target:{sceneId:plan.scenes[0].id},parameters:{duration:8}},{mediaIds:['photo']});
 assert.equal(next.totalDuration,next.scenes.reduce((sum,s)=>sum+s.duration,0));
 assert.throws(()=>planner.createScenePlan({prompt:'No assets'}),/Select/);
});
test('legacy scene fields validate without mutating input or substituting missing media',()=>{
 const planner=new ZorifiScenePlanner(),plan={scenes:[{title:'Opening',mediaId:'photo',duration:3}]};
 const valid=planner.validateScenePlan(plan,{mediaIds:['photo']});assert.equal(valid.scenes[0].purpose,'Opening');assert.equal(valid.scenes[0].mediaIds[0],'photo');assert.equal(plan.scenes[0].purpose,undefined);
 assert.throws(()=>planner.validateScenePlan(plan,{mediaIds:['different']}),/available media/);
});
test('timeline application appends typed clips with numeric tracks and unique IDs',()=>{
 const planner=new ZorifiScenePlanner(),state={clips:[{id:'manual',start:2,duration:8,track:0}],mediaAssets:[{id:'photo',type:'image'},{id:'video',type:'video',duration:9}],duration:10};
 const plan={scenes:[{title:'Photo',mediaId:'photo',duration:3},{title:'Footage',mediaId:'video',duration:4}]};
 planner.applyToTimeline(state,plan);assert.equal(state.clips[1].type,'image');assert.equal(state.clips[1].start,10);assert.equal(state.clips[2].start,13);assert.equal(state.duration,17);
 planner.applyToTimeline(state,plan);assert.equal(state.clips[3].start,17);assert.equal(new Set(state.clips.map(c=>c.id)).size,5);assert.ok(state.clips.every(c=>Number.isInteger(c.track)));
});
test('invalid footage or timing fails atomically before changing a project',()=>{
 const planner=new ZorifiScenePlanner(),state={clips:[],mediaAssets:[{id:'photo',type:'image'},{id:'short',type:'video',duration:1}],duration:0};
 const original=JSON.stringify(state);
 assert.throws(()=>planner.applyToTimeline(state,{scenes:[{mediaId:'photo',duration:3},{mediaId:'short',duration:5}]}),/source video/);
 assert.equal(JSON.stringify(state),original);
 for(const duration of [NaN,Infinity,-1,0])assert.throws(()=>planner.applyToTimeline(state,{scenes:[{mediaId:'photo',duration}]}),/finite duration/);
 assert.equal(JSON.stringify(state),original);
});
