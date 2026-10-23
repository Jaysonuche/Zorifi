const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,devices}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const root=path.resolve(__dirname,'..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function putHome(page,id){
  await page.waitForFunction(()=>typeof render==='function'&&typeof termsAcceptance!=='undefined');
  await page.evaluate(accountId=>{
    currentUser={id:accountId,name:'Tour Tester',identifier:'tour@example.invalid',email:'tour@example.invalid'};
    localStorage.setItem(ACCOUNTS_KEY,JSON.stringify([currentUser]));
    localStorage.setItem(SESSION_KEY,currentUser.id);
    syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
    state.view='home';render();
  },id);
  await page.locator('.home-screen').waitFor({state:'visible'});
}

async function checkDialog(page,label){
  const dialog=page.getByRole('dialog',{name:'A tour of your creative workspace'});
  await dialog.waitFor({state:'visible'});
  const geometry=await page.evaluate(()=>{
    const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    return {viewport:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,dialog:box('.zorifi-tour-dialog'),player:box('.zorifi-tour-player'),video:box('.zorifi-tour-player video'),chapters:box('.zorifi-tour-chapters'),close:box('.zorifi-tour-close')};
  });
  for(const [part,box] of Object.entries(geometry)){
    if(typeof box!=='object')continue;
    assert(box.left>=-1&&box.right<=geometry.viewport+1,`${label}: ${part} exceeds phone width: ${JSON.stringify(geometry)}`);
  }
  assert(geometry.dialog.top>=-1&&geometry.dialog.bottom<=geometry.height+1,`${label}: tour must fit viewport height: ${JSON.stringify(geometry)}`);
  assert(geometry.pageWidth<=geometry.viewport+1,`${label}: tour created page-wide scrolling: ${JSON.stringify(geometry)}`);
  assert(geometry.player.width>100&&geometry.player.height>40,`${label}: video preview must remain usable: ${JSON.stringify(geometry)}`);
  return dialog;
}

