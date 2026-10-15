const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
 // This smoke test exercises local editing and never sends provider requests.
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-features=CalculateNativeWinOcclusion'],...(process.env.ZORIFI_BROWSER_EXECUTABLE?{executablePath:process.env.ZORIFI_BROWSER_EXECUTABLE}:fs.existsSync(edge)?{executablePath:edge}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[],missing=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400&&!response.url().includes('/api/'))missing.push(`${response.status()} ${response.url()}`);});
  await page.route('**/api/vanessa-provider?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Provider not configured for smoke testing.'})}));
  await page.goto(origin);await page.waitForFunction(()=>document.getElementById('app').children.length>0);
  await page.evaluate(()=>{currentUser={id:'smoke-user',name:'Smoke Creator',identifier:'smoke@example.invalid',email:'smoke@example.invalid'};localStorage.setItem(ACCOUNTS_KEY,JSON.stringify([currentUser]));localStorage.setItem(SESSION_KEY,currentUser.id);syncPhase10Stores();termsAcceptance.accept();createNewProject();state.creatorSettings.addZorifiEnding=false;});
  await page.locator('#zorifi-startup').waitFor({state:'detached'});
  await page.locator('.timeline-area').waitFor({state:'visible'});
  await page.locator('#file-picker').setInputFiles(path.join(root,'icons','icon-192.png'));
  await page.waitForFunction(()=>state.mediaAssets.some(asset=>asset.name==='icon-192.png'));
  assert.equal(await page.evaluate(()=>editorResources.activeObjectURLs.has(state.mediaAssets.find(asset=>asset.name==='icon-192.png').url)),true,'Imported preview URLs must be tracked');
  const workerResult=await page.evaluate(async()=>{
    const pipeline=new ZorifiOptimization.AudioWorkerPipeline();
    try{const input=new Float32Array([0,1,0,0]);const [a,b]=await Promise.all([pipeline.analyzeAudio(input.buffer,{sampleCount:2}),pipeline.analyzeAudio(new Float32Array([.5,.5]).buffer,{sampleCount:1})]);return {a,b,bytes:input.byteLength};}finally{pipeline.terminate();}
  });assert.deepEqual(workerResult,{a:[1,0],b:[.5],bytes:16});
  const decodedWave=await page.evaluate(async()=>{
    const count=8000,buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer),write=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
    write(0,'RIFF');view.setUint32(4,36+count*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,count*2,true);for(let i=0;i<count;i++)view.setInt16(44+i*2,Math.round(Math.sin(i*.2)*16000),true);
    return ZorifiAudioEngine.decodeWaveform(new Blob([buffer],{type:'audio/wav'}),window.AudioContext,20);
  });assert.equal(decodedWave.peaks.length,20);assert.ok(decodedWave.peaks.every(value=>value>.4),'Worker-backed decoded waveform should contain real audio peaks');
  const edited=await page.evaluate(()=>{const asset=state.mediaAssets.find(asset=>asset.name==='icon-192.png');addMediaToTimeline(asset.id);const clip=state.clips.find(item=>item.mediaId===asset.id);clip.duration=1;state.selected=clip.id;addTitle({name:'Recovered Zorifi'});const title=state.clips.find(item=>item.type==='text');title.duration=1;recalculateDuration();saveProject();return {projectId:state.projectId,clips:state.clips.length,persisted:asset.persisted};});
  assert.ok(edited.persisted,'Imported media must persist to IndexedDB');assert.equal(edited.clips,2);
  await page.evaluate(()=>render());fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts','desktop-editor.png'),fullPage:true});
  await page.reload();await page.waitForFunction(()=>typeof getSavedProjects==='function');
  await page.evaluate(async id=>{const project=getSavedProjects().find(item=>item.id===id);if(!project)throw new Error('Saved project missing');await loadProject(project);state.view='editor';render();},edited.projectId);
  assert.equal(await page.evaluate(()=>state.missingMedia),false,'Media must reload without missing-file warnings');
  await page.locator('.timeline-area').waitFor({state:'visible'});
  await page.evaluate(()=>showExport());
  await page.waitForFunction(()=>document.querySelector('[data-export-resolution]'));
  const downloadPromise=page.waitForEvent('download',{timeout:30000});
  await page.locator('[data-export-resolution]').selectOption('720');
  await page.locator('[data-export-format]').selectOption('webm');
  await page.locator('[data-start]').click();
  let download;try{download=await downloadPromise;}catch(error){console.error('Export state:',await page.evaluate(()=>({duration:state.duration,clips:state.clips.map(({type,start,duration})=>({type,start,duration})),modal:document.querySelector('.export-modal')?.innerText})));throw error;}await download.saveAs(path.join(root,'artifacts','smoke-export.webm'));assert.ok(fs.statSync(path.join(root,'artifacts','smoke-export.webm')).size>1000,'Export must contain media');
  const decoded=await page.evaluate(()=>new Promise((resolve,reject)=>{const video=document.createElement('video'),timer=setTimeout(()=>reject(new Error('Export did not decode')),10000);video.onloadeddata=()=>{clearTimeout(timer);resolve({width:video.videoWidth,height:video.videoHeight});};video.onerror=()=>{clearTimeout(timer);reject(new Error('Exported video could not be decoded'));};video.src=document.querySelector('.export-save-link').href;video.load();}));assert.equal(decoded.height,720);assert.ok(decoded.width>0);
  await page.evaluate(()=>document.querySelectorAll('.modal-overlay,.modal-backdrop').forEach(node=>node.remove()));
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{detectRuntimeMode();render();});await page.locator('.timeline-area').waitFor({state:'visible'});await page.locator('#privacy-shortcut').click();await page.locator('[data-privacy-dialog]').waitFor({state:'visible'});await page.locator('[data-close]').first().click();await page.screenshot({path:path.join(root,'artifacts','mobile-editor.png'),fullPage:true});
  const offline=await browser.newContext();const offlinePage=await offline.newPage();await offlinePage.goto(origin);try{await offlinePage.waitForFunction(()=>navigator.serviceWorker.controller!==null,{},{timeout:30000});}catch(error){console.error('Service worker state:',await offlinePage.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {readyState:document.readyState,registration:!!r,active:r?.active?.state,installing:r?.installing?.state,waiting:r?.waiting?.state,controller:!!navigator.serviceWorker.controller,cacheKeys:await caches.keys()};}));throw error;}const offlineFailures=[];offlinePage.on('requestfailed',request=>offlineFailures.push(request.url()+' '+request.failure()));offlinePage.on('pageerror',error=>offlineFailures.push('pageerror '+error.message));await offline.setOffline(true);await offlinePage.reload();try{await offlinePage.waitForFunction(()=>document.getElementById('app').children.length>0);}catch(error){console.error('Offline reload diagnostics:',offlineFailures.slice(0,15));throw error;}await offline.close();
  assert.deepEqual(errors,[],'Browser runtime errors');assert.deepEqual(missing,[],'Missing browser assets');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{detectRuntimeMode();render();});
  const blocked=await page.evaluate(()=>vanessaFetch(vanessaEndpoint('vanessa-global'),{method:'POST',body:'{}'}).catch(error=>error.code));assert.equal(blocked,'PRIVACY_CONSENT_REQUIRED');assert.equal(await page.evaluate(()=>secureAIService.generateAIResponse('vanessa-image',{}).catch(error=>error.code)),'PRIVACY_CONSENT_REQUIRED');
  await page.evaluate(()=>showPrivacySettings());await page.locator('[data-privacy-dialog]').waitFor();assert.ok((await page.locator('[data-privacy-dialog]').innerText()).includes('Jayson Uche'));
  await page.locator('[data-ai-consent]').check();assert.equal(await page.evaluate(()=>ZorifiPrivacy.consent(localStorage,currentUser.id)),true);
  await page.locator('[data-ai-consent]').uncheck();assert.equal(await page.evaluate(()=>ZorifiPrivacy.consent(localStorage,currentUser.id)),false);
  await page.evaluate(()=>localStorage.setItem('unrelated-app','preserve'));
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-erase-privacy]').click();await page.waitForFunction(()=>localStorage.getItem('zorifi-session-v1')===null);await page.waitForFunction(()=>typeof getAccounts==='function'&&getAccounts().length===0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-app')),'preserve');
  const storedMedia=await page.evaluate(async()=>{const db=await openMediaDatabase();const counts=await Promise.all([...db.objectStoreNames].map(name=>new Promise((resolve,reject)=>{const request=db.transaction(name).objectStore(name).count();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);})));db.close();return counts;});assert.ok(storedMedia.every(count=>count===0),'Erasure must remove imported media copies');assert.deepEqual(errors,[],'Privacy controls must not cause runtime errors');console.log('Browser smoke passed: startup, import, editing, save/reload, video export, mobile privacy, offline startup, consent withdrawal and local erasure.');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
