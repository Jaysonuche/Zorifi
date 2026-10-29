const test=require('node:test'),assert=require('node:assert/strict');
const Engine=require('../zorifi-vanessa-professional-engine.js');
const project={clips:[{id:'shot',type:'video',start:0,duration:8,track:0,keyframes:{}},{id:'ending',type:'video',start:8,duration:2.4,track:0,zorifiEnding:true}],trackStates:{},undo:[],redo:[]};
const action=(command,parameters={},target='shot')=>({command,target,parameters});
test('open-ended creative delegation is recognized without treating questions or review-only instructions as permission',()=>{
 for(const text of ['Vanessa, help me with this edit','Hey Vanessa help me improve this video','Could you help me polish my project?','Improve this video','Make this edit more professional','Take the lead on this video'])assert.equal(Engine.delegatedRequest(text),true,text);
 for(const text of ['What is a cinematic edit?','How can you improve this video?','Explain how to improve this video','Improve this video but only suggest changes','Improve this video; ask me first','Make cinematic music','Add a title','Help with my account'])assert.equal(Engine.delegatedRequest(text),false,text);
});
test('title ranges and local section timing cannot become the whole project duration',()=>{
 for(const text of ['Add a title from 1 to 4 seconds','Improve the first five seconds','Trim the selected clip to 3 seconds','Apply a grade at 8 seconds'])assert.equal(Engine.requestedDuration(text),null,text);
 for(const [text,duration]of [['Create a premium 45-second cinematic fashion commercial',45],['Make a 30 second video',30],['Target duration: 20 seconds',20],['A video lasting 60 seconds',60]])assert.equal(Engine.requestedDuration(text),duration,text);
});
test('automatic pass permits useful bounded local adjustments after validation',()=>{
 const plan=[action('visual.adjust',{property:'contrast',value:8}),action('visual.filter',{id:'cinematic',intensity:35}),action('keyframe.animation',{preset:'zoom_in',from:100,to:104,duration:8}),action('audio.fade',{in:.2,out:.3})];
 assert.equal(Engine.delegationSafety(plan,project,{beforeReview:{issues:[]},afterReview:{issues:[]}}).automatic,true);
});
test('destructive, source/timing, new content, strong changes and unsupported actions always need confirmation',()=>{
 for(const change of [action('clip.delete'),action('clip.trim',{duration:4}),action('clip.move',{start:1,track:0}),action('clip.set',{property:'scale',value:120}),action('text.add',{id:'title',text:'Buy now'}),action('visual.mask',{shape:'circle'}),action('visual.filter',{id:'cinematic',intensity:80}),action('visual.adjust',{property:'exposure',value:30}),action('audio.music_generate'),action('eval')])assert.equal(Engine.delegationSafety([change],project).automatic,false,change.command);
 assert.equal(Engine.delegationSafety([action('visual.adjust',{property:'contrast',value:8},'ending')],project).automatic,false);
 assert.equal(Engine.delegationSafety([action('keyframe.animation',{preset:'zoom_in',from:100,to:104,duration:8})],{...project,clips:[{...project.clips[0],keyframes:{scale:[{time:0,value:100}]}}]}).automatic,false);
});
test('new technical warnings force review, existing measured warnings do not manufacture failure',()=>{
 const actions=[action('visual.adjust',{property:'contrast',value:8})],warning={code:'audio_headroom',clipId:'shot',severity:'warning'};
 assert.equal(Engine.delegationSafety(actions,project,{beforeReview:{issues:[]},afterReview:{issues:[warning]}}).automatic,false);
 assert.equal(Engine.delegationSafety(actions,project,{beforeReview:{issues:[warning]},afterReview:{issues:[warning]}}).automatic,true);
});
test('history context is bounded actual change counts, never full prior project contents',()=>{
 const result=Engine.historySummary({...project,undo:[{clips:[]},{clips:[{...project.clips[0],name:'Private project words'}]}],redo:[{}]});
 assert.deepEqual(result,{undoDepth:2,redoDepth:1,recentChanges:[{added:1,removed:0,modified:0},{added:1,removed:0,modified:1}]});assert(!JSON.stringify(result).includes('Private project words'));
});
