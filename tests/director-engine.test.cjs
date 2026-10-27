const test=require('node:test'),assert=require('node:assert/strict');
const {ZorifiVanessaDirectorEngine:Director,analyzeProjectContext,classifyIntent,skillLevelFromInput}=require('../zorifi-director-engine.js');

function clock(){
 let time=0,id=0;const pending=new Map();
 return {now:()=>time,setTimeout(fn,delay){const token=++id;pending.set(token,{fn,at:time+delay});return token;},clearTimeout(token){pending.delete(token);},advance(ms){const target=time+ms;for(;;){const due=[...pending].sort((a,b)=>a[1].at-b[1].at).find(([,job])=>job.at<=target);if(!due)break;pending.delete(due[0]);time=due[1].at;due[1].fn();}time=target;},get size(){return pending.size;}};
}
const project=()=>({projectId:'one',duration:30,playing:false,clips:[{id:'late',type:'video',mediaId:'source',start:12,duration:8,track:0,sourceStart:3},{id:'early',type:'video',mediaId:'source',start:0,duration:3,track:0},{id:'audio',type:'audio',start:0,duration:14,track:1001}],mediaAssets:[{id:'source',type:'video',duration:25}]});

test('project context uses timeline order, actual audio clips and source bounds without claiming content analysis',()=>{
 const state=project(),analysis=analyzeProjectContext(state);
 assert.equal(analysis.openingClip.id,'early');assert.equal(analysis.openingClip.duration,3);assert.equal(analysis.pacing,'measured_durations');assert.equal(analysis.pacingEvidence.semanticAnalysis,false);assert.equal(analysis.hasAudio,true);assert.equal(analysis.trackCount,2);assert.deepEqual(analysis.gaps,[{start:3,end:12,duration:9}]);assert.equal(analysis.clips.find(clip=>clip.id==='late').sourceEnd,11);
 state.clips=state.clips.filter(clip=>clip.type!=='audio');state.tracks=new Set([1,2]);assert.equal(analyzeProjectContext(state).hasAudio,false);
 state.clips.find(clip=>clip.id==='early').duration=8;assert.equal(analyzeProjectContext(state).pacing,'long_opening');assert.equal(state.clips[1].duration,8);
 state.clips[0].sourceStart=24;assert.equal(analyzeProjectContext(state).clips[0].withinSourceBounds,false);
});

test('only direct takeover requests authorize editing and jargon never labels an editor a professional',()=>{
 for(const input of ['Take over','Please take over my edit','Hey Vanessa, can you help me edit this?','Edit it','Make this video look professional'])assert.equal(classifyIntent(input),'takeover',input);
 for(const input of ['What happens when you take over?','Explain director mode','Do not take over my project','I wonder if you can edit it','How can you take over?'])assert.notEqual(classifyIntent(input),'takeover',input);
 assert.equal(classifyIntent('Guide me through the timeline'),'guidance');assert.equal(classifyIntent('How do I trim a clip?'),'guidance');assert.equal(classifyIntent('What should I do next?'),'guidance');
 assert.equal(skillLevelFromInput('Add keyframes and check the vectorscope'),'unknown');assert.equal(skillLevelFromInput("I'm a beginner"),'beginner');assert.equal(skillLevelFromInput('I am an experienced video editor'),'professional');assert.equal(skillLevelFromInput('Make this professional','beginner'),'beginner');
});

test('director delegates real editing with a scope guard and never fabricates state changes',async()=>{
 const state=project(),before=structuredClone(state),events=[],calls=[];
 const director=new Director(()=>state,{}, {getScope:()=>({userId:'person'}),isCurrent:scope=>scope.userId==='person',onProgress:event=>events.push(event.stage),execute:async request=>{calls.push(request);request.checkCurrent();request.report('validating','Validated supported tools.');return {status:'AWAITING_CONFIRMATION',message:'Review this edit.'};},guide:request=>({reply:`There are ${request.analysis.visualClipCount} visual clips.`}),converse:()=>({reply:'Hello.'})});
 assert.equal((await director.handleUserRequest('Take over my edit')).status,'AWAITING_CONFIRMATION');assert.deepEqual(state,before);assert.equal(director.currentMode,'director');assert.equal(director.isEditingMode,false);assert.equal(director.busy,false);assert.deepEqual(events,['planning','validating','awaiting-confirmation']);assert.equal(calls[0].signal.aborted,false);
 assert.match((await director.handleUserRequest('How do I trim?')).reply,/2 visual/);assert.equal((await director.handleUserRequest('Hello')).reply,'Hello.');
});

