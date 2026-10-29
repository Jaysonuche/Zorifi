const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {createServer}=require('../scripts/dev-server.cjs');

(async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{for(const [engine,name] of [[chromium,'Chromium'],[webkit,'WebKit']]){
    const browser=await engine.launch({headless:true,...(name==='Chromium'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
    try{
      const page=await browser.newPage(),origin=`http://127.0.0.1:${server.address().port}`;
      await page.route('**/stage2-media-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Real decoded media review</title>'}));
      await page.goto(origin+'/stage2-media-fixture');
      for(const file of ['zorifi-autocut-media.js','zorifi-autocut.js','zorifi-autocut-director.js','zorifi-vanessa-media-review.js'])await page.addScriptTag({url:origin+'/'+file});
      const result=await page.evaluate(async()=>{
        const response=await fetch('/assets/template-previews/cinematic-travel.mp4'),blob=await response.blob(),asset={id:'real-video',type:'video',name:'Real imported MP4',file:blob,size:blob.size,url:URL.createObjectURL(blob)};
        try{
          let evidence,videoCodecLimitation=null;try{evidence=await ZorifiVanessaMediaReview.collectEvidence([asset],{includeAudio:false});}catch(error){if(!/codec|opened|decode/i.test(error.message))throw error;videoCodecLimitation=error.message;const photo=await (await fetch('/assets/tool-previews/park-portrait.webp')).blob();asset.type='image';asset.file=photo;asset.size=photo.size;URL.revokeObjectURL(asset.url);asset.url=URL.createObjectURL(photo);evidence=await ZorifiVanessaMediaReview.collectEvidence([asset],{includeAudio:false});}
          const info=ZorifiVanessaMediaReview.validateEvidence(evidence,{assetIds:[asset.id]}),source=evidence.media[0],moments=ZorifiVanessaMediaReview.strongestMoments(evidence);
          const state={projectId:'review-fixture',duration:source.duration,ratio:'16 / 9',currentTime:0,selected:'clip',trackStates:{},mediaAssets:[asset],clips:[{id:'clip',type:'video',mediaId:asset.id,start:0,duration:source.duration,sourceStart:0,playbackRate:1,track:0,volume:0}]};
          const review=ZorifiVanessaMediaReview.reviewProject(state,{evidence,targetDuration:source.duration}),controller=new AbortController();controller.abort();let cancelled=false;try{await ZorifiVanessaMediaReview.collectEvidence([asset],{signal:controller.signal});}catch(error){cancelled=error.name==='AbortError';}
          return {info,videoCodecLimitation,duration:source.duration,width:source.width,height:source.height,frames:source.frames.map(frame=>({time:frame.time,score:frame.metrics?.score,luma:frame.metrics?.luma,image:frame.image.slice(0,23)})),candidates:moments.length,exportReady:review.exportReady,certified:!review.needsCreativeApproval,unknown:source.unknown,cancelled};
        }finally{URL.revokeObjectURL(asset.url);}
      });
      assert.ok(result.info.frameCount>=(result.videoCodecLimitation?1:2));assert.ok(result.frames.every(frame=>Number.isFinite(frame.score)&&frame.image==='data:image/jpeg;base64,'));if(!result.videoCodecLimitation)assert.ok(result.frames.at(-1).time>result.duration*.8);assert.ok(result.width>0&&result.height>0);assert.ok(result.candidates>0);assert.equal(result.exportReady,true);assert.equal(result.certified,false);assert.equal(result.cancelled,true);assert.ok(result.unknown.includes('audio content was not decoded'));
      const audioResult=await page.evaluate(async()=>{
        const data=new ArrayBuffer(44+64000),view=new DataView(data),text=(at,value)=>{for(let index=0;index<value.length;index++)view.setUint8(at+index,value.charCodeAt(index));};text(0,'RIFF');view.setUint32(4,data.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,64000,true);for(let index=0;index<32000;index++)view.setInt16(44+2*index,Math.round(Math.sin(index*Math.PI/16)*(index%8000<1600?20000:1000)),true);
        const wav=new Blob([data],{type:'audio/wav'}),photo=await (await fetch('/assets/tool-previews/park-portrait.webp')).blob(),sources=[{id:'portrait',type:'image',file:photo,size:photo.size,name:'Real portrait'},{id:'pcm-track',type:'audio',file:wav,size:wav.size,duration:2,name:'PCM soundtrack'}],evidence=await ZorifiVanessaMediaReview.collectEvidence(sources,{includeAudio:true}),audio=evidence.media.find(item=>item.id==='pcm-track');
        return {measured:Boolean(audio?.audio),duration:audio?.audio?.metrics?.duration,sampleCount:audio?.audio?.metrics?.sampleCount,peak:audio?.audio?.metrics?.samplePeak,inlineWav:ZorifiVanessaMediaReview.providerParts(evidence).filter(part=>part.inlineData?.mimeType==='audio/wav').length,warnings:evidence.warnings};
      });
      if(name==='Chromium'){assert.equal(audioResult.measured,true,JSON.stringify(audioResult));assert.equal(audioResult.duration,2);assert.equal(audioResult.sampleCount,32000);assert.ok(audioResult.peak>.5);assert.equal(audioResult.inlineWav,1);}else if(!audioResult.measured){assert.ok(audioResult.warnings.some(value=>/decoding is unavailable/.test(value)));assert.equal(audioResult.inlineWav,0);}
      console.log(JSON.stringify({engine:name,passed:true,...result,audioResult},null,2));
    }finally{await browser.close();}
  }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
