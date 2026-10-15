const {chromium}=require('playwright'),assert=require('node:assert/strict'),{createServer}=require('../scripts/dev-server.cjs');
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage(),logs=[];page.on('console',msg=>logs.push(msg.text()));
 await page.addInitScript(()=>{
  window.__ZORIFI_FIREBASE_CONFIG__={apiKey:'test-key',projectId:'browser-test'};
  if(!sessionStorage.getItem('auth-test-initialized')){sessionStorage.setItem('auth-test-initialized','1');sessionStorage.setItem('zorifi-firebase-session:browser-test',JSON.stringify({uid:'test-user',idToken:'old-token',refreshToken:'refresh-token',expiresAt:Date.now()-1000}));}
  window.refreshCalls=0;const original=window.fetch.bind(window);
  window.fetch=async(url,options={})=>{
   if(String(url).includes('securetoken.googleapis.com')){refreshCalls++;return Response.json({user_id:'test-user',id_token:'new-token',refresh_token:'new-refresh',expires_in:'3600'});}
   if(String(url).includes('refresh-test')){window.sentBearer=new Headers(options.headers).get('authorization');return Response.json({ok:true});}
   return original(url,options);
  };
 });
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#zorifi-startup').waitFor({state:'detached'});
 await page.waitForFunction(()=>firebaseGateway.session?.idToken==='new-token');
 assert.equal(await page.evaluate(()=>refreshCalls),1);
 assert(logs.includes('[Zorifi Auth] Firebase ID token refreshed successfully.'));
 await page.evaluate(async()=>{currentUser={id:'test-user',name:'Test'};ZorifiPrivacy.setConsent(localStorage,currentUser.id,true);await vanessaFetch('/api/refresh-test',{method:'POST',body:'{}'});});
 assert.equal(await page.evaluate(()=>sentBearer),'Bearer new-token');
 await page.reload();await page.waitForFunction(()=>firebaseGateway.session?.idToken==='new-token');
 assert.equal(await page.evaluate(()=>refreshCalls),1);
 await page.evaluate(()=>firebaseGateway.signOut());
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('zorifi-firebase-session:browser-test')),null);
 assert(!logs.some(line=>line.includes('new-token')||line.includes('new-refresh')));
 console.log('Browser refresh passed: startup success log, refreshed gateway bearer, reload restoration, logout cleanup, no token logs.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exitCode=1});
