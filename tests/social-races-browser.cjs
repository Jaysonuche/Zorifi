const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{chromium}=require('playwright'),installFake=require('./helpers/social-firestore.cjs');
const root=path.resolve(__dirname,'..'),edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function prepare(page,{configured=true,open=true,holdInitial=false}={}){
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="home-topbar"><button id="studio-project">My editing project</button></div><main id="studio-content">An unsaved Studio project</main></body></html>');
  await page.addStyleTag({path:path.join(root,'zorifi-social.css')});
  await page.addScriptTag({path:path.join(root,'zorifi-firebase.js')});
  await page.addScriptTag({path:path.join(root,'zorifi-social.js')});
  await page.addScriptTag({content:`window.installSocialFake=${installFake.toString()};`});
  await page.evaluate(({configured,holdInitial})=>{
    const profiles={alice:{name:'Alice',discoverable:true},bob:{name:'Bob'},cara:{name:'Cara'}};
    const pair=other=>({members:['alice',other],requester:other,recipient:'alice',status:'accepted'});
    const fake=installSocialFake({profiles,connections:{'alice~bob':pair('bob'),'alice~cara':pair('cara')}});
    fake.docs.set('socialConnections/alice~bob/messages/bob-history',{sender:'bob',text:'Bob history',createdAt:'2026-10-19T10:00:00Z'});
    fake.docs.set('socialConnections/alice~cara/messages/cara-history',{sender:'cara',text:'Cara history',createdAt:'2026-10-19T10:01:00Z'});
    window.__holds=[];
    const transport=async(url,options)=>{
      const response=await fake.transport(url,options),hold=__holds.find(item=>!item.started&&String(url).includes(item.urlPart)&&(!item.bodyPart||String(options.body||'').includes(item.bodyPart)));
      if(!hold)return response;
      hold.started=true;await new Promise(resolve=>{hold.release=resolve;});return response;
    };
    window.firebaseGateway=new ZorifiFirebase.FirebaseGateway(configured?{apiKey:'public-test-config',projectId:'zorifi'}:{},transport);
    firebaseGateway.session=configured?{uid:'alice',idToken:'test-user-token',refreshToken:'test-refresh',expiresAt:Date.now()+3600000}:null;
    window.currentUser={name:'Alice'};window.toast=message=>{window.__toast=message;};
    if(holdInitial){
      window.__initialReady=0;window.__releaseInitial=null;
      const gate=new Promise(resolve=>{window.__releaseInitial=resolve;});
      const Client=ZorifiSocial.Client;
      window.__originalOpen=ZorifiSocial.open;
      ZorifiSocial.open=options=>{
        for(const name of ['myProfile','people','connections','blocks']){
          const original=options.client[name].bind(options.client);let first=true;
          options.client[name]=async args=>{const wait=first;first=false;const value=await original(args);if(wait){__initialReady++;await gate;}return value;};
        }
        return __originalOpen(options);
      };
      fake.docs.get('socialProfiles/alice').discoverable=false;
      fake.docs.get('socialProfiles/alice').name='Old Alice';
      fake.docs.get('socialProfiles/bob').name='Old Bob';
      fake.docs.get('socialConnections/alice~bob').status='pending';
      fake.docs.set('socialBlocks/alice/blocked/cara',{owner:'alice',blockedUid:'cara'});
    }
  },{configured,holdInitial});
  await page.addScriptTag({path:path.join(root,'zorifi-social-integration.js')});
  if(open)await page.evaluate(()=>{window.__social=openZorifiSocial();});
  if(configured&&!holdInitial&&open)await page.waitForFunction(()=>document.querySelector('.social-status')?.textContent.startsWith('Connected'));
}
async function choose(page,id){await page.locator('[data-social-tab="inbox"]').click();await page.locator(`[data-social-conversation="${id}"]`).click();}
async function expectMessage(page,message){await page.waitForFunction(text=>document.querySelector('.social-message-list')?.textContent.includes(text),message);}

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.ZORIFI_BROWSER_EXECUTABLE?{executablePath:process.env.ZORIFI_BROWSER_EXECUTABLE}:fs.existsSync(edge)?{executablePath:edge}:{})});
  const errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1280,height:860}});page.on('pageerror',error=>errors.push(error.message));
    await prepare(page);
    await page.evaluate(()=>__holds.push({urlPart:'/socialConnections/alice~bob:runQuery'}));
    await choose(page,'alice~bob');await page.waitForFunction(()=>__holds[0].started);
    await page.locator('[data-social-conversation="alice~cara"]').click();await expectMessage(page,'Cara history');
    await page.evaluate(()=>__holds[0].release());await page.waitForTimeout(30);
    await page.locator('[data-social-tab="profile"]').click();await page.locator('[data-social-tab="inbox"]').click();
    await expectMessage(page,'Cara history');assert(!await page.locator('.social-message-list').innerText().then(text=>text.includes('Bob history')),'A late Bob history response must never enter Cara’s conversation.');

    await page.locator('[data-social-conversation="alice~bob"]').click();await expectMessage(page,'Bob history');
    await page.locator('.social-message-form textarea').fill('A message for Bob');
    await page.evaluate(()=>__holds.push({urlPart:':commit',bodyPart:'A message for Bob'}));
    await page.locator('.social-message-form button').click();await page.waitForFunction(()=>__holds[1].started);
    await page.locator('[data-social-conversation="alice~cara"]').click();await expectMessage(page,'Cara history');
    await page.locator('.social-message-form textarea').fill('Unsent Cara draft');
    await page.evaluate(()=>__holds[1].release());await page.waitForFunction(()=>!document.querySelector('.social-message-form button').disabled);
    assert.equal(await page.locator('.social-message-form textarea').inputValue(),'Unsent Cara draft');
    assert(!await page.locator('.social-message-list').innerText().then(text=>text.includes('A message for Bob')||text.includes('Bob history')));
    await page.locator('[data-social-conversation="alice~bob"]').click();await expectMessage(page,'A message for Bob');assert.equal(await page.locator('.social-message-form textarea').inputValue(),'');
    await page.locator('[data-social-conversation="alice~cara"]').click();assert.equal(await page.locator('.social-message-form textarea').inputValue(),'Unsent Cara draft');
    assert.equal(await page.evaluate(()=>__socialFake.stats.messages),1);

    await page.evaluate(()=>__holds.push({urlPart:'/socialConnections/alice~bob:runQuery'}));
    await page.locator('[data-social-conversation="alice~bob"]').click();await page.waitForFunction(()=>__holds[2].started);
    await page.locator('[data-social-conversation="alice~cara"]').click();
    await page.evaluate(()=>__socialFake.docs.set('socialConnections/alice~bob/messages/new-bob-history',{sender:'bob',text:'Newer Bob history',createdAt:'2026-10-19T12:00:00Z'}));
    await page.locator('[data-social-conversation="alice~bob"]').click();await expectMessage(page,'Newer Bob history');
    await page.evaluate(()=>__holds[2].release());await page.waitForTimeout(30);assert.match(await page.locator('.social-message-list').innerText(),/Newer Bob history/,'An earlier request must not replace a newer response after returning to the same conversation.');

    await page.locator('.social-message-form textarea').fill('Retry Bob only once');
    await page.evaluate(()=>{__socialFake.configuration.failAfterCommit=true;});
    await page.locator('.social-message-form button').click();await page.waitForFunction(()=>document.querySelector('.social-status')?.textContent.includes('could not reach the cloud'));
    await page.locator('[data-social-conversation="alice~cara"]').click();assert.equal(await page.locator('.social-message-form textarea').inputValue(),'Unsent Cara draft');
    await page.locator('[data-social-conversation="alice~bob"]').click();assert.equal(await page.locator('.social-message-form textarea').inputValue(),'Retry Bob only once');
    await page.locator('.social-message-form button').click();await page.waitForFunction(()=>!document.querySelector('.social-message-form textarea').value&&!document.querySelector('.social-message-form button').disabled);
    assert.equal(await page.evaluate(()=>__socialFake.stats.messages),2,'A UI retry after a lost acknowledgement must reuse its original message request ID.');

    await page.evaluate(()=>{firebaseGateway.session={...firebaseGateway.session,idToken:'same-account-new-token'};document.querySelector('#studio-content').append(' still here');});
    await page.waitForTimeout(320);assert.equal(await page.locator('.zorifi-social-screen').count(),1,'A same-UID token replacement must keep Social open.');
    await page.evaluate(()=>{firebaseGateway.session={...firebaseGateway.session,uid:'different-account'};});
    await page.waitForFunction(()=>!document.querySelector('.zorifi-social-screen'));assert.equal(await page.locator('#studio-content').evaluate(element=>element.inert),false);

    await prepare(page,{holdInitial:true});await page.waitForFunction(()=>__initialReady===4);
    await page.evaluate(async()=>{
      const docs=__socialFake.docs;docs.get('socialProfiles/alice').name='Current Alice';docs.get('socialProfiles/alice').discoverable=true;docs.get('socialProfiles/bob').name='Current Bob';docs.get('socialConnections/alice~bob').status='accepted';docs.delete('socialBlocks/alice/blocked/cara');
      await __social.refresh();__releaseInitial();
    });
    await page.waitForTimeout(30);assert.equal(await page.locator('.social-person h3').allTextContents().then(names=>names.sort().join(',')),'Cara,Current Bob');
    assert.equal(await page.locator('.social-publish-note').count(),0,'The obsolete private profile must not replace the current published profile.');
    await page.locator('[data-social-tab="profile"]').click();assert.equal(await page.locator('.social-profile-form [name="name"]').inputValue(),'Current Alice');
    await choose(page,'alice~bob');await expectMessage(page,'Bob history');assert.equal(await page.locator('.social-message-form').count(),1,'The stale pending status must not replace the accepted connection.');
    await page.evaluate(()=>__social.close());

    await prepare(page,{configured:false,open:false});await page.locator('[data-mode-social]').click();
    assert.match(await page.locator('.zorifi-social-screen').innerText(),/local preview is not connected/i);assert.equal(await page.locator('.social-person').count(),0);
    assert.equal(await page.locator('[data-social-online]').getAttribute('href'),'https://zorifi.vercel.app');assert.equal(await page.locator('#studio-content').evaluate(element=>element.inert),true);
    await page.screenshot({path:path.join(os.tmpdir(),'zorifi-social-welcome-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(os.tmpdir(),'zorifi-social-welcome-mobile.png'),fullPage:true});
    await page.getByRole('button',{name:'Return to Studio',exact:true}).click();assert.equal(await page.locator('.zorifi-social-screen').count(),0);assert.equal(await page.locator('#studio-content').evaluate(element=>element.inert),false);assert.match(await page.locator('#studio-content').innerText(),/unsaved Studio project/);
    assert.deepEqual(errors,[]);
    console.log('Social browser races passed: stale conversation reads, send while switching, per-thread drafts, current refresh snapshot, same-UID refresh, account switch cleanup, and honest responsive local welcome.');
    console.log('Welcome screenshots: '+path.join(os.tmpdir(),'zorifi-social-welcome-desktop.png')+' ; '+path.join(os.tmpdir(),'zorifi-social-welcome-mobile.png'));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
