const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,webkit}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    const engine=process.env.ZORIFI_TEST_ENGINE==='webkit'?'webkit':'chromium';
    browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&fs.existsSync(edge)?{executablePath:edge}:{})});
    const page=await browser.newPage({viewport:{width:1600,height:1000},serviceWorkers:'block'});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#zorifi-startup').waitFor({state:'detached'});
    await page.evaluate(()=>{
      currentUser={id:'preview-transform-proof',name:'Editor'};
      syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();createNewProject();
      const canvas=document.createElement('canvas');canvas.width=240;canvas.height=135;
      canvas.getContext('2d').fillRect(0,0,240,135);
      const url=canvas.toDataURL();
      state.creatorSettings.addZorifiEnding=false;
      state.mediaAssets=[{id:'preview-image',type:'image',name:'Preview.png',duration:8,url,thumbnail:url}];
      state.clips=[{id:'preview-clip',type:'video',name:'Preview',mediaId:'preview-image',start:0,duration:8,track:0,scale:100,positionX:17,positionY:12,rotation:0,opacity:100,fit:'contain'}];
      state.selected='preview-clip';state.currentTime=2;state.duration=8;state.view='editor';render();
    });
    const stateOfGuides=()=>page.evaluate(()=>{
      const clip=state.clips[0],preview=document.querySelector('.preview');
      showAlignmentGuide('move',clip);
      return {x:preview.classList.contains('guide-x'),y:preview.classList.contains('guide-y'),center:preview.classList.contains('guide-centered')};
    });
    assert.deepEqual(await stateOfGuides(),{x:false,y:false,center:false},'Off-center media must not show center guides');
    await page.evaluate(()=>setEditableClipValue(state.clips[0],'positionX',0));
    assert.deepEqual(await stateOfGuides(),{x:true,y:false,center:false},'Horizontal centering shows only its own guide');
    await page.evaluate(()=>setEditableClipValue(state.clips[0],'positionY',0));
    assert.deepEqual(await stateOfGuides(),{x:true,y:true,center:true},'Both guides appear only at the exact center');
    await page.evaluate(()=>showAlignmentGuide('scale',state.clips[0]));
    assert.deepEqual(await page.evaluate(()=>({x:document.querySelector('.preview').classList.contains('guide-x'),y:document.querySelector('.preview').classList.contains('guide-y')})),{x:false,y:false},'Resizing clears movement guides');
    await page.evaluate(()=>render());
    assert.deepEqual(await stateOfGuides(),{x:true,y:true,center:true},'Centered guides survive an editor rerender');
    assert.equal(await page.locator('.guide-vertical').evaluate(el=>getComputedStyle(el).display),'block','The vertical guide is visibly rendered');
    assert.equal(await page.locator('.guide-horizontal').evaluate(el=>getComputedStyle(el).display),'block','The horizontal guide is visibly rendered');
    await page.evaluate(()=>{setEditableClipValue(state.clips[0],'positionX',12);setEditableClipValue(state.clips[0],'positionY',10);render();});
    assert.deepEqual(await stateOfGuides(),{x:false,y:false,center:false},'Off-center media remains free of guide lines after rerender');
    await page.evaluate(()=>applyPreviewCommand('center'));
    assert.deepEqual(await stateOfGuides(),{x:true,y:true,center:true},'The Center action displays both guides after rerender');
    const dragBox=await page.locator('[data-preview-transform]').boundingBox();
    const dragPoint={x:dragBox.x+dragBox.width/2,y:dragBox.y+dragBox.height/2};
    await page.mouse.move(dragPoint.x,dragPoint.y);
    await page.mouse.down();
    await page.mouse.move(dragPoint.x+32,dragPoint.y+24,{steps:4});
    await page.mouse.up();
    assert.deepEqual(await stateOfGuides(),{x:false,y:false,center:false},'Guides clear after dragging media away from center');
    const movedBox=await page.locator('[data-preview-transform]').boundingBox();
    const movedPoint={x:movedBox.x+movedBox.width/2,y:movedBox.y+movedBox.height/2};
    await page.mouse.move(movedPoint.x,movedPoint.y);
    await page.mouse.down();
    await page.mouse.move(movedPoint.x-32,movedPoint.y-24,{steps:4});
    await page.mouse.up();
    assert.deepEqual(await stateOfGuides(),{x:true,y:true,center:true},'Guides remain visible after a centered drag is released');
    assert.equal(await page.locator('[data-preview-rotation-readout]').textContent(),'0°');
    assert.deepEqual(await page.evaluate(()=>[shortestRotationStep(179,-179),shortestRotationStep(-179,179)]),[2,-2],'Rotation crosses the ±180° boundary continuously');
    const handle=page.locator('.preview-rotate-handle');
    const bounds=await handle.boundingBox();
    assert(bounds&&bounds.y>=0&&bounds.x>=0,'The rotate handle must stay visible inside the preview');
    const preview=await page.locator('.preview').boundingBox();
    const center={x:preview.x+preview.width/2,y:preview.y+preview.height/2};
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.mouse.down();
    await page.mouse.move(center.x+preview.width*.2,center.y-preview.height*.1,{steps:5});
    const during=await page.locator('[data-preview-rotation-readout]').textContent();
    assert.notEqual(during,'0°','Turning the media should update the visible degree value');
    assert.equal(await page.locator('[data-preview-rotation-readout]').evaluate(el=>el.classList.contains('turning')),true);
    await page.mouse.up();
    assert.equal(await page.locator('[data-preview-rotation-readout]').textContent(),during,'The degree value should persist after release');
    await page.evaluate(()=>{
      state.clips=[{id:'preview-text',type:'text',name:'Preview title',text:'Centered title',start:0,duration:8,track:2,positionX:0,positionY:0,bottom:20,rotation:0,opacity:100}];
      state.selected='preview-text';render();
    });
    assert.deepEqual(await stateOfGuides(),{x:true,y:false,center:false},'A lower-third title must not show a false vertical center guide');
    await page.evaluate(()=>{setEditableClipValue(state.clips[0],'positionY',-30);render();});
    assert.deepEqual(await stateOfGuides(),{x:true,y:true,center:true},'A title actually centered in the preview shows both guides');
    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
    await mobile.goto(`http://127.0.0.1:${server.address().port}`);
    await mobile.locator('.zorifi-opening').waitFor({state:'detached'});
    const touchResult=await mobile.evaluate(engine=>{
      currentUser={id:'touch-preview-proof',name:'Editor'};
      syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();createNewProject();
      const canvas=document.createElement('canvas');canvas.width=240;canvas.height=135;
      const url=canvas.toDataURL();state.creatorSettings.addZorifiEnding=false;
      state.mediaAssets=[{id:'touch-image',type:'image',name:'Touch.png',duration:8,url,thumbnail:url}];
      state.clips=[{id:'touch-clip',type:'video',name:'Touch',mediaId:'touch-image',start:0,duration:8,track:0,scale:100,positionX:12,positionY:12,rotation:0,opacity:100,fit:'contain'}];
      state.selected='touch-clip';state.currentTime=2;state.duration=8;state.view='editor';render();
      // WebKit's Touch constructor is unavailable in Playwright's page context.
      // Check the mobile centering command there; Chromium exercises touch drag below.
      if(engine==='webkit'){
        applyPreviewCommand('center');
        const preview=document.querySelector('.preview');
        return {x:keyframedValue(state.clips[0],'positionX'),y:keyframedValue(state.clips[0],'positionY'),center:preview.classList.contains('guide-centered')};
      }
      const box=document.querySelector('[data-preview-transform]'),rect=box.closest('.preview').getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
      const touch=(clientX,clientY)=>new Touch({identifier:1,target:box,clientX,clientY});
      const start=touch(x,y),end=touch(x-rect.width*.12,y-rect.height*.12);
      box.dispatchEvent(new TouchEvent('touchstart',{touches:[start],targetTouches:[start],changedTouches:[start],bubbles:true,cancelable:true}));
      box.dispatchEvent(new TouchEvent('touchmove',{touches:[end],targetTouches:[end],changedTouches:[end],bubbles:true,cancelable:true}));
      box.dispatchEvent(new TouchEvent('touchend',{touches:[],targetTouches:[],changedTouches:[end],bubbles:true,cancelable:true}));
      const clip=state.clips[0],preview=document.querySelector('.preview');
      return {x:keyframedValue(clip,'positionX'),y:keyframedValue(clip,'positionY'),center:preview.classList.contains('guide-centered')};
    },engine);
    assert.deepEqual(touchResult,{x:0,y:0,center:true},'Mobile centering keeps both guides visible after release');
    await mobile.close();
    assert.deepEqual(errors,[]);
    console.log(`${engine}: preview guides survive centered desktop and mobile edits, and visible rotation shows live degrees.`);
  }finally{
    await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
