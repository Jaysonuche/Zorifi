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
    const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#zorifi-startup').waitFor({state:'detached'});
    await page.evaluate(()=>{
      currentUser={id:'timeline-placement-proof',name:'Editor'};
      syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();createNewProject();
      const canvas=document.createElement('canvas');canvas.width=200;canvas.height=120;
      canvas.getContext('2d').fillRect(0,0,200,120);
      const url=canvas.toDataURL();
      state.creatorSettings.addZorifiEnding=false;
      state.mediaAssets=[
        {id:'first-media',type:'image',name:'First.png',duration:5,url,thumbnail:url},
        {id:'second-media',type:'image',name:'Second.png',duration:4,url,thumbnail:url}
      ];
      state.clips=[];state.duration=10;state.currentTime=0;state.snapping=false;
      state.activePanel='media';state.panelCollapsed=false;state.view='editor';render();
    });
    await page.evaluate(()=>{addMediaToTimeline('first-media');state.currentTime=0;addMediaToTimeline('second-media');});
    let clips=await page.evaluate(()=>state.clips.filter(clip=>clip.type==='video').map(({name,start,duration,track,scale,overlay})=>({name,start,duration,track,scale,overlay})));
    assert.equal(clips.length,2);
    assert.deepEqual(clips.map(clip=>clip.track),[0,0],'Regular imports should stay on the main video lane');
    assert(clips[1].start>=clips[0].start+clips[0].duration,'Regular imports should sequence after occupied V1 clips');
    assert.equal(clips[1].scale,100);
    assert.equal(clips[1].overlay,false);
    await page.locator('[data-media-id="first-media"]').dragTo(page.locator('.timeline-new-track-drop'),{force:true});
    clips=await page.evaluate(()=>state.clips.filter(clip=>clip.type==='video').map(({track,scale,overlay})=>({track,scale,overlay})));
    assert.equal(clips.at(-1).track,4,'Explicit new-track drop should create V2');
    assert.equal(clips.at(-1).scale,100,'A new video lane should retain full-frame scale');
    assert.equal(clips.at(-1).overlay,false,'A new video lane is not implicitly an overlay');
    for(let i=0;i<3;i++)await page.locator('[data-media-id="first-media"]').dragTo(page.locator('.timeline-new-track-drop'),{force:true});
    assert.deepEqual(await page.evaluate(()=>matchingTracks('video')),[0,4,5,6,7],'The new-layer drop target must remain usable after every addition');
    await page.evaluate(()=>{state.activePanel='text';state.textSection='yours';render();});
    await page.locator('[data-text-preset]').first().dragTo(page.locator('.timeline-new-track-drop'),{force:true});
    await page.locator('[data-text-preset]').first().dragTo(page.locator('.timeline-new-track-drop'),{force:true});
    await page.locator('[data-text-preset]').first().dragTo(page.locator('.timeline-new-track-drop'),{force:true});
    const textTracks=await page.evaluate(()=>state.clips.filter(clip=>clip.type==='text').map(clip=>clip.track));
    assert.deepEqual(textTracks,[2,200,201],'Repeated text drops should create independent text tracks');
    await page.evaluate(()=>{state.activePanel='audio';state.audioSection='music';render();});
    await page.locator('[data-audio-track]').first().dragTo(page.locator('.timeline-new-track-drop'),{force:true});
    const audio=await page.evaluate(()=>state.clips.find(clip=>clip.type==='audio'));
    assert(audio&&audio.track===1,'Audio can be dragged directly to its own timeline');
    for(let i=0;i<2;i++)await page.locator('[data-audio-track]').first().dragTo(page.locator('.timeline-new-track-drop'),{force:true});
    assert.deepEqual(await page.evaluate(()=>matchingTracks('audio')),[1,100,101]);
    await page.evaluate(()=>{state.activePanel='effects';state.effectSection='effects';render();});
    for(let i=0;i<3;i++)await page.evaluate(()=>{
      const id=document.querySelector('.effect-card[data-effect]')?.dataset.effect;
      const target=document.querySelector('.timeline-new-track-drop');
      if(!id||!target)throw new Error('Effect source or timeline target is unavailable');
      const transfer=new DataTransfer();
      transfer.setData('application/x-zorifi-effect',id);
      target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
    });
    const fx=await page.evaluate(()=>state.clips.find(clip=>clip.type==='effect'));
    assert(fx&&fx.track===3,'Effects can be dragged directly to an editable FX timeline');
    assert.deepEqual(await page.evaluate(()=>matchingTracks('effect')),[3,300,301]);
    // Cross the old ID bands in the live editor, then verify the highest layer
    // can still be selected, trimmed, and saved with the correct track kind.
    await page.evaluate(()=>{
      state.clips=[];
      for(const kind of ['video','text','audio','effect'])for(let i=0;i<125;i++){
        const track=nextTrack(kind);state.clips.push({id:`many-${kind}-${i}`,type:kind,track,start:0,duration:5,mediaId:kind==='video'?'first-media':undefined,name:`Layer ${i+1}`,opacity:100,volume:100});
      }
      state.selected='many-video-124';render();
    });
    const many=await page.evaluate(()=>['video','audio','text','effect'].map(kind=>({kind,count:matchingTracks(kind).length,last:trackLabel(matchingTracks(kind).at(-1))})));
    assert.deepEqual(many.map(item=>item.count),[125,125,125,125]);
    assert.deepEqual(many.map(item=>item.last),['V125','A125','T125','FX125']);
    await page.evaluate(()=>{const scroll=document.querySelector('.timeline-scroll');scroll.scrollTop=0;scroll.scrollLeft=0;});
    const trim=await page.locator('[data-clip="many-video-124"] [data-trim="right"]').boundingBox();
    const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.outerHTML,{x:trim.x+trim.width/2,y:trim.y+trim.height/2});
    await page.mouse.move(trim.x+trim.width/2,trim.y+trim.height/2);await page.mouse.down();
    await page.mouse.move(trim.x-40,trim.y+trim.height/2,{steps:8});await page.mouse.up();
    const restored=await page.evaluate(()=>{
      const project=ProjectModel.migrateProject(ProjectModel.serializeProject(state,''));
      const clip=project.clips.find(item=>item.id==='many-video-124');
      return {duration:clip.duration,label:trackLabel(clip.track),count:project.clips.length};
    });
    assert(restored.duration<5&&restored.duration>0,JSON.stringify({message:'An extended video track must remain trimmable',trim,hit,restored}));
    assert.equal(restored.label,'V125');assert.equal(restored.count,500);
    assert.deepEqual(errors,[]);
    console.log('Media, text, audio and effects create the intended tracks; ordinary imports do not become overlays.');
  }finally{
    await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
