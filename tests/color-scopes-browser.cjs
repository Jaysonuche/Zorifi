const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {createServer}=require('../scripts/dev-server.cjs');
(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.ZORIFI_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#zorifi-startup').waitFor({state:'detached'});
  await page.evaluate(()=>{
   currentUser={id:'scopes-test',name:'Scopes Test'};syncPhase10Stores();termsAcceptance.accept();createNewProject();
   const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff4040';ctx.fillRect(0,0,32,32);
   state.mediaAssets=[{id:'source',name:'Color test',type:'image',url:canvas.toDataURL()}];state.clips=[{id:'clip',type:'video',name:'Color test',mediaId:'source',start:0,duration:5,track:0,opacity:100,scale:100,fit:'contain'}];state.selected='clip';state.currentTime=1;state.activePanel='color';
   const original=ZorifiColorScopesEngine.prototype.analyzeFrame;ZorifiColorScopesEngine.prototype.analyzeFrame=function(...args){const result=original.apply(this,args);let count=0,sum=0;for(const column of result.waveform.grid)for(let i=0;i<256;i++){sum+=i*column[i];count+=column[i];}window.scopeMean=sum/count;return result;};render();
  });
  await page.waitForFunction(()=>document.querySelector('[data-color-scopes]')?.dataset.scopeReady==='true').catch(async error=>{console.error(await page.evaluate(()=>({status:document.querySelector('[data-scope-status]')?.textContent,sources:[...document.querySelectorAll('[data-preview-clip]')].map(e=>({tag:e.tagName,id:e.dataset.previewClip,complete:e.complete,width:e.naturalWidth})),panel:state.activePanel,session:!!colorScopeSession})));throw error;});const before=await page.evaluate(()=>scopeMean);
  await page.evaluate(()=>{state.proSettings.exposure=-50;});await page.waitForFunction(old=>scopeMean<old*.8,before);
  assert.equal(await page.locator('[data-color-scopes] canvas').count(),3);
  await page.evaluate(()=>{state.activePanel='media';render();});await page.waitForFunction(()=>colorScopeSession===null);
  console.log('Color scope browser check passed: real image pixels, three rendered scopes, exposure response and panel cleanup.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
