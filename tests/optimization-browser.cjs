const assert=require('node:assert/strict');const {chromium,webkit}=require('playwright');const {createServer}=require('../scripts/dev-server.cjs');
(async()=>{const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const engine of [chromium,webkit]){const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
 try{const page=await browser.newPage({serviceWorkers:'block'}),errors=[];let requests=0;page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/vanessa-provider?service=vanessa-global',route=>{requests++;return route.fulfill({json:{reply:'Authenticated transport fixture'}});});
 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});await page.locator('.zorifi-opening').waitFor({state:'detached'});
 const result=await page.evaluate(async()=>{
  const a=new Float32Array(300003),b=new Float32Array(a.length);a[50000]=.8;b[50000]=.4;a[a.length-1]=1;b[b.length-1]=1;
  let largest=0,tiles=0,ticks=0;const timer=setInterval(()=>ticks++,0);
  const pipeline=new ZorifiOptimization.AudioWorkerPipeline({maxTransferBytes:4096,workerFactory:url=>{const worker=new Worker(url),post=worker.postMessage.bind(worker);worker.postMessage=(message,buffers)=>{largest=Math.max(largest,buffers.reduce((sum,buffer)=>sum+buffer.byteLength,0));tiles++;post(message,buffers);};return worker;}});
  try{
   const controller=new AbortController(),cancelled=pipeline.analyzeChannels([a,b],10,{signal:controller.signal}).then(()=>false,error=>error.name==='AbortError');controller.abort();
   const actual=await pipeline.analyzeChannels([a,b],10),expected=ZorifiAudioEngine.waveformFromChannels([a,b],10);
   currentUser={id:'optimization-browser',name:'Optimization Editor'};
   ZorifiPrivacy.setConsent(localStorage,currentUser.id,false);let consentDenied=false;
   try{await ZorifiOptimization.SecureAIService.makeRequest('vanessa-global',{message:'fixture'});}catch(error){consentDenied=error.code==='PRIVACY_CONSENT_REQUIRED';}
   ZorifiPrivacy.setConsent(localStorage,currentUser.id,true);const reply=await ZorifiOptimization.SecureAIService.makeRequest('vanessa-global',{message:'fixture'});
   return {actual,expected,largest,tiles,ticks,cancelled:await cancelled,bytes:a.byteLength,pending:pipeline.pending.size,consentDenied,reply};
  }finally{clearInterval(timer);pipeline.terminate();}
 });
 assert.deepEqual(result.actual,result.expected);assert.ok(result.tiles>500);assert.ok(result.largest<=4096);assert.ok(result.ticks>0);assert.equal(result.bytes,300003*4);assert.equal(result.cancelled,true);assert.equal(result.pending,0);assert.equal(result.consentDenied,true);assert.equal(requests,1);assert.equal(result.reply.reply,'Authenticated transport fixture');assert.deepEqual(errors,[]);console.log(`${engine.name()}: real bounded Web Worker, UI timer progress, concurrent cancellation, intact PCM and consent proxy passed`);
 }finally{await browser.close();}
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
