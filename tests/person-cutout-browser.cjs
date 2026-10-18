// Explicit integration test: downloads the pinned on-device runtime and model.
// Uses the user's supplied portrait reference locally; source pixels are never
// uploaded to a provider by the segmentation adapter.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const project=path.resolve(__dirname,'..');
(async()=>{
  const source=process.argv[2]||'C:/Users/User/Downloads/WhatsApp Image 2026-10-17 at 19.55.53.jpeg';
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:900,height:800}});await page.setContent('<input type="file"><canvas id="output"></canvas>');
    for(const module of ['zorifi-person-cutout.js','zorifi-tool-registry.js','zorifi-autocut-creative.js','zorifi-autocut-director.js','zorifi-autocut-renderer.js'])await page.addScriptTag({path:path.join(project,module)});
    const requests=[];page.on('request',request=>{if(request.method()!=='GET')throw new Error('Segmentation must never upload source data.');requests.push(request.url());});
    await page.locator('input').setInputFiles(source);
    const result=await page.evaluate(async()=>{
      const file=document.querySelector('input').files[0],image=new Image();image.src=URL.createObjectURL(file);await image.decode();const progress=[];
      await ZorifiPersonCutout.prepare({allowDownload:true,onProgress:event=>progress.push(event.stage)});
      const matte=ZorifiPersonCutout.cutout(image),context=matte.getContext('2d'),alphaAt=(x,y)=>context.getImageData(Math.round(x*matte.width),Math.round(y*matte.height),1,1).data[3],pixels=context.getImageData(0,0,matte.width,matte.height).data;let visible=0,transparent=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]>220)visible++;if(pixels[i]<25)transparent++;}
      const background=document.createElement('canvas');background.width=360;background.height=640;const back=background.getContext('2d');back.fillStyle='#153aee';back.fillRect(0,0,360,640);
      const assets=[{id:'background',type:'image',duration:5,name:'Blue scene',url:background.toDataURL()},{id:'portrait',type:'image',duration:5,name:'Portrait reference',url:image.src}],shot={mediaId:'background',sourceStart:0,duration:.8,speed:1,reason:'Demonstrate actual person segmentation over a separate scene.',fit:'cover',motion:'none',transition:'cut',grade:'natural',caption:'',captionPosition:'bottom',layout:'hero-overlay',secondaryMediaIds:['portrait'],tools:[{id:'person-cutout',params:{}}]};
      const plan=ZorifiAutoCutDirector.compile({plan:{title:'Foreground proof',story:'Person over blue scene',shots:[shot],warnings:[]}},assets),rendered=await ZorifiAutoCutRenderer.render({plan,assets,width:360,height:640});
      const url=URL.createObjectURL(rendered.blob),video=document.createElement('video');video.src=url;video.muted=true;await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});video.currentTime=.3;await new Promise(resolve=>video.onseeked=resolve);const final=document.querySelector('#output');final.width=360;final.height=640;const finalContext=final.getContext('2d');finalContext.drawImage(video,0,0);const exportPixel=(x,y)=>Array.from(finalContext.getImageData(Math.round(x*360),Math.round(y*640),1,1).data);URL.revokeObjectURL(url);
      const result={status:ZorifiPersonCutout.status(),progress,faceAlpha:alphaAt(.5,.43),streetAlpha:alphaAt(.1,.16),visible,transparent,width:matte.width,height:matte.height,image:matte.toDataURL(),exportImage:final.toDataURL(),exportBackground:exportPixel(.26,.17),exportFace:exportPixel(.5,.44),videoBytes:rendered.blob.size};ZorifiPersonCutout.dispose();return result;
    });
    assert(result.status.ready);assert(result.visible>10000);assert(result.transparent>10000);assert(result.faceAlpha>200);assert(result.streetAlpha<70);assert(result.progress.includes('ready'));assert(result.videoBytes>3000);assert(result.exportBackground[2]>180&&result.exportBackground[0]<60);assert(result.exportFace[2]<160&&result.exportFace[0]>30);
    fs.mkdirSync(path.join(project,'artifacts'),{recursive:true});fs.writeFileSync(path.join(project,'artifacts','person-cutout-proof.png'),Buffer.from(result.image.split(',')[1],'base64'));
    fs.writeFileSync(path.join(project,'artifacts','person-cutout-export-proof.png'),Buffer.from(result.exportImage.split(',')[1],'base64'));
    console.log(JSON.stringify({...result,image:undefined,exportImage:undefined,requests}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
