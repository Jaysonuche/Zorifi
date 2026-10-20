// Load the real app and its full stylesheet cascade. A hand-built header cannot
// catch a generic mobile navigation rule hiding the Studio / Social switch.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');
const installSocialFake=require('./helpers/social-firestore.cjs');

async function assertNavigation(page,width,label){
  const header=page.locator('.home-topbar');
  const nav=header.locator(':scope>.zorifi-mode-switch');
  await nav.waitFor({state:'attached'});
  assert.equal(await nav.count(),1,`${label}: render must mount one mode switch`);
  assert(await nav.isVisible(),`${label}: Studio / Social must remain visible through the actual app CSS cascade`);
  for(const selector of ['[data-mode-studio]','[data-mode-social]']){
    const target=nav.locator(selector);
    const bounds=await target.boundingBox();
    assert(bounds&&bounds.width>=(width<1024?44:40)&&bounds.height>=(width<1024?44:36),`${label}: a visible, reachable ${selector} is required ${JSON.stringify(bounds)}`);
    assert(bounds.x>=0&&bounds.x+bounds.width<=width+1,`${label}: ${selector} is outside the screen`);
    assert(await target.evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),`${label}: ${selector} is obscured`);
  }
  const sizing=await header.evaluate(element=>({scroll:element.scrollWidth,width:element.clientWidth,document:document.documentElement.scrollWidth,children:[...element.children].map(child=>{const r=child.getBoundingClientRect();return {className:child.className,x:r.x,width:r.width,visible:getComputedStyle(child).display!=='none'};})}));
  assert(sizing.scroll<=sizing.width+1,`${label}: header overflow ${JSON.stringify(sizing)}`);
  assert(sizing.document<=width+1,`${label}: document overflow ${JSON.stringify(sizing)}`);
  const visible=sizing.children.filter(child=>child.visible&&child.width>0);
  for(const child of visible)assert(child.x>=-1&&child.x+child.width<=width+1,`${label}: header child outside screen ${JSON.stringify(child)}`);
  if(label.endsWith('signed in'))await page.screenshot({path:path.join(__dirname,`../artifacts/social-home-${label.replace(/[^a-zA-Z0-9-]+/g,'-')}.png`)});
  await nav.locator('[data-mode-social]').click();
}

(async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});
  try{
    for(const engine of (process.env.ZORIFI_TEST_ENGINE?[process.env.ZORIFI_TEST_ENGINE]:['chromium','webkit'])){
      if(engine==='webkit'&&!fs.existsSync(webkit.executablePath()))continue;
      const browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
      try{
        for(const width of [320,360,390,430,712,820,1280]){
          const context=await browser.newContext({viewport:{width,height:width<1024?920:900},hasTouch:width<1024,serviceWorkers:'block'});
          const page=await context.newPage(),errors=[];
          page.on('pageerror',error=>errors.push(error.message));
          // This test never sends test identities or messages to production.
          await page.route(/https:\/\/(?:firestore|identitytoolkit|securetoken)\.googleapis\.com\//,route=>route.abort());
          await page.goto(`http://127.0.0.1:${server.address().port}/`);
          await page.locator('#zorifi-startup').waitFor({state:'detached'});
          await page.addScriptTag({content:`window.installSocialFake=${installSocialFake.toString()};`});
          await page.evaluate(()=>{
            currentUser={id:'alice',cloudUid:'alice',name:'Alice'};
            syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
            // A local preview still needs a real, visible Social destination.
            firebaseGateway.session=null;firebaseGateway.config={};
            state.view='home';render();
          });
          const label=`${engine} ${width}px`;
          await assertNavigation(page,width,label+' local preview');
          await page.getByRole('heading',{name:'Welcome to Zorifi Social.',exact:true}).waitFor();
          assert.equal(await page.locator('[data-social-online]').getAttribute('href'),'https://zorifi.vercel.app');
          assert.equal(await page.locator('.social-person').count(),0,'Local preview must not invent Social people');
          await page.locator('.social-header nav [data-social-studio]').click();
          assert.equal(await page.locator('.zorifi-social-screen').count(),0);
          await page.evaluate(()=>{
            const fake=installSocialFake({uid:'alice',profiles:{bob:{name:'Bob',bio:'A test creator'}}});
            firebaseGateway.config={apiKey:'public-test-config',projectId:'zorifi',authDomain:'zorifi.firebaseapp.com'};
            firebaseGateway.transport=fake.transport;
            firebaseGateway.session={uid:'alice',idToken:'local-fixture-token',refreshToken:'local-fixture-refresh',expiresAt:Date.now()+3600000};
            currentUser={id:'alice',cloudUid:'alice',name:'Alice'};
            syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
            // Multiple complete app renders must not remove or duplicate it.
            state.view='home';render();render();
            state.projectId='navigation-keep-edit';state.currentProject='A draft kept in Studio';
            window.__socialStudioNode=document.querySelector('.home-screen');
          });
          await assertNavigation(page,width,label+' signed in');
          await page.waitForFunction(()=>document.querySelector('.social-status')?.textContent.startsWith('Connected'));
          await page.locator('[data-social-tab="people"]').click();await page.locator('.social-person h3',{hasText:'Bob'}).waitFor();
          await page.getByRole('button',{name:'Create your profile',exact:true}).waitFor();
          assert.equal(await page.evaluate(()=>__socialFake.stats.commits),0,'A missing first-time profile must load Social without automatically publishing one');
          assert.equal(await page.locator('.social-person').count(),1);
          assert.equal(await page.locator('#app').evaluate(element=>element.inert),true,'Social isolates the preserved Studio');
          await page.screenshot({path:path.join(__dirname,`../artifacts/social-navigation-${engine}-${width}.png`)});
          await page.locator('.social-header nav [data-social-studio]').click();
          assert.equal(await page.locator('.zorifi-social-screen').count(),0);
          assert.equal(await page.locator('#app').evaluate(element=>element.inert),false,'Return to Studio restores its controls');
          assert.deepEqual(await page.evaluate(()=>({id:state.projectId,name:state.currentProject,view:state.view,sameNode:__socialStudioNode===document.querySelector('.home-screen')})),{id:'navigation-keep-edit',name:'A draft kept in Studio',view:'home',sameNode:true},'Return to Studio preserves the active editing project and mounted workspace');
          assert.deepEqual(errors,[],`${label}: no runtime errors`);
          console.log(`${label}: real app visible/clickable Studio / Social, bounded header, welcome and signed-in cloud fixture passed.`);
          await context.close();
        }
      }finally{await browser.close();}
    }
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
