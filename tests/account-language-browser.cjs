const assert=require('node:assert/strict');const fs=require('node:fs');const {chromium,webkit}=require('playwright');const {createServer}=require('../scripts/dev-server.cjs');
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async()=>{const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:edge}:{})});
 try{for(const width of [320,390,768,1440]){
 const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block',hasTouch:width<1000}),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/vanessa-provider?service=vanessa-language',route=>{const payload=JSON.parse(route.request().postData());requests.push(payload);return route.fulfill({json:{result:{translations:Object.fromEntries(payload.input.strings.map(source=>[source,`${payload.input.locale.split('-')[0]} · ${source}`]))}}});});
 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});await page.locator('.zorifi-opening').waitFor({state:'detached'});
 await page.evaluate(()=>{currentUser={id:'account-language',name:'Private Creator 862',email:'private862@example.invalid',identifier:'private862@example.invalid',language:'en-GB'};localStorage.setItem(ACCOUNTS_KEY,JSON.stringify([currentUser]));syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();state.view='home';render();ZorifiTheme.controller.setPreference('dark');ZorifiAppSettings.open();});
 assert.equal(await page.locator('.zs-group').first().evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(24, 27, 38)');
 assert.equal(await page.locator('.zs-row').first().evaluate(node=>getComputedStyle(node).color),'rgb(240, 241, 248)');
 await page.locator('.zs-identity').click();await page.locator('.zorifi-profile-page').waitFor();
 assert.equal(await page.locator('.modal-backdrop:has(.account-modal)').count(),0,'Profile is a full page');
 assert.equal(await page.locator('[data-profile-preview] .profile-silhouette').count(),1,'No initials-only avatar');
 assert.equal(await page.evaluate(()=>document.getElementById('app').inert),true);
 assert.equal(await page.locator('[name=name]').inputValue(),'Private Creator 862');
 await page.locator('[name=language]').selectOption('fr-FR');
 await page.waitForFunction(()=>document.querySelector('.zorifi-profile-page h1')?.textContent==='Votre profil');
 await page.waitForFunction(()=>{const s=ZorifiInterfaceLanguage.controller.status();return !s.running&&!s.pending;});
 assert.equal(await page.locator('[name=name]').inputValue(),'Private Creator 862');
 assert.equal(await page.locator('[name=email]').inputValue(),'private862@example.invalid');
 assert.equal(await page.locator('[data-photo]').innerText(),'Choisir une photo');
 if(width===320){await page.evaluate(()=>{const box=document.createElement('section');box.id='translation-lifecycle-test';box.innerHTML='<label>Background<select><option value="original">Original</option><option value="blur">Blur</option></select></label><span translate="no">Settings</span><span class="vanessa-message-text">Settings</span><span class="clip-name">Settings</span>';document.querySelector('.zorifi-profile-page').append(box);});await page.waitForFunction(()=>document.querySelector('#translation-lifecycle-test option[value=blur]')?.textContent==='fr · Blur');assert.equal(await page.locator('#translation-lifecycle-test option[value=blur]').getAttribute('value'),'blur');assert.equal(await page.locator('#translation-lifecycle-test [translate=no]').innerText(),'Settings');assert.equal(await page.locator('#translation-lifecycle-test .vanessa-message-text').innerText(),'Settings');assert.equal(await page.locator('#translation-lifecycle-test .clip-name').innerText(),'Settings');await page.locator('#translation-lifecycle-test').evaluate(node=>node.remove());}
 assert.equal(await page.locator('.profile-page-mark').innerText(),'Zorifi');
 assert.equal(requests.flatMap(request=>request.input.strings).some(value=>/Private Creator 862|private862@/.test(value)),false,'Only public UI labels leave the device');
 await page.locator('[name=language]').selectOption('ar-SA');await page.waitForFunction(()=>document.querySelector('.zorifi-profile-page h1')?.textContent==='ملفك الشخصي');
 assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
 await page.waitForFunction(()=>{const s=ZorifiInterfaceLanguage.controller.status();return !s.running&&!s.pending;});
 const bounds=await page.locator('.zorifi-profile-page').evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1,`${name} ${width}: ${JSON.stringify(bounds)}`);
 await page.locator('[name=language]').selectOption('en-GB');await page.waitForFunction(()=>document.querySelector('.zorifi-profile-page h1')?.textContent==='Your profile');
 await page.locator('[name=name]').fill('Updated Creator 862');await page.locator('[data-account-form] button[type=submit]').click();
 assert.equal(await page.locator('.zorifi-profile-page').count(),0);assert.equal(await page.evaluate(()=>document.getElementById('app').inert),false);assert.equal(await page.evaluate(()=>currentUser.name),'Updated Creator 862');
 await page.evaluate(()=>{ZorifiTheme.controller.setPreference('light');ZorifiAppSettings.open();});assert.equal(await page.locator('.zs-group').first().evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 255, 255)');
 await page.evaluate(()=>ZorifiTheme.controller.setPreference('dark'));assert.equal(await page.locator('.zs-group').first().evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(24, 27, 38)');
 if(name==='chromium'&&[390,1440].includes(width)){fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:`artifacts/account-settings-${width}.png`});await page.locator('.zs-identity').click();await page.screenshot({path:`artifacts/account-profile-${width}.png`});}
 assert.deepEqual(errors,[]);console.log(`${name} ${width}: theme, profile save, language switch, RTL and private text checks passed`);await page.close();
 }}finally{await browser.close();}
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
