(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiAutoCutCreative=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const MOTIONS=['none','push-in','pull-out','pan-left','pan-right'];
  const GRADES={natural:'none',cinematic:'contrast(1.12) saturate(.88) brightness(.96)',monochrome:'grayscale(1) contrast(1.18)',vivid:'contrast(1.1) saturate(1.24)'};
  const chromaBuffers=new WeakMap();
  function style(clip){const value=clip.autoCutStyle||{};return {motion:MOTIONS.includes(value.motion)?value.motion:'none',grade:Object.hasOwn(GRADES,value.grade)?value.grade:'natural',caption:String(value.caption||'').slice(0,160),captionPosition:value.captionPosition==='center'?'center':'bottom',transition:['flash','dissolve'].includes(value.transition)?value.transition:'cut',focalPoint:{x:clamp(value.focalPoint?.x??.5,0,1),y:clamp(value.focalPoint?.y??.5,0,1)},kinetic:value.kinetic!==false};}
  function motionAt(clip,time){const s=style(clip),p=clamp((time-clip.start)/Math.max(.01,clip.duration),0,1),e=p*p*(3-2*p);let scale=1,x=0,y=0;if(s.motion==='push-in')scale=1+.12*e;if(s.motion==='pull-out')scale=1.12-.12*e;if(s.motion.startsWith('pan-')){scale=1.1;x=(s.motion==='pan-left'?1:-1)*.045*(1-2*e);}return {scale,x,y,progress:p};}
  function cell(clip,width,height){const c=clip.collage?.cell;if(!c)return {x:0,y:0,width,height};const x=clamp(c.left,0,100)/100*width,y=clamp(c.top,0,100)/100*height;return {x,y,width:clamp(c.width,0,100-clamp(c.left,0,100))/100*width,height:clamp(c.height,0,100-clamp(c.top,0,100))/100*height};}
  function drawCaption(ctx,clip,time,width,height){
    const s=style(clip);if(!s.caption)return;const local=clamp(time-clip.start,0,clip.duration),words=s.caption.trim().split(/\s+/),reveal=clamp(local/.24,0,1),content=s.kinetic&&words.length>1?words.slice(0,Math.max(1,Math.ceil(local/Math.min(.16,clip.duration/(words.length+2))))).join(' '):s.caption;
    let font=Math.min(height*(s.captionPosition==='center'?.1:.058),width*.085);const maxWidth=width*.84;
    ctx.save();ctx.globalAlpha=clamp((clip.opacity??100)/100,0,1)*reveal;ctx.textAlign='center';ctx.textBaseline='middle';
    const wrap=text=>{const lines=[];let line='';for(const word of text.split(/\s+/)){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;};
    for(let attempt=0;attempt<30;attempt++){ctx.font=`800 ${font}px Arial, sans-serif`;if(wrap(s.caption).length<=3||font<=10)break;font=Math.max(10,font*.9);}
    const shown=wrap(content),lineHeight=font*1.15,baseY=(s.captionPosition==='center'?height*.5:height*.82)-(shown.length-1)*lineHeight/2;
    ctx.translate(width/2,baseY+(1-reveal)*font*.2);const zoom=.92+.08*reveal;ctx.scale(zoom,zoom);ctx.lineJoin='round';ctx.lineWidth=Math.max(3,font*.11);ctx.strokeStyle='rgba(0,0,0,.86)';ctx.fillStyle='#fff';ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=font*.2;
    shown.forEach((text,index)=>{ctx.strokeText(text,0,index*lineHeight,maxWidth);ctx.fillText(text,0,index*lineHeight,maxWidth);});ctx.restore();
  }
  function draw(ctx,media,clip,time,width,height,options={}){
    const sw=media.videoWidth||media.naturalWidth||media.width,sh=media.videoHeight||media.naturalHeight||media.height;if(!sw||!sh)return;
    const bounds=cell(clip,width,height),s=style(clip),m=motionAt(clip,time),w=bounds.width,h=bounds.height;if(!w||!h)return;
    ctx.save();ctx.globalAlpha=clamp((clip.opacity??100)/100,0,1);ctx.translate(bounds.x,bounds.y);ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();if(clip.collage||!clip.track){ctx.fillStyle=clip.collage?.background||'#090b10';ctx.fillRect(0,0,w,h);}
    let drawSource=media;const left=clamp(clip.cropLeft,0,45)/100*sw,top=clamp(clip.cropTop,0,45)/100*sh,cw=Math.max(1,sw-left-clamp(clip.cropRight,0,45)/100*sw),ch=Math.max(1,sh-top-clamp(clip.cropBottom,0,45)/100*sh);
    let sx=left,sy=top,sourceWidth=cw,sourceHeight=ch;
    if(clip.chromaKey&&root.document&&root.ZorifiAdvancedEditing?.applyChromaToImageData){let buffer=chromaBuffers.get(media);if(!buffer){buffer=root.document.createElement('canvas');chromaBuffers.set(media,buffer);}const quality=Math.min(1,640/cw);buffer.width=Math.max(2,Math.round(cw*quality));buffer.height=Math.max(2,Math.round(ch*quality));const pixels=buffer.getContext('2d',{willReadFrequently:true});pixels.drawImage(media,left,top,cw,ch,0,0,buffer.width,buffer.height);const data=pixels.getImageData(0,0,buffer.width,buffer.height);root.ZorifiAdvancedEditing.applyChromaToImageData(data,{color:clip.chromaColor||'#00ff00',tolerance:clip.chromaTolerance??38,softness:clip.chromaSoftness??18,spill:clip.chromaSpill??45});pixels.putImageData(data,0,0);drawSource=buffer;sx=0;sy=0;sourceWidth=buffer.width;sourceHeight=buffer.height;}
    const factor=clip.fit==='contain'?Math.min(w/sourceWidth,h/sourceHeight):Math.max(w/sourceWidth,h/sourceHeight),dw=sourceWidth*factor,dh=sourceHeight*factor;
    const offsetX=clip.fit==='contain'?(w-dw)/2:clamp(w/2-s.focalPoint.x*dw,w-dw,0),offsetY=clip.fit==='contain'?(h-dh)/2:clamp(h/2-s.focalPoint.y*dh,h-dh,0);
    ctx.save();ctx.globalAlpha=clamp((clip.opacity??100)/100,0,1);ctx.globalCompositeOperation=clip.blendMode&&clip.blendMode!=='normal'?clip.blendMode:'source-over';ctx.filter=[ctx.filter,GRADES[s.grade],clip.autoCutExtraFilter].filter(value=>value&&value!=='none').join(' ')||'none';ctx.translate(w/2+(Number(clip.positionX)||0)/100*w+m.x*w,h/2+(Number(clip.positionY)||0)/100*h);ctx.rotate((Number(clip.rotation)||0)*Math.PI/180);ctx.scale(m.scale*(Number(clip.scale)||100)/100*(Number(clip.scaleX??100)/100),m.scale*(Number(clip.scale)||100)/100*(Number(clip.scaleY??100)/100));
    if(clip.maskShape||clip.cornerRadius){const scale=clamp(clip.maskScale??100,10,150)/100,x=clamp(clip.maskX,-100,100)/100*w,y=clamp(clip.maskY,-100,100)/100*h;ctx.beginPath();if(clip.maskShape==='circle')ctx.ellipse(x,y,dw*.42*scale,dh*.42*scale,0,0,Math.PI*2);else if(clip.maskShape==='triangle'){ctx.moveTo(x,y-dh*.44*scale);ctx.lineTo(x+dw*.44*scale,y+dh*.44*scale);ctx.lineTo(x-dw*.44*scale,y+dh*.44*scale);ctx.closePath();}else{const mw=clip.maskShape==='rectangle'?dw*.8*scale:dw,mh=clip.maskShape==='rectangle'?dh*.8*scale:dh;ctx.roundRect(x-mw/2,y-mh/2,mw,mh,Math.min(mw,mh)*clamp(clip.cornerRadius,0,50)/100);}ctx.clip();}
    ctx.drawImage(drawSource,sx,sy,sourceWidth,sourceHeight,offsetX-w/2,offsetY-h/2,dw,dh);ctx.restore();
    if(s.grade==='cinematic'){const gradient=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.2,w/2,h/2,Math.max(w,h)*.7);gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(1,'rgba(0,0,0,.25)');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);}
    const elapsed=time-clip.start;if(s.transition==='flash'&&clip.start>0&&elapsed>=0&&elapsed<.14){ctx.globalAlpha=(1-elapsed/.14)*.85;ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;}
    if(!options.skipCaption)drawCaption(ctx,clip,time,w,h);ctx.restore();
  }
  return {MOTIONS,GRADES,style,motionAt,cell,draw,drawCaption};
});
