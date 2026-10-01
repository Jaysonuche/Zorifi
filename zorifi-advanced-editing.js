(function(global){
  'use strict';

  const RAMP_PRESETS={
    impact:[{p:0,v:.55},{p:.2,v:.55},{p:.5,v:1.7},{p:.72,v:1.25},{p:1,v:.55}],
    cinematic:[{p:0,v:.68},{p:.22,v:.78},{p:.58,v:1.4},{p:.82,v:1.12},{p:1,v:.72}],
    velocity:[{p:0,v:.45},{p:.18,v:.55},{p:.48,v:2.35},{p:.7,v:1.45},{p:1,v:.62}],
    smooth:[{p:0,v:.78},{p:.3,v:1.18},{p:.62,v:1.38},{p:1,v:.82}]
  };

  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
  function cubicBezierProgress(progress,curve=[.42,0,.58,1]){
    const p=clamp(progress,0,1),[x1,y1,x2,y2]=curve.map(value=>clamp(value,0,1));let low=0,high=1,t=p;
    const sample=(a,b,t)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
    for(let index=0;index<12;index++){t=(low+high)/2;if(sample(x1,x2,t)<p)low=t;else high=t;}
    return sample(y1,y2,t);
  }
  function easedProgress(progress,easing='ease-in-out',bezier){
    const p=clamp(progress,0,1);
    if(easing==='bezier'||easing==='custom')return cubicBezierProgress(p,bezier);
    if(easing==='hold')return 0;
    if(easing==='linear')return p;
    if(easing==='ease-in')return p*p;
    if(easing==='ease-out')return 1-(1-p)*(1-p);
    return p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
  }

  function keyframedValue(clip,property,time,fallback=0){
    const frames=[...(clip?.keyframes?.[property]||[])].sort((a,b)=>a.time-b.time);
    if(!frames.length)return basePropertyValue(clip,property,fallback);
    if(time<=frames[0].time)return Number(frames[0].value);
    if(time>=frames.at(-1).time)return Number(frames.at(-1).value);
    const afterIndex=frames.findIndex(frame=>frame.time>=time),before=frames[afterIndex-1],after=frames[afterIndex];
    const progress=easedProgress((time-before.time)/Math.max(.001,after.time-before.time),before.easing||clip.keyframeEasing||'ease-in-out',before.bezier);
    return Number(before.value)+(Number(after.value)-Number(before.value))*progress;
  }

  function basePropertyValue(clip,property,fallback=0){
    const adjustmentKeys=new Set(['brightness','contrast','saturation','exposure','temperature','tint','highlights','shadows','sharpen','blur','vignette']),hslKeys=new Set(['hue','hslSaturation','lightness']);
    if(adjustmentKeys.has(property)){const key=property;return Number(clip?.visualEffects?.adjustments?.[key]??(key==='saturation'?100:fallback));}
    if(hslKeys.has(property)){const key=property==='hslSaturation'?'saturation':property;return Number(clip?.visualEffects?.hsl?.[key]??fallback);}
    const defaults={scale:100,scaleX:100,scaleY:100,opacity:100,anchorX:50,anchorY:50,volume:100,playbackRate:1,adjustSaturation:100};
    return Number(clip?.[property]??defaults[property]??fallback);
  }

  function upsertKeyframe(clip,property,time,value,easing='ease-in-out',threshold=.04){
    clip.keyframes=clip.keyframes||{};
    const frames=[...(clip.keyframes[property]||[])],existing=frames.find(frame=>Math.abs(frame.time-time)<=threshold);
    if(existing){existing.time=time;existing.value=Number(value);existing.easing=easing;}
    else frames.push({time,value:Number(value),easing});
    clip.keyframes[property]=frames.sort((a,b)=>a.time-b.time);
    return clip.keyframes[property];
  }

  function removeKeyframeAt(clip,property,time,threshold=.06){
    if(!clip?.keyframes?.[property])return false;
    const before=clip.keyframes[property].length;
    clip.keyframes[property]=clip.keyframes[property].filter(frame=>Math.abs(frame.time-time)>threshold);
    if(!clip.keyframes[property].length)delete clip.keyframes[property];
    return before!==(clip.keyframes[property]?.length||0);
  }

  function keyframeAt(clip,property,time,threshold=.06){
    return (clip?.keyframes?.[property]||[]).find(frame=>Math.abs(Number(frame.time)-Number(time))<=threshold)||null;
  }

  function keyframeTimes(clip,property=null){
    const frames=property?[...(clip?.keyframes?.[property]||[])]:Object.values(clip?.keyframes||{}).flat();
    return [...new Set(frames.map(frame=>Number(frame.time)).filter(Number.isFinite))].sort((a,b)=>a-b);
  }

  function adjacentKeyframeTime(clip,time,direction,property=null,threshold=.001){
    const times=keyframeTimes(clip,property),current=Number(time)||0;
    if(direction<0)return times.filter(value=>value<current-threshold).at(-1)??null;
    return times.find(value=>value>current+threshold)??null;
  }

  function moveKeyframesAt(clip,fromTime,toTime,threshold=.06){
    if(!clip?.keyframes)return 0;let moved=0;
    Object.keys(clip.keyframes).forEach(property=>{
      const frames=clip.keyframes[property],moving=frames.filter(frame=>Math.abs(frame.time-fromTime)<=threshold);if(!moving.length)return;
      const stationary=frames.filter(frame=>Math.abs(frame.time-fromTime)>threshold&&Math.abs(frame.time-toTime)>threshold);moving.forEach(frame=>{frame.time=Number(toTime);moved++;});clip.keyframes[property]=[...stationary,...moving].sort((a,b)=>a.time-b.time);
    });
    return moved;
  }

  function snapTime(time,fps=30,start=0,end=Infinity){const frame=1/Math.max(1,Number(fps)||30);return clamp(Math.round(Number(time)/frame)*frame,Number(start)||0,Number.isFinite(Number(end))?Number(end):Infinity);}
  function selectedFrames(clip,selection=[]){return selection.map(item=>({property:item.property,frame:(clip?.keyframes?.[item.property]||[]).find(frame=>Math.abs(frame.time-item.time)<.0001)})).filter(item=>item.frame);}
  function copyKeyframes(clip,selection=[]){const frames=selectedFrames(clip,selection);if(!frames.length)return null;const origin=Math.min(...frames.map(item=>item.frame.time));return frames.map(item=>({property:item.property,offset:item.frame.time-origin,value:item.frame.value,easing:item.frame.easing||'ease-in-out',bezier:item.frame.bezier?[...item.frame.bezier]:undefined}));}
  function pasteKeyframes(clip,clipboard,time,fps=30){if(!Array.isArray(clipboard)||!clipboard.length)return [];const created=[];clipboard.forEach(item=>{const target=snapTime(Number(time)+(Number(item.offset)||0),fps,clip.start,clip.start+clip.duration);upsertKeyframe(clip,item.property,target,item.value,item.easing);const frame=keyframeAt(clip,item.property,target,.0001);if(frame&&item.bezier)frame.bezier=[...item.bezier];created.push({property:item.property,time:target});});return created;}
  function deleteSelectedKeyframes(clip,selection=[]){let count=0;selection.forEach(item=>{if(removeKeyframeAt(clip,item.property,item.time,.0001))count++;});return count;}
  function moveSelectedKeyframes(clip,selection,delta,fps=30){const frames=selectedFrames(clip,selection),updates=[];frames.forEach(item=>updates.push({...item,from:item.frame.time,to:snapTime(item.frame.time+delta,fps,clip.start,clip.start+clip.duration)}));updates.sort((a,b)=>delta>=0?b.from-a.from:a.from-b.from);updates.forEach(item=>{item.frame.time=item.to;clip.keyframes[item.property]=clip.keyframes[item.property].filter((frame,index,array)=>array.findIndex(candidate=>Math.abs(candidate.time-frame.time)<.0001)===index).sort((a,b)=>a.time-b.time);});return updates.map(item=>({property:item.property,time:item.to}));}

  function rampValue(points,progress){
    const p=clamp(progress,0,1);
    if(p<=points[0].p)return points[0].v;
    const index=points.findIndex(point=>point.p>=p),after=points[index<0?points.length-1:index],before=points[Math.max(0,(index<0?points.length:index)-1)];
    const amount=(p-before.p)/Math.max(.0001,after.p-before.p);
    return before.v+(after.v-before.v)*amount;
  }

  function rampArea(points,end=1){
    const target=clamp(end,0,1);let area=0;
    for(let index=1;index<points.length;index++){
      const before=points[index-1],after=points[index];
      if(target<=before.p)break;
      const segmentEnd=Math.min(target,after.p),width=segmentEnd-before.p;
      if(width>0){const endValue=before.v+(after.v-before.v)*(width/Math.max(.0001,after.p-before.p));area+=width*(before.v+endValue)/2;}
      if(target<=after.p)break;
    }
    return area;
  }

  function sourceTiming(clip,time){
    const progress=clamp((time-clip.start)/Math.max(.01,clip.duration),0,1),base=Math.max(.05,keyframedValue(clip,'playbackRate',time,1)),points=RAMP_PRESETS[clip.speedRamp];
    if(!points)return {sourceTime:(clip.sourceStart||0)+progress*clip.duration*base,playbackRate:base,progress};
    const total=Math.max(.0001,rampArea(points,1)),mapped=rampArea(points,progress)/total,instant=rampValue(points,progress)/total;
    return {sourceTime:(clip.sourceStart||0)+mapped*clip.duration*base,playbackRate:clamp(base*instant,.1,8),progress:mapped};
  }

  function transitionState(type,progress,role='incoming'){
    const p=clamp(progress,0,1),incoming=role==='incoming',direction=incoming?1:-1,state={opacity:1,x:0,y:0,scale:1,rotation:0,blur:0,brightness:1,clipPath:null};
    if(!type||p>=1)return state;
    if(type==='dissolve')state.opacity=incoming?p:1-p;
    else if(type==='dip-black'){state.opacity=incoming?Math.max(0,(p-.35)/.65):Math.max(0,1-p/.65);state.brightness=Math.max(.08,Math.abs(p-.5)*2);}
    else if(['slide','push','whip','blur-whip','hand-cover'].includes(type)){state.x=(incoming?1-p:-p)*direction*100;state.opacity=incoming?Math.min(1,p*2):1-p*.35;state.blur=['whip','blur-whip'].includes(type)?(1-p)*14:0;}
    else if(['zoom','flash-zoom','match-punch','velocity-snap'].includes(type)){state.scale=incoming?1+(1-p)*.32:1+p*.16;state.opacity=incoming?Math.min(1,p*2):1-p*.55;state.blur=(1-p)*8;state.brightness=type==='flash-zoom'?1+(1-p)*1.5:1;}
    else if(['spin-zoom','morph-cut','portal-wipe'].includes(type)){state.scale=incoming?.62+.38*p:1+.28*p;state.rotation=(incoming?1-p:p)*direction*28;state.opacity=incoming?p:1-p;state.blur=(1-p)*5;}
    else if(['iris','mask-swipe'].includes(type)){state.opacity=incoming?1:1-p;state.clipPath=type==='iris'?`circle(${Math.round((incoming?p:1-p)*75)}% at 50% 50%)`:`inset(0 ${Math.round((incoming?1-p:p)*100)}% 0 0)`;}
    else if(['glitch-cut','pixel-tear','negative-flash','shake-cut'].includes(type)){state.x=Math.sin(p*50)*direction*(1-p)*4;state.y=Math.cos(p*43)*(1-p)*2;state.opacity=incoming?p>.18?1:p/.18:1-p;state.brightness=type==='negative-flash'&&p<.25?2.2:1;}
    else if(type==='light-leak'){state.opacity=incoming?p:1-p*.7;state.brightness=1+(1-Math.abs(p-.5)*2)*.7;}
    else state.opacity=incoming?p:1-p;
    return state;
  }

  function hexToRgb(value){const hex=String(value||'#00ff00').replace('#',''),full=hex.length===3?hex.split('').map(char=>char+char).join(''):hex;return {r:parseInt(full.slice(0,2),16)||0,g:parseInt(full.slice(2,4),16)||0,b:parseInt(full.slice(4,6),16)||0};}
  function chromaPixel(r,g,b,options={}){
    const key=hexToRgb(options.color),distance=Math.hypot(r-key.r,g-key.g,b-key.b)/441.673,tolerance=.02+clamp(options.tolerance??38,0,100)*.0048,softness=.015+clamp(options.softness??18,0,100)*.0022;
    const alpha=clamp((distance-tolerance)/softness,0,1),spill=clamp(options.spill??45,0,100)/100;
    if(key.g>=key.r&&key.g>=key.b&&alpha<1){const neutral=Math.max(r,b),amount=(1-alpha)*spill;g=Math.round(g+(Math.min(g,neutral)-g)*amount);}
    return {r,g,b,a:Math.round(alpha*255)};
  }

  function applyChromaToImageData(imageData,options={}){
    const data=imageData.data;
    for(let index=0;index<data.length;index+=4){const keyed=chromaPixel(data[index],data[index+1],data[index+2],options);data[index]=keyed.r;data[index+1]=keyed.g;data[index+2]=keyed.b;data[index+3]=Math.round(data[index+3]*keyed.a/255);}
    return imageData;
  }

  function estimateFrameTranslation(previous,current,width,height,options={}){
    if(!previous||!current||previous.length!==current.length||previous.length<width*height*4)return {x:0,y:0,confidence:0};
    const radius=Math.max(1,Math.min(16,Math.round(options.searchRadius??8))),step=Math.max(1,Math.round(options.sampleStep??2));
    const margin=radius+2,left=Math.max(margin,Math.floor(width*.2)),right=Math.min(width-margin,Math.ceil(width*.8)),top=Math.max(margin,Math.floor(height*.2)),bottom=Math.min(height-margin,Math.ceil(height*.8));
    const luma=(data,index)=>data[index]*.299+data[index+1]*.587+data[index+2]*.114;
    let best={x:0,y:0,error:Infinity},second=Infinity;
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      let error=0,count=0;
      for(let y=top;y<bottom;y+=step)for(let x=left;x<right;x+=step){const before=(y*width+x)*4,after=((y+dy)*width+x+dx)*4;error+=Math.abs(luma(previous,before)-luma(current,after));count++;}
      error/=Math.max(1,count);
      if(error<best.error){second=best.error;best={x:dx,y:dy,error};}else if(error<second)second=error;
    }
    const separation=Number.isFinite(second)?(second-best.error)/Math.max(1,second):0,texture=Math.min(1,best.error/18+.15);
    return {x:best.x,y:best.y,confidence:clamp(separation*.75+texture*.25,0,1),error:best.error};
  }

  function trackingKeyframes(samples,options={}){
    if(!Array.isArray(samples)||!samples.length)return {positionX:[],positionY:[]};
    const width=Math.max(1,Number(options.width)||1),height=Math.max(1,Number(options.height)||1),strength=clamp(options.strength??100,0,200)/100,startX=Number(options.startX)||0,startY=Number(options.startY)||0;
    return {
      positionX:samples.map(sample=>({time:Number(sample.time)||0,value:startX+(Number(sample.x)||0)/width*100*strength,easing:'linear'})),
      positionY:samples.map(sample=>({time:Number(sample.time)||0,value:startY+(Number(sample.y)||0)/height*100*strength,easing:'linear'}))
    };
  }

  global.ZorifiAdvancedEditing={RAMP_PRESETS,easedProgress,cubicBezierProgress,basePropertyValue,keyframedValue,upsertKeyframe,removeKeyframeAt,keyframeAt,keyframeTimes,adjacentKeyframeTime,moveKeyframesAt,snapTime,copyKeyframes,pasteKeyframes,deleteSelectedKeyframes,moveSelectedKeyframes,sourceTiming,transitionState,chromaPixel,applyChromaToImageData,estimateFrameTranslation,trackingKeyframes};
})(typeof window!=='undefined'?window:globalThis);
