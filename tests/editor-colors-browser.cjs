const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');
const root=path.resolve(__dirname,'..');

async function setup(page){
  await page.goto(page.context()._options.baseURL,{waitUntil:'domcontentloaded'});
  await page.locator('.zorifi-opening').waitFor({state:'detached'});
  await page.evaluate(()=>{
    currentUser={id:'editor-colour-test',name:'Editor'};
    syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();createNewProject();
    state.creatorSettings.addZorifiEnding=false;
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ed4264';ctx.fillRect(0,0,320,180);
    const url=canvas.toDataURL();
    state.mediaAssets=[{id:'picture',type:'image',name:'Colour.png',url,thumbnail:url,width:320,height:180,duration:10}];
    state.clips=[{id:'clip',mediaId:'picture',type:'video',name:'Colour',track:0,start:0,duration:10,scale:100,positionX:0,positionY:0,rotation:0,opacity:100,volume:0,fit:'contain',sourceStart:0,keyframes:{}}];
    state.duration=10;state.currentTime=2;state.selected='clip';state.activePanel='filters';render();
  });
}
async function colours(page,selectors){return page.evaluate(selectors=>{
  const rgb=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
  const luminance=color=>{const values=rgb(color).map(value=>{const n=value/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
  return selectors.map(selector=>{const el=document.querySelector(selector);if(!el)return {selector,missing:true};
    const s=getComputedStyle(el),a=luminance(s.color),b=luminance(s.backgroundColor);
    return {selector,color:s.color,background:s.backgroundColor,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
},selectors);}
(async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const engine=process.env.ZORIFI_TEST_ENGINE==='webkit'?'webkit':'chromium';
  const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
  try{
    for(const [width,height,touch] of [[1440,900,false],[1024,700,false],[390,844,true],[320,480,true]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:touch,baseURL:`http://127.0.0.1:${server.address().port}`,serviceWorkers:'block'});
      const page=await context.newPage();await setup(page);
      const originalFilter=await page.locator('[data-preview-clip="clip"]').evaluate(el=>getComputedStyle(el).filter);
      for(const theme of ['dark','light']){
        await page.evaluate(theme=>ZorifiTheme.controller.setPreference(theme),theme);
        if(touch)await page.evaluate(()=>{state.responsivePanel='tools';state.activePanel='filters';render();});
        if(touch){const preview=await page.locator('.preview-wrap').boundingBox();assert(preview.height>=40,JSON.stringify({width,height,preview}));}
        await page.waitForFunction(theme=>getComputedStyle(document.querySelector('.timeline-toolbar button:not(:disabled)')).color===(theme==='light'?'rgb(35, 38, 58)':'rgb(241, 242, 250)'),theme);
        const sample=await colours(page,['.app-shell','.filter-target','.media-panel input','.timeline-toolbar button:not(:disabled)',...(touch?[]:['.inspector .inspect-section','.inspector-head button','.sidebar .tool-btn'])]);
        for(const item of sample){assert(!item.missing,JSON.stringify(item));assert(item.ratio>=4.5,`${engine} ${touch?'phone':'desktop'} ${theme}: ${JSON.stringify(item)}`);}
        await page.evaluate(()=>{state.activePanel='media';state.selected='clip';render();});
        const preview=await page.locator('[data-preview-clip="clip"]').evaluate(el=>getComputedStyle(el).filter);
        assert.equal(preview,originalFilter,'Changing editor chrome must not recolour imported content');
        if(!touch){
          const tools=await page.locator('.sidebar .tool-btn').evaluateAll(buttons=>buttons.map(button=>{const label=button.querySelector('.tool-label'),icon=button.querySelector('svg,.fx-icon');return {name:label?.textContent,display:label&&getComputedStyle(label).display,width:button.getBoundingClientRect().width,labelWidth:label?.clientWidth,labelContent:label?.scrollWidth,icon:icon&&getComputedStyle(icon).display};}));
          assert(tools.length>=12,'The desktop rail must expose the editing tool categories');
          for(const tool of tools){assert(tool.name&&tool.display!=='none'&&tool.width>=100,JSON.stringify(tool));assert(tool.labelWidth+1>=tool.labelContent,JSON.stringify(tool));assert(tool.icon&&tool.icon!=='none',JSON.stringify(tool));}
        }
        const drop=await page.locator('.timeline-new-track-label').boundingBox();
        assert(drop&&drop.x>=0&&drop.x+drop.width<=width+1,JSON.stringify({width,drop}));
        await page.screenshot({path:path.join(root,`artifacts/editor-colours-${engine}-${width}-${theme}.png`)});
        await page.evaluate(()=>{state.activePanel='filters';render();});
        console.log(`${engine} ${touch?'phone':'desktop'} ${theme}: readable editor cards, inputs and controls`);
      }
      await context.close();
    }
  }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
