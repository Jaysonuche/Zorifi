const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 const executablePath=process.env.ZORIFI_BROWSER_EXECUTABLE||(fs.existsSync(edge)?edge:undefined);
 const browser=await chromium.launch({headless:true,executablePath});
 try{
  const page=await browser.newPage();
  for(const file of ['zorifi-audio-engine.js','zorifi-music-studio.js'])await page.addScriptTag({path:path.resolve(__dirname,'..',file)});
  const result=await page.evaluate(async()=>{
   const ctx=new OfflineAudioContext(2,4800,48000),studio=new ZorifiAudioStudio({audioContext:ctx});
   const buffer=ctx.createBuffer(1,2400,48000);buffer.getChannelData(0).fill(.5);
   await studio.addStemTrack('lead',buffer,'lead');await studio.addStemTrack('bass',buffer,'bass');
   studio.setTrackVolume('lead',.5);studio.setTrackPan('lead',-1);
   studio.setTrackVolume('bass',.25);studio.setTrackPan('bass',1);
   await studio.playAll();const out=await ctx.startRendering();
   const result={before:out.getChannelData(0)[500],left:out.getChannelData(0)[1500],right:out.getChannelData(1)[1500],ended:[...studio.tracks.values()].every(t=>!t.isPlaying),bpm:studio.buildAIMusicPrompt().parameters.bpm};
   await studio.dispose();return result;
  });
  assert.equal(result.before,0);assert.ok(Math.abs(result.left-.25)<.001);assert.ok(Math.abs(result.right-.125)<.001);
  assert.equal(result.ended,true);assert.equal(result.bpm,120);
  console.log('Browser audio render passed: synchronized stems, volume, stereo pan, natural completion and AI brief.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
