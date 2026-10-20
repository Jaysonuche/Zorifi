const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const fake=require('./helpers/social-firestore.cjs');
const root=path.resolve(__dirname,'..');
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:edge});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="home-topbar">Studio project</div></body></html>');
    for(const name of ['zorifi-social.css','zorifi-social-creator.css'])await page.addStyleTag({path:path.join(root,name)});
    for(const name of ['zorifi-firebase.js','zorifi-social.js','zorifi-social-creator.js'])await page.addScriptTag({path:path.join(root,name)});
    await page.addScriptTag({content:`window.installSocialFake=${fake.toString()};`});
    await page.evaluate(()=>{
      window.__fake=installSocialFake({profiles:{alice:{name:'Alice',discoverable:true},bob:{name:'Bob',username:'bob',discoverable:true}}});
      window.firebaseGateway=new ZorifiFirebase.FirebaseGateway({apiKey:'public-fixture',projectId:'zorifi',storageBucket:'zorifi.firebasestorage.app',socialMediaEnabled:false},__fake.transport);
      firebaseGateway.session={uid:'alice',idToken:'fixture',refreshToken:'fixture',expiresAt:Date.now()+3600000};
      window.currentUser={id:'alice',name:'Alice'};
      window.toast=()=>{};
    });
    await page.addScriptTag({path:path.join(root,'zorifi-social-integration.js')});
    await page.evaluate(()=>{window.__social=openZorifiSocial();});
    await page.waitForFunction(()=>document.querySelector('.social-status')?.textContent.startsWith('Connected'));
    assert(await page.locator('.social-creator-content h2').getByText('The creator feed.').isVisible(),'Feed is the initial Social view');
    assert(await page.locator('#studio-content').count()===0 || await page.locator('.home-topbar').evaluate(element=>element.inert),'Studio is inert while Social is open');
    await page.locator('[data-creator-tab="upload"]').click();
    assert.match(await page.locator('.social-publish-note').innerText(),/needs cloud media storage/);
    assert.equal(await page.locator('input[name="video"]').isEnabled(),false,'Without a protected bucket, no private file chooser is enabled');
    assert.equal(await page.locator('.social-upload-form [type="submit"]').isEnabled(),false);
    await page.locator('[data-social-tab="profile"]').click();
    await page.locator('.social-profile-form [name="username"]').waitFor();
    await page.locator('.social-profile-form [name="username"]').fill('Alice_Creates');
    await page.locator('.social-profile-form [type="submit"]').click();
    await page.waitForFunction(()=>window.__fake.docs.get('socialProfiles/alice')?.username==='alice_creates');
    assert.equal(await page.evaluate(()=>window.__fake.docs.get('socialUsernames/alice_creates')?.uid),'alice','Profile and unique username alias are committed together');
    await page.locator('[data-social-tab="people"]').click();
    await page.locator('[data-creator-search]').fill('@bob');
    await page.waitForFunction(()=>document.querySelector('[data-search-result]')?.textContent.includes('1 matching'));
    await page.locator('[data-creator-tab="vanessa"]').click();
    await page.locator('#social-vanessa-message').fill('Help me caption my edit');
    await page.locator('.social-vanessa-form button').click();
    assert.match(await page.locator('.social-status').innerText(),/optional AI processing/);
    assert.equal(await page.evaluate(()=>window.__fake.records.filter(record=>record.url.includes('/api/vanessa')).length),0,'No AI request without optional consent');
    await page.evaluate(()=>__social.close());
    assert.equal(await page.locator('.zorifi-social-screen').count(),0);
    assert.equal(await page.locator('.home-topbar').evaluate(element=>element.inert),false,'Closing Social restores Studio');
    assert.deepEqual(errors,[]);
    console.log('Social creator UI: feed, storage gate, username save, search, Vanessa consent, and Studio restoration passed.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
