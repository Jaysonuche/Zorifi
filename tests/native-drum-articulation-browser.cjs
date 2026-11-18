// Offline identity fixture; native notes, synthesis, history and persistence are real.
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright'),{createServer}=require('../scripts/dev-server.cjs');
(async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors=[];let cloudCalls=0;
    page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/**',route=>{if(route.request().method()==='POST')cloudCalls++;return route.fulfill({status:401,json:{error:'Offline drum articulation test'}});});
    await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.zorifi-opening').waitFor({state:'detached'});
    const saved=await page.evaluate(async()=>{
      currentUser={id:'drum-articulation',cloudUid:'drum-articulation-cloud',name:'Drum articulation fixture'};localStorage.setItem(ACCOUNTS_KEY,JSON.stringify([currentUser]));localStorage.setItem(SESSION_KEY,currentUser.id);
      firebaseGateway.config={apiKey:'fixture',projectId:'fixture'};firebaseGateway.session={uid:'drum-articulation-cloud',idToken:'fixture',refreshToken:'fixture',expiresAt:Date.now()+3600000};syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();ZorifiPrivacy.setConsent(localStorage,currentUser.id,true);
      createMusicProject();state.creatorSettings.addZorifiEnding=false;state.clips=[];state.mediaAssets=[];state.currentTime=0;state.undo=[];state.redo=[];
      await ZorifiNativeMusicWorkspace.compose({duration:5,bpm:120,key:'C',genre:'Pop',selectedInstruments:['piano'],rhythm:'four-on-floor'});const clip=state.clips.find(c=>c.musicPattern?.instrument==='kick');
      await ZorifiNativeMusicWorkspace.execute({command:'music.native.edit',target:clip.id,parameters:{edit:{operation:'add',note:{id:'independent-off-grid',start:.53,duration:.07,pitch:36,velocity:.4}}}},{confirmed:true});state.selected=clip.id;render();
      return{project:state.projectId,clip:clip.id,pattern:structuredClone(clip.musicPattern),undo:state.undo.length};
    });
    await page.locator('[data-native-notes="'+saved.clip+'"]').click();await page.locator('[data-native-step-index]').fill('5');await page.locator('[data-native-step-index]').dispatchEvent('change');await page.locator('[data-native-step-articulation]').selectOption('flam');await page.locator('[data-native-step-apply]').click();
    await page.waitForFunction(id=>!ZorifiNativeMusicWorkspace.inspect().busy&&state.clips.find(c=>c.id===id).musicPattern.revision>2,saved.clip);
    const manual=await page.evaluate(id=>{const clip=state.clips.find(c=>c.id===id);return{pattern:structuredClone(clip.musicPattern),grid:ZorifiNativeMusic.drumGrid(clip.musicPattern),undo:state.undo.length};},saved.clip);
    assert.equal(manual.grid.cells[4].articulation,'flam');assert.equal(manual.grid.cells[4].hits,2);assert.equal(manual.undo,saved.undo+1);assert.deepEqual(manual.pattern.notes.find(n=>n.id==='independent-off-grid'),saved.pattern.notes.find(n=>n.id==='independent-off-grid'));
    await page.locator('[data-native-pattern-dialog] [data-native-close]').first().click();await page.evaluate(()=>undo());assert.deepEqual(await page.evaluate(id=>state.clips.find(c=>c.id===id).musicPattern,saved.clip),saved.pattern);await page.evaluate(()=>redo());assert.deepEqual(await page.evaluate(id=>state.clips.find(c=>c.id===id).musicPattern,saved.clip),manual.pattern);
    const result=await page.evaluate(async()=>{
      const before=JSON.stringify(state.clips),proposal=await ZorifiEditorWorkflowBridge.turn('Set native drum step 5 of 16 in bar 1 at pitch 36 to 8-hit roll at 70% velocity');if(!proposal?.plan)throw Error('Missing reviewed articulation plan');
      if(JSON.stringify(state.clips)!==before)throw Error('Review changed source notes');const blocked=await ZorifiEditorWorkflowBridge.execute(proposal.plan,{confirmed:false});if(blocked.status!=='REQUIRES_CONFIRMATION')throw Error('Missing confirmation guard');
      return ZorifiEditorWorkflowBridge.execute(proposal.plan,{confirmed:true});
    });assert(result);
    const final=await page.evaluate(async id=>{
      const clip=state.clips.find(c=>c.id===id),file=await getProjectMedia(state.projectId,clip.mediaId),ctx=new AudioContext();
      try{const audio=await ctx.decodeAudioData(await file.arrayBuffer()),imported=ZorifiNativeMusic.parseMidi(ZorifiNativeMusic.midiFile([clip.musicPattern]));return{pattern:structuredClone(clip.musicPattern),grid:ZorifiNativeMusic.drumGrid(clip.musicPattern),undo:state.undo.length,audible:audio.getChannelData(0).some(value=>Math.abs(value)>.001),duration:audio.duration,midiNotes:imported.patterns.reduce((sum,p)=>sum+p.notes.length,0)};}finally{await ctx.close();}
    },saved.clip);
    assert.equal(final.grid.cells[4].articulation,'roll');assert.equal(final.grid.cells[4].hits,8);assert.equal(final.grid.cells[4].velocity,.7);assert.equal(final.undo,manual.undo+1);assert.equal(final.duration,5);assert(final.audible);assert.equal(final.midiNotes,final.pattern.notes.length);assert.deepEqual(final.pattern.notes.find(n=>n.id==='independent-off-grid'),saved.pattern.notes.find(n=>n.id==='independent-off-grid'));
    const trimmedMidi=await page.evaluate(id=>{
      const clip=state.clips.find(c=>c.id===id),before={sourceStart:clip.sourceStart,duration:clip.duration,playbackRate:clip.playbackRate},source=JSON.stringify(clip.musicPattern),original=ZorifiNativeMusic.midiFile;let exported;
      ZorifiNativeMusic.midiFile=patterns=>{exported=patterns.find(p=>p.instrument==='kick');return original(patterns);};
      try{clip.sourceStart=.52;clip.duration=2;clip.playbackRate=1.25;ZorifiNativeMusicWorkspace.exportMidi();return{sourceUnchanged:source===JSON.stringify(clip.musicPattern),allIndependent:exported.notes.every(n=>!n.drumStep),startsAtTrim:exported.notes.filter(n=>n.start===clip.start).length>=2,notes:exported.notes.length};}
      finally{Object.assign(clip,before);ZorifiNativeMusic.midiFile=original;}
    },saved.clip);assert(trimmedMidi.sourceUnchanged&&trimmedMidi.allIndependent&&trimmedMidi.startsAtTrim&&trimmedMidi.notes>8);
    await page.locator('[data-native-notes="'+saved.clip+'"]').click();await page.locator('[data-native-step-index]').fill('5');await page.locator('[data-native-step-index]').dispatchEvent('change');assert.equal(await page.locator('[data-native-step-articulation]').inputValue(),'roll');assert.equal(await page.locator('[data-native-step-hits]').inputValue(),'8');
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});const bounds=await page.locator('[data-native-pattern-dialog]').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('[data-native-step-apply]').click({trial:true});}
    await page.screenshot({path:'artifacts/native-drum-articulation-desktop.png'});await page.locator('[data-native-pattern-dialog] [data-native-close]').first().click();await page.evaluate(()=>saveProject());await page.reload();await page.locator('.zorifi-opening').waitFor({state:'detached'});await page.evaluate(async id=>{syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();await loadProject(getSavedProjects().find(p=>p.id===id));state.view='editor';editorWorkspaceMode='music';render();},saved.project);
    assert.deepEqual(await page.evaluate(id=>state.clips.find(c=>c.id===id).musicPattern,saved.clip),final.pattern);assert.deepEqual(errors,[]);assert.equal(cloudCalls,0);
    fs.writeFileSync('artifacts/native-drum-articulation-browser.json',JSON.stringify({manualFlam:true,reviewedVanessaRoll:true,confirmationGuard:true,independentOffGridPreserved:true,undoRedo:true,oneUndoPerEdit:true,decodedAudio:true,midiRetriggers:true,trimmedRateMidi:true,sourceReopened:true,widths:[320,390,768,1440],duration:final.duration,cloudCalls,errors},null,2));
    console.log('PASS: manual flam, reviewed Vanessa 8-hit roll, confirmation, source preservation, Undo/Redo, real 5s audio, MIDI, reopen and 320–1440px.');
  }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
