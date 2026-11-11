const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const {createServer} = require('../scripts/dev-server.cjs');

// Native controls and real browser encoders; no live AI or private source media.
(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({status:401,json:{error:'Cloud providers disabled in this native editing fixture.'}}));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.locator('.zorifi-opening').waitFor({state:'detached'});
    await page.evaluate(() => {
      currentUser = {id:'motion-composition-editor',name:'Motion composition editor',language:'en-GB'};
      syncPhase10Stores(); termsAcceptance.accept(); betaProgramState.acknowledge(); createNewProject();
      Object.assign(state.creatorSettings, {addZorifiEnding:false,compositionDuration:2,workStart:0,workEnd:2});
      state.clips = []; state.mediaAssets = []; state.frameWidth = 320; state.frameHeight = 180;
      state.duration = 2; state.currentTime = 0; state.ratio = '16 / 9'; state.undo = []; state.redo = [];
      state.view = 'editor'; state.activePanel = 'motion-scenes'; render(); saveProject();
    });

    await page.getByText('Composition settings', {exact:true}).click();
    let projectForm = page.locator('[data-motion-form="project"]');
    await projectForm.locator('[name="width"]').fill('640');
    await projectForm.locator('[name="height"]').fill('360');
    await projectForm.locator('[name="fps"]').fill('24');
    await projectForm.locator('button').click();
    assert.deepEqual(await page.evaluate(() => [state.frameWidth,state.frameHeight,state.creatorSettings.customFrameRate,state.undo.length]), [640,360,24,1]);
    await page.evaluate(() => undo());
    assert.equal(await page.evaluate(() => state.frameWidth), 320);
    await page.evaluate(() => redo());

    const beforeFailure = await page.evaluate(() => JSON.stringify({snapshot:ProjectModel.captureHistory(state),undo:state.undo,redo:state.redo}));
    await page.evaluate(() => {window.originalCompositionSave = saveProject; saveProject = () => false;});
    projectForm = page.locator('[data-motion-form="project"]');
    await projectForm.locator('[name="width"]').fill('480');
    await projectForm.locator('button').click();
    await page.evaluate(() => {saveProject = window.originalCompositionSave; delete window.originalCompositionSave;});
    assert.equal(await page.evaluate(() => JSON.stringify({snapshot:ProjectModel.captureHistory(state),undo:state.undo,redo:state.redo})), beforeFailure, 'Failed device save must roll back composition metadata and Undo/Redo exactly.');
    assert.match(await page.locator('.motion-workspace [role="status"]').textContent(), /could not save/);

    await page.locator('[data-motion-create="shape"]').click();
    const shapeId = await page.evaluate(() => state.selected);
    await page.evaluate(id => {
      ZorifiMotionWorkspace.apply({command:'shape.set',target:id,parameters:{type:'rectangle',width:180,height:100,roundness:18,fill:'#ff507e'}});
      for (const [time,value] of [[0,-25],[1.1,25]]) ZorifiMotionWorkspace.apply({command:'animation.keyframe',target:id,parameters:{property:'positionX',time,value,easing:'linear'}});
    }, shapeId);
    await page.getByText('Native creative pack · apply at playhead', {exact:true}).click();
    await page.locator('[data-motion-native-preset="zoom-shake"]').click();
    const packState = await page.evaluate(() => JSON.stringify(state.clips));
    assert(await page.evaluate(id => state.clips.find(c => c.id === id).motion.effects.some(fx => fx.type === 'shake'), shapeId));
    await page.evaluate(() => {undo(); redo();});
    assert.equal(await page.evaluate(() => JSON.stringify(state.clips)), packState);
    await page.evaluate(id => ZorifiMotionWorkspace.apply({command:'composition.precompose',parameters:{id:'manual-scene',layerIds:[id],name:'Editable motion scene'}}), shapeId);
    await page.getByText('Nested composition settings', {exact:true}).click();
    const nested = page.locator('[data-motion-form="composition"]');
    await nested.locator('[name="name"]').fill('Manual scene settings');
    await nested.locator('[name="width"]').fill('480');
    await nested.locator('[name="height"]').fill('270');
    await nested.locator('[name="duration"]').fill('3');
    await nested.locator('[name="fps"]').fill('30');
    await nested.locator('button').click();
    const configured = await page.evaluate(() => JSON.stringify(state.clips));
    assert.deepEqual(await page.evaluate(() => {const c=state.clips.find(c=>c.id==='manual-scene');return [c.name,c.composition.width,c.composition.height,c.composition.duration,c.composition.fps];}), ['Manual scene settings',480,270,3,30]);
    await page.evaluate(() => undo());
    assert.equal(await page.evaluate(() => state.clips.find(c=>c.id==='manual-scene').composition.width), 640);
    await page.evaluate(() => redo());
    assert.equal(await page.evaluate(() => JSON.stringify(state.clips)), configured);

    // The same existing Vanessa operation validates and produces the identical
    // nested-source change; it is not a second editor store or generated code.
    const parity = await page.evaluate(() => {
      const before=structuredClone(state),action=ZorifiProfessionalTools.validateAction({command:'motion.edit',target:'manual-scene',parameters:{operation:'composition.settings',dataJson:JSON.stringify({name:'Manual scene settings',width:480,height:270,duration:3,fps:30})}},state);
      ZorifiMotionGraph.apply(before,{command:action.parameters.operation,target:action.target,parameters:JSON.parse(action.parameters.dataJson)});
      return ZorifiProfessionalTools.verifyAction(action,state,before);
    });
    assert(parity);

    const saved = await page.evaluate(() => {addAudioTrack('tactile-click',{start:.3});state.clips=ProjectModel.migrateProject({id:state.projectId,clips:state.clips}).clips;render();saveProject();return {id:state.projectId,user:currentUser,clips:JSON.stringify(state.clips),width:state.frameWidth,height:state.frameHeight};});
    await page.reload(); await page.locator('.zorifi-opening').waitFor({state:'detached'});
    await page.evaluate(async saved => {currentUser=saved.user;syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();await loadProject(getSavedProjects().find(p=>p.id===saved.id));state.activePanel='motion-scenes';state.view='editor';render();}, saved);
    assert.equal(await page.evaluate(() => JSON.stringify(state.clips)), saved.clips);
    assert.equal(await page.evaluate(() => state.frameWidth), saved.width);
    const previews = await page.evaluate(async () => {const a=await ZorifiMotionWorkspace.renderFrame({time:.08,width:320,height:180}),b=await ZorifiMotionWorkspace.renderFrame({time:.8,width:320,height:180});return {changes:a.data.reduce((n,v,i)=>n+(v!==b.data[i]),0),saved:ZorifiProductionBridge.savedMatches()};});
    assert(previews.changes > 100); assert(previews.saved);

    assert(await page.evaluate(() => Boolean(preferredMime('mp4'))), 'This export check requires a real MP4 encoder.');
    await page.evaluate(() => showExport());
    const modal=page.locator('.export-modal');
    await modal.locator('[data-export-resolution]').selectOption('custom');
    await modal.locator('[data-export-width]').fill('320'); await modal.locator('[data-export-height]').fill('180');
    await modal.locator('[data-export-fps]').selectOption('24'); await modal.locator('[data-export-format]').selectOption('mp4');
    await modal.locator('[data-output-range]').selectOption('custom');
    await modal.locator('[data-output-from]').fill('0'); await modal.locator('[data-output-to]').fill('1.2');
    const downloading=page.waitForEvent('download',{timeout:45000}); await modal.locator('[data-start]').click();
    const download=await downloading,output='artifacts/upgrade-motion-composition.mp4'; await download.saveAs(output);
    const bytes=fs.readFileSync(output); assert(bytes.subarray(0,32).includes(Buffer.from('ftyp')));
    await page.route('**/composition-export-check',r=>r.fulfill({body:bytes,contentType:'video/mp4'}));
    const exported=await page.evaluate(async()=>{
      const blob=await(await fetch('/composition-export-check')).blob(),url=URL.createObjectURL(blob),v=document.createElement('video'),ac=new AudioContext();
      try {v.muted=true;v.src=url;await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;});
        const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d',{willReadFrequently:true}),frames=[];
        for(const time of [.08,.8]){await new Promise(resolve=>{v.onseeked=resolve;v.currentTime=time;});ctx.clearRect(0,0,320,180);ctx.drawImage(v,0,0);frames.push([...ctx.getImageData(0,0,320,180).data]);}
        const audio=await ac.decodeAudioData(await blob.arrayBuffer());let peak=0;for(const sample of audio.getChannelData(0))peak=Math.max(peak,Math.abs(sample));
        return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,changes:frames[0].reduce((n,p,i)=>n+(p!==frames[1][i]),0),visible:frames.some(frame=>frame.some((p,i)=>i%4!==3&&p>100)),audioPeak:peak};
      } finally {v.pause();v.removeAttribute('src');v.load();URL.revokeObjectURL(url);await ac.close();}
    });
    assert(exported.duration>1&&exported.duration<2,JSON.stringify(exported));assert.equal(exported.width,320);assert.equal(exported.height,180);
    assert(exported.visible);assert(exported.changes>100);assert(exported.audioPeak>.0001);assert.deepEqual(errors,[]);
    fs.writeFileSync('artifacts/upgrade-motion-composition.json',JSON.stringify({manualComposition:true,saveFailureRollback:true,nestedSettingsParity:true,undoRedo:true,reopened:true,previews,exported},null,2));
    console.log('Composition settings rollback, nested manual/Vanessa opcode parity, actual native zoom-shake pack, preview/Undo/Redo/reopen and decoded animated MP4 with audible SFX passed: '+JSON.stringify(exported));
  } finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
