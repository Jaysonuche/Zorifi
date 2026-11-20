const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:edge});const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',hasTouch:true}),errors=[];page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});await page.locator('.zorifi-opening').waitFor({state:'detached'});
    await page.evaluate(()=>{
      window.testAccount=id=>{currentUser={id,cloudUid:id,name:'Test creator',email:id+'@example.invalid',language:'en-GB'};syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();state.view='ai-video';render();};
      localStorage.setItem(AI_HISTORY_KEY,JSON.stringify([{id:'unknown-owner',type:'language',stage:'completed',prompt:'Legacy private data'}]));
      testAccount('alice');
    });
    assert.deepEqual(await page.evaluate(()=>aiGenerationManager.history),[],'Unowned legacy history is not migrated');
    await page.locator('[data-generation-kind="image"]').click();await page.locator('[name=prompt]').fill('Alice original image idea');
    await page.locator('[data-generation-kind="script"]').click();await page.locator('[name=topic]').fill('Alice script topic');
    await page.locator('[data-generation-kind="storyboard"]').click();await page.locator('[name=topic]').fill('A different storyboard');
    await page.locator('[data-generation-kind="script"]').click();assert.equal(await page.locator('[name=topic]').inputValue(),'Alice script topic');
    await page.locator('[data-generation-kind="image"]').click();assert.equal(await page.locator('[name=prompt]').inputValue(),'Alice original image idea');
    await page.evaluate(()=>{
      aiProviderDetails=async()=>({configured:true,provider:'Test mock',model:'test-only'});
      aiProviderTransport=async(service,payload,{signal})=>{window.oldSignal=signal;return new Promise(resolve=>window.finishOldImage=()=>resolve({status:'complete',url:'https://example.invalid/alice-private.png',mimeType:'image/png'}));};
    });
    await page.locator('[data-ai-asset-form]').evaluate(form=>form.requestSubmit());await page.waitForFunction(()=>typeof window.finishOldImage==='function');
    await page.evaluate(()=>testAccount('bob'));
    assert.equal(await page.evaluate(()=>window.oldSignal.aborted),true);
    await page.evaluate(()=>window.finishOldImage());await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>aiGenerationManager.scope),'bob');assert.deepEqual(await page.evaluate(()=>aiGenerationManager.history),[]);
    assert.equal(await page.evaluate(()=>JSON.stringify(aiCreateDrafts).includes('Alice')),false);assert.equal(await page.evaluate(()=>aiAssetDraft),null);
    await page.evaluate(async()=>{const job=aiGenerationManager.create({type:'language',prompt:'Bob saved script',run:async()=>({text:'Bob only result'})});await aiGenerationManager.start(job.id);});
    await page.locator('[data-generation-kind="history"]').click();await page.locator('.generation-history').waitFor();assert.equal(await page.locator('.generation-history').innerText().then(value=>value.includes('Bob saved script')),true);
    await page.evaluate(()=>testAccount('alice'));assert.equal(await page.evaluate(()=>aiGenerationManager.history.some(item=>item.prompt==='Bob saved script')),false);
    await page.evaluate(()=>testAccount('bob'));assert.equal(await page.evaluate(()=>aiGenerationManager.history[0]?.prompt),'Bob saved script');
    assert.equal(await page.evaluate(()=>localStorage.getItem(aiHistoryKey('alice'))?.includes('Bob saved script')||false),false);
    for(const width of [320,390,768,1024,1440]){
      await page.setViewportSize({width,height:844});await page.evaluate(()=>{aiGenerationKind='video';renderAiVideo();});
      await page.locator('[data-generation-kind="image"]').click();await page.locator('[data-ai-asset-form]').waitFor();
      const bounds=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,header:document.querySelector('.ai-create-topbar').getBoundingClientRect().bottom,body:document.querySelector('.ai-asset-layout').getBoundingClientRect().top}));
      assert.ok(bounds.scroll<=bounds.width+1,`${width}: no horizontal page overflow`);assert.ok(bounds.body>=bounds.header-1,`${width}: tabs are not covered by workspace`);
    }
    assert.deepEqual(errors,[]);
    const report={passed:true,providerRequests:'mocked only; no live AI calls',widths:[320,390,768,1024,1440],checks:['unowned legacy history ignored','image/script/storyboard drafts retained across tabs','in-flight request aborted on account change','late results suppressed','history isolated and restored per account','real tab taps and no page overflow at five device widths'],pageErrors:errors};fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/ai-create-isolation-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
