(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiAutoCutCreative=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const MOTIONS=['none','push-in','pull-out','pan-left','pan-right'];
  const GRADES={natural:'none',cinematic:'contrast(1.12) saturate(.88) brightness(.96)',monochrome:'grayscale(1) contrast(1.18)',vivid:'contrast(1.1) saturate(1.24)'};
  const chromaBuffers=new WeakMap();
  const spatialBuffers=new WeakMap();
  const registry=()=>root.ZorifiToolRegistry||(typeof require==='function'?require('./zorifi-tool-registry.js'):null);
  function style(clip){const value=clip.autoCutStyle||{};return {motion:MOTIONS.includes(value.motion)?value.motion:'none',grade:Object.hasOwn(GRADES,value.grade)?value.grade:'natural',caption:String(value.caption||'').slice(0,160),captionPosition:value.captionPosition==='center'?'center':'bottom',transition:['flash','dissolve','whip-left','whip-right'].includes(value.transition)?value.transition:'cut',focalPoint:{x:clamp(value.focalPoint?.x??.5,0,1),y:clamp(value.focalPoint?.y??.5,0,1)},kinetic:value.kinetic!==false};}
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
  function drawFlat(ctx,media,clip,time,width,height,options={}){
    const sw=media.videoWidth||media.naturalWidth||media.width,sh=media.videoHeight||media.naturalHeight||media.height;if(!sw||!sh)return;
    const bounds=cell(clip,width,height),s=style(clip),m=motionAt(clip,time),w=bounds.width,h=bounds.height;if(!w||!h)return;
    ctx.save();ctx.globalAlpha=clamp((clip.opacity??100)/100,0,1);ctx.translate(bounds.x,bounds.y);ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();if((clip.collage||!clip.track)&&!(clip.subjectCutout?.enabled&&clip.track>0)){ctx.fillStyle=clip.collage?.background||'#090b10';ctx.fillRect(0,0,w,h);}
    let drawSource=media;const left=clamp(clip.cropLeft,0,45)/100*sw,top=clamp(clip.cropTop,0,45)/100*sh,cw=Math.max(1,sw-left-clamp(clip.cropRight,0,45)/100*sw),ch=Math.max(1,sh-top-clamp(clip.cropBottom,0,45)/100*sh);
    let sx=left,sy=top,sourceWidth=cw,sourceHeight=ch;
    if(clip.chromaKey){if(!root.document||!root.ZorifiAdvancedEditing?.applyChromaToImageData)throw new Error('The colour-key engine is unavailable. Refresh Zorifi before rendering this tool.');let buffer=chromaBuffers.get(media);if(!buffer){buffer=root.document.createElement('canvas');chromaBuffers.set(media,buffer);}const quality=Math.min(1,640/cw);buffer.width=Math.max(2,Math.round(cw*quality));buffer.height=Math.max(2,Math.round(ch*quality));const pixels=buffer.getContext('2d',{willReadFrequently:true});pixels.drawImage(media,left,top,cw,ch,0,0,buffer.width,buffer.height);const data=pixels.getImageData(0,0,buffer.width,buffer.height);root.ZorifiAdvancedEditing.applyChromaToImageData(data,{color:clip.chromaColor||'#00ff00',tolerance:clip.chromaTolerance??38,softness:clip.chromaSoftness??18,spill:clip.chromaSpill??45});pixels.putImageData(data,0,0);drawSource=buffer;sx=0;sy=0;sourceWidth=buffer.width;sourceHeight=buffer.height;}
    const factor=clip.fit==='contain'?Math.min(w/sourceWidth,h/sourceHeight):Math.max(w/sourceWidth,h/sourceHeight),dw=sourceWidth*factor,dh=sourceHeight*factor;
    const offsetX=clip.fit==='contain'?(w-dw)/2:clamp(w/2-s.focalPoint.x*dw,w-dw,0),offsetY=clip.fit==='contain'?(h-dh)/2:clamp(h/2-s.focalPoint.y*dh,h-dh,0);
    const color=clip.autoCutColor||{},adjustment=`brightness(${clamp(color.brightness??1,.5,1.5)}) contrast(${clamp(color.contrast??1,.5,1.8)}) saturate(${clamp(color.saturation??1,0,2)}) hue-rotate(${clamp(color.hue??0,-180,180)}deg)`,blur=clamp(clip.autoCutBlur,0,24)*Math.max(w,h)/1280;
    const shake=clip.autoCutShake,local=Math.max(0,time-clip.start),shakeAmount=clamp(shake?.amount,0,3)/100,frequency=clamp(shake?.frequency??6,1,16),shakeX=Math.sin(local*frequency*Math.PI*2)*shakeAmount*w,shakeY=Math.sin(local*frequency*Math.PI*3.14)*shakeAmount*h*.6;
    const whip=s.transition.startsWith('whip-')&&clip.start>0?Math.max(0,1-local/.24):0,whipX=whip*whip*w*(s.transition==='whip-left'?1:-1);
    ctx.save();ctx.globalAlpha=clamp((clip.opacity??100)/100,0,1);ctx.globalCompositeOperation=clip.blendMode&&clip.blendMode!=='normal'?clip.blendMode:'source-over';ctx.filter=[ctx.filter,GRADES[s.grade],adjustment,blur||whip?`blur(${blur+whip*9}px)`:'',clip.autoCutExtraFilter].filter(value=>value&&value!=='none').join(' ')||'none';ctx.translate(w/2+(Number(clip.positionX)||0)/100*w+m.x*w+shakeX+whipX,h/2+(Number(clip.positionY)||0)/100*h+m.y*h+shakeY);ctx.rotate((Number(clip.rotation)||0)*Math.PI/180);ctx.scale(m.scale*(Number(clip.scale)||100)/100*(Number(clip.scaleX??100)/100),m.scale*(Number(clip.scale)||100)/100*(Number(clip.scaleY??100)/100));
    if(clip.autoCutGlow){ctx.shadowBlur=clamp(clip.autoCutGlow.amount,0,30)*Math.max(w,h)/1280;ctx.shadowColor=/^#[a-f\d]{6}$/i.test(clip.autoCutGlow.color)?clip.autoCutGlow.color:'#af78ff';}
    if(clip.maskShape||clip.cornerRadius){const scale=clamp(clip.maskScale??100,10,150)/100,x=clamp(clip.maskX,-100,100)/100*w,y=clamp(clip.maskY,-100,100)/100*h;ctx.beginPath();if(clip.maskShape==='circle')ctx.ellipse(x,y,dw*.42*scale,dh*.42*scale,0,0,Math.PI*2);else if(clip.maskShape==='triangle'){ctx.moveTo(x,y-dh*.44*scale);ctx.lineTo(x+dw*.44*scale,y+dh*.44*scale);ctx.lineTo(x-dw*.44*scale,y+dh*.44*scale);ctx.closePath();}else{const mw=clip.maskShape==='rectangle'?dw*.8*scale:dw,mh=clip.maskShape==='rectangle'?dh*.8*scale:dh;ctx.roundRect(x-mw/2,y-mh/2,mw,mh,Math.min(mw,mh)*clamp(clip.cornerRadius,0,50)/100);}ctx.clip();}
    ctx.drawImage(drawSource,sx,sy,sourceWidth,sourceHeight,offsetX-w/2,offsetY-h/2,dw,dh);ctx.restore();
    if(s.grade==='cinematic'||clip.autoCutVignette){const gradient=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.2,w/2,h/2,Math.max(w,h)*.7);gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(1,`rgba(0,0,0,${Math.max(s.grade==='cinematic'?.25:0,clamp(clip.autoCutVignette,0,1))})`);ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);}
    const elapsed=time-clip.start;if(s.transition==='flash'&&clip.start>0&&elapsed>=0&&elapsed<.14){ctx.globalAlpha=(1-elapsed/.14)*.85;ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;}
    if(!options.skipCaption)drawCaption(ctx,clip,time,w,h);ctx.restore();
  }
  function spatialAt(clip,time){
    const values=registry()?.validateParams('spatial',clip.spatial3D||{})||clip.spatial3D||{},p=clamp((time-clip.start)/Math.max(.01,clip.duration),0,1),e=p*p*(3-2*p),lerp=(a,b)=>a+(b-a)*e;
    return {rotateX:lerp(values.rotateX,values.endRotateX),rotateY:lerp(values.rotateY,values.endRotateY),rotateZ:lerp(values.rotateZ,values.endRotateZ),depth:lerp(values.depth,values.endDepth),cameraX:lerp(values.cameraX,values.endCameraX),cameraY:lerp(values.cameraY,values.endCameraY),perspective:values.perspective,scale:values.scale,shadow:values.shadow};
  }
  // Rotate a real 3D plane and apply z-dependent perspective division. Opposite
  // edges have different lengths when tilted; this is not a 2D cosine scale.
  function projectPoint(u,v,width,height,spatial){
    const r=Math.PI/180,ax=spatial.rotateX*r,ay=spatial.rotateY*r,az=spatial.rotateZ*r,extent=Math.max(width,height),distance=spatial.perspective*extent;
    let x=(u-.5)*width*spatial.scale,y=(v-.5)*height*spatial.scale,z=0;
    const y1=y*Math.cos(ax)-z*Math.sin(ax),z1=y*Math.sin(ax)+z*Math.cos(ax),x2=x*Math.cos(ay)+z1*Math.sin(ay),z2=-x*Math.sin(ay)+z1*Math.cos(ay);
    x=x2*Math.cos(az)-y1*Math.sin(az)-spatial.cameraX*width;y=x2*Math.sin(az)+y1*Math.cos(az)-spatial.cameraY*height;z=z2+spatial.depth*extent;
    const perspective=distance/Math.max(extent*.25,distance+z);return {x:width/2+x*perspective,y:height/2+y*perspective,z,perspective};
  }
  function affineTriangle(ctx,texture,source,dest){
    const [a,b,c]=source,[p,q,r]=dest,den=a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y);if(Math.abs(den)<1e-8)return;
    const A=(p.x*(b.y-c.y)+q.x*(c.y-a.y)+r.x*(a.y-b.y))/den,B=(p.y*(b.y-c.y)+q.y*(c.y-a.y)+r.y*(a.y-b.y))/den,C=(p.x*(c.x-b.x)+q.x*(a.x-c.x)+r.x*(b.x-a.x))/den,D=(p.y*(c.x-b.x)+q.y*(a.x-c.x)+r.y*(b.x-a.x))/den,E=(p.x*(b.x*c.y-c.x*b.y)+q.x*(c.x*a.y-a.x*c.y)+r.x*(a.x*b.y-b.x*a.y))/den,F=(p.y*(b.x*c.y-c.x*b.y)+q.y*(c.x*a.y-a.x*c.y)+r.y*(a.x*b.y-b.x*a.y))/den;
    // Offset triangle edges, not merely their vertices. A radial vertex offset
    // hardly expands a long thin triangle's diagonal and leaves dark AA seams.
    const vertices=[p,q,r],orientation=((q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x))>=0?1:-1;
    const normals=vertices.map((point,index)=>{const next=vertices[(index+1)%3],dx=next.x-point.x,dy=next.y-point.y,length=Math.hypot(dx,dy)||1;return {x:orientation*dy/length,y:-orientation*dx/length};});
    const points=vertices.map((point,index)=>{const before=normals[(index+2)%3],after=normals[index],distance=1.1/Math.max(.08,1+before.x*after.x+before.y*after.y);return {x:point.x+(before.x+after.x)*distance,y:point.y+(before.y+after.y)*distance};});
    ctx.save();ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);ctx.lineTo(points[1].x,points[1].y);ctx.lineTo(points[2].x,points[2].y);ctx.closePath();ctx.clip();ctx.transform(A,B,C,D,E,F);ctx.drawImage(texture,0,0);ctx.restore();
  }
  function drawProjected(ctx,texture,width,height,spatial,{subdivisions=10}={}){
    const n=Math.max(2,Math.min(20,Math.round(subdivisions))),points=Array.from({length:n+1},(_,y)=>Array.from({length:n+1},(_,x)=>projectPoint(x/n,y/n,width,height,spatial)));
    if(spatial.shadow>0){const corners=[points[0][0],points[0][n],points[n][n],points[n][0]];ctx.save();ctx.shadowColor=`rgba(0,0,0,${spatial.shadow})`;ctx.shadowBlur=Math.max(width,height)*.04;ctx.shadowOffsetY=height*.025;ctx.fillStyle='#090b10';ctx.beginPath();ctx.moveTo(corners[0].x,corners[0].y);for(const corner of corners.slice(1))ctx.lineTo(corner.x,corner.y);ctx.closePath();ctx.fill();ctx.restore();}
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const a={x:x/n*texture.width,y:y/n*texture.height},b={x:(x+1)/n*texture.width,y:y/n*texture.height},c={x:(x+1)/n*texture.width,y:(y+1)/n*texture.height},d={x:x/n*texture.width,y:(y+1)/n*texture.height};
      affineTriangle(ctx,texture,[a,b,c],[points[y][x],points[y][x+1],points[y+1][x+1]]);affineTriangle(ctx,texture,[a,c,d],[points[y][x],points[y+1][x+1],points[y+1][x]]);
    }return points;
  }
  function draw(ctx,media,clip,time,width,height,options={}){
    if(clip.autoCutTools?.length&&!clip.autoCutToolsApplied){const tools=registry();if(!tools)throw new Error('The editing-tool registry is unavailable.');clip=tools.applyTools(clip);}
    if(clip.subjectCutout?.enabled){if(!root.ZorifiPersonCutout?.ready())throw new Error('The on-device person cutout model must be enabled before this edit can render.');media=root.ZorifiPersonCutout.cutout(media,clip.subjectCutout);}
    if(!clip.spatial3D)return drawFlat(ctx,media,clip,time,width,height,options);
    const bounds=cell(clip,width,height),w=bounds.width,h=bounds.height;if(!w||!h)return;
    let texture=spatialBuffers.get(media);if(!texture){texture=root.document?.createElement('canvas')||(typeof root.OffscreenCanvas==='function'?new root.OffscreenCanvas(2,2):null);if(!texture)throw new Error('This device cannot render a spatial video panel.');spatialBuffers.set(media,texture);}
    const factor=Math.min(1,1280/Math.max(w,h)),tw=Math.max(2,Math.round(w*factor)),th=Math.max(2,Math.round(h*factor));if(texture.width!==tw||texture.height!==th){texture.width=tw;texture.height=th;}
    const pixels=texture.getContext('2d');pixels.clearRect(0,0,tw,th);drawFlat(pixels,media,{...clip,collage:null,track:clip.subjectCutout?.enabled?clip.track:0,opacity:100,spatial3D:null},time,tw,th,{skipCaption:true});
    ctx.save();ctx.translate(bounds.x,bounds.y);ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();if(!options.transparent&&!(clip.subjectCutout?.enabled&&clip.track>0)){ctx.fillStyle=clip.collage?.background||'#090b10';ctx.fillRect(0,0,w,h);}ctx.globalAlpha=clamp((clip.opacity??100)/100,0,1);const spatial=spatialAt(clip,time);drawProjected(ctx,texture,w,h,clip.subjectCutout?.enabled?{...spatial,shadow:0}:spatial);if(!options.skipCaption)drawCaption(ctx,clip,time,w,h);ctx.restore();
  }
  return {MOTIONS,GRADES,style,motionAt,cell,spatialAt,projectPoint,drawProjected,draw,drawCaption};
});
