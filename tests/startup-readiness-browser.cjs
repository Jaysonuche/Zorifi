const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,webkit}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

(async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    const engine=process.env.ZORIFI_TEST_ENGINE==='webkit'?'webkit':'chromium';
    browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&fs.existsSync(edge)?{executablePath:edge}:{})});
    const origin=`http://127.0.0.1:${server.address().port}`;
    const firstPaint=await browser.newPage({serviceWorkers:'block'});
    let releaseStyle;
    const holdStyle=new Promise(resolve=>{releaseStyle=resolve;});
    await firstPaint.route('**/styles.css?*',async route=>{await holdStyle;await route.continue();});
    const firstNavigation=firstPaint.goto(origin,{waitUntil:'load'});
    await firstPaint.locator('.zorifi-opening').waitFor({state:'visible'});
    assert.equal(await firstPaint.locator('.zorifi-opening').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(8, 9, 24)','Critical startup styling paints before the main stylesheet arrives');
    releaseStyle();
    await firstNavigation;
    await firstPaint.locator('.zorifi-opening').waitFor({state:'detached'});
    await firstPaint.close();

    const delayed=await browser.newPage({serviceWorkers:'block'});
    let release;
    const hold=new Promise(resolve=>{release=resolve;});
    await delayed.route('**/app.js?*',async route=>{await hold;await route.continue();});
    const navigation=delayed.goto(origin,{waitUntil:'load'});
    await delayed.locator('.zorifi-opening').waitFor({state:'visible'});
    assert.equal(await delayed.getByRole('button',{name:'Skip intro'}).count(),0,'The startup gate cannot be skipped');
    assert.equal(await delayed.locator('.zorifi-opening').getAttribute('aria-busy'),'true');
    await pause(1800);
    assert(await delayed.locator('.zorifi-opening').isVisible(),'The gate stays up while the application script is still loading, beyond the old fixed timer');
    const cover=await delayed.evaluate(()=>{
      const layer=document.querySelector('.zorifi-opening'),rect=layer.getBoundingClientRect();
      return document.elementFromPoint(rect.width/2,rect.height/2)?.closest('.zorifi-opening')===layer;
    });
    assert(cover,'The first-paint gate covers the application during startup');
    release();
    await navigation;
    await delayed.locator('.zorifi-opening').waitFor({state:'detached'});
    assert(await delayed.locator('#app > *').count(),'The initial application view exists before the gate closes');
    await delayed.close();

    const failed=await browser.newPage({serviceWorkers:'block'});
    await failed.route('**/app.js?*',route=>route.abort('failed'));
    await failed.goto(origin,{waitUntil:'load'});
    await failed.locator('.zorifi-opening').waitFor({state:'visible'});
    assert.match(await failed.locator('[data-opening-status]').innerText(),/required Zorifi file could not load/i);
    assert(await failed.getByRole('button',{name:'Reload Zorifi'}).isVisible(),'A failed boot offers a reload action');
    assert.equal(await failed.locator('.zorifi-opening').getAttribute('aria-busy'),'false');
    await failed.close();
    const failedOpening=await browser.newPage({serviceWorkers:'block'});
    await failedOpening.route('**/zorifi-opening.js?*',route=>route.abort('failed'));
    await failedOpening.goto(origin,{waitUntil:'load'});
    assert.match(await failedOpening.locator('[data-opening-status]').innerText(),/required Zorifi file could not load/i,'The inline first-paint gate catches a missing startup controller');
    assert(await failedOpening.getByRole('button',{name:'Reload Zorifi'}).isVisible());
    await failedOpening.close();
    console.log(`${engine}: startup readiness passed: first paint before styles, delayed scripts, no skip, and failed asset recovery.`);
  }finally{
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
