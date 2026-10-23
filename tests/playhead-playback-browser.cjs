const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const engine=process.env.ZORIFI_TEST_ENGINE||'chromium';
  const browser=await (engine==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:edge}));
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#zorifi-startup').waitFor({state:'detached'});
    await page.evaluate(()=>{
      currentUser={id:'seek-playback-proof',name:'Editor'};
      syncPhase10Stores();termsAcceptance.accept();betaProgramState.acknowledge();createNewProject();
      state.mediaAssets=[{id:'video-proof',type:'video',name:'Test video.mp4',url:'/assets/tutorial/zorifi-tour.mp4',duration:20}];
      state.clips=[{id:'clip-proof',mediaId:'video-proof',type:'video',name:'Test video',track:0,start:0,duration:12,sourceStart:0,playbackRate:1,opacity:100,volume:100,scale:100,fit:'contain'}];
      state.duration=12;state.currentTime=0;state.creatorSettings.addZorifiEnding=false;state.view='editor';render();
    });
    await page.locator('video[data-preview-clip="clip-proof"]').waitFor();
    await page.locator('video[data-preview-clip="clip-proof"]').evaluate(video=>new Promise((resolve,reject)=>{if(video.readyState>=1)return resolve();video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',()=>reject(new Error('Fixture video failed to load')),{once:true});}));
    const duration=await page.locator('video[data-preview-clip="clip-proof"]').evaluate(video=>video.duration);
    assert(duration>5,`Fixture must cover a nonzero seek (${duration}s)`);
    const target=Math.min(5,duration-2);
    await page.evaluate(time=>{seekProject(time);render();},target);
    await page.locator('[data-action="play"]').first().click();
    await page.waitForTimeout(300);
    const result=await page.evaluate(()=>({project:state.currentTime,source:document.querySelector('video[data-preview-clip="clip-proof"]')?.currentTime,playing:state.playing}));
    assert(result.playing,'Timeline playback should start');
    assert(result.project>target-.25,`Playback must continue from the dropped playhead, not restart: ${JSON.stringify(result)}`);
    assert(result.source>target-.25,`Preview video must seek to the dropped playhead: ${JSON.stringify(result)}`);
    await page.evaluate(()=>{stopProjectPlayback();seekProject(0);render();});
    const playhead=await page.locator('.playhead').boundingBox(),timeline=await page.locator('.timeline-content').boundingBox();
    assert(playhead&&timeline,'Timeline and playhead must be visible');
    const x=playhead.x+playhead.width/2,y=playhead.y+playhead.height*.1;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+timeline.width*.4,y,{steps:10});await page.mouse.up();
    const dropped=await page.evaluate(()=>state.currentTime);
    assert(dropped>3,`Dragging the playhead must move it away from zero (${dropped})`);
    await page.locator('[data-action="play"]').first().click();await page.waitForTimeout(300);
    const draggedResult=await page.evaluate(()=>({project:state.currentTime,source:document.querySelector('video[data-preview-clip="clip-proof"]')?.currentTime}));
    assert(draggedResult.project>dropped-.25,`Dragged playhead must keep its time on playback: ${JSON.stringify({dropped,...draggedResult})}`);
    assert(draggedResult.source>dropped-.25,`Preview media must follow the dragged playhead: ${JSON.stringify({dropped,...draggedResult})}`);
    const audioDuration=await page.evaluate(()=>new Promise((resolve,reject)=>{const audio=new Audio('/assets/template-sounds/beat-edit.wav');audio.addEventListener('loadedmetadata',()=>resolve(audio.duration),{once:true});audio.addEventListener('error',()=>reject(new Error('Audio fixture failed to load')),{once:true});}));
    assert(audioDuration>3,'Audio fixture must support a nonzero seek');
    const mixedTarget=Math.min(2,audioDuration-1);
    await page.evaluate(time=>{
      stopProjectPlayback();state.mediaAssets.push({id:'audio-proof',type:'audio',name:'Music.wav',url:'/assets/template-sounds/beat-edit.wav',duration:8});
      state.clips.push({id:'music-proof',mediaId:'audio-proof',type:'audio',name:'Music',track:1,start:0,duration:8,sourceStart:0,playbackRate:1,volume:100});
      seekProject(time);render();
    },mixedTarget);
    await page.locator('[data-action="play"]').first().click();await page.waitForTimeout(300);
    const mixedResult=await page.evaluate(()=>({project:state.currentTime,source:document.querySelector('video[data-preview-clip="clip-proof"]')?.currentTime,audio:timelineAudioPlayers.get('music-proof')?.currentTime}));
    assert(mixedResult.project>mixedTarget-.25&&mixedResult.source>mixedTarget-.25&&mixedResult.audio>mixedTarget-.25,
      `Video and soundtrack must both start at the playhead: ${JSON.stringify(mixedResult)}`);
    assert.deepEqual(errors,[]);
    console.log(`${engine}: video and soundtrack playback start from a dragged/re-rendered nonzero playhead position.`);
  }finally{
    await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
