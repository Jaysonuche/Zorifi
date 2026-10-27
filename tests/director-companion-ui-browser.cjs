const assert=require('node:assert/strict'),{chromium,webkit}=require('playwright'),{createServer}=require('../scripts/dev-server.cjs');
function wav(){const count=32000,buffer=Buffer.alloc(44+count*2);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(16000,24);buffer.writeUInt32LE(32000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)buffer.writeInt16LE(Math.sin(i*440*Math.PI*2/16000)*1200,44+i*2);return buffer;}
(async()=>{const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{
 for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){
  if(process.env.ZORIFI_TEST_BROWSER&&process.env.ZORIFI_TEST_BROWSER!==name)continue;
  const browser=await type.launch({headless:true,...(name==='Chromium'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
  try{const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1440,height:1000}}),errors=[];let speechRequests=0;page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/api/**',route=>{if(new URL(route.request().url()).searchParams.get('service')==='vanessa-speech'){speechRequests++;return route.fulfill({status:200,contentType:'audio/wav',body:wav()});}return route.fulfill({status:401,json:{error:'Fixture: no paid provider'}});});
   await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.zorifi-opening').waitFor({state:'detached'});
   await page.evaluate(()=>{currentUser={id:'companion-ui',name:'Studio tester',email:'studio@example.invalid',language:'en-GB'};syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();ZorifiPrivacy.setConsent(localStorage,currentUser.id,false);state.view='home';vanessaOpen=false;vanessaWakeEnabled=false;vanessaVoiceEnabled=false;const blocker=document.createElement('div');blocker.className='modal-backdrop';blocker.id='test-intro-blocker';document.body.appendChild(blocker);render();});
   await page.waitForTimeout(1700);assert.equal(await page.evaluate(()=>localStorage.getItem('zorifi-director-introduced-v1:companion-ui')),null);
   await page.locator('#test-intro-blocker').evaluate(node=>node.remove());await page.waitForFunction(()=>localStorage.getItem('zorifi-director-introduced-v1:companion-ui')==='true');
   assert.match(await page.locator('[data-director-caption-text]').textContent(),/creative co-partner/);assert(await page.locator('[data-director-hint]').isVisible());
   await page.locator('[data-director-caption-close]').click();await page.evaluate(()=>render());await page.waitForTimeout(1650);assert.equal(await page.locator('[data-director-caption]').isVisible(),false);
   for(const [width,height] of [[320,568],[390,844],[768,1024],[1440,1000],[320,250]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>{detectRuntimeMode();syncVisualViewport();render();ZorifiDirectorBridge.announce('Vanessa is ready to help with your next edit.',{voice:false});});await page.waitForTimeout(120);
    for(const selector of ['[data-director-open]','.director-companion-notes']){const box=await page.locator(selector).boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,selector+JSON.stringify(box));}
    if(name==='Chromium'&&height>250)await page.screenshot({path:`artifacts/director-companion-${width}.png`});
   }
   await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{detectRuntimeMode();createNewProject();state.creatorSettings.addZorifiEnding=false;render();});
   await page.locator('[data-director-open]').click();assert.equal(await page.locator('.inspector-embedded').count(),1);assert.equal(await page.locator('.vanessa-assistant').count(),1);assert.equal(await page.locator('[data-director-companion]').isVisible(),false);
   if(name==='Chromium')await page.locator('.inspector').screenshot({path:'artifacts/director-companion-editor-chat.png'});
   await page.locator('.vanessa-close').click();
   const idle=await page.evaluate(()=>{const e=ZorifiVanessaDirector;e.recordInteraction();e.lastInteractionTime=Date.now()-16000;state.playing=true;const playing=e.onUserInactive();state.playing=false;const input=document.querySelector('.topbar input');input?.focus();const typing=e.onUserInactive();input?.blur();const shown=e.onUserInactive(),again=e.onUserInactive();return {playing,typing,shown,again};});assert.deepEqual(idle,{playing:false,typing:false,shown:true,again:false});
   const audio=await page.evaluate(async()=>{vanessaVoiceEnabled=true;vanessaFetch=(_url,options)=>fetch('/api/vanessa-provider?service=vanessa-speech',options);await speakAsVanessa('Hello from Vanessa.');return vanessaVoicePlaybackState;});
   if(audio==='blocked'){await page.locator('[data-director-open]').click();await page.locator('[data-vanessa-play-reply]').click();await page.locator('.vanessa-close').click();}
   await page.waitForFunction(()=>['speaking','error','idle'].includes(vanessaVoicePlaybackState));
   const actual=await page.evaluate(()=>({state:vanessaVoicePlaybackState,text:document.querySelector('[data-director-caption-text]').textContent}));
   if(actual.state==='speaking'){assert.equal(actual.text,'Hello from Vanessa.');await page.waitForFunction(()=>vanessaVoicePlaybackState==='idle');assert.equal(await page.locator('[data-director-caption-text]').textContent(),'');console.log(`${name}: real WAV playback drove speech captions and cleared them on end.`);}
   else {assert.equal(actual.state,'error','Audio must either really play or expose its unavailable state.');assert(actual.text);console.log(`${name}: unavailable audio is reported truthfully; no simulated speech. ${actual.text}`);}
   assert.equal(speechRequests,1);
   await page.evaluate(()=>{vanessaVoiceEnabled=false;ZorifiDirectorBridge.announce('Private account caption',{voice:false});currentUser=null;render();});assert.equal(await page.locator('[data-director-companion]').isVisible(),false);assert.equal(await page.locator('[data-director-caption-text]').textContent(),'');assert.equal(await page.evaluate(()=>window.ZorifiVanessaDirector),null);
   assert.deepEqual(errors,[]);console.log(`${name}: first-use/modal defer, once-only intro, fitted phone/tablet/desktop orb, shared chat, idle playback/typing suppression and logout cleanup passed.`);
  }finally{await browser.close();}
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
