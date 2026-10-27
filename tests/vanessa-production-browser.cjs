const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');
(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const [engine,name]of [[chromium,'Chromium'],[webkit,'WebKit']]){
  const browser=await engine.launch({headless:true,...(name==='Chromium'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
  try{
   const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],requests=[];let release;
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{window.micStarts=0;window.SpeechRecognition=class{constructor(){window.micStarts++;}start(){}stop(){}abort(){}};});
   await page.route('**/api/**',async route=>{
    if(!route.request().url().endsWith('/api/vanessa/chat'))return route.fulfill({status:401,json:{error:'No unrelated cloud service in this fixture.'}});
    const input=route.request().postDataJSON();requests.push({input,auth:route.request().headers().authorization});
    if(input.message==='Delayed split')await new Promise(resolve=>release=resolve);
    const command=/undo/i.test(input.message)?'history.undo':/redo/i.test(input.message)?'history.redo':/save/i.test(input.message)?'project.save':/trim/i.test(input.message)?'clip.trim':/split/i.test(input.message)?'clip.split':null;
    const action=command?{command,target:command.startsWith('clip.')?'clip':null,parameters:command==='clip.split'?{time:2}:command==='clip.trim'?{duration:1,from:'end'}:{}}:null;
    return route.fulfill({json:{sessionId:input.sessionId,requestId:input.requestId,sequence:input.sequence,reply:'A prism separates colours because glass bends each wavelength differently.',text:'A prism separates colours because glass bends each wavelength differently.',actions:action?[action]:[]}}).catch(()=>{});
   });
   const url=`http://127.0.0.1:${server.address().port}`;await page.goto(url);await page.locator('.zorifi-opening').waitFor({state:'detached'});
   await page.evaluate(async()=>{
    firebaseGateway.config={apiKey:'public-fixture',projectId:'fixture'};firebaseGateway.session={uid:'alice-cloud',idToken:'fixture-token',refreshToken:'fixture-refresh',expiresAt:Date.now()+3600000};
    currentUser={id:'alice-local',cloudUid:'alice-cloud',name:'Alice',email:'alice@example.test',language:'en-GB'};syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
    vanessaVoiceEnabled=false;vanessaWakeEnabled=false;ZorifiPrivacy.setConsent(localStorage,currentUser.id,true);createNewProject();state.creatorSettings.addZorifiEnding=false;
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;canvas.getContext('2d').fillRect(0,0,160,90);const blob=await new Promise(resolve=>canvas.toBlob(resolve));window.fixtureBlobPersistence=true;try{await storeProjectMedia(state.projectId,'photo',blob);}catch{window.fixtureBlobPersistence=false;}
    state.mediaAssets=[{id:'photo',name:'Local photo',type:'image',duration:5,width:160,height:90,url:fixtureBlobPersistence?editorResources.createManagedUrl(blob):canvas.toDataURL(),localFile:fixtureBlobPersistence,persisted:fixtureBlobPersistence,generated:!fixtureBlobPersistence}];
    state.clips=[{id:'clip',type:'video',mediaId:'photo',name:'Opening',start:0,duration:5,track:0,scale:100,opacity:100,volume:0,sourceStart:0,playbackRate:1}];state.trackStates={};state.duration=5;state.currentTime=2;state.selected='clip';state.undo=[];state.redo=[];state.view='editor';saveProject();window.fixtureProject=state.projectId;render();ZorifiDirectorBridge.sync();
   });
   assert.equal(await page.evaluate(()=>micStarts),0,'Microphone stays opt-in.');
   await page.evaluate(()=>ZorifiDirectorBridge.open());assert.equal(await page.locator('[data-vanessa-form]').count(),1);
   await page.evaluate(()=>sendToVanessa('Split the selected clip at 2 seconds'));
   assert.equal(await page.evaluate(()=>state.clips.length),1,'AI proposal cannot edit before confirmation.');
   assert.equal(await page.locator('[data-vanessa-confirm="apply"]').count(),1);
   await page.evaluate(()=>resolveVanessaConfirmation(true));
   assert.equal(await page.evaluate(()=>vanessaHistory.at(-1).actionStatus),'SUCCESS',await page.evaluate(()=>vanessaHistory.at(-1).text));
   assert.deepEqual(await page.evaluate(()=>({count:state.clips.length,undo:state.undo.length,busy:vanessaBusy,saved:ZorifiProductionBridge.savedMatches(),last:vanessaHistory.at(-1).actionStatus})),{count:2,undo:1,busy:false,saved:true,last:'SUCCESS'});
   assert.equal(await page.locator('.timeline-area .clip[data-clip]').count(),2,'The actual timeline renders both split clips.');
   await page.evaluate(()=>sendToVanessa('undo'));assert.equal(await page.evaluate(()=>state.clips.length),1);
   await page.evaluate(()=>sendToVanessa('redo'));assert.equal(await page.evaluate(()=>state.clips.length),2);
   await page.evaluate(()=>sendToVanessa('save project'));assert(await page.evaluate(()=>ZorifiProductionBridge.savedMatches()),JSON.stringify(await page.evaluate(()=>vanessaHistory.at(-1))));
   await page.evaluate(()=>{state.selected='clip';return sendToVanessa('Trim the selected clip to 1 second');});assert.equal(await page.evaluate(()=>state.clips[0].duration),2);await page.evaluate(()=>resolveVanessaConfirmation(true));assert.equal(await page.evaluate(()=>state.clips[0].duration),1);await page.evaluate(()=>sendToVanessa('undo'));assert.equal(await page.evaluate(()=>state.clips[0].duration),2);
   await page.evaluate(async()=>{state.selected='clip';const result=await ZorifiProductionBridge.execute({actions:[{command:'clip.trim',target:'clip',parameters:{duration:1}}]});vanessaPendingPlan=result.plan;state.clips[0].name='Manual change';await resolveVanessaConfirmation(true);});
   assert.deepEqual(await page.evaluate(()=>({duration:state.clips[0].duration,name:state.clips[0].name,busy:vanessaBusy,status:vanessaHistory.at(-1).actionStatus})),{duration:2,name:'Manual change',busy:false,status:'FAILED'});
   await page.evaluate(()=>{window.pendingTurn=ZorifiProductionBridge.request({message:'Delayed split',context:vanessaEditorContext()},{intent:'editing'}).then(()=>false,error=>error.name==='AbortError');});
   while(!release)await new Promise(resolve=>setTimeout(resolve,10));await page.evaluate(()=>cancelVanessaStream());release();release=null;assert(await page.evaluate(()=>pendingTurn));assert.equal(await page.evaluate(()=>state.clips.length),2);
   const navigated=await page.evaluate(async()=>{const original=firebaseGateway.getIdToken;let releaseAuth;firebaseGateway.getIdToken=()=>new Promise(resolve=>releaseAuth=resolve);const pending=ZorifiProductionBridge.execute({actions:[{command:'clip.trim',target:'clip',parameters:{duration:1}}]},{confirmed:true}).then(()=>false,error=>/changed/.test(error.message));state.view='home';releaseAuth('fixture-token');const rejected=await pending;firebaseGateway.getIdToken=original;state.view='editor';return {rejected,duration:state.clips[0].duration};});assert.deepEqual(navigated,{rejected:true,duration:2},'Navigating away while auth is pending must not mutate the hidden project.');
   const isolation=await page.evaluate(async()=>{const old=currentUser,session=firebaseGateway.session;currentUser={id:'bob-local',cloudUid:'bob-cloud',name:'Bob'};firebaseGateway.session={uid:'bob-cloud',idToken:'bob-token',expiresAt:Date.now()+3600000};const media=await getProjectMedia(fixtureProject,'photo'),projects=getSavedProjects();firebaseGateway.session={...session,uid:'wrong-cloud'};currentUser=old;let rejected=false;try{await ZorifiProductionBridge.request({message:'hello'});}catch{rejected=true;}firebaseGateway.session=session;return {media:media===null,projects:projects.length,rejected};});
   assert.deepEqual(isolation,{media:true,projects:0,rejected:true});
   const persisted=await page.evaluate(()=>{saveProject();return {project:getSavedProjects().find(p=>p.id===fixtureProject),profile:currentUser,session:firebaseGateway.session,blobPersistence:fixtureBlobPersistence};});
   await page.reload();await page.locator('.zorifi-opening').waitFor({state:'detached'});
   const restored=await page.evaluate(async data=>{firebaseGateway.config={apiKey:'public-fixture',projectId:'fixture'};firebaseGateway.session=data.session;currentUser=data.profile;syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();await loadProject(getSavedProjects().find(p=>p.id===data.project.id));return {count:state.clips.length,name:state.clips[0].name,blob:data.blobPersistence?(await getProjectMedia(data.project.id,'photo'))?.size>0:state.mediaAssets[0].url.startsWith('data:image/png')};},persisted);
   assert.deepEqual(restored,{count:2,name:'Manual change',blob:true});
   await page.evaluate(()=>{vanessaVoiceEnabled=false;return sendToVanessa('Why does a prism split white light?');});assert.match(await page.evaluate(()=>vanessaHistory.at(-1).text),/wavelength/);
   assert(requests.every(item=>item.auth==='Bearer fixture-token'));assert.deepEqual(errors,[]);
   await page.screenshot({path:`artifacts/v5-${name.toLowerCase()}.png`});console.log(`${name}: real split/visible timeline, confirmation, Undo/Redo, save/reload with device media (${persisted.blobPersistence?'IndexedDB Blob':'data URL; this Windows WebKit cannot store Blobs'}), stale proposal, Stop, ordinary reply, opt-in mic and account isolation passed (${requests.length} authenticated fixture requests).`);
   await context.close();
  }finally{await browser.close();}
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
