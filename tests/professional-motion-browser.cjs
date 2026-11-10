const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const {createServer} = require('../scripts/dev-server.cjs');

// Explicit authentication and AI transport fixtures. This exercises the real
// conversation dispatcher, proposal validation, native editor and renderer;
// it does not certify a live provider's proposed creative direction.
(async () => {
  fs.mkdirSync('artifacts', {recursive:true});
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
    const errors = [];
    let requests = 0, delayed = false, releaseDelayed, notifyDelayed;
    let delayedStarted = new Promise(resolve => { notifyDelayed = resolve; });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request();
      if (!request.url().endsWith('/api/vanessa/chat')) return route.fulfill({status:401,json:{error:'Unrelated provider disabled in this representative fixture.'}});
      const input = request.postDataJSON();
      requests++;
      assert.equal(request.headers().authorization, 'Bearer motion-fixture-token');
      if (input.intent !== 'professional') {
        const command = /redo/i.test(input.message) ? 'history.redo' : 'history.undo';
        return route.fulfill({json:{sessionId:input.sessionId,requestId:input.requestId,sequence:input.sequence,reply:'Native history fixture.',actions:[{command,target:null,parameters:{}}]}});
      }
      assert.equal(input.project.ownerUid, 'motion-cloud');
      assert.equal(input.project.id, await page.evaluate(() => state.projectId));
      assert(input.context.catalog.supportedCommands.includes('motion.edit'));
      assert.equal(input.context.manifest.mediaAssets.length, 0, 'An authored shape scene does not need invented source media.');
      if (delayed) { notifyDelayed(); await new Promise(resolve => { releaseDelayed = resolve; }); }
      let response = {
        sessionId:input.sessionId,requestId:input.requestId,sequence:input.sequence,
        title:'Editable motion foundations',strategy:'Native nested circles, independently animated text, controller and planar camera.',
        reply:'A native editable motion scene is ready for review.',
        actions:[{command:'motion.edit',target:null,parameters:{operation:'scene.benchmark',dataJson:JSON.stringify({name:'foundations',prefix:delayed?'stopped-motion':'vanessa-motion',start:0})}}],
        observations:[],warnings:['Deterministic provider/authentication fixture; no live Gemini creative-quality claim.']
      };
      if(process.env.ZORIFI_MOTION_REPLAY==='1')response={...JSON.parse(fs.readFileSync('artifacts/consolidated-live-motion-plan.json','utf8')),sessionId:input.sessionId,requestId:input.requestId,sequence:input.sequence};
      try { await route.fulfill({json:response}); } catch (error) {
        // Cancellation closes this intercepted request before its fixture reply.
        if (!delayed) throw error;
      }
    });
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('.zorifi-opening').waitFor({state:'detached'});
    await page.evaluate(() => {
      firebaseGateway.config={apiKey:'fixture-public',projectId:'fixture'};
      firebaseGateway.session={uid:'motion-cloud',idToken:'motion-fixture-token',refreshToken:'fixture-refresh',expiresAt:Date.now()+3600000};
      currentUser={id:'motion-local',cloudUid:'motion-cloud',name:'Motion editor',email:'motion@example.test',language:'en-GB'};
      syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
      vanessaVoiceEnabled=false;vanessaWakeEnabled=false;
      ZorifiPrivacy.setConsent(localStorage,currentUser.id,true);
      createNewProject();state.creatorSettings.addZorifiEnding=false;
      state.frameWidth=320;state.frameHeight=180;state.ratio='16 / 9';
      state.clips=[];state.mediaAssets=[];state.trackStates={};state.selected=null;
      state.currentTime=0;state.duration=10;state.undo=[];state.redo=[];state.view='editor';
      saveProject();render();ZorifiDirectorBridge.sync();
    });
    const unchanged = await page.evaluate(() => JSON.stringify(state.clips));
    await page.evaluate(() => sendToVanessa('Create a 10-second cinematic motion graphics logo with expanding circles and a 35mm camera.'));
    assert.equal(await page.evaluate(() => vanessaHistory.at(-1).actionStatus), 'REQUIRES_CONFIRMATION', await page.evaluate(() => vanessaHistory.at(-1).text));
    assert.equal(await page.evaluate(() => JSON.stringify(state.clips)), unchanged, 'Reviewed proposal must not mutate the live project.');
    assert.equal(await page.evaluate(() => state.undo.length), 0);
    assert.equal(await page.locator('[data-vanessa-confirm="apply"]').count(), 1);
    await page.evaluate(() => resolveVanessaConfirmation(true));
    assert.equal(await page.evaluate(() => vanessaHistory.at(-1).actionStatus), 'SUCCESS', await page.evaluate(() => vanessaHistory.at(-1).text));
    const applied = await page.evaluate(() => ({
      roots:state.clips.length,layers:ZorifiMotionWorkspace.flatten().length,
      undo:state.undo.length,saved:ZorifiProductionBridge.savedMatches(),
      data:JSON.stringify(state.clips),hasCamera:ZorifiMotionWorkspace.flatten().some(clip=>clip.layerKind==='camera')
    }));
    assert.equal(applied.roots, 1);
    assert(applied.layers >= 10, JSON.stringify(applied));
    assert.equal(applied.hasCamera, true);
    assert.equal(applied.undo, 1, 'All coordinated scene actions use one native checkpoint.');
    assert.equal(applied.saved, true);
    assert.equal(await page.locator('.timeline-area .clip[data-clip]').count(), 1);
    const frame = await page.evaluate(async () => {
      seekProject(3);render();
      const rendered=await ZorifiMotionWorkspace.renderFrame({time:3,width:320,height:180});
      let energy=0;for(let at=0;at<rendered.data.length;at+=4)energy+=rendered.data[at]+rendered.data[at+1]+rendered.data[at+2];
      return {image:rendered.image,energy};
    });
    assert(frame.energy > 100000, 'The real shared renderer must produce visible scene pixels.');
    assert.equal(await page.locator('.preview.motion-rendered canvas').count(), 1);
    fs.writeFileSync('artifacts/consolidated-professional-motion.jpg', Buffer.from(frame.image.split(',')[1], 'base64'));
    await page.evaluate(() => sendToVanessa('undo'));
    assert.equal(await page.evaluate(() => state.clips.length), 0);
    assert.equal(await page.evaluate(() => state.redo.length), 1);
    await page.evaluate(() => sendToVanessa('redo'));
    assert.equal(await page.evaluate(() => JSON.stringify(state.clips)), applied.data);
    assert.equal(await page.evaluate(() => ZorifiProductionBridge.savedMatches()), true);
    const saved = await page.evaluate(() => ({projectId:state.projectId,user:currentUser,session:firebaseGateway.session}));
    await page.reload();await page.locator('.zorifi-opening').waitFor({state:'detached'});
    await page.evaluate(async saved => {
      firebaseGateway.config={apiKey:'fixture-public',projectId:'fixture'};firebaseGateway.session=saved.session;
      currentUser=saved.user;syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
      vanessaVoiceEnabled=false;vanessaWakeEnabled=false;
      await loadProject(getSavedProjects().find(project=>project.id===saved.projectId));state.view='editor';render();
    }, saved);
    assert.equal(await page.evaluate(() => JSON.stringify(state.clips)), applied.data, 'Nested editable state survives a real refresh and native project reopen.');
    assert.equal(await page.evaluate(() => ZorifiProductionBridge.savedMatches()), true, JSON.stringify(await page.evaluate(()=>{const a=ProjectModel.migrateProject(CreatorPlatform.validateProject(ProjectModel.serializeProject(state,currentProjectThumbnail()))),b=ProjectModel.migrateProject(JSON.parse(localStorage.getItem(projectStorageKey())).find(x=>x.id===state.projectId));return Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>({key:k,expected:a[k],stored:b[k]}));})));
    const restoredFrame = await page.evaluate(async () => (await ZorifiMotionWorkspace.renderFrame({time:3,width:320,height:180})).image);
    assert.equal(restoredFrame, frame.image, 'Arbitrary-time render is deterministic after refresh.');
    delayed=true;
    const beforeStop = await page.evaluate(() => ({data:JSON.stringify(state.clips),undo:state.undo.length}));
    await page.evaluate(() => { window.pendingMotionTurn=sendToVanessa('Create another cinematic motion graphics logo with expanding circles.'); });
    await Promise.race([delayedStarted,new Promise((_,reject)=>setTimeout(()=>reject(Error('Delayed motion planning did not start.')),10000))]);
    await page.evaluate(() => cancelVanessaStream());
    releaseDelayed();
    await page.evaluate(() => pendingMotionTurn);
    assert.deepEqual(await page.evaluate(() => ({data:JSON.stringify(state.clips),undo:state.undo.length})), beforeStop, 'Stop discards the delayed provider proposal without changing native data/history.');
    assert.equal(await page.evaluate(() => ZorifiProfessionalStudio.inspect().pending), null);
    assert.equal(await page.locator('[data-vanessa-confirm="apply"]').count(), 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync('artifacts/consolidated-professional-motion.json', JSON.stringify({representativeAuthenticationFixture:true,deterministicProviderFixture:true,liveGemini:false,replayOfActualGemini:process.env.ZORIFI_MOTION_REPLAY==='1',requests,roots:applied.roots,layers:applied.layers,oneUndoCheckpoint:true,nativeHistory:true,saveReopen:true,deterministicRender:true,stopPreventedPendingProposal:true},null,2));
    console.log('Vanessa representative authenticated motion proposal: review/confirm -> native nested scene and visible shared render -> one Undo/Redo -> exact save/reopen -> Stop rejects delayed proposal. No live provider claim.');
  } finally {
    await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error => { console.error(error);process.exitCode=1; });
