const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
async function main(){
 const data=fs.mkdtempSync(path.join(root,'artifacts','desktop-profile-'));
 const port=49170;const env={...process.env,ZORIFI_SMOKE_DATA:data,ZORIFI_SMOKE_PORT:String(port)};delete env.ELECTRON_RUN_AS_NODE;
 const executable=process.env.ZORIFI_DESKTOP_EXECUTABLE||require('electron');
 const child=spawn(executable,process.env.ZORIFI_DESKTOP_EXECUTABLE?[]:['.'],{cwd:root,env,windowsHide:true,stdio:'pipe'});let log='';child.on('error',error=>{log+=error.message;});child.stderr?.on('data',data=>log+=data);child.stdout?.on('data',data=>log+=data);
 let browser;
 try{
  for(let i=0;i<60;i++){if(child.exitCode!==null)throw new Error(log);try{const result=await fetch(`http://127.0.0.1:${port}/json/version`);if(result.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  for(let i=0;i<30&&!page;i++){page=browser.contexts()[0]?.pages()[0];if(!page)await new Promise(resolve=>setTimeout(resolve,500));}
  assert.ok(page,'Desktop window did not open.');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.reload();await page.locator('#zorifi-startup').waitFor({state:'detached'});
  await page.evaluate(()=>{currentUser={id:'desktop-smoke',name:'Desktop Test'};syncPhase10Stores();termsAcceptance.accept();createNewProject();});
  await page.locator('.timeline-area').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.ZorifiMasterApp?.state===state&&typeof ZorifiMasterApp.enhanceSelectedClipAudio==='function'),true);
  const settings=await page.evaluate(()=>fetch('/api/ai-settings').then(response=>response.json()));assert.ok(settings.configurations.language);
  assert.equal(await page.evaluate(()=>firebaseGateway.configured()),true,'Desktop must load the public Firebase config before authentication.');
  assert.equal(await page.evaluate(()=>fetch('/zorifi-local-companion.js').then(response=>response.status)),200);
  const appOrigin=`http://127.0.0.1:${port+1}`;
  for(const asset of ['zorifi-opening.js','zorifi-opening.css','zorifi-editor-future.css','zorifi-music-future.css','zorifi-vanessa-future.css']){
   const response=await fetch(`${appOrigin}/${asset}`);
   assert.equal(response.status,200,`Desktop must serve ${asset}`);
  }
  const captions=await fetch(`${appOrigin}/assets/tutorial/zorifi-tour.vtt`);
  assert.equal(captions.headers.get('content-type'),'text/vtt');
  const tourRange=await fetch(`${appOrigin}/assets/tutorial/zorifi-tour.mp4`,{headers:{Range:'bytes=0-31'}});
  assert.equal(tourRange.status,206);
  assert.equal((await tourRange.arrayBuffer()).byteLength,32);
  const localEndpoint=`http://127.0.0.1:${port+1}`;
  if(settings.hostedLanguage){
   const unauthenticated=await fetch(`${localEndpoint}/api/vanessa-provider?service=vanessa-global`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'What is 2 x 4?'})});
   assert.equal(unauthenticated.status,401);
   assert.match((await unauthenticated.json()).error,/Sign in/);
  }
  const companionOrigin='https://zorifi.vercel.app';
  const companionSettings=await fetch(`${localEndpoint}/api/ai-settings`,{headers:{Origin:companionOrigin}});
  assert.equal(companionSettings.status,200);
  assert.equal(companionSettings.headers.get('access-control-allow-origin'),companionOrigin);
  const companionBody=await companionSettings.json();
  assert.equal(companionBody.configurations.music.provider,'Local CPU');
  assert.deepEqual(Object.keys(companionBody.configurations),['music']);
  const preflight=await fetch(`${localEndpoint}/api/vanessa-music`,{method:'OPTIONS',headers:{Origin:companionOrigin,'Access-Control-Request-Method':'POST','Access-Control-Request-Private-Network':'true'}});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-private-network'),'true');
  const denied=await fetch(`${localEndpoint}/api/vanessa-music`,{method:'POST',headers:{Origin:'https://example.org','Content-Type':'application/json'},body:JSON.stringify({prompt:'gentle piano',duration:5})});
  assert.equal(denied.status,403);
  if(process.env.ZORIFI_TEST_LOCAL_MUSIC==='1'){
   assert.equal(settings.configurations.music.provider,'Local CPU');
   assert.equal(settings.configurations.music.configured,true);
   const started=await fetch(`${localEndpoint}/api/vanessa-music`,{method:'POST',headers:{Origin:companionOrigin,'Content-Type':'application/json'},body:JSON.stringify({action:'start',prompt:'gentle ambient piano and soft drums',duration:5,vocals:'instrumental'})});
   assert.equal(started.status,200);
   const requestId=(await started.json()).requestId;assert.ok(requestId);
   let completed;
   for(let i=0;i<200;i++){
    await new Promise(resolve=>setTimeout(resolve,1500));
    const response=await fetch(`${localEndpoint}/api/vanessa-music`,{method:'POST',headers:{Origin:companionOrigin,'Content-Type':'application/json'},body:JSON.stringify({action:'status',requestId})});
    completed=await response.json();
    if(completed.status!=='running')break;
   }
   assert.equal(completed.status,'complete',completed.error);
   assert.match(completed.url,/^data:audio\/wav;base64,/);
   const wav=Buffer.from(completed.url.split(',')[1],'base64');
   assert.equal(wav.toString('ascii',0,4),'RIFF');
   assert.equal(wav.toString('ascii',8,12),'WAVE');
   assert.ok(wav.length>10000);
   console.log(`Desktop local music render passed: 5-second WAV (${wav.length} bytes).`);
  }
  const peaks=await page.evaluate(async()=>{
   const pipeline=new ZorifiOptimization.AudioWorkerPipeline();
   try{return await pipeline.analyzeAudio(new Float32Array([0,1,0,0]).buffer,{sampleCount:2});}
   finally{pipeline.terminate();}
  });assert.deepEqual(peaks,[1,0]);
  const multicamOffset=await page.evaluate(async()=>{
   let seed=17;const samples=Float32Array.from({length:301},()=>{seed=seed*16807%2147483647;return seed/2147483647;}),delayed=new Float32Array(311);delayed.set(samples,10);
   const engine=new ZorifiMulticamSyncEngine();try{return (await engine.matchEnvelopes({envelope:samples,sampleRate:100},{envelope:delayed,sampleRate:100})).offsetSeconds;}finally{await engine.dispose();}
  });assert.equal(multicamOffset,-.1);
  await page.locator('#privacy-shortcut').click();assert.ok((await page.locator('[data-privacy-dialog]').innerText()).includes('zorifvideoeditor@gmail.com'));assert.equal(await page.evaluate(()=>ZorifiPrivacy.consent(localStorage,currentUser.id)),false);await page.locator('[data-close]').first().click();
  assert.deepEqual(errors,[]);console.log('Desktop smoke passed: Electron runtime, editor, tutorial assets, waveform worker, local provider settings and privacy controls.');
 }finally{await browser?.close();child.kill();}
}
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});main().catch(error=>{console.error(error);process.exitCode=1;});
