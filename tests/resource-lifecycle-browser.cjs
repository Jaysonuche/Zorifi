const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

function audioFixture(){
  const rate=8000,samples=rate*4,buffer=Buffer.alloc(44+samples*2);
  buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);
  buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
  buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);
  buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
  for(let sample=0;sample<samples;sample++)buffer.writeInt16LE(Math.round(Math.sin(sample*.2)*8000),44+sample*2);
  return buffer;
}

async function exercise(browserType,origin){
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser=await browserType.launch({headless:true,...(browserType===chromium&&fs.existsSync(edge)?{executablePath:edge}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900},serviceWorkers:'block'}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/vanessa-provider?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Provider calls are disabled in lifecycle tests."}'}));
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.locator('.zorifi-opening').waitFor({state:'detached'});
    await page.evaluate(()=>{
      currentUser={id:'resource-lifecycle',name:'Lifecycle Editor',email:'lifecycle@example.invalid'};
      syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
      createNewProject();state.creatorSettings.addZorifiEnding=false;
    });
    await page.locator('#file-picker').setInputFiles([
      {name:'lifecycle-image.png',mimeType:'image/png',buffer:fs.readFileSync(path.join(__dirname,'../icons/icon-192.png'))},
      {name:'lifecycle-audio.wav',mimeType:'audio/wav',buffer:audioFixture()}
    ]);
    await page.waitForFunction(()=>state.mediaAssets.filter(asset=>asset.name.startsWith('lifecycle-')).length===2);
    const prepared=await page.evaluate(()=>{
      const assets=state.mediaAssets.filter(asset=>asset.name.startsWith('lifecycle-'));
      assets.forEach(asset=>addMediaToTimeline(asset.id));
      window.lifecycleSources={projectId:state.projectId,urls:assets.map(asset=>asset.url),ids:assets.map(asset=>asset.id)};
      snapshot();state.currentProject='Final unsaved lifecycle edit';scheduleProjectSave(10000);
      return {persisted:assets.every(asset=>asset.persisted),missing:state.missingMedia,tracked:assets.every(asset=>editorResources.activeObjectURLs.has(asset.url)),history:state.undo.length};
    });
    if(browserType===chromium)assert.equal(prepared.persisted,true,'Fixture media should be stored locally');
    else assert.equal(prepared.missing,!prepared.persisted,'Unsupported Blob storage must be reported as session-only media');
    assert.equal(prepared.tracked,true,'Fixture previews should be tracked');
    assert.ok(prepared.history>0);

    const failedSave=await page.evaluate(()=>{
      const original=Storage.prototype.setItem,key=projectStorageKey();let message='';
      Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('Simulated full device storage','QuotaExceededError');return original.call(this,name,value);};
      try{createNewProject();}catch(error){message=error.message;}finally{Storage.prototype.setItem=original;}
      return {message,sameProject:state.projectId===lifecycleSources.projectId,assets:state.mediaAssets.length,tracked:lifecycleSources.urls.every(url=>editorResources.activeObjectURLs.has(url))};
    });
    assert.match(failedSave.message,/Save the current project/);
    assert.equal(failedSave.sameProject,true,'A failed save must keep the current edit open');
    assert.equal(failedSave.assets,2);
    assert.equal(failedSave.tracked,true,'A failed save must preserve usable source URLs');

    await page.evaluate(()=>seekProject(.25));
    await page.locator('.play-btn').click();
    await page.waitForFunction(()=>state.playing);
    const webAudio=await page.evaluate(()=>{
      // Exercise retained real connected nodes independently of decoder support.
      window.lifecycleGraphDisconnects=0;
      const context=ensurePreviewAudioContext();
      if(!context)return false;
      const graph=ZorifiAudioEngine.createProcessingChain(context,context.createGain(),context.destination),media=new Audio();
      for(const node of Object.values(graph).flat())if(typeof node?.disconnect==='function'){
        const disconnect=node.disconnect.bind(node);
        node.disconnect=(...args)=>{lifecycleGraphDisconnects++;return disconnect(...args);};
      }
      previewAudioGraphs.set('retained-lifecycle-graph',{media,graph});
      return true;
    });
    const released=await page.evaluate(async()=>{
      const media=[...document.querySelectorAll('video[data-preview-clip],audio[data-timeline-audio]'),...[...previewAudioGraphs.values()].map(entry=>entry.media)];
      createNewProject();state.creatorSettings.addZorifiEnding=false;
      const saved=getSavedProjects().find(project=>project.id===lifecycleSources.projectId);
      return {
        savedName:saved?.name,savedClipCount:saved?.clips.length,
        tracked:lifecycleSources.urls.some(url=>editorResources.activeObjectURLs.has(url)),
        revoked:await Promise.all(lifecycleSources.urls.map(async url=>{try{await fetch(url);return false;}catch{return true;}})),
        playing:state.playing,graphs:previewAudioGraphs.size,players:timelineAudioPlayers.size,disconnects:lifecycleGraphDisconnects,
        detached:media.every(element=>element.paused&&!element.getAttribute('src')),
        assets:state.mediaAssets.length,undo:state.undo.length,redo:state.redo.length
      };
    });
    assert.equal(released.savedName,'Final unsaved lifecycle edit','New edit must save outstanding changes before releasing sources');
    assert.equal(released.savedClipCount,2);
    assert.equal(released.tracked,false);
    assert.deepEqual(released.revoked,[true,true]);
    assert.equal(released.playing,false);
    assert.equal(released.graphs,0,'Previous media and WebAudio graphs should no longer be retained');
    if(webAudio)assert.ok(released.disconnects>10,'All retained processing nodes should be disconnected');
    assert.equal(released.players,0);
    assert.equal(released.detached,true);
    assert.equal(released.assets,0);
    assert.equal(released.undo,0,'Undo must not resurrect another project or its revoked previews');
    assert.equal(released.redo,0);

    const restored=await page.evaluate(async()=>{
      const saved=getSavedProjects().find(project=>project.id===lifecycleSources.projectId);
      await loadProject(saved);state.view='editor';render();
      const assets=state.mediaAssets.filter(asset=>lifecycleSources.ids.includes(asset.id));
      return {
        name:state.currentProject,clips:state.clips.length,missing:state.missingMedia,
        fresh:assets.every(asset=>typeof asset.url==='string'&&asset.url.startsWith('blob:')&&!lifecycleSources.urls.includes(asset.url)&&editorResources.activeObjectURLs.has(asset.url)),
        available:assets.filter(asset=>asset.url).length,
        sizes:await Promise.all(assets.filter(asset=>asset.url).map(async asset=>(await(await fetch(asset.url)).blob()).size))
      };
    });
    assert.equal(restored.name,'Final unsaved lifecycle edit');
    assert.equal(restored.clips,2);
    if(prepared.persisted){
      assert.equal(restored.missing,false,'Revoking a preview must not delete persisted media');
      assert.equal(restored.fresh,true,'Stored media should receive new managed preview URLs');
      assert.equal(restored.available,2);
      assert.ok(restored.sizes.every(size=>size>0));
    }else{
      assert.equal(restored.missing,true,'Unsupported storage must retain an honest missing-source warning');
      assert.equal(restored.available,0,'A saved project must not retain revoked preview URLs');
    }
    assert.deepEqual(errors,[]);
    console.log(`${browserType.name()}: New edit stops playback, saves changes, releases previews and protects failed saves; ${webAudio?'connected WebAudio nodes disconnected':'Windows WebKit WebAudio unavailable'}; ${prepared.persisted?'persisted media restored':'Windows WebKit Blob storage unavailable, missing-source warning verified'}.`);
  }finally{await browser.close();}
}

(async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    for(const browserType of process.env.ZORIFI_TEST_ENGINE?[process.env.ZORIFI_TEST_ENGINE==='webkit'?webkit:chromium]:[chromium,webkit])await exercise(browserType,origin);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
