const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(fs.existsSync(edge)?{executablePath:edge}:{})});
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
    assert.deepEqual(errors,[]);
    console.log('Preview guides appear only on centered axes, and visible rotation shows live degrees.');
  }finally{
    await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
