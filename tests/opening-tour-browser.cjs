const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,devices}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const root=path.resolve(__dirname,'..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function putHome(page){
  await page.waitForFunction(()=>typeof render==='function'&&typeof termsAcceptance!=='undefined');
  await page.evaluate(()=>{
    currentUser={id:'opening-tour-test',name:'Tour Tester',identifier:'tour@example.invalid',email:'tour@example.invalid'};
    localStorage.setItem(ACCOUNTS_KEY,JSON.stringify([currentUser]));
    localStorage.setItem(SESSION_KEY,currentUser.id);
    syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
    state.view='home';render();
  });
  await page.locator('.home-screen').waitFor({state:'visible'});
}

(async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    const mediaUrl=`http://127.0.0.1:${server.address().port}/assets/tutorial/zorifi-tour.mp4`;
    const range=await fetch(mediaUrl,{headers:{Range:'bytes=0-99'}});
    assert.equal(range.status,206,'Local preview must serve media byte ranges for chapter seeking');
    assert.match(range.headers.get('content-range')||'',/^bytes 0-99\/\d+$/);
    assert.equal((await range.arrayBuffer()).byteLength,100);
    const badRange=await fetch(mediaUrl,{headers:{Range:'bytes=999999999-'}});
    assert.equal(badRange.status,416,'Invalid media byte ranges are rejected');
    const captions=await fetch(`http://127.0.0.1:${server.address().port}/assets/tutorial/zorifi-tour.vtt`);
    assert.equal(captions.headers.get('content-type'),'text/vtt');
    assert.match(await captions.text(),/^WEBVTT/);
    browser=await chromium.launch({headless:true,...(fs.existsSync(edge)?{executablePath:edge}:{})});
    for(const device of [{name:'desktop',viewport:{width:1440,height:900}},{name:'phone',...devices['iPhone 13']}]){
      const page=await browser.newPage({...device,serviceWorkers:'block'});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const opening=page.locator('.zorifi-opening');
      await opening.waitFor({state:'visible'});
      assert(await opening.getByRole('button',{name:'Skip intro'}).isVisible());
      await opening.getByRole('button',{name:'Skip intro'}).click();
      await opening.waitFor({state:'detached'});
      await putHome(page);
      const card=page.locator('.zorifi-tour-card');
      await card.waitFor({state:'visible'});
      const cardWidth=(await card.boundingBox())?.width||0;
      assert(cardWidth>=device.viewport.width*.68,`Tour card should fill the home content on ${device.name}: ${cardWidth}px`);
      if(device.name==='phone'){
        const previewHeight=(await card.locator('.zorifi-tour-card-video').boundingBox())?.height||0;
        assert(previewHeight>=150,`Phone tour preview should be large enough to watch: ${previewHeight}px`);
        const {bottom:cardBottom}=await card.boundingBox().then(box=>({bottom:box.y+box.height}));
        const {bottom:previewBottom}=await card.locator('.zorifi-tour-card-video').boundingBox().then(box=>({bottom:box.y+box.height}));
        assert(previewBottom<=cardBottom,`Phone tour video should remain inside the card`);
      }
      const preview=card.locator('video');
      assert.equal(await preview.getAttribute('muted'),'');
      assert.equal(await preview.getAttribute('loop'),'');
      assert(await card.getByRole('button',{name:/Watch guided tour/}).isVisible());
      await card.getByRole('button',{name:/Watch guided tour/}).click();
      const dialog=page.getByRole('dialog',{name:'A tour of your creative workspace'});
      assert(await dialog.isVisible());
      const video=dialog.locator('video');
      await video.evaluate(el=>new Promise((resolve,reject)=>{if(el.error){reject(Error(`Tutorial media failed: ${el.error.code}`));return;}if(Number.isFinite(el.duration)&&el.duration>20){resolve();return;}const timer=setTimeout(()=>reject(Error(`Tutorial metadata timed out: readyState=${el.readyState} duration=${el.duration}`)),8000);el.addEventListener('loadedmetadata',()=>{clearTimeout(timer);resolve();},{once:true});el.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Tutorial media failed'));},{once:true});}));
      const duration=await video.evaluate(el=>el.duration);
      assert(duration>23&&duration<25,`Tutorial should be a playable 24-second video: ${duration}`);
      assert.equal(await dialog.locator('track[kind="captions"]').count(),1);
      await dialog.getByRole('button',{name:/04 Make music/}).click();
      await page.waitForFunction(()=>document.querySelector('.zorifi-tour-dialog video')?.currentTime>=11.8,null,{timeout:5000});
      assert(await dialog.locator('[data-tour-copy]').innerText().then(s=>s.includes('Music studio')));
      await dialog.getByRole('button',{name:'Close tutorial'}).click();
      assert.equal(await page.getByRole('dialog',{name:'A tour of your creative workspace'}).count(),0);
      const metrics=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,overflow:document.body.style.overflow}));
      assert(metrics.width<=metrics.viewport+1,`No page-wide overflow on ${device.name}: ${JSON.stringify(metrics)}`);
      assert.equal(metrics.overflow,'');
      assert.deepEqual(errors,[],`No browser errors on ${device.name}`);
      await page.screenshot({path:path.join(root,'artifacts',`tour-${device.name}-226.png`)});
      await page.close();
    }
    const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
    await reduced.goto(`http://127.0.0.1:${server.address().port}/`);
    await delay(30);
    assert.equal(await reduced.locator('.zorifi-opening').count(),0,'Reduced motion skips the opening');
    await reduced.close();
    const previewLink=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
    await previewLink.goto(`http://127.0.0.1:${server.address().port}/?update=226`);
    await previewLink.locator('.zorifi-opening').waitFor({state:'visible'});
    await previewLink.close();
    console.log('Opening and illustrated tour passed: skip, playback, captions, chapters, close, mobile and reduced motion.');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
