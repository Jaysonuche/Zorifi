const assert=require('node:assert/strict');
const {chromium}=require('playwright'),fs=require('node:fs'),{createServer}=require('../scripts/dev-server.cjs');
(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,cloudSpeechRequests=0;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/api/**',route=>{if(new URL(route.request().url()).searchParams.get('service')==='vanessa-speech')cloudSpeechRequests++;return route.fulfill({status:401,json:{error:'No provider used by device-voice probe.'}});});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.zorifi-opening').waitFor({state:'detached'});
  const pending=page.evaluate(async()=>{
   const synthesis=window.speechSynthesis;if(!synthesis)return {supported:false};
   await new Promise(resolve=>{if(synthesis.getVoices().length)return resolve();const timer=setTimeout(done,2500);function done(){clearTimeout(timer);synthesis.removeEventListener('voiceschanged',done);resolve();}synthesis.addEventListener('voiceschanged',done);});
   currentUser={id:'device-voice-probe',name:'Voice tester',language:'en-GB'};syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();localStorage.setItem('zorifi-director-introduced-v1:'+currentUser.id,'true');state.view='home';vanessaOpen=false;render();ZorifiDirectorBridge.sync();vanessaVoiceEnabled=true;
   const service=getVanessaVoiceService(),selected=service.selectedVoice('en-GB');if(selected)service.selectVoice(ZorifiVanessaVoice.voiceId(selected));
   const events=[];window.__voiceProbeEvents=events;
   const record=event=>events.push({status:event.detail.status,charIndex:event.detail.charIndex,code:event.detail.code,highlight:document.querySelector('.director-caption-word.is-current')?.textContent||null,subtitle:document.querySelector('[data-director-caption-text]')?.textContent||''});
   window.addEventListener('zorifi:vanessa-speech',record);
   const text='Hello. I am Vanessa, ready to help with your edit.',job=await speakAsVanessa(text),completion=await job.completion;
   window.removeEventListener('zorifi:vanessa-speech',record);const selectedVoice=service.selectedVoice('en-GB')?.name;
   disposeVanessaVoiceService();const recreatedSelection=getVanessaVoiceService().selectedVoice('en-GB')?.name;
   return {supported:true,actualDeviceSpeech:true,physicalMicrophoneTested:false,text,selectedVoice,recreatedSelection,voices:synthesis.getVoices().map(voice=>({name:voice.name,language:voice.lang,local:voice.localService})),completion,events};
  });
  await page.waitForFunction(()=>window.__voiceProbeEvents?.some(event=>event.status==='speaking'),undefined,{timeout:20000});
  await page.screenshot({path:'artifacts/vanessa-real-device-voice.png'});
  const result=await pending;
  assert.equal(result.supported,true,'Installed Windows Edge must expose device speech for this hardware probe.');assert.equal(result.completion.status,'ended');assert.equal(cloudSpeechRequests,0);assert(result.events.some(event=>event.status==='speaking'));assert(result.events.some(event=>event.status==='boundary'&&event.highlight));assert.equal(result.events.at(-1).status,'ended');assert(result.events.filter(event=>event.subtitle).every(event=>event.subtitle===result.text));assert.equal(result.recreatedSelection,result.selectedVoice);
  await page.reload();await page.locator('.zorifi-opening').waitFor({state:'detached'});await page.waitForFunction(()=>speechSynthesis.getVoices().length>0);
  result.refreshedSelection=await page.evaluate(()=>{currentUser={id:'device-voice-probe',name:'Voice tester',language:'en-GB'};return getVanessaVoiceService().selectedVoice('en-GB')?.name;});
  assert.equal(result.refreshedSelection,result.selectedVoice,'Explicit voice selection survives a real page refresh.');result.cloudSpeechRequests=cloudSpeechRequests;
  fs.writeFileSync('artifacts/vanessa-device-voice-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
