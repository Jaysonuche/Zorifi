const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {createServer}=require('../scripts/dev-server.cjs');
(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.ZORIFI_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#zorifi-startup').waitFor({state:'detached'});
  await page.evaluate(()=>{
   currentUser={id:'easing-test',name:'Easing Test'};syncPhase10Stores();termsAcceptance.accept();createNewProject();addTitle({name:'Motion test'});
   const clip=state.clips.find(c=>c.id===state.selected);clip.start=0;clip.duration=1;clip.keyframes={positionX:[{time:0,value:0,easing:'linear'},{time:1,value:100}]};clip.keyframeVisibleProperties=['positionX'];
   state.activePanel='keyframes';state.currentTime=0;activeKeyframeProperty='positionX';keyframeSelection=[{property:'positionX',time:0}];keyframeWorkspaceView='graph';render();
  });
  await page.locator('[data-kf-easing]').selectOption('easeOutBounce');
  const bounce=await page.evaluate(()=>keyframedValue(state.clips.find(c=>c.id===state.selected),'positionX',.4));assert.ok(Math.abs(bounce-91)<.0001);
  await page.locator('[data-kf-easing]').selectOption('easeInOutCubic');
  const cubic=await page.evaluate(()=>keyframedValue(state.clips.find(c=>c.id===state.selected),'positionX',.25));assert.ok(Math.abs(cubic-6.25)<.0001);
  await page.locator('[data-kf-easing]').selectOption('bezier');
  for(const [index,value] of [0,1,0,1].entries()){const input=page.locator(`[data-kf-bezier="${index}"]`);await input.fill(String(value));await input.dispatchEvent('change');}
  const bezier=await page.evaluate(()=>keyframedValue(state.clips.find(c=>c.id===state.selected),'positionX',.125));assert.ok(Math.abs(bezier-87.5)<.0001);
  const graph=await page.locator('.keyframe-workspace-graph path').getAttribute('d');assert.ok(graph.startsWith('M'));assert.ok(!graph.includes('NaN'));
  console.log('Easing browser check passed: cubic/bounce selection, zero-valued Bezier controls, property sampling and curve graph.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
