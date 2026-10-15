const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {createServer}=require('../scripts/dev-server.cjs');
(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.ZORIFI_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage({acceptDownloads:true});await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#zorifi-startup').waitFor({state:'detached'});
  const result=await page.evaluate(async()=>{
   currentUser={id:'caption-test',name:'Caption Test'};syncPhase10Stores();termsAcceptance.accept();createNewProject();
   const bytes=new ArrayBuffer(16044),view=new DataView(bytes);const text=(at,value)=>[...value].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
   text(0,'RIFF');view.setUint32(4,16036,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,16000,true);
   const url=editorResources.createManagedUrl(new Blob([bytes],{type:'audio/wav'}));state.mediaAssets=[{id:'audio',name:'test.wav',type:'audio',duration:2,url}];
   state.clips=[{id:'source',type:'audio',name:'Speech',mediaId:'audio',start:5,duration:.1,sourceStart:1,playbackRate:2,track:1,volume:100}];state.selected='source';state.currentTime=5;state.duration=5.1;state.captionSettings.source='selected';
   // Mock only speech recognition; this test never calls a paid provider.
   transcribeCaptionMedia=async(blob)=>{if(!blob.size)throw new Error('Missing audio upload');return {captions:[{start:1,end:1.2,text:'Real test words'}]};};
   state.activePanel='captions';render();document.querySelector('#btn-generate-captions').click();for(let i=0;i<500&&captionGenerating;i++)await new Promise(resolve=>setTimeout(resolve,10));const caption=state.clips.find(c=>c.autoCaption);return {ok:Boolean(caption),start:caption?.start,duration:caption?.duration};
  });
  assert.equal(result.ok,true);assert.equal(result.start,5);assert.ok(Math.abs(result.duration-.1)<.0001);
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-caption-export]').click();const download=await downloadPromise;
  const text=fs.readFileSync(await download.path(),'utf8');assert.ok(text.includes('00:00:05,000 --> 00:00:05,100'));assert.ok(text.includes('Real test words'));
  console.log('Caption browser check passed: mocked transcription, source trim/speed alignment, short caption boundaries and actual SRT download.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
