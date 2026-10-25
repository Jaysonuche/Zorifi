const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

const engine=process.env.ZORIFI_TEST_ENGINE==='webkit'?'webkit':'chromium';
const devices=[
  {width:1024,height:768},
  {width:1440,height:900},
  {width:1920,height:1080},
  {width:320,height:480,touch:true},
  {width:390,height:844,touch:true},
  {width:1024,height:768,touch:true,ipad:true}
];

async function seed(page){
  await page.goto(page.context()._options.baseURL);
  await page.locator('#zorifi-startup').waitFor({state:'detached'});
  await page.evaluate(()=>{
    currentUser={id:'keyframe-fit-regression',name:'Animation Editor'};
    syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();
    createNewProject();state.creatorSettings.addZorifiEnding=false;
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
    const context=canvas.getContext('2d');context.fillStyle='#8759da';context.fillRect(0,0,320,180);
    context.fillStyle='#ee92cb';context.fillRect(40,20,100,140);
    const url=canvas.toDataURL();
    state.mediaAssets=[{id:'keyframe-source',type:'image',name:'Portrait.png',url,thumbnail:url,width:320,height:180,duration:5}];
    state.clips=[{
      id:'keyframe-clip',type:'video',mediaId:'keyframe-source',track:0,start:0,duration:5,
      name:'WhatsApp Video 2026-10-23 at 23.30.29 - a very long imported filename.mp4',
      scale:100,positionX:0,positionY:0,rotation:0,opacity:100,volume:0,fit:'contain',sourceStart:0,
      keyframes:{scale:[{time:0,value:100,easing:'linear'},{time:5,value:150,easing:'linear'}]},
      keyframeVisibleProperties:['scale']
    }];
    state.duration=5;state.currentTime=0;state.selected='keyframe-clip';state.activePanel='media';
    activeKeyframeProperty='scale';keyframeSelection=[{property:'scale',time:0}];
    keyframeFps=30;render();
  });
}

async function assertWorkspace(page,graph,touch){
  const expected=graph?'graph':'timeline';
  assert.equal(await page.evaluate(()=>state.activePanel),graph?'graph':'keyframes');
  assert.equal(await page.locator('.keyframe-workspace').getAttribute('data-keyframe-workspace'),expected);
  assert.equal(await page.locator('.media-panel>.panel-heading h2').textContent(),graph?'Graph':'Keyframes');
  assert.equal(await page.locator('.keyframe-workspace-graph').count(),graph?1:0);
  assert.equal(await page.locator('.keyframe-workspace-timeline').count(),graph?0:1);
  assert.equal(await page.locator('[data-kf-view]').count(),0,'Keyframes must not contain the former Graph tab');
  const prefix=touch?'.pocket-editor-dock ':'.sidebar ';
  const keyframe=page.locator(prefix+(touch?'[data-pocket-tool="keyframes"]':'[data-panel="keyframes"]'));
  const curve=page.locator(prefix+(touch?'[data-pocket-tool="graph"]':'[data-action="graph-tool"]'));
  assert.equal(await keyframe.evaluate(el=>el.classList.contains('active')),!graph,'Keyframes active state is independent');
  assert.equal(await curve.evaluate(el=>el.classList.contains('active')),graph,'Graph active state is independent');
}

async function fit(page){
  const result=await page.evaluate(()=>{
    const panel=document.querySelector('.media-panel'),workspace=panel.querySelector('.keyframe-workspace');
    const bounds=workspace.getBoundingClientRect();
    const overflow=[...workspace.querySelectorAll('*')].filter(element=>!element.closest('.kf-property-picker')).map(element=>{
      const box=element.getBoundingClientRect();
      return {tag:element.tagName,className:typeof element.className==='string'?element.className:element.className.baseVal,left:box.left,right:box.right,width:box.width};
    }).filter(box=>box.width>0&&(box.left<bounds.left-1||box.right>bounds.right+1));
    const name=workspace.querySelector('.kf-clip-head b');
    return {viewport:innerWidth,document:document.documentElement.scrollWidth,panel:{width:panel.clientWidth,scroll:panel.scrollWidth},workspace:{width:bounds.width,scroll:workspace.scrollWidth},overflow,nameTruncates:name.scrollWidth>name.clientWidth,nameOverflow:getComputedStyle(name).textOverflow};
  });
  assert(result.document<=result.viewport+1,JSON.stringify(result));
  assert(result.panel.scroll<=result.panel.width+1,JSON.stringify(result));
  assert(result.workspace.scroll<=result.workspace.width+1,JSON.stringify(result));
  assert.deepEqual(result.overflow,[],JSON.stringify(result));
  assert.equal(result.nameOverflow,'ellipsis','Imported filenames retain the truncation treatment');
  if(result.workspace.width<400)assert(result.nameTruncates,'The long imported filename must truncate within a narrow card');
}

