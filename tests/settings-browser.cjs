const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

async function main(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';let browser;
  try{
    browser=await chromium.launch({headless:true,...(fs.existsSync(edge)?{executablePath:edge}:{})});
    const page=await browser.newPage({viewport:{width:320,height:690},deviceScaleFactor:1}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>window.ZorifiAppSettings?.open&&typeof render==='function');
    await page.evaluate(()=>{currentUser={id:'settings-smoke',name:'Settings Creator',identifier:'settings@example.invalid',email:'settings@example.invalid',language:'en-GB'};localStorage.setItem(ACCOUNTS_KEY,JSON.stringify([currentUser]));localStorage.setItem(SESSION_KEY,currentUser.id);syncPhase10Stores();termsAcceptance.accept();state.view='home';render();});
    await page.locator('#zorifi-startup').waitFor({state:'detached'});
    await page.evaluate(()=>document.querySelectorAll('[data-beta-welcome]').forEach(node=>node.remove()));
    await page.locator('#privacy-shortcut').click();
    await page.locator('.zorifi-settings-screen').waitFor({state:'visible'});
    assert.equal(await page.locator('#privacy-shortcut').getAttribute('aria-label'),'Open settings');
    for(const label of ['Edit profile','Manage accounts','Link your email','Blocked accounts','App language','Add default ending','Auto upload','Add widgets','Help Center','Trust Center','Terms and Policies','Clear cache','Version','About Zorifi','Switch account','Sign out'])assert.ok((await page.locator('.zorifi-settings-screen').innerText()).includes(label),`${label} must appear in settings`);
    const width=await page.evaluate(()=>({visible:document.querySelector('.zorifi-settings-screen').clientWidth,scroll:document.querySelector('.zorifi-settings-screen').scrollWidth}));
    assert.ok(width.scroll<=width.visible+1,`Settings overflow a 320px phone: ${JSON.stringify(width)}`);
    fs.mkdirSync(path.join(__dirname,'..','artifacts'),{recursive:true});
    await page.screenshot({path:path.join(__dirname,'..','artifacts','settings-mobile.png')});
    await page.locator('[data-route="about"]').click();assert.match(await page.locator('.zs-detail').innerText(),/made by J\.U\.P\.C\.O Enterprises/i);assert.match(await page.locator('.zs-detail').innerText(),/Jayson Uche/);
    await page.locator('[data-back]').click();
    await page.locator('[data-default-ending]').uncheck();
    assert.equal(await page.evaluate(()=>window.ZorifiAppSettings.defaultEnding()),false);
    await page.locator('[data-route="language"]').click();const value=await page.locator('[data-language] option').last().getAttribute('value');await page.locator('[data-language]').selectOption(value);assert.equal(await page.evaluate(()=>currentUser.language),value);
    await page.locator('[data-back]').click();await page.locator('[data-route="cache"]').click();
    await page.evaluate(async()=>{localStorage.setItem('settings-preserve','yes');const cache=await caches.open('zorifi-v999');await cache.put('/settings-test-cache',new Response('test'));});
    page.once('dialog',dialog=>dialog.accept());await page.locator('[data-clear-cache]').click();await page.waitForFunction(()=>document.querySelector('.zs-status')?.textContent.includes('cleared'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('settings-preserve')),'yes');assert.equal(await page.evaluate(async()=>(await caches.keys()).includes('zorifi-v999')),false);
    await page.locator('[data-close]').click();await page.evaluate(()=>createNewProject());assert.equal(await page.evaluate(()=>state.creatorSettings.addZorifiEnding),false);
    await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{detectRuntimeMode();state.view='home';render();document.querySelectorAll('[data-beta-welcome]').forEach(node=>node.remove());window.ZorifiAppSettings.open();});await page.screenshot({path:path.join(__dirname,'..','artifacts','settings-desktop.png')});
    await page.locator('[data-route="accounts"]').first().click();assert.match(await page.locator('.zs-detail').innerText(),/Settings Creator/);
    await page.locator('[data-back]').click();await page.evaluate(()=>{window.ZorifiAppSettings.open();window.ZorifiAppSettings.open();});await page.locator('[data-close]').click();assert.equal(await page.evaluate(()=>document.getElementById('app').inert),false);
    await page.evaluate(()=>window.ZorifiAppSettings.open());await page.locator('[data-route="signout"]').click();assert.equal(await page.evaluate(()=>localStorage.getItem(SESSION_KEY)),null);
    await page.waitForFunction(()=>document.getElementById('privacy-shortcut')?.textContent==='Privacy & data');await page.locator('#privacy-shortcut').click();await page.locator('[data-privacy-dialog]').waitFor({state:'visible'});
    assert.deepEqual(errors,[],'Settings must not throw in the browser');console.log('Settings browser test passed.');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
