const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const project=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  try{
    const page=await browser.newPage({viewport:{width:1000,height:700}});
    await page.setContent('<canvas id="output" width="640" height="360"></canvas>');
    for(const file of ['zorifi-tool-registry.js','zorifi-autocut-creative.js','zorifi-autocut-renderer.js'])await page.addScriptTag({path:path.join(project,file)});
    const result=await page.evaluate(async()=>{
      const source=document.createElement('canvas');source.width=320;source.height=180;const p=source.getContext('2d');
      [['#f02020',0,0],['#20e040',160,0],['#2040f0',0,90],['#f0e020',160,90]].forEach(([color,x,y])=>{p.fillStyle=color;p.fillRect(x,y,160,90);});
      const canvas=document.querySelector('#output'),ctx=canvas.getContext('2d'),Tools=ZorifiToolRegistry,Creative=ZorifiAutoCutCreative;
      const spatial=Tools.validateParams('spatial',{rotateX:12,endRotateX:12,rotateY:-38,endRotateY:-38,rotateZ:-5,endRotateZ:-5,depth:.1,endDepth:.1,scale:.9}),clip={id:'spatial-proof',type:'video',mediaId:'source',start:0,duration:.8,sourceStart:0,track:0,opacity:100,fit:'contain',scale:100,playbackRate:1,autoCutStyle:{motion:'none',grade:'natural'},spatial3D:spatial};
      Creative.draw(ctx,source,clip,.4,640,360);
      const pixel=(u,v)=>{const q=Creative.projectPoint(u,v,640,360,Creative.spatialAt(clip,.4));return Array.from(ctx.getImageData(Math.round(q.x),Math.round(q.y),1,1).data);};
      const pixels=[[.25,.25],[.75,.25],[.25,.75],[.75,.75]].map(([u,v])=>pixel(u,v)),corner=Array.from(ctx.getImageData(0,0,1,1).data);
      const rendered=await ZorifiAutoCutRenderer.render({plan:{clips:[clip],duration:.8},assets:[{id:'source',type:'image',duration:5,name:'Projection colours',url:source.toDataURL()}],width:640,height:360});
      const url=URL.createObjectURL(rendered.blob),video=document.createElement('video');video.muted=true;video.src=url;await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});video.currentTime=.3;await new Promise(resolve=>video.onseeked=resolve);ctx.clearRect(0,0,640,360);ctx.drawImage(video,0,0,640,360);const videoPixels=[[.25,.25],[.75,.25],[.25,.75],[.75,.75]].map(([u,v])=>pixel(u,v));URL.revokeObjectURL(url);
      return {pixels,corner,videoPixels,size:rendered.blob.size,mime:rendered.mimeType,duration:video.duration,image:canvas.toDataURL()};
    });
    const colors=[[0,1],[1,0],[2,0],[0,2]];
    for(const samples of [result.pixels,result.videoPixels])for(let i=0;i<samples.length;i++){const [high,low]=colors[i];assert(samples[i][high]-samples[i][low]>90,`Quadrant ${i}: ${samples[i]}`);}
    assert(result.corner[0]<20&&result.corner[1]<20&&result.corner[2]<25);assert(result.size>2000);assert(Number.isFinite(result.duration)&&result.duration>.5);
    fs.mkdirSync(path.join(project,'artifacts'),{recursive:true});fs.writeFileSync(path.join(project,'artifacts','autocut-spatial-proof.png'),Buffer.from(result.image.split(',')[1],'base64'));
    console.log(JSON.stringify({spatialPixels:result.pixels,exportPixels:result.videoPixels,bytes:result.size,mime:result.mime,duration:result.duration}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