async function reachable(page){
  const selectors=['[data-kf-command="auto"]','[data-keyframe-nav="previous"]','[data-keyframe-nav="next"]','[data-kf-fps]',
    ...['add','copy','paste','duplicate','delete','nudge-left','nudge-right'].map(command=>`[data-kf-command="${command}"]`),
    '[data-kf-active-property]','[data-kf-value]','[data-kf-easing]','[data-clear-keyframes]'];
  for(const selector of selectors){
    const control=page.locator('.keyframe-workspace '+selector);
    await control.scrollIntoViewIfNeeded();
    const position=await control.evaluate(element=>{
      const panel=element.closest('.media-panel'),box=element.getBoundingClientRect(),clip=panel.getBoundingClientRect();
      const x=box.left+box.width/2,y=box.top+box.height/2,target=document.elementFromPoint(x,y);
      return {x,y,left:clip.left,right:clip.right,top:clip.top,bottom:clip.bottom,hit:Boolean(target&&(target===element||element.contains(target)))};
    });
    assert(position.x>=position.left&&position.x<=position.right&&position.y>=position.top&&position.y<=position.bottom,`${selector}: ${JSON.stringify(position)}`);
    // Disabled Paste remains visible and reachable even before a frame is copied.
    if(await control.isEnabled())assert(position.hit,`${selector} is covered: ${JSON.stringify(position)}`);
  }
}

async function editFrames(page,openGraph){
  await page.evaluate(()=>{state.currentTime=2;keyframeSelection=[];render();});
  await page.locator('[data-kf-command="add"]').click();
  assert(await page.evaluate(()=>state.clips[0].keyframes.scale.some(frame=>Math.abs(frame.time-2)<.0001)),'Add writes a real timeline keyframe');
  await page.locator('[data-kf-command="nudge-right"]').click();
  const moved=await page.evaluate(()=>keyframeSelection[0].time);
  assert(Math.abs(moved-(2+1/30))<.0001,'Nudge moves the selected keyframe by one frame');
  const input=page.locator('[data-kf-value]');await input.fill('125');await input.dispatchEvent('change');
  assert.equal(await page.evaluate(()=>AdvancedEditing.keyframeAt(state.clips[0],'scale',keyframeSelection[0].time,.0001).value),125);
  await page.locator('[data-kf-easing]').selectOption('hold');
  assert.equal(await page.evaluate(()=>keyframedValue(state.clips[0],'scale',3)),125,'Hold changes the actual sampled animation');
  await openGraph();
  await page.locator('[data-kf-easing]').selectOption('linear');
  assert(await page.evaluate(()=>keyframedValue(state.clips[0],'scale',3)>125),'Linear interpolation changes the sampled animation');
  await page.locator('[data-kf-easing]').selectOption('bezier');
  for(const [index,value]of [0,1,0,1].entries()){
    const field=page.locator(`[data-kf-bezier="${index}"]`);await field.fill(String(value));await field.dispatchEvent('change');
  }
  assert.deepEqual(await page.evaluate(()=>AdvancedEditing.keyframeAt(state.clips[0],'scale',keyframeSelection[0].time,.0001).bezier),[0,1,0,1]);
  const path=await page.locator('.keyframe-workspace-graph path').getAttribute('d');
  assert(path.startsWith('M')&&!path.includes('NaN'),'Graph plots valid values after real keyframe edits');
  await fit(page);
  for(let index=0;index<4;index++)await page.locator(`[data-kf-bezier="${index}"]`).scrollIntoViewIfNeeded();
}

(async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.ZORIFI_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
    for(const device of devices){
      const context=await browser.newContext({viewport:{width:device.width,height:device.height},hasTouch:Boolean(device.touch),serviceWorkers:'block',baseURL:`http://127.0.0.1:${server.address().port}`});
      if(device.ipad)await context.addInitScript(()=>{Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await seed(page);assert.equal(await page.evaluate(()=>runtimeMode.touch),Boolean(device.touch));
      let graph,keyframes;
      if(device.touch){
        await page.locator('[data-pocket-group="motion"]').click();
        graph=()=>page.locator('[data-pocket-tool="graph"]').click();
        keyframes=()=>page.locator('[data-pocket-tool="keyframes"]').click();
      }else{
        graph=()=>page.locator('.sidebar [data-action="graph-tool"]').click();
        keyframes=()=>page.locator('.sidebar [data-panel="keyframes"]').click();
      }
      await graph();await assertWorkspace(page,true,device.touch);await fit(page);await reachable(page);
      await keyframes();await assertWorkspace(page,false,device.touch);await fit(page);await reachable(page);
      if(!device.touch){
        await page.locator('[data-composition-graph="graph"]').click();await assertWorkspace(page,true,false);
        await page.locator('[data-composition-graph="timeline"]').click();await assertWorkspace(page,false,false);
        await graph();await page.locator('.keyframe-edge-tool').click();await assertWorkspace(page,false,false);
      }
      await editFrames(page,graph);
      await keyframes();await assertWorkspace(page,false,device.touch);await fit(page);
      assert.deepEqual(errors,[],JSON.stringify(errors));
      await context.close();
      console.log(`${engine} ${device.width}×${device.height} ${device.touch?'touch':'desktop'}: independent animation tools, fitted controls and editing passed`);
    }
  }finally{
    await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
