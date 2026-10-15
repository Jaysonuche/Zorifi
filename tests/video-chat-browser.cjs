const {chromium}=require('playwright'),assert=require('node:assert/strict'),{createServer}=require('../scripts/dev-server.cjs');
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://video.replicate.delivery/**',route=>route.fulfill({status:200,body:''}));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#zorifi-startup').waitFor({state:'detached'});
 await page.evaluate(()=>{
  currentUser={id:'video-chat-test',name:'Video Test'};syncPhase10Stores();termsAcceptance.accept();createNewProject();ZorifiPrivacy.setConsent(localStorage,currentUser.id,true);vanessaOpen=true;vanessaVoiceEnabled=false;render();
  window.videoStarts=0;window.readyVideo=false;const original=window.fetch;
  window.fetch=async(url,options={})=>{
   if(String(url).includes('vanessa-video-tool'))return Response.json({toolCall:{name:'generate_ai_video',arguments:{prompt:'Ocean waves',duration:5,ratio:'16:9'}}});
   if(String(url).includes('vanessa-motion')){
    const body=JSON.parse(options.body);if(body.action==='start')videoStarts++;
    if(window.failVideo)return Response.json({error:'Replicate requires credit.'},{status:502});
    return Response.json({requestId:'test-ticket',status:readyVideo?'complete':'running',url:readyVideo?'https://video.replicate.delivery/result.mp4':'',duration:5});
   }
   return original(url,options);
  };
 });
 await page.locator('#vanessa-chat-input').fill('Generate a 5-second video of ocean waves');await page.locator('#vanessa-chat-submit').click();
 await page.waitForFunction(()=>videoStarts===1&&!vanessaBusy);
 assert.equal(await page.locator('#vanessa-messages video').count(),0);
 await page.locator('#vanessa-chat-input').fill('Generate a short video of a forest');await page.locator('#vanessa-chat-submit').click();
 await page.waitForFunction(()=>!vanessaBusy);assert.equal(await page.evaluate(()=>videoStarts),1);
 await page.evaluate(()=>readyVideo=true);await page.locator('#vanessa-messages video').waitFor({timeout:10000});
 assert((await page.locator('#vanessa-messages').innerText()).includes('video is ready'));
 await page.waitForFunction(()=>vanessaVideoJobs.size===0);
 await page.evaluate(()=>failVideo=true);
 await page.locator('#vanessa-chat-input').fill('Generate a video of clouds');await page.locator('#vanessa-chat-submit').click();
 await page.waitForFunction(()=>vanessaHistory.some(x=>x.actionStatus==='FAILED'&&x.text.includes('credit')));
 assert.deepEqual(errors,[]);console.log('Video chat passed: named tool dispatch, single render, real completion preview and provider failure.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exitCode=1});
