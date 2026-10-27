const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const [browserType,name] of [[chromium,'Chromium'],[webkit,'WebKit']]){
  const browser=await browserType.launch({headless:true,...(name==='Chromium'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
  try{
   const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   // The integration fixtures never contact a paid generation or speech service.
   await page.route('**/api/**',route=>route.fulfill({status:401,json:{error:'No remote provider in this browser fixture.'}}));
   await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});await page.locator('.zorifi-opening').waitFor({state:'detached'});await page.waitForFunction(()=>Boolean(window.ZorifiDirectorBridge&&window.ZorifiMasterApp));
   await page.evaluate(()=>{
    window.directorGateway=ZorifiMasterApp.aiGateway.generateAIResponse;
    window.setupCompanionFixture=()=>{
     currentUser={id:'director-companion-test',name:'Director Test',email:'director@example.test',language:'en-GB'};syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
     localStorage.setItem('zorifi-director-introduced-v1:'+currentUser.id,'true');vanessaVoiceEnabled=false;vanessaWakeEnabled=false;vanessaOpen=false;
     createNewProject();state.creatorSettings.addZorifiEnding=false;
     const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const drawing=canvas.getContext('2d');drawing.fillStyle='#794bdc';drawing.fillRect(0,0,160,90);
     state.mediaAssets=[{id:'photo',name:'Photo',type:'image',duration:5,width:160,height:90,url:canvas.toDataURL()},{id:'music-source',name:'Score',type:'audio',duration:30,url:'assets/template-sounds/cinematic-travel.wav'}];
     state.clips=[{id:'a',type:'video',mediaId:'photo',track:0,start:0,duration:5,sourceStart:0,playbackRate:1,name:'Opening',scale:100,opacity:100,volume:0},{id:'b',type:'video',mediaId:'photo',track:0,start:5,duration:5,sourceStart:0,playbackRate:1,name:'Closing',scale:100,opacity:100,volume:0},{id:'score',type:'audio',mediaId:'music-source',track:1,start:0,duration:10,sourceStart:0,playbackRate:1,name:'Score',volume:50,audioEffects:{role:'music'}}];
     state.trackStates={};state.duration=10;state.currentTime=2;state.selected='a';state.undo=[];state.redo=[];state.view='editor';
     ZorifiPrivacy.setConsent(localStorage,currentUser.id,false);ZorifiMasterApp.aiGateway.generateAIResponse=directorGateway;render();ZorifiDirectorBridge.sync();
    };
    window.cloudCompanionPlan={actions:[{command:'transition.apply',target:'b',parametersJson:JSON.stringify({id:'dissolve',duration:.35})}]};
    window.deferCompanionPlan=()=>{ZorifiPrivacy.setConsent(localStorage,currentUser.id,true);ZorifiMasterApp.aiGateway.generateAIResponse=()=>new Promise(resolve=>window.releaseCompanionPlan=()=>resolve(cloudCompanionPlan));};
    setupCompanionFixture();
   });
   const local=await page.evaluate(async()=>{
    const result=await ZorifiVanessaDirector.handleUserRequest('Take over and add smooth transitions.');
    const value={status:result.status,message:result.message,planner:result.director?.planner,undo:state.undo.length,ids:state.clips.map(clip=>clip.id),starts:state.clips.map(clip=>clip.start),transition:state.clips.find(clip=>clip.id==='b').transition,fade:state.clips.find(clip=>clip.id==='score').audioFadeOut,time:state.currentTime};undo();return {...value,restoredTransition:state.clips.find(clip=>clip.id==='b').transition||null,restoredFade:state.clips.find(clip=>clip.id==='score').audioFadeOut||0};
   });
   assert.equal(local.status,'SUCCESS',JSON.stringify(local));assert.equal(local.planner,'device');assert.equal(local.undo,1);assert.deepEqual(local.ids,['a','b','score']);assert.deepEqual(local.starts,[0,5,0]);assert.equal(local.transition,'dissolve');assert(local.fade>0);assert.equal(local.time,2);assert.equal(local.restoredTransition,null);assert.equal(local.restoredFade,0);
   const guidance=await page.evaluate(async()=>{setupCompanionFixture();const result=await ZorifiDirectorBridge.handleTurn('Guide me through this edit.');return {status:result.status,message:result.message,undo:state.undo.length};});
   assert.equal(guidance.status,'SUCCESS');assert.match(guidance.message,/2 visual clips.*1 separate audio clips.*2 tracks/);assert.match(guidance.message,/lasts 5\.0s/);assert.equal(guidance.undo,0);
   const cloud=await page.evaluate(async()=>{
    setupCompanionFixture();ZorifiPrivacy.setConsent(localStorage,currentUser.id,true);let seen;
    ZorifiMasterApp.aiGateway.generateAIResponse=async(service,payload,options)=>{seen={service,commands:payload.context.capabilities.commands,hasSignal:Boolean(options.signal)};return cloudCompanionPlan;};
    const result=await ZorifiVanessaDirector.handleUserRequest('Take over and smooth the joins.');return {status:result.status,planner:result.director?.planner,undo:state.undo.length,transition:state.clips[1].transition,seen};
   });
   assert.equal(cloud.status,'SUCCESS');assert.equal(cloud.planner,'gemini');assert.equal(cloud.undo,1);assert.equal(cloud.transition,'dissolve');assert.equal(cloud.seen.service,'vanessa');assert(cloud.seen.hasSignal);assert(cloud.seen.commands.includes('clip.trim'));assert(!cloud.seen.commands.includes('clip.delete'));
   const invalid=await page.evaluate(async()=>{
    const cases=[];for(const scenario of ['unsupported','locked','source-bounds']){
     setupCompanionFixture();ZorifiPrivacy.setConsent(localStorage,currentUser.id,true);if(scenario==='locked')state.trackStates[0]={locked:true};if(scenario==='source-bounds')state.clips[2].sourceStart=25;
     const before=JSON.stringify(state.clips);ZorifiMasterApp.aiGateway.generateAIResponse=async()=>({actions:[scenario==='unsupported'?{command:'clip.delete',target:'a',parameters:{}}:{command:'transition.apply',target:'b',parameters:{id:'dissolve',duration:.35}}]});
     let message;try{await ZorifiVanessaDirector.handleUserRequest('Take over and improve this edit.');}catch(error){message=error.message;}
     cases.push({scenario,message,unchanged:JSON.stringify(state.clips)===before,undo:state.undo.length});
    }return cases;
   });
   assert(invalid.every(value=>value.message&&value.unchanged&&value.undo===0),JSON.stringify(invalid));
   const guards=await page.evaluate(async()=>{
    const values=[];
    for(const scenario of ['cancel','timeline','selection','project','account']){
     setupCompanionFixture();deferCompanionPlan();const starting=JSON.stringify(state.clips),oldProject=state.projectId,request=ZorifiVanessaDirector.handleUserRequest('Take over and add smooth transitions.').then(result=>({result}),error=>({error:error.message}));
     let busy;try{await ZorifiVanessaDirector.handleUserRequest('Take over.');}catch(error){busy=error.message;}
     if(scenario==='cancel')ZorifiVanessaDirector.cancel();
     if(scenario==='timeline')state.clips[0].name='Manual rename while planning';
     if(scenario==='selection')state.selected='b';
     if(scenario==='project'){state.projectId='replacement-project';state.clips=[{id:'replacement',type:'video',mediaId:'photo',name:'Replacement',track:0,start:0,duration:2,scale:100,opacity:100}];state.undo=[];}
     if(scenario==='account'){currentUser={id:'replacement-user',name:'Replacement',email:'other@example.test'};ZorifiDirectorBridge.sync();}
     releaseCompanionPlan();const result=await request;await new Promise(resolve=>setTimeout(resolve,40));
     values.push({scenario,busy,error:result.error,undo:state.undo.length,clipIds:state.clips.map(clip=>clip.id),projectId:state.projectId,owner:currentUser.id,manualName:state.clips[0].name,unchanged:JSON.stringify(state.clips)===starting,oldProject});
    }return values;
   });
   assert(guards.every(value=>/already/.test(value.busy)&&value.error&&value.undo===0),JSON.stringify(guards));
   assert(guards.find(value=>value.scenario==='cancel').unchanged);assert(guards.find(value=>value.scenario==='selection').unchanged);assert.equal(guards.find(value=>value.scenario==='timeline').manualName,'Manual rename while planning');assert.deepEqual(guards.find(value=>value.scenario==='project').clipIds,['replacement']);assert.equal(guards.find(value=>value.scenario==='project').projectId,'replacement-project');assert.equal(guards.find(value=>value.scenario==='account').owner,'replacement-user');assert(guards.find(value=>value.scenario==='account').unchanged);
   const legacy=await page.evaluate(async()=>{setupCompanionFixture();const result=await executeVanessaPlan({actions:[{command:'clip.set',target:'a',parameters:{property:'scale',value:110}}]});return {status:result.status,scale:state.clips[0].scale,undo:state.undo.length};});assert.equal(legacy.status,'SUCCESS');assert.equal(legacy.scale,110);assert.equal(legacy.undo,1);
   await page.evaluate(()=>ZorifiDirectorBridge.open());await page.locator('[data-director-mode]').selectOption('director');assert.equal(await page.evaluate(()=>ZorifiVanessaDirector.currentMode),'director');await page.locator('[data-director-idle-help]').uncheck();assert.equal(await page.locator('[data-director-idle-help]').isChecked(),false);assert.equal(await page.locator('.vanessa-assistant').count(),1);
   assert.deepEqual(errors,[]);console.log(`${name}: local/cloud Director edits, one Undo, actual timeline guidance, validation, cancellation, busy/stale account/project guards, legacy editing and live mode controls passed.`);await context.close();
  }finally{await browser.close();}
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
