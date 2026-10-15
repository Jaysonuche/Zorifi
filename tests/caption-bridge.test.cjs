const test=require('node:test');
const assert=require('node:assert/strict');
const {ZorifiAutoCaptionsEngine:Engine,ZorifiCaptionEditorBridge:Bridge}=require('../zorifi-phase8.js');
function state(){return {projectId:'p',captionSettings:{language:'en'},duration:12,mediaAssets:[{id:'m',file:new Blob(['audio'])}],clips:[{id:'source',mediaId:'m',type:'audio',start:10,duration:2,sourceStart:1,playbackRate:2,track:1},{id:'other',type:'text',autoCaption:true,autoCaptionSourceId:'other-source',name:'Other speech',start:0,duration:1,track:2},{id:'translated',type:'text',autoCaption:true,autoCaptionSourceId:'source',translatedFromId:'old',name:'Bonjour',start:10,duration:1,track:200}]};}
const segments=[{start:0,end:2,text:'First words',words:[{text:'First',start:0,end:1.5},{text:'words',start:1.5,end:2}]},{start:4,end:6,text:'Last words'}];
test('bridge loads actual files, maps source times and replaces only original captions of that source',async()=>{
 const project=state();let snapshots=0;
 const engine=new Engine({transcribe:async(audio)=>{assert.equal(audio,project.mediaAssets[0].file);return {captions:segments};}});
 const bridge=new Bridge(project,engine,{beforeApply:()=>snapshots++});const list=await bridge.generateForSelectedClip('source');bridge.applyCaptionsToEditingTimeline(list);
 const generated=project.clips.filter(c=>c.autoCaptionSourceId==='source'&&!c.translatedFromId);
 assert.equal(generated[0].start,10);assert.equal(generated[0].duration,.5);assert.equal(generated[0].captionWords[0].start,10);assert.equal(generated[1].start,11.5);assert.equal(generated[1].duration,.5);
 assert.ok(project.clips.some(c=>c.id==='other'));assert.ok(project.clips.some(c=>c.id==='translated'));
 bridge.applyCaptionsToEditingTimeline(list);assert.equal(project.clips.length,5);assert.equal(snapshots,2);
 const srt=bridge.exportTimelineCaptionsToSRT({originalsOnly:true});assert.ok(srt.includes('First words'));assert.ok(!srt.includes('Bonjour'));assert.ok(srt.indexOf('Other speech')<srt.indexOf('First words'));
});
test('URL media fallback passes abort signal and rejects empty media',async()=>{
 const project=state();project.mediaAssets=[{id:'m',url:'blob:source'}];const controller=new AbortController();
 const engine=new Engine({transcribe:async()=>({captions:segments})});
 const bridge=new Bridge(project,engine,{fetchMedia:async(url,{signal})=>{assert.equal(url,'blob:source');assert.equal(signal,controller.signal);return {ok:true,blob:async()=>new Blob(['audio'])};}});
 await bridge.generateForSelectedClip('source',{signal:controller.signal});
 bridge.fetchMedia=async()=>({ok:true,blob:async()=>new Blob([])});await assert.rejects(bridge.generateForSelectedClip('source'),/empty/);
});
test('source edits during transcription and before apply reject without changing captions',async()=>{
 const project=state();let finish;const bridge=new Bridge(project,new Engine({transcribe:()=>new Promise(resolve=>finish=resolve)}));
 const result=bridge.generateForSelectedClip('source');project.clips[0].start=11;finish({captions:segments});await assert.rejects(result,/changed/);assert.equal(project.clips.length,3);
 bridge.captionEngine.transcribe=async()=>({captions:segments});const list=await bridge.generateForSelectedClip('source');project.projectId='another';assert.throws(()=>bridge.applyCaptionsToEditingTimeline(list),/changed/);assert.equal(project.clips.length,3);
});
test('invalid captions, empty cleanup and unsupported styles preserve the existing timeline',async()=>{
 const project=state(),bridge=new Bridge(project,new Engine({transcribe:async()=>({captions:segments})}));await bridge.generateForSelectedClip('source');const before=JSON.stringify(project.clips);
 assert.throws(()=>bridge.applyCaptionsToEditingTimeline([{start:1,end:NaN,text:'bad'}]));
 assert.throws(()=>bridge.applyCaptionsToEditingTimeline(segments,'unknown'));
 project.captionSettings.removeFillers=true;assert.throws(()=>bridge.applyCaptionsToEditingTimeline([{start:1,end:2,text:'um uh'}]),/No speech/);
 assert.equal(JSON.stringify(project.clips),before);
});
