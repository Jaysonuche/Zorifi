const {chromium}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

(async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
    fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});
    const cases=[{width:320,height:740},{width:390,height:844},{width:800,height:1060},{width:844,height:390},{width:1024,height:768,ipad:true},{width:1366,height:1024,ipad:true},{width:1440,height:900,desktop:true}];
    for(const device of cases){
      const page=await browser.newPage({viewport:{width:device.width,height:device.height},hasTouch:!device.desktop});
      if(device.ipad)await page.addInitScript(()=>{Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});});
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.locator('#zorifi-startup').waitFor({state:'detached'});
      // The CSS can be checked independently before the release cache is bumped.
      await page.addStyleTag({path:path.join(__dirname,'../zorifi-touch-workspace.css')});
      await page.evaluate(()=>{currentUser={id:'touch-workspace-check',name:'Touch Creator'};syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();state.view='home';render();window._templateFeedOpens=0;window.openTemplateFeed=()=>{window._templateFeedOpens++;};});
      assert.equal(await page.locator('[data-home-section="templates"],.template-library').count(),0,'Home must not contain a hidden template gallery');
      assert.equal(await page.locator('.vanessa-launch').isVisible(),false,'The floating assistant must not obscure navigation');
      assert.equal(await page.evaluate(()=>runtimeMode.touch),!device.desktop);
      const overflow=await page.evaluate(()=>({document:document.documentElement.scrollWidth,home:document.querySelector('.home-content').scrollWidth,homeWidth:document.querySelector('.home-content').clientWidth}));
      assert(overflow.document<=device.width+1,`${device.width}: document horizontal overflow ${JSON.stringify(overflow)}`);
      assert(overflow.home<=overflow.homeWidth+1,`${device.width}: Home horizontal overflow ${JSON.stringify(overflow)}`);
      if(!device.desktop){
        const logo=await page.locator('.mobile-home-brand img').boundingBox();assert(logo&&logo.width<=44&&logo.height<=44,'The iPad desktop user agent must not expose an unscaled logo');
        assert(await page.locator('[data-zorifi-pulse]').isVisible(),'Pulse Desk belongs to all touch layouts');
        const nav=page.locator('.mobile-home-nav');assert(await nav.isVisible());
        const targets=await nav.locator('button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect(),center=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:button.textContent,w:r.width,h:r.height,visible:button.contains(center)};}));
        assert.equal(targets.length,5);assert(targets.every(target=>target.w>=44&&target.h>=44&&target.visible),JSON.stringify(targets));
        await nav.locator('[data-home-scroll="templates"]').click();
        assert.equal(await page.evaluate(()=>window._templateFeedOpens),1,'Templates opens only on deliberate navigation');
        await nav.locator('[data-mobile-home="vanessa"]').click();
        assert(await page.locator('.vanessa-panel input[name="message"]').isVisible());
        await page.evaluate(()=>{vanessaOpen=false;state.view='home';render();});
      }else{
        assert(await page.locator('[data-zorifi-futures]').isVisible());
        assert.equal(await page.locator('.mobile-home-nav').count(),0);
        await page.locator('.launch-nav [data-home-scroll="templates"]').click();
        assert.equal(await page.evaluate(()=>window._templateFeedOpens),1);
      }
      if(device.width===390||device.ipad&&device.width===1366||device.desktop)await page.screenshot({path:path.join(__dirname,`../artifacts/touch-workspace-${device.width}.png`)});
      if(!device.desktop){
        await page.evaluate(()=>{createNewProject();render();});
        assert(await page.locator('.mobile-editor-dock').isVisible());
        const canvas=await page.locator('.stage').boundingBox(),timeline=await page.locator('.timeline-area').boundingBox();
        for(const rect of [canvas,timeline])assert(rect&&rect.width>0&&rect.height>0&&rect.x>=0&&rect.x+rect.width<=device.width+1&&rect.y+rect.height<=device.height+1,JSON.stringify(rect));
        await page.locator('[data-action="mobile-tools"]').click();
        assert(await page.locator('.mobile-tool-sheet').isVisible());
        assert(await page.locator('.mobile-tool-sheet [data-panel="collage"]').isVisible());
        await page.locator('button[data-action="close-mobile-tools"]').click();
        await page.locator('.mobile-editor-dock [data-panel="text"]').click();
        await page.waitForTimeout(280);
        assert(await page.locator('.left-panel').isVisible(),'Text opens in a sheet on every touch device');
        await page.locator('.left-panel>.responsive-panel-close').click();
        await page.locator('.touch-vanessa-control').click();
        assert(await page.locator('.vanessa-panel input[name="message"]').isVisible());
        if(device.width===390){
          await page.setViewportSize({width:390,height:350});await page.waitForTimeout(150);
          const input=await page.locator('.vanessa-panel input[name="message"]').boundingBox();assert(input&&input.y>=0&&input.y+input.height<=351,'The message field must remain reachable with the virtual keyboard');
          await page.setViewportSize({width:390,height:844});
        }
        await page.evaluate(()=>{vanessaOpen=false;createMusicProject();});
        assert(await page.locator('.music-mobile-nav').isVisible(),'Music must offer the same navigation on phones and tablets');
        await page.locator('[data-music-mobile-panel="mixer"]').click();
        await page.waitForFunction(()=>{const el=document.querySelector('.music-workspace');return el.scrollLeft>=el.clientWidth*1.8;},{},{timeout:4000});
        const music=await page.evaluate(()=>{const el=document.querySelector('.music-workspace');return{scroll:el.scrollLeft,width:el.clientWidth,doc:document.documentElement.scrollWidth};});
        assert(music.scroll>=music.width*1.8,'Mix navigation must open the actual mixer');assert(music.doc<=device.width+1,'Music must not create document overflow');
      }
      console.log(`Touch workspace passed: ${device.width}×${device.height}${device.ipad?' iPadOS':''}${device.desktop?' desktop':''}`);
      await page.close();
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
