const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

// Local authentication/provider fixtures exercise the real proposal, native
// history, saving and renderer. Every provider request is intercepted.
(async()=>{
 fs.mkdirSync('artifacts',{recursive:true});
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors=[];
  let requests=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{
   const request=route.request();
   if(!request.url().endsWith('/api/vanessa/chat'))return route.fulfill({status:401,json:{error:'Provider disabled in local mask fixture.'}});
   const input=request.postDataJSON();requests++;
   assert.equal(input.intent,'professional');
   return route.fulfill({json:{sessionId:input.sessionId,requestId:input.requestId,sequence:input.sequence,title:'Animate the editable mask',strategy:'Rotate the existing path mask without changing its layer.',reply:'Review the native mask animation.',actions:[
    {command:'motion.edit',target:'subject',parameters:{operation:'mask.set',dataJson:JSON.stringify({x:0,y:0,rotation:0,invert:false})}},
    ...[[0,0],[2,90]].map(([time,value])=>({command:'motion.edit',target:'subject',parameters:{operation:'animation.keyframe',dataJson:JSON.stringify({property:'mask:rotation',time,value,easing:'linear'})}}))
   ],observations:[],warnings:['Local provider fixture; no live model call.']}});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('.zorifi-opening').waitFor({state:'detached'});
  await page.evaluate(()=>{
   firebaseGateway.config={apiKey:'fixture-public',projectId:'fixture'};
   firebaseGateway.session={uid:'mask-cloud',idToken:'mask-fixture-token',refreshToken:'fixture-refresh',expiresAt:Date.now()+3600000};
   currentUser={id:'mask-local',cloudUid:'mask-cloud',name:'Mask editor',language:'en-GB'};
   syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
   vanessaVoiceEnabled=false;vanessaWakeEnabled=false;ZorifiPrivacy.setConsent(localStorage,currentUser.id,true);
   createNewProject();state.creatorSettings.addZorifiEnding=false;
   state.clips=[];state.mediaAssets=[];state.trackStates={};state.frameWidth=320;state.frameHeight=180;state.ratio='16 / 9';
   state.duration=10;state.currentTime=0;state.view='editor';state.activePanel='motion-scenes';state.undo=[];state.redo=[];
   ZorifiMotionWorkspace.apply({command:'layer.create',parameters:{id:'subject',kind:'shape',duration:10,geometry:{type:'rectangle',width:250,height:150,roundness:0,fill:'#ffffff'}}});
   render();ZorifiDirectorBridge.sync();
   window.maskPixels=(time=0,project=state)=>{
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
    ZorifiMotionRenderer.draw(canvas.getContext('2d'),project,time);
    const data=canvas.getContext('2d').getImageData(0,0,320,180).data;
    const bounds={left:320,right:-1,top:180,bottom:-1};let mass=0,xmass=0,ymass=0;
    for(let y=0;y<180;y++)for(let x=0;x<320;x++){
     const alpha=data[(y*320+x)*4+3];mass+=alpha;xmass+=alpha*(x+.5);ymass+=alpha*(y+.5);
     if(alpha>100){bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);}
    }
    return {bounds,mass,center:{x:xmass/mass,y:ymass/mass},alpha:[...data].filter((_,i)=>i%4===3)};
   };
  });

  await page.getByText('Track matte and masks',{exact:true}).click();
  let form=page.locator('[data-motion-form="mask"]');
  await form.locator('[name="type"]').selectOption('rectangle');
  for(const [name,value]of Object.entries({width:100,height:20,x:25,y:0,rotation:90}))await form.locator('[name="'+name+'"]').fill(String(value));
  const historyBefore=await page.evaluate(()=>state.undo.length);
  await form.getByRole('button',{name:'Apply editable mask',exact:true}).click();
  const vertical=await page.evaluate(()=>maskPixels());
  assert.deepEqual(vertical.bounds,{left:175,right:194,top:40,bottom:139});
  assert.equal(await page.evaluate(()=>state.clips[0].rotation),0);
  assert.equal(await page.evaluate(()=>state.undo.length),historyBefore+1);
  await page.evaluate(()=>{undo();redo();});
  assert.deepEqual(await page.evaluate(()=>maskPixels().bounds),vertical.bounds);

  form=page.locator('[data-motion-form="mask"]');await form.locator('[name="invert"]').check();
  await form.getByRole('button',{name:'Apply editable mask',exact:true}).click();
  const inverted=await page.evaluate(()=>maskPixels());
  const full=await page.evaluate(()=>{const p=structuredClone(state);delete p.clips[0].motion.mask;return maskPixels(0,p);});
  assert(vertical.alpha.every((alpha,i)=>Math.abs(alpha+inverted.alpha[i]-full.alpha[i])<=1),'Inverted mask complements the visible layer.');

  const vertices=[{x:-60,y:-15,out:[20,-5]},{x:60,y:-15,in:[-20,-5]},{x:60,y:15},{x:-60,y:15}];
  await page.evaluate(points=>ZorifiMotionWorkspace.apply({command:'mask.set',target:'subject',parameters:{type:'path',points,closed:true,opacity:50,invert:false,x:0,y:0,rotation:0}}),vertices);
  form=page.locator('[data-motion-form="mask"]');assert.equal(await form.locator('[name="type"]').inputValue(),'path');
  await form.locator('[name="x"]').fill('12');await form.locator('[name="rotation"]').fill('25');
  await form.getByRole('button',{name:'Apply editable mask',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>state.clips[0].motion.mask.points),vertices);
  const beforePen=await page.evaluate(()=>structuredClone(state.clips[0].motion.mask));
  await page.locator('[data-motion-pen="mask"]').click();await page.locator('[data-path-apply]').click();
  const afterPen=await page.evaluate(()=>structuredClone(state.clips[0].motion.mask));
  for(const key of ['points','opacity','rotation','x','invert'])assert.deepEqual(afterPen[key],beforePen[key]);
  await page.getByText('Keyframes and curves',{exact:true}).click();
  const keyForm=page.locator('[data-motion-form="key"]');
  await keyForm.locator('[name="property"]').selectOption('mask:rotation');
  await keyForm.locator('[name="time"]').fill('0');await keyForm.locator('[name="value"]').fill('25');
  await keyForm.getByRole('button',{name:'Add or replace keyframe',exact:true}).click();
  assert.equal(await page.evaluate(()=>ZorifiMotionGraph.evaluate(state,0).layers[0].mask.rotation),25);

  const beforePlan=await page.evaluate(()=>({data:JSON.stringify(state.clips),undo:state.undo.length}));
  await page.evaluate(()=>sendToVanessa('Create an editable motion graphics animation rotating the selected path mask from 0 to 90 degrees over two seconds.'));
  assert.equal(await page.evaluate(()=>vanessaHistory.at(-1).actionStatus),'REQUIRES_CONFIRMATION',await page.evaluate(()=>vanessaHistory.at(-1).text));
  assert.deepEqual(await page.evaluate(()=>({data:JSON.stringify(state.clips),undo:state.undo.length})),beforePlan);
  await page.evaluate(()=>resolveVanessaConfirmation(true));
  assert.equal(await page.evaluate(()=>vanessaHistory.at(-1).actionStatus),'SUCCESS',await page.evaluate(()=>vanessaHistory.at(-1).text));
  assert.equal(await page.evaluate(()=>state.undo.length),beforePlan.undo+1);
  const mid=await page.evaluate(()=>maskPixels(1));
  await page.evaluate(()=>maskPixels(.2));assert.deepEqual(await page.evaluate(()=>maskPixels(1)),mid);
  assert.equal(await page.evaluate(()=>ZorifiMotionGraph.evaluate(state,1).layers[0].mask.rotation),45);
  assert.deepEqual(await page.evaluate(()=>state.clips[0].motion.mask.points),vertices);
  await page.evaluate(()=>undo());assert.equal(await page.evaluate(()=>JSON.stringify(state.clips)),beforePlan.data);
  await page.evaluate(()=>redo());assert.deepEqual(await page.evaluate(()=>maskPixels(1)),mid);
  assert.equal(await page.evaluate(()=>ZorifiProductionBridge.savedMatches()),true);

  const perspective=await page.evaluate(()=>{
   const p=structuredClone(state);p.clips=p.clips.filter(c=>c.id==='subject');p.clips[0].keyframes={};p.clips[0].positionZ=300;
   delete p.clips[0].motion.mask;
   ZorifiMotionGraph.apply(p,{command:'mask.set',target:'subject',parameters:{type:'rectangle',width:60,height:15,x:60,y:0,rotation:90,opacity:50}});
   ZorifiMotionGraph.apply(p,{command:'layer.create',parameters:{id:'camera',kind:'camera',duration:10}});
   return maskPixels(0,p);
  });
  const focal=35/36*320,expectedX=160+60*focal/(300+focal);
  assert(Math.abs(perspective.center.x-expectedX)<1,JSON.stringify(perspective.center));
  assert(Math.abs(perspective.center.y-90)<1,JSON.stringify(perspective.center));
  assert(perspective.bounds.right-perspective.bounds.left<12,JSON.stringify(perspective.bounds));
  assert(perspective.bounds.bottom-perspective.bounds.top>25,JSON.stringify(perspective.bounds));
  assert.equal(Math.max(...perspective.alpha),128,'Perspective triangle overlaps must not accumulate mask opacity.');

  const saved=await page.evaluate(()=>({id:state.projectId,user:currentUser,session:firebaseGateway.session,data:JSON.stringify(state.clips)}));
  await page.reload();await page.locator('.zorifi-opening').waitFor({state:'detached'});
  await page.evaluate(async saved=>{
   firebaseGateway.config={apiKey:'fixture-public',projectId:'fixture'};firebaseGateway.session=saved.session;
   currentUser=saved.user;syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
   await loadProject(getSavedProjects().find(p=>p.id===saved.id));state.view='editor';state.activePanel='motion-scenes';render();
  },saved);
  assert.equal(await page.evaluate(()=>JSON.stringify(state.clips)),saved.data);
  assert.equal(await page.evaluate(()=>ZorifiMotionGraph.evaluate(state,1).layers[0].mask.rotation),45);
  await page.locator('[data-motion-focus="subject"]').click();
  await page.getByText('Track matte and masks',{exact:true}).click();
  await page.locator('[data-motion-remove-mask]').click();
  assert.equal(await page.evaluate(()=>state.clips[0].motion.mask),undefined);
  assert.equal(await page.evaluate(()=>Object.keys(state.clips[0].keyframes).some(k=>k.startsWith('mask:'))),false);
  await page.evaluate(()=>undo());assert.equal(await page.evaluate(()=>ZorifiMotionGraph.evaluate(state,1).layers[0].mask.rotation),45);
  const image=await page.evaluate(async()=>{seekProject(1);render();return (await ZorifiMotionWorkspace.renderFrame({time:1,width:320,height:180})).image;});
  fs.writeFileSync('artifacts/consolidated-mask-transforms.jpg',Buffer.from(image.split(',')[1],'base64'));
  assert.deepEqual(errors,[]);assert.equal(requests,1);
  fs.writeFileSync('artifacts/consolidated-mask-transforms.json',JSON.stringify({manualRotationBounds:vertical.bounds,pathAndOpacityPreserved:true,vanessaFixtureRequests:requests,singleUndo:true,saveReopen:true,deterministicScrub:true,perspectiveCenter:perspective.center,perspectiveExpectedX:expectedX},null,2));
  console.log('Manual independent mask transforms/inversion, Bezier preservation/refinement, reviewed Vanessa mask animation, one Undo/Redo, deterministic pixels, projected camera mask, save/reopen and mask removal passed.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
