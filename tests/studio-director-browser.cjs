const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

function wav(){
 const frames=96000,body=Buffer.alloc(44+frames*2);body.write('RIFF');body.writeUInt32LE(body.length-8,4);body.write('WAVEfmt ',8);body.writeUInt32LE(16,16);body.writeUInt16LE(1,20);body.writeUInt16LE(1,22);body.writeUInt32LE(48000,24);body.writeUInt32LE(96000,28);body.writeUInt16LE(2,32);body.writeUInt16LE(16,34);body.write('data',36);body.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)body.writeInt16LE(Math.round(Math.sin(2*Math.PI*220*i/48000)*3000),44+i*2);return body;
}

(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const [engine,name] of [[chromium,'Chromium'],[webkit,'WebKit']]){
  const browser=await engine.launch({headless:true,...(name==='Chromium'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
  try{
   const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];let mode='ok',musicRequests=0;
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('https://media.test/**',route=>route.fulfill({status:mode==='download-failed'?503:200,headers:{'access-control-allow-origin':'*'},contentType:'audio/wav',body:mode==='invalid-audio'?Buffer.alloc(100):wav()}));
   await page.route('**/api/**',route=>{
    const url=new URL(route.request().url()),service=url.searchParams.get('service');
    if(url.pathname==='/api/ai-settings')return route.fulfill({json:{configurations:{music:{provider:'Gemini Lyria Clip',configured:true}}}});
    if(service==='vanessa-scenes')return route.fulfill({json:{plan:{scenes:[{id:'opening',purpose:'Opening',mediaIds:['photo'],duration:2,transition:'none',effects:[],text:'Opening'},{id:'close',purpose:'Closing',mediaIds:['photo'],duration:2,transition:'dissolve',effects:[],text:''}]}}});
    if(service==='vanessa-music'){musicRequests++;return route.fulfill({json:{status:mode==='provider-failed'?'failed':'complete',...(mode==='provider-failed'?{error:'Provider unavailable'}:{audioUrl:'https://media.test/score.wav',mimeType:'audio/wav',duration:30,requestId:'music-request'})}});}
    return route.continue();
   });
   await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});
   await page.locator('.zorifi-opening').waitFor({state:'detached'});await page.waitForFunction(()=>!!window.ZorifiMasterApp?.studioDirector);
   await page.evaluate(()=>{
    window.directorOriginalHooks={...ZorifiMasterApp.studioDirector.hooks};
    window.setupDirectorFixture=()=>{
     currentUser={id:'studio-director-test',name:'Studio Director Test',email:'director@example.test'};syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
     createNewProject();state.creatorSettings.addZorifiEnding=false;state.mediaAssets=[{id:'photo',name:'Photo',type:'image',duration:5,width:100,height:100,url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="purple"/></svg>'}];
     state.clips=[{id:'manual',mediaId:'photo',name:'Manual clip',type:'image',track:0,start:0,duration:3,opacity:100,scale:100,volume:0}];state.currentTime=1;state.selected='manual';state.duration=3;state.undo=[];state.redo=[];
     ZorifiPrivacy.setConsent(localStorage,currentUser.id,true);ZorifiMasterApp.studioDirector.hooks={...directorOriginalHooks};render();
    };
    setupDirectorFixture();
   });
   if(!await page.evaluate(()=>Boolean(window.AudioContext||window.webkitAudioContext))){
    // The Windows Playwright WebKit build omits Web Audio entirely. Exercise
    // real scene commits and the honest unsupported-device path there; actual
    // WAV decoding and persistence are verified in Chromium below.
    const video=await page.evaluate(async()=>{const first=await ZorifiMasterApp.executeDirectorCommand('Create a cinematic montage');const count=state.clips.length;await ZorifiMasterApp.executeDirectorCommand('Create a cinematic montage');const result={type:first.type,count,secondCount:state.clips.length,undo:state.undo.length,time:state.currentTime,manual:state.clips[0].id,transition:state.clips.find(clip=>clip.sceneId==='close'&&clip.type==='image').transition};undo();return {...result,afterUndo:state.clips.length};});
    assert.equal(video.type,'video_planned');assert(video.secondCount>video.count);assert.equal(video.afterUndo,video.count);assert.equal(video.undo,2);assert.equal(video.time,1);assert.equal(video.manual,'manual');assert.equal(video.transition,'dissolve');
    const unavailable=await page.evaluate(async()=>{setupDirectorFixture();let message;try{await ZorifiMasterApp.executeDirectorCommand('Generate a soundtrack');}catch(error){message=error.message;}return {message,undo:state.undo.length,clips:state.clips.length};});
    assert.match(unavailable.message,/decoding.*supported/i);assert.equal(unavailable.undo,0);assert.equal(unavailable.clips,1);assert.deepEqual(errors,[]);await context.close();console.log(`${name}: real scene appends, transitions, Undo and playhead preservation passed; unavailable Web Audio rejects soundtrack insertion without changing the project.`);continue;
   }
   const combined=await page.evaluate(async()=>{
    const result=await ZorifiMasterApp.executeDirectorCommand('Create a cinematic montage with an upbeat synthwave soundtrack'),audio=state.clips.find(clip=>clip.studioDirected),asset=state.mediaAssets.find(item=>item.id===audio.mediaId),stored=await getProjectMedia(state.projectId,asset.id);
    const before={type:result.type,clips:state.clips.length,undo:state.undo.length,manual:state.clips[0].id,time:state.currentTime,workspace:editorWorkspaceMode,audioDuration:audio.duration,sourceDuration:asset.duration,audioStart:audio.start,persisted:stored.size>44,transition:state.clips.find(clip=>clip.sceneId==='close'&&clip.type==='image').transition,tracks:state.clips.filter(clip=>clip.sceneGenerated&&clip.type==='image').map(clip=>clip.track)};
    undo();return {...before,afterUndo:state.clips.map(clip=>clip.id)};
   });
   assert.equal(combined.type,'studio_directed');assert.equal(combined.undo,1);assert.equal(combined.manual,'manual');assert.equal(combined.time,1);assert.equal(combined.workspace,'video');assert.equal(combined.sourceDuration,2);assert.equal(combined.audioDuration,2);assert.equal(combined.audioStart,3);assert.equal(combined.persisted,true);assert.equal(combined.transition,'dissolve');assert.deepEqual(combined.tracks,[0,0]);assert.deepEqual(combined.afterUndo,['manual']);

   const ending=await page.evaluate(async()=>{setupDirectorFixture();state.creatorSettings.addZorifiEnding=true;const original=ensureZorifiEnding(),originalStart=original.start;original.keyframes={opacity:[{time:original.start,value:0},{time:original.start+1,value:100}]};await ZorifiMasterApp.executeDirectorCommand('Create a cinematic montage');const placed=state.clips.find(clip=>clip.zorifiEnding);return {start:placed.start,originalStart,originalUnchanged:original.start===originalStart,frameTime:placed.keyframes.opacity[0].time,tracks:state.clips.filter(clip=>clip.sceneGenerated&&clip.type==='image').map(clip=>clip.track),undo:state.undo.length};});
   assert.equal(ending.start,7);assert.equal(ending.frameTime,7);assert.equal(ending.originalStart,3);assert(ending.originalUnchanged);assert.deepEqual(ending.tracks,[0,0]);assert.equal(ending.undo,1);

   const observer=await page.evaluate(async()=>{setupDirectorFixture();const originalRender=render;render=()=>{throw new Error('Test view observer failure');};try{const result=await ZorifiMasterApp.executeDirectorCommand('Create a cinematic montage');return {type:result.type,clips:state.clips.length,undo:state.undo.length,status:ZorifiMasterApp.directorStatus.stage};}finally{render=originalRender;render();}});
   assert.equal(observer.type,'video_planned');assert(observer.clips>1);assert.equal(observer.undo,1);assert.equal(observer.status,'complete');

   const musicOnly=await page.evaluate(async()=>{
    setupDirectorFixture();editorWorkspaceMode='music';state.creatorSettings.workspaceMode='music';state.trackStates[1]={locked:true};render();const result=await ZorifiMasterApp.executeDirectorCommand('Generate upbeat music at 128 BPM');const clip=state.clips.find(item=>item.studioDirected);return {type:result.type,mode:editorWorkspaceMode,time:state.currentTime,start:clip.start,duration:clip.duration,track:clip.track,kind:ZorifiTimelineTracks.kind(clip.track),undo:state.undo.length};
   });
   assert.equal(musicOnly.type,'music_generated');assert.equal(musicOnly.mode,'music');assert.equal(musicOnly.time,1);assert.equal(musicOnly.start,1);assert.equal(musicOnly.duration,2);assert.equal(musicOnly.kind,'audio');assert.notEqual(musicOnly.track,1);assert.equal(musicOnly.undo,1);

   for(const failure of ['provider-failed','download-failed','invalid-audio']){
    mode=failure;
    const result=await page.evaluate(async()=>{setupDirectorFixture();try{await ZorifiMasterApp.executeDirectorCommand('Create a cinematic montage with a soundtrack');return {unexpected:true};}catch(error){return {message:error.message,clips:state.clips.map(item=>item.id),undo:state.undo.length,generated:state.mediaAssets.filter(item=>item.generated).length,status:ZorifiMasterApp.directorStatus.stage};}});
    assert.equal(result.unexpected,undefined,failure);assert.deepEqual(result.clips,['manual'],failure);assert.equal(result.undo,0,failure);assert.equal(result.generated,0,failure);assert.equal(result.status,'failed',failure);
   }
   mode='ok';
   const cancelled=await page.evaluate(async()=>{
    setupDirectorFixture();let resolve;ZorifiMasterApp.studioDirector.hooks.generateMusic=()=>new Promise(done=>resolve=done);
    const pending=ZorifiMasterApp.executeDirectorCommand('Generate an upbeat soundtrack').then(()=>({unexpected:true}),error=>({message:error.message}));await Promise.resolve();ZorifiMasterApp.cancelDirectorCommand();resolve({status:'complete',url:'https://media.test/score.wav'});const result=await pending;return {...result,clips:state.clips.length,undo:state.undo.length,status:ZorifiMasterApp.directorStatus.stage};
   });
   assert.equal(cancelled.unexpected,undefined);assert.equal(cancelled.clips,1);assert.equal(cancelled.undo,0);assert.equal(cancelled.status,'cancelled');

   const stale=await page.evaluate(async()=>{
    setupDirectorFixture();let staged;ZorifiMasterApp.studioDirector.hooks.prepareMusic=async(...args)=>{staged=await ZorifiMasterApp.prepareDirectorMusic(...args);currentUser={id:'another-account',name:'Other'};state.projectId='another-project';return staged;};
    let message;try{await ZorifiMasterApp.executeDirectorCommand('Generate a soundtrack');}catch(error){message=error.message;}
    const db=await openMediaDatabase(),records=await new Promise(resolve=>{const request=db.transaction(MEDIA_STORE_NAME,'readonly').objectStore(MEDIA_STORE_NAME).getAll();request.onsuccess=()=>resolve(request.result);});let revoked=false;try{await fetch(staged.asset.url);}catch{revoked=true;}
    return {message,clips:state.clips.map(item=>item.id),undo:state.undo.length,stagingRemoved:!records.some(record=>record.assetId===staged.asset.id),revoked};
   });
   assert.match(stale.message,/account|project/i);assert.deepEqual(stale.clips,['manual']);assert.equal(stale.undo,0);assert(stale.stagingRemoved&&stale.revoked,JSON.stringify(stale));

   const busy=await page.evaluate(async()=>{
    setupDirectorFixture();let resolve;ZorifiMasterApp.studioDirector.hooks.generateMusic=()=>new Promise(done=>resolve=done);const first=ZorifiMasterApp.executeDirectorCommand('Generate music').catch(error=>error.message);await Promise.resolve();let message;try{await ZorifiMasterApp.executeDirectorCommand('Generate music');}catch(error){message=error.message;}ZorifiMasterApp.cancelDirectorCommand();resolve({status:'complete',url:'https://media.test/score.wav'});await first;return {message,clips:state.clips.length};
   });
   assert.match(busy.message,/already/);assert.equal(busy.clips,1);assert(musicRequests>=5);
   const chat=await page.evaluate(async()=>{setupDirectorFixture();vanessaVoiceEnabled=false;vanessaHistory=[];vanessaBusy=false;await sendToVanessa('Create a cinematic montage with an upbeat synthwave soundtrack');return {reply:vanessaHistory.at(-1)?.text,status:vanessaHistory.at(-1)?.actionStatus,audio:state.clips.filter(clip=>clip.studioDirected).length,undo:state.undo.length,busy:vanessaBusy};});
   assert.match(chat.reply,/Added.*scenes.*soundtrack/);assert.equal(chat.status,'SUCCESS');assert.equal(chat.audio,1);assert.equal(chat.undo,1);assert.equal(chat.busy,false);
   const legacyAction=await page.evaluate(async()=>{setupDirectorFixture();const reply=await executeVanessaAction('ai_generate_music',{value:'upbeat synthwave at 128 BPM'});return {reply,audio:state.clips.filter(clip=>clip.studioDirected).length,undo:state.undo.length,capability:vanessaEditorContext().capabilities.studioDirector.combinedSceneAndSoundtrack};});assert.match(legacyAction.reply,/generated Synthwave music/);assert.equal(legacyAction.audio,1);assert.equal(legacyAction.undo,1);assert.equal(legacyAction.capability,true);
   const esm=await page.evaluate(async()=>{const direct=await import('./ZorifiVanessaStudioDirector.js'),legacy=await import('./ZorifiVanessaStudioCore.js');return {direct:typeof direct.ZorifiVanessaStudioDirector,legacy:typeof legacy.ZorifiVanessaStudioDirector,gateway:typeof legacy.ZorifiAIProviderGateway.prototype.requestGeneration,method:typeof direct.ZorifiVanessaStudioDirector.prototype.executeDirectorCommand};});assert.deepEqual(esm,{direct:'function',legacy:'function',gateway:'function',method:'function'});
   assert.deepEqual(errors,[]);
   await context.close();console.log(`${name}: unified director passed mixed scenes/music, one Undo, real decoded WAV persistence, transition retention, unlocked tracks, workspace/playhead preservation, failures, cancellation, stale-account cleanup and busy guards.`);
  }finally{await browser.close();}
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