test('cancellation settles promptly, rejects concurrent edits and prevents late hook writes',async()=>{
 const state=project();let finish,request;
 const director=new Director(state,{}, {execute:context=>{request=context;return new Promise(resolve=>finish=resolve);}});
 const pending=director.handleUserRequest('Take over');await assert.rejects(director.handleUserRequest('Take over'),/already/);assert.equal(director.isEditingMode,true);assert.equal(director.cancel(),true);await assert.rejects(pending,{name:'AbortError'});assert.equal(director.busy,false);assert.equal(director.isEditingMode,false);assert.throws(()=>request.checkCurrent(),{name:'AbortError'});finish({status:'SUCCESS'});await Promise.resolve();
 const controller=new AbortController();controller.abort();await assert.rejects(director.handleUserRequest('Take over',{signal:controller.signal}),{name:'AbortError'});assert.equal(director.busy,false);
});

test('project replacement, account changes and disposal invalidate pending results',async()=>{
 for(const change of ['project','account','dispose']){
  let state=project(),user='first',finish,request;const events=[];
  const director=new Director(()=>state,{}, {getScope:()=>({user}),isCurrent:scope=>scope.user===user,onProgress:event=>events.push(event.stage),execute:context=>{request=context;return new Promise(resolve=>finish=resolve);}});
  const pending=director.handleUserRequest('Edit it');if(change==='project')state={...state,projectId:'two'};else if(change==='account')user='second';else director.dispose();
  finish({status:'SUCCESS'});await assert.rejects(pending,{name:'AbortError'});assert.throws(()=>request.checkCurrent(),{name:'AbortError'});assert.equal(director.isEditingMode,false);assert.equal(events.includes('complete'),false);
 }
});

test('idle help waits 15 seconds, ignores playback and prompts once per interaction with a cooldown',()=>{
 const time=clock(),state=project(),prompts=[];let allowed=true;
 const director=new Director(state,{}, {clock:time,canPrompt:()=>allowed,onIdle:value=>prompts.push(value)});
 assert.equal(time.size,0);director.start();time.advance(14999);assert.equal(prompts.length,0);time.advance(1);assert.equal(prompts.length,1);time.advance(180000);assert.equal(prompts.length,1);
 state.playing=true;director.recordInteraction();time.advance(15000);assert.equal(prompts.length,1);state.playing=false;time.advance(10000);assert.equal(prompts.length,2);
 director.recordInteraction();time.advance(15000);assert.equal(prompts.length,2);time.advance(180000);assert.equal(prompts.length,3);
 allowed=false;director.recordInteraction();time.advance(190000);assert.equal(prompts.length,3);allowed=true;time.advance(10000);assert.equal(prompts.length,4);
 director.dispose();assert.equal(time.size,0);time.advance(400000);assert.equal(prompts.length,4);assert.equal(director.isActive,false);assert.throws(()=>director.start(),/closed/);
});

test('lifecycle hooks initialize once, clean up and never create a second speech recognizer',()=>{
 const time=clock(),calls=[];const director=new Director(project(),{}, {clock:time,initDOMUI:()=>{calls.push('ui');return ()=>calls.push('remove-ui');},initVoiceWakeWord:()=>{calls.push('wake-bridge');return ()=>calls.push('remove-wake');},onSpeak:text=>calls.push(text),toggleChatPanel:()=>calls.push('open-chat')});
 director.start().start();assert.deepEqual(calls,['ui','wake-bridge']);assert.equal(director.recognition,null);director.speak('Ready.');director.openChatAndListen();director.stop();assert.deepEqual(calls,['ui','wake-bridge','Ready.','open-chat','remove-ui','remove-wake']);assert.equal(time.size,0);director.start();director.dispose();assert.equal(time.size,0);
});
