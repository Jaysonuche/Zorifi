const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {createServer}=require('../scripts/dev-server.cjs');
(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.ZORIFI_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#zorifi-startup').waitFor({state:'detached'});
  await page.evaluate(()=>{
   currentUser={id:'multicam-test',name:'Multicam Test'};syncPhase10Stores();termsAcceptance.accept();createNewProject();
   let seed=17;const amplitudes=Array.from({length:500},()=>{seed=seed*16807%2147483647;return .1+.7*seed/2147483647;});
   function wav(delay){const count=(500+delay)*80,bytes=new ArrayBuffer(44+count*2),view=new DataView(bytes),text=(at,value)=>[...value].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
    text(0,'RIFF');view.setUint32(4,36+count*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,count*2,true);
    for(let i=0;i<count;i++){const amp=amplitudes[Math.floor(i/80)-delay]||0;view.setInt16(44+i*2,Math.round(amp*Math.sin(i*Math.PI/4)*24000),true);}return new Blob([bytes],{type:'audio/wav'});
   }
   state.mediaAssets=[{id:'m',name:'Master.wav',type:'audio',duration:5,url:editorResources.createManagedUrl(wav(0))},{id:'t',name:'Target.wav',type:'audio',duration:5.25,url:editorResources.createManagedUrl(wav(25))}];
   state.clips=[{id:'master',type:'audio',mediaId:'m',name:'Master',start:2,duration:5,track:1,volume:100},{id:'target',type:'audio',mediaId:'t',name:'Target',start:4,duration:5.25,track:100,volume:100}];state.duration=9.25;state.selected='master';render();studioAction('multicam');
  });
  await page.locator('[data-sync-target][value="target"]').check();await page.locator('[data-sync-run]').click();await page.waitForFunction(()=>document.querySelector('[data-sync-status]')?.textContent.startsWith('Aligned'),{},{timeout:30000});
  const result=await page.evaluate(()=>({start:state.clips.find(c=>c.id==='target').start,group:state.clips[0].multicamGroupId===state.clips[1].multicamGroupId}));assert.ok(Math.abs(result.start-1.75)<=.011);assert.equal(result.group,true);
  await page.locator('.multicam-modal [data-close]').click();await page.evaluate(()=>undo());assert.equal(await page.evaluate(()=>state.clips.find(c=>c.id==='target').start),4);
  console.log('Multicam browser check passed: real WAV decoding, worker correlation, modal alignment and Undo.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
