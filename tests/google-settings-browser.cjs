const assert=require('node:assert/strict');
const {chromium,devices}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
async function setup(page){
 await page.addInitScript(()=>{
  window.__ZORIFI_FIREBASE_CONFIG__={apiKey:'fixture-public-key',projectId:'fixture',googleClientId:'123-fixture.apps.googleusercontent.com'};
  window.fixtureScopes=[];
  window.google={accounts:{id:{initialize(value){window.fixtureGoogleSignin=value;},renderButton(element){const button=document.createElement('button');button.textContent='Continue with Google';button.onclick=()=>window.fixtureGoogleSignin.callback({credential:'fixture.google.credential'});element.append(button);}},oauth2:{initTokenClient(options){return {requestAccessToken(){window.fixtureScopes.push(options.scope);queueMicrotask(()=>options.callback({access_token:'fixture-mail-token',scope:window.fixtureScopes.join(' '),expires_in:3600}));}};},revoke(token,callback){window.fixtureRevoked=token;callback({successful:true});}}}};
 });
 await page.route('https://identitytoolkit.googleapis.com/**',route=>route.fulfill({json:{localId:'google-uid',email:'creator@example.com',displayName:'Google Creator',idToken:'fixture-firebase',refreshToken:'fixture-refresh',expiresIn:3600}}));
 await page.route('https://gmail.googleapis.com/**',route=>{
  const url=new URL(route.request().url());let value;
  if(url.pathname.endsWith('/profile'))value={emailAddress:'mail@example.com'};
  else if(url.pathname.endsWith('/messages/send')){windowSent.push(JSON.parse(route.request().postData()));value={id:'sent-id'};}
  else if(url.pathname.endsWith('/messages'))value={messages:[{id:'m1'}]};
  else value={id:'m1',payload:{mimeType:'text/plain',headers:[{name:'Subject',value:'Fixture subject'},{name:'From',value:'Friend <friend@example.com>'}],body:{data:Buffer.from('Fixture email body. <img onerror=bad()>').toString('base64url')}}};
  return route.fulfill({json:value});
 });
 await page.route('**/api/vanessa-provider?service=vanessa-global',route=>{aiCalls.push(JSON.parse(route.request().postData()));return route.fulfill({json:{reply:'A suggested reply for you to review.'}});});
}
let windowSent=[],aiCalls=[];
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:edge});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#zorifi-startup').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Continue with Google',exact:true}).click();await page.locator('[data-terms-form]').waitFor();
  assert.equal(await page.evaluate(()=>currentUser),null,'Google sign-in never auto-accepts terms');
  assert.equal(await page.evaluate(()=>pendingAuthentication.account.cloudUid),'google-uid');
  await page.evaluate(()=>{currentUser={id:'test-creator',cloudUid:'google-uid',name:'Creator'};pendingAuthentication=null;syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();state.view='home';render();showAccountSettings();});
  await page.getByRole('button',{name:'About Zorifi',exact:true}).click();assert.match(await page.locator('.zorifi-app-info').innerText(),/J\.U\.P\.C\.O Enterprises/);assert.match(await page.locator('.zorifi-app-info').innerText(),/Jayson Uche/);await page.locator('.zorifi-app-info [data-close]').first().click();
  await page.getByRole('button',{name:'Gmail & Vanessa',exact:true}).click();await page.locator('[data-mail-read]').waitFor();await page.locator('[data-mail-read]').click();await page.getByRole('button',{name:/Fixture subject/}).click();
  assert.equal(aiCalls.length,0,'Reading email does not send it to Vanessa');assert.equal(await page.locator('[data-mail-message] img').count(),0,'Email HTML remains inert plain text');
  await page.locator('[data-mail-ask]').click();await page.locator('[data-mail-question]').fill('Suggest a reply');await page.locator('[data-mail-ask-confirm]').click();await page.waitForTimeout(80);assert.equal(aiCalls.length,0,'Optional AI privacy consent is enforced before email leaves for Gemini');
  await page.evaluate(()=>ZorifiPrivacy.setConsent(localStorage,currentUser.id,true));
  await page.locator('[data-mail-ask-confirm]').click();await page.locator('[data-mail-use-draft]').waitFor();assert.equal(aiCalls.length,1);assert.equal(aiCalls[0].editorContext.selectedEmail.subject,'Fixture subject');await page.locator('[data-mail-use-draft]').click();assert.match(await page.locator('[data-mail-compose] textarea').inputValue(),/suggested reply/);assert.equal(windowSent.length,0,'A Vanessa draft is never auto-sent');
  await page.locator('[data-mail-send-permission]').click();await page.waitForFunction(()=>window.fixtureScopes.length===2);await page.waitForTimeout(100);
  await page.locator('[data-mail-compose] [name="to"]').fill('friend@example.com');await page.locator('[data-mail-compose] [name="subject"]').fill('Reviewed subject');await page.locator('[data-mail-compose] [name="body"]').fill('Reviewed email content');await page.locator('[data-mail-compose] button').click();assert.equal(windowSent.length,0);await page.locator('[data-mail-send-now]').click();await page.waitForFunction(()=>document.querySelector('[data-mail-status]')?.textContent.includes('Email sent'));assert.equal(windowSent.length,1);
  const decoded=Buffer.from(windowSent[0].raw,'base64url').toString('utf8');assert(decoded.includes('To: friend@example.com'));assert(decoded.includes('Reviewed email content'));
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage}));assert(!stored.includes('fixture-mail-token'));assert(!stored.includes('Fixture email body'));assert(!stored.includes('Reviewed email content'));
  await page.evaluate(()=>{currentUser={id:'other-account',name:'Other'};render();});await page.locator('.zorifi-mail').waitFor({state:'detached'});assert.deepEqual(errors,[]);
  await page.close();
  for(const [name,context,expected]of [['iPhone',devices['iPhone 13'],/Add to Home Screen/],['macOS',{hasTouch:false,isMobile:false,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'},/Add to Dock/],['Linux',{hasTouch:false,isMobile:false,userAgent:'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0 Safari/537.36'},/Install app/]]){
   const p=await browser.newPage({...context,serviceWorkers:'block'});await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('#zorifi-startup').waitFor({state:'detached'});if(name!=='iPhone')await p.evaluate(()=>Object.defineProperty(navigator,'maxTouchPoints',{value:0,configurable:true}));await p.evaluate(()=>ZorifiAppSettings.install());assert.match(await p.locator('.zorifi-app-info').innerText(),expected,name+' has truthful platform guidance');await p.close();
  }
  const native=await browser.newPage({serviceWorkers:'block'});await native.goto('http://127.0.0.1:'+server.address().port);await native.locator('#zorifi-startup').waitFor({state:'detached'});await native.evaluate(()=>{window.fixtureInstallCalls=0;deferredInstallPrompt={prompt:async()=>window.fixtureInstallCalls++,userChoice:Promise.resolve({outcome:'accepted'})};});await native.locator('[data-install-app]').click();assert.equal(await native.evaluate(()=>window.fixtureInstallCalls),1);await native.close();
  console.log('Google terms gate, scoped Gmail read/review/send, privacy and account cleanup, About, native install and iPhone/macOS/Linux guidance passed. All external services were isolated fixtures; no real email was read or sent.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