(async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    const range=await fetch(`${origin}/assets/tutorial/zorifi-tour.mp4`,{headers:{Range:'bytes=0-99'}});
    assert.equal(range.status,206,'Preview must serve seekable media byte ranges');
    assert.match(range.headers.get('content-range')||'',/^bytes 0-99\/\d+$/);
    assert.equal((await range.arrayBuffer()).byteLength,100);
    const captions=await fetch(`${origin}/assets/tutorial/zorifi-tour.vtt`);
    assert.equal(captions.headers.get('content-type'),'text/vtt');
    assert.match(await captions.text(),/^WEBVTT/);

    browser=await chromium.launch({headless:true,...(fs.existsSync(edge)?{executablePath:edge}:{})});
    const signup=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
    const errors=[];signup.on('pageerror',error=>errors.push(error.message));
    await signup.goto(origin);
    assert.equal(await signup.locator('#zorifi-startup').count(),0,'The legacy startup layer is removed');
    assert.equal(await signup.getByRole('button',{name:'Skip intro'}).count(),0,'The startup gate has no skip control');
    await signup.locator('.zorifi-opening').waitFor({state:'detached'});
    assert.equal(await signup.locator('[data-zorifi-tour],.zorifi-tour-card').count(),0,'There is no persistent tour video or replay button');
    await signup.evaluate(()=>{if(firebaseGateway.configured())firebaseGateway.signUp=async()=>({uid:'opening-tour-new-user'});});
    await signup.locator('[data-auth-mode="signup"]').click();
    await signup.locator('[data-auth-form] [name="name"]').fill('New Creator');
    await signup.locator('[data-auth-form] [name="identifier"]').fill('new-creator@example.invalid');
    await signup.locator('[data-auth-form] [name="password"]').fill('tour-test-password');
    await signup.locator('[data-auth-form] [name="confirm"]').fill('tour-test-password');
    await signup.locator('[data-auth-form] .auth-submit').click();
    await signup.locator('[data-terms-agreement]').check();
    await signup.locator('[data-terms-continue]').click();
    const beta=signup.locator('[data-beta-welcome]');
    if(await beta.count())await beta.locator('[data-beta-acknowledge]').click();
    const first=await checkDialog(signup,'new signup');
    const video=first.locator('video');
    await video.evaluate(el=>new Promise((resolve,reject)=>{
      if(el.error){reject(Error('Tutorial media failed'));return;}
      if(Number.isFinite(el.duration)&&el.duration>20){resolve();return;}
      const timer=setTimeout(()=>reject(Error('Tutorial metadata timed out')),8000);
      el.addEventListener('loadedmetadata',()=>{clearTimeout(timer);resolve();},{once:true});
      el.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Tutorial media failed'));},{once:true});
    }));
    assert((await video.evaluate(el=>el.duration))>23,'The guided video plays');
    await first.getByRole('button',{name:/04 Make music/}).click();
    await signup.waitForFunction(()=>document.querySelector('.zorifi-tour-dialog video')?.currentTime>=11.8);
    assert.match(await first.locator('[data-tour-copy]').innerText(),/Music studio/);
    await first.getByRole('button',{name:'Close tutorial'}).click();
    assert.equal(await signup.locator('.zorifi-tour-dialog').count(),0);
    assert.equal(await signup.evaluate(()=>localStorage.getItem('zorifi-tour-seen-v1:'+currentUser.id)),'seen');
    await signup.evaluate(()=>ZorifiTour.showPending(currentUser.id));
    await delay(80);
    assert.equal(await signup.locator('.zorifi-tour-dialog').count(),0,'The tour does not reopen after dismissal');
    await signup.reload();
    await signup.locator('.zorifi-opening').waitFor({state:'detached'});
    assert.equal(await signup.locator('.zorifi-tour-dialog,.zorifi-tour-card,[data-zorifi-tour]').count(),0,'No tour returns after reload');
    assert.deepEqual(errors,[],'Signup and playback cause no runtime errors');
    await signup.close();

    const returning=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
    await returning.goto(origin);
    await returning.locator('.zorifi-opening').waitFor({state:'detached'});
    await returning.evaluate(()=>{if(firebaseGateway.configured())firebaseGateway.signIn=async()=>({uid:'existing-on-another-device'});});
    await returning.locator('[data-auth-form] [name="identifier"]').fill('returning@example.invalid');
    await returning.locator('[data-auth-form] [name="password"]').fill('existing-password');
    await returning.locator('[data-auth-form] .auth-submit').click();
    if(await returning.evaluate(()=>firebaseGateway.configured())){
      await returning.locator('[data-terms-agreement]').waitFor({state:'visible'});
      await returning.locator('[data-terms-agreement]').check();
      await returning.locator('[data-terms-continue]').click();
    }else await putHome(returning,'returning-local-account');
    const returningBeta=returning.locator('[data-beta-welcome]');
    if(await returningBeta.count())await returningBeta.locator('[data-beta-acknowledge]').click();
    await returning.locator('.home-screen').waitFor({state:'visible'});
    await delay(100);
    assert.equal(await returning.locator('.zorifi-tour-dialog,.zorifi-tour-card,[data-zorifi-tour]').count(),0,'Existing online user on a new device does not get the signup tour');
    await returning.close();

    for(const device of [
      {name:'tiny',viewport:{width:280,height:540},hasTouch:true},
      {name:'small',viewport:{width:320,height:568},hasTouch:true},
      {name:'phone',viewport:{width:390,height:844},hasTouch:true},
      {name:'dynamic-island',...devices['iPhone 14 Pro']},
      {name:'landscape',viewport:{width:667,height:375},hasTouch:true},
      {name:'tablet',viewport:{width:768,height:1024},hasTouch:true},
      {name:'desktop',viewport:{width:1440,height:900}}
    ]){
      const page=await browser.newPage({...device,serviceWorkers:'block'});
      await page.goto(origin);
      await page.locator('.zorifi-opening').waitFor({state:'detached'});
      await putHome(page,`returning-${device.name}`);
      assert.equal(await page.locator('.zorifi-tour-dialog,.zorifi-tour-card,[data-zorifi-tour]').count(),0,`${device.name}: returning account sees no tour`);
      await page.evaluate(()=>ZorifiTour.open());
      await checkDialog(page,device.name);
      if(device.name==='dynamic-island'){
        await page.addStyleTag({content:'.zorifi-tour-backdrop{padding-top:59px;padding-bottom:34px}'});
        const dialog=await checkDialog(page,'dynamic-island safe area');
        const bounds=await dialog.boundingBox();
        assert(bounds.y>=58,'Tour respects the simulated Dynamic Island inset');
      }
      if(['small','phone'].includes(device.name)){
        fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
        await page.screenshot({path:path.join(root,'artifacts',`tour-${device.name}-227.png`)});
      }
      await page.close();
    }
    const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
    await reduced.goto(origin);
    await reduced.locator('.zorifi-opening').waitFor({state:'detached'});
    assert.equal(await reduced.locator('.zorifi-opening').count(),0,'Reduced motion keeps startup gating but finishes normally');
    await reduced.close();
    console.log('Opening and first-signup tour passed: one-time lifecycle, playback, chapters, narrow phones, safe areas and reduced motion.');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
