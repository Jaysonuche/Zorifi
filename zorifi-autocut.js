(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiAutoCut=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  // AutoCut works on media already imported into the current project. Analysis
  // happens in the browser; no frame pixels or audio samples leave the device.
  const LIMITS=Object.freeze({assets:16,samplesPerVideo:36,candidatesPerVideo:150,framesWide:48,framesHigh:27,clips:120});
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const finite=value=>Number.isFinite(Number(value))?Number(value):null;
  const round=value=>Math.round(value*1000)/1000;
  const median=values=>{if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return (sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2;};
  const validDuration=asset=>{const value=finite(asset?.duration);return value!=null&&value>0?value:0;};
  const disposableUrl=url=>typeof url==='string'&&(/^(blob:|data:)/.test(url)||/^https?:\/\//.test(url));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const cancelled=()=>{const error=new Error('AutoCut cancelled');error.name='AbortError';return error;};
  const checkAbort=signal=>{if(signal?.aborted)throw cancelled();};
  function sampleTimes(duration,count){
    if(!duration)return [];
    const total=clamp(Math.ceil(duration/1.5)+1,2,count);
    const inset=Math.min(.08,duration/20);
    return Array.from({length:total},(_,index)=>round(inset+(duration-2*inset)*index/(total-1)));
  }
  function frameFeatures(frame,previous){
    const data=frame?.data||frame?.pixels,width=Number(frame?.width)||0,height=Number(frame?.height)||0;
    if(!data||width<2||height<2||data.length<width*height*4)return null;
    let sum=0,sumSq=0,saturation=0,edges=0,difference=0,dark=0,bright=0,edgeCount=0;
    const gray=new Uint8Array(width*height),rgb=new Uint8Array(width*height*3);
    for(let p=0;p<width*height;p++){
      const at=p*4,red=data[at],green=data[at+1],blue=data[at+2];
      const y=.2126*red+.7152*green+.0722*blue,maximum=Math.max(red,green,blue),minimum=Math.min(red,green,blue);
      gray[p]=y;rgb[p*3]=red;rgb[p*3+1]=green;rgb[p*3+2]=blue;
      sum+=y;sumSq+=y*y;saturation+=(maximum-minimum)/Math.max(1,maximum);
      if(y<24)dark++;if(y>241)bright++;
      if(previous?.rgb?.length===rgb.length)difference+=(Math.abs(red-previous.rgb[p*3])+Math.abs(green-previous.rgb[p*3+1])+Math.abs(blue-previous.rgb[p*3+2]))/(3*255);
      if(p>=width&&p%width>0){edges+=Math.abs(y-gray[p-1])+Math.abs(y-gray[p-width]);edgeCount+=2;}
    }
    const count=width*height,luma=sum/count,contrast=Math.sqrt(Math.max(0,sumSq/count-luma*luma));
    return {time:round(Math.max(0,finite(frame.time)||0)),luma:round(luma/255),contrast:round(contrast/128),saturation:round(saturation/count),sharpness:round(edges/Math.max(1,edgeCount)/64),darkFraction:round(dark/count),brightFraction:round(bright/count),difference:previous?.rgb?.length===rgb.length?round(difference/count):0,rgb};
  }
  function scoreFrame(frame){
    if(!frame)return .42;
    const exposure=1-clamp(Math.abs(frame.luma-.5)*1.65,0,1),detail=clamp(frame.sharpness/.22,0,1),contrast=clamp(frame.contrast/.35,0,1);
    return round(clamp(.22+.3*exposure+.22*detail+.15*contrast+.11*clamp(frame.saturation/.45,0,1)-.22*frame.darkFraction-.15*frame.brightFraction,0,1));
  }
  function detectSceneCuts(frames,duration){
    const changes=frames.slice(1).map(frame=>frame.difference).filter(Number.isFinite),centre=median(changes),mad=median(changes.map(value=>Math.abs(value-centre)));
    const threshold=Math.max(.28,centre+2.5*mad),cuts=[];
    for(const frame of frames.slice(1)){
      const time=frame.time;
      if(frame.difference>=threshold&&time>.65&&time<duration-.65&&time-(cuts.at(-1)||0)>=.8)cuts.push(time);
    }
    return cuts;
  }
  async function loadVideo(asset,signal){
    checkAbort(signal);
    if(root.ZorifiAutoCutMedia){const loaded=await root.ZorifiAutoCutMedia.openVideo(asset,{signal});return {...loaded,video:loaded.media};}
    if(!root.document||!disposableUrl(asset.url))throw new Error('Video preview is unavailable');
    const video=root.document.createElement('video');video.preload='metadata';video.muted=true;video.playsInline=true;
    let duration;
    try{duration=await new Promise((resolve,reject)=>{
      let timer;const aborted=()=>done(reject,cancelled()),done=(fn,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',aborted);video.onloadedmetadata=null;video.onerror=null;fn(value);};
      timer=setTimeout(()=>done(reject,new Error('Video metadata took too long to read. Check that this device supports its codec.')),90000);
      signal?.addEventListener('abort',aborted,{once:true});
      video.onloadedmetadata=()=>done(resolve,Number.isFinite(video.duration)&&video.duration>0?video.duration:validDuration(asset));
      video.onerror=()=>done(reject,new Error('Video could not be decoded'));
      video.src=asset.url;
    });checkAbort(signal);}catch(error){video.pause();video.removeAttribute('src');video.load();throw error;}
    return {video,duration,dispose(){video.pause();video.removeAttribute('src');video.load();}};
  }
  async function seekFrame(video,time,signal){
    checkAbort(signal);
    if(root.ZorifiAutoCutMedia)return root.ZorifiAutoCutMedia.seek(video,time,{signal,timeout:60000});
    if(Math.abs(video.currentTime-time)<.025&&video.readyState>=2)return;
    await new Promise((resolve,reject)=>{
      let timer;const done=(fn,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',aborted);video.removeEventListener('seeked',seeked);video.removeEventListener('loadeddata',seeked);video.removeEventListener('error',failed);fn(value);};
      const seeked=()=>{if(video.readyState>=2)done(resolve);},failed=()=>done(reject,new Error('Video seek failed')),aborted=()=>done(reject,cancelled());
      timer=setTimeout(()=>done(reject,new Error('Video frame seek timed out')),60000);
      signal?.addEventListener('abort',aborted,{once:true});
      video.addEventListener('seeked',seeked);video.addEventListener('error',failed,{once:true});
      video.addEventListener('loadeddata',seeked,{once:true});
      try{video.currentTime=time;}catch(error){done(reject,error);}
    });
  }
  async function sampleVideo(asset,times,{signal,onSample}={}){
    let video,loaded,canvas;
    try{
      loaded=await loadVideo(asset,signal);video=loaded.video;
      canvas=root.document.createElement('canvas');canvas.width=LIMITS.framesWide;canvas.height=LIMITS.framesHigh;
      const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Frame analysis is unavailable');
      // Metadata may have changed since import. Always spread a bounded set of
      // samples over the decoded duration, including the end of a long source.
      const frames=[],positions=sampleTimes(loaded.duration,LIMITS.samplesPerVideo);let failures=0;
      for(const [index,requested] of positions.entries()){
        const time=Math.min(requested,Math.max(0,loaded.duration-.03));
        try{await seekFrame(video,time,signal);checkAbort(signal);context.drawImage(video,0,0,canvas.width,canvas.height);const image=context.getImageData(0,0,canvas.width,canvas.height);frames.push({time,width:canvas.width,height:canvas.height,data:image.data});}
        catch(error){if(signal?.aborted)throw error;failures++;}
        if(typeof onSample==='function')onSample({sample:index+1,totalSamples:positions.length});
        await sleep(0);
      }
      return {frames,duration:loaded.duration,width:loaded.width||video.videoWidth||asset.width||0,height:loaded.height||video.videoHeight||asset.height||0,warning:failures?`${failures} preview frame${failures===1?'':'s'} could not be decoded; AutoCut used ${frames.length} readable samples.`:null};
    }finally{if(loaded?.dispose)loaded.dispose();else if(video){video.pause();video.removeAttribute('src');video.load();}if(canvas){canvas.width=1;canvas.height=1;}}
  }
  async function sampleImage(asset,{signal}={}){
    checkAbort(signal);
    if(root.ZorifiAutoCutMedia){let loaded,canvas;try{loaded=await root.ZorifiAutoCutMedia.loadImage(asset,{signal,maxDimension:512,maxPixels:512*512});checkAbort(signal);canvas=root.document.createElement('canvas');canvas.width=LIMITS.framesWide;canvas.height=LIMITS.framesHigh;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Image analysis is unavailable');context.drawImage(loaded.image,0,0,canvas.width,canvas.height);return {frames:[{time:0,width:canvas.width,height:canvas.height,data:context.getImageData(0,0,canvas.width,canvas.height).data}],duration:validDuration(asset)||4,width:loaded.width,height:loaded.height};}finally{loaded?.dispose();if(canvas){canvas.width=1;canvas.height=1;}}}
    if(!root.document||!root.Image||!disposableUrl(asset.url))throw new Error('Image preview is unavailable');
    const image=await new Promise((resolve,reject)=>{const element=new root.Image();let timer;const aborted=()=>done(reject,cancelled()),done=(fn,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',aborted);element.onload=null;element.onerror=null;if(fn===reject)element.src='';fn(value);};timer=setTimeout(()=>done(reject,new Error('Image loading timed out')),90000);signal?.addEventListener('abort',aborted,{once:true});element.onload=()=>done(resolve,element);element.onerror=()=>done(reject,new Error('Image could not be decoded'));element.src=asset.url;});
    const canvas=root.document.createElement('canvas');try{checkAbort(signal);canvas.width=LIMITS.framesWide;canvas.height=LIMITS.framesHigh;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Image analysis is unavailable');context.drawImage(image,0,0,canvas.width,canvas.height);return {frames:[{time:0,width:canvas.width,height:canvas.height,data:context.getImageData(0,0,canvas.width,canvas.height).data}],duration:validDuration(asset)||4,width:image.naturalWidth,height:image.naturalHeight};}finally{image.src='';canvas.width=1;canvas.height=1;}
  }
  async function analyzeMediaAssets(assets,{sampleVideoFrames=sampleVideo,sampleImageFrame=sampleImage,signal,onProgress}={}){
    const selected=(Array.isArray(assets)?assets:[]).filter(asset=>asset&&['video','image'].includes(asset.type)).slice(0,LIMITS.assets),analyses=[];
    for(const [assetIndex,asset] of selected.entries()){
      checkAbort(signal);
      if(typeof onProgress==='function')onProgress({phase:'analyzing',assetIndex:assetIndex+1,assetCount:selected.length,name:asset.name||'Media'});
      let duration=asset.type==='image'?(validDuration(asset)||4):validDuration(asset),width=finite(asset.width)||0,height=finite(asset.height)||0,raw=[],warning=null;
      try{
        const result=asset.type==='video'?await sampleVideoFrames(asset,sampleTimes(duration,LIMITS.samplesPerVideo),{signal,onSample:progress=>{if(typeof onProgress==='function')onProgress({phase:'sampling',assetIndex:assetIndex+1,assetCount:selected.length,name:asset.name||'Media',...progress});}}):await sampleImageFrame(asset,{signal});
        checkAbort(signal);raw=Array.isArray(result)?result:(result?.frames||[]);duration=finite(result?.duration)||duration;width=finite(result?.width)||width;height=finite(result?.height)||height;warning=result?.warning||null;
      }catch(error){if(signal?.aborted)throw error;warning=error?.message||'Frame analysis unavailable';}
      if(!duration)continue;
      const frames=[],times=new Set();let previous=null;
      for(const rawFrame of raw){const feature=frameFeatures(rawFrame,previous);if(!feature||times.has(feature.time))continue;times.add(feature.time);frames.push(feature);previous=feature;}
      frames.sort((a,b)=>a.time-b.time);
      // Keep signatures private and out of serialised project state.
      const metrics=frames.map(({rgb,...rest})=>({...rest,score:scoreFrame(rest)})),cuts=asset.type==='video'?detectSceneCuts(metrics,duration):[];
      analyses.push({mediaId:String(asset.id),name:String(asset.name||'Media'),type:asset.type,duration:round(duration),width,height,frameSamples:metrics,cuts,analysis:metrics.length?'sampled-frames':'metadata-only',warning:warning||(!metrics.length?'No decodable frames; selection uses duration only.':null)});
    }
    return analyses;
  }
  function audioBeatTimes(waveform,{minGap=.32}={}){
    const peaks=waveform?.peaks,duration=finite(waveform?.duration);
    if(!(Array.isArray(peaks)||ArrayBuffer.isView(peaks))||!duration||peaks.length<8)return [];
    const values=Array.from(peaks,Number).map(value=>Number.isFinite(value)?Math.max(0,value):0),baseline=median(values),deviation=median(values.map(value=>Math.abs(value-baseline))),threshold=Math.max(baseline+2*deviation,baseline*1.45,.06),beats=[];
    for(let index=1;index<values.length-1;index++)if(values[index]>=threshold&&values[index]>=values[index-1]&&values[index]>=values[index+1]){const time=index*duration/values.length;if(!beats.length||time-beats.at(-1)>=minGap)beats.push(round(time));}
    return beats;
  }
  function pacing(prompt){const text=String(prompt||'').toLowerCase();if(/\b(fast|energetic|punchy|hype|upbeat|quick)\b/.test(text))return {name:'energetic',shot:1.6,min:.75,max:3.2};if(/\b(slow|reflective|emotional|cinematic|calm)\b/.test(text))return {name:'cinematic',shot:3.8,min:1.5,max:6};return {name:'balanced',shot:2.7,min:1,max:4.5};}
  function candidatesFor(analysis,style){
    const duration=Number(analysis.duration),boundaries=[0,...[...new Set((analysis.cuts||[]).filter(value=>Number.isFinite(value)&&value>0&&value<duration))].sort((a,b)=>a-b),duration],segments=[];let total=0;
    // Count candidate windows first. A multi-hour source must never allocate an
    // array or run a loop for every possible shot before applying the limit.
    for(let scene=0;scene<boundaries.length-1;scene++){
      const start=boundaries[scene],end=boundaries[scene+1],available=end-start;
      if(available<style.min*.8)continue;
      const length=analysis.type==='image'?available:Math.min(style.max,Math.max(style.min,Math.min(style.shot,available))),whole=Math.floor((available+1e-7)/length),remainder=Math.max(0,available-whole*length),count=analysis.type==='image'?1:Math.max(1,whole+(remainder+1e-7>=style.min*.8?1:0));
      segments.push({start,end,length,count,scene,offset:total});total+=count;
    }
    const count=Math.min(total,LIMITS.candidatesPerVideo),out=[];let segmentIndex=0;
    const evenly=(items,number)=>number>=items.length?items:Array.from({length:number},(_,index)=>items[number===1?Math.floor(items.length/2):Math.round(index*(items.length-1)/(number-1))]);
    let slots=Array.from({length:count},(_,index)=>count===total?index:Math.round(index*(total-1)/(count-1)));
    if(count<total&&Array.isArray(analysis.frameSamples)){
      // Keep the windows we actually measured. A uniform candidate grid alone
      // rarely intersects sparse samples from a multi-hour recording.
      const measured=new Set([0,total-1]);
      for(const frame of analysis.frameSamples){const segment=segments.find(item=>frame.time>=item.start&&frame.time<=item.end);if(segment)measured.add(segment.offset+Math.min(segment.count-1,Math.max(0,Math.floor((frame.time-segment.start)/segment.length))));}
      const anchors=evenly([...measured].sort((a,b)=>a-b),count),reserved=new Set(anchors);
      slots=[...anchors,...evenly(slots.filter(slot=>!reserved.has(slot)),count-anchors.length)].sort((a,b)=>a-b);
    }
    for(let index=0;index<count;index++){
      const slot=slots[index];
      while(segmentIndex<segments.length-1&&slot>=segments[segmentIndex].offset+segments[segmentIndex].count)segmentIndex++;
      const segment=segments[segmentIndex],ordinal=slot-segment.offset,at=segment.start+ordinal*segment.length,length=ordinal===segment.count-1?segment.end-at:segment.length;
      const observations=analysis.frameSamples.filter(frame=>frame.time>=at-.15&&frame.time<=at+length+.15),quality=observations.length?observations.reduce((sum,frame)=>sum+frame.score,0)/observations.length:.42;
      const changes=observations.slice(1).map(frame=>frame.difference),movement=changes.length?median(changes):0;
      const score=round(clamp(quality-.15*Math.max(0,movement-.65),0,1));
      out.push({mediaId:analysis.mediaId,name:analysis.name,type:analysis.type,sourceStart:round(at),duration:round(length),quality:score,scene:segment.scene,confidence:observations.length?'measured':'metadata-only'});
    }
    return out;
  }
  function overlap(a,b){if(a.mediaId!==b.mediaId)return 0;return Math.max(0,Math.min(a.sourceStart+a.duration,b.sourceStart+b.duration)-Math.max(a.sourceStart,b.sourceStart));}
  function planEdit(analyses,{prompt='',targetDuration,beatTimes=[],soundtrack,idPrefix=`autocut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`}={}){
    const source=(Array.isArray(analyses)?analyses:[]).filter(item=>item&&item.mediaId&&['video','image'].includes(item.type)&&item.duration>0),style=pacing(prompt);
    if(!source.length)return {clips:[],duration:0,pacing:style.name,evidence:{sampledFrames:0,detectedSceneCuts:0,beatCount:0},warnings:['Import at least one playable video or image.']};
    const all=source.flatMap((analysis,index)=>candidatesFor(analysis,style).map(candidate=>({...candidate,assetIndex:index}))),usable=all.filter(candidate=>candidate.confidence==='measured');
    if(!all.length)return {clips:[],duration:0,pacing:style.name,evidence:{sampledFrames:0,detectedSceneCuts:0,beatCount:0},warnings:['No usable source interval was found.']};
    const available=source.reduce((sum,item)=>sum+item.duration,0),requested=finite(targetDuration),goal=clamp(requested&&requested>0?requested:Math.min(30,available),style.min,Math.min(180,Math.max(style.min,available))),chosen=[],used=new Set();let remaining=goal;
    while(remaining>=style.min*.65&&chosen.length<LIMITS.clips){
      const options=all.filter(candidate=>candidate.duration>=style.min*.65&&!used.has(candidate)&&chosen.every(item=>overlap(candidate,item)<Math.min(.3,candidate.duration*.12)));
      if(!options.length)break;
      const represented=new Set(chosen.map(item=>item.mediaId));
      options.sort((a,b)=>{
        const rank=item=>item.quality+.17*(represented.has(item.mediaId)?0:1)-.08*(chosen.at(-1)?.mediaId===item.mediaId?1:0)+.03*(item.sourceStart/Math.max(1,source[item.assetIndex].duration));
        return Number(represented.has(a.mediaId))-Number(represented.has(b.mediaId))||rank(b)-rank(a)||a.assetIndex-b.assetIndex||a.sourceStart-b.sourceStart;
      });
      // Reserve room for other selected sources before spending the duration
      // budget on one still or long shot. A short montage should still be a montage.
      const pick=options[0],unseen=new Set(options.filter(item=>item.mediaId!==pick.mediaId&&!represented.has(item.mediaId)).map(item=>item.mediaId));
      const reserved=Math.min(unseen.size,Math.max(0,Math.floor(remaining/style.min)-1))*style.min;
      const length=round(Math.min(pick.duration,remaining-reserved));
      used.add(pick);chosen.push({...pick,duration:length});remaining-=length;
    }
    // Preserve temporal progression within each source while interleaving related media.
    chosen.sort((a,b)=>(a.sourceStart/source[a.assetIndex].duration)-(b.sourceStart/source[b.assetIndex].duration)||a.assetIndex-b.assetIndex);
    const beats=[...new Set((Array.isArray(beatTimes)?beatTimes:[]).map(finite).filter(value=>value!=null&&value>=0&&value<=goal))].sort((a,b)=>a-b);
    const clips=[],soundtrackDuration=finite(soundtrack?.duration);let cursor=0;
    for(const candidate of chosen){
      let length=Math.min(candidate.duration,goal-cursor);
      if(length<style.min*.55)break;
      const near=beats.find(beat=>Math.abs(beat-(cursor+length))<=.18&&beat-cursor>=style.min*.7);
      if(near!=null)length=Math.min(candidate.duration,near-cursor);
      length=round(length);if(length<=0)break;
      clips.push({id:`${idPrefix}-${clips.length+1}`,mediaId:candidate.mediaId,type:'video',name:candidate.name,start:round(cursor),duration:length,sourceStart:candidate.type==='video'?candidate.sourceStart:0,track:0,opacity:100,volume:candidate.type==='image'?0:100,audioFadeIn:candidate.type==='video'?Math.min(.06,length/4):0,audioFadeOut:candidate.type==='video'?Math.min(.06,length/4):0,playbackRate:1,scale:100,positionX:0,positionY:0,rotation:0,fit:'cover',transition:null,autoCutEvidence:{quality:candidate.quality,confidence:candidate.confidence,scene:candidate.scene}});
      cursor+=length;
    }
    const warnings=source.map(item=>item.warning).filter(Boolean),useSoundtrack=Boolean(soundtrack?.id&&soundtrackDuration&&soundtrackDuration>=cursor-.05&&cursor>0);
    if(useSoundtrack)clips.forEach(clip=>{clip.volume=0;clip.audioFadeIn=0;clip.audioFadeOut=0;});
    if(soundtrack?.id&&!useSoundtrack)warnings.push('The soundtrack is shorter than the planned edit, so source audio was kept.');
    if(useSoundtrack&&cursor>0)clips.push({id:`${idPrefix}-soundtrack`,mediaId:String(soundtrack.id),type:'audio',name:String(soundtrack.name||'Soundtrack'),start:0,duration:round(cursor),sourceStart:0,track:1,opacity:100,volume:85,playbackRate:1,audioFadeIn:Math.min(.25,cursor/8),audioFadeOut:Math.min(.6,cursor/8)});
    if(usable.length===0)warnings.push('Frame analysis was unavailable. Review the suggested cuts before exporting.');
    if(cursor<goal-.5)warnings.push('The available distinct source intervals do not cover the full requested duration.');
    return {clips,duration:round(cursor),pacing:style.name,evidence:{sampledFrames:source.reduce((sum,item)=>sum+(item.frameSamples?.length||0),0),detectedSceneCuts:source.reduce((sum,item)=>sum+(item.cuts?.length||0),0),beatCount:beats.length,method:usable.length?'local-frame-analysis':'metadata-only'},warnings};
  }
  async function createAutoCutPlan(assets,options={}){
    const analyses=await analyzeMediaAssets(assets,options);
    const soundtrack=options.soundtrack,beats=Array.isArray(options.beatTimes)?options.beatTimes:audioBeatTimes(soundtrack?.waveform);
    return {...planEdit(analyses,{...options,beatTimes:beats,soundtrack}),analyses};
  }
  return {LIMITS,sampleTimes,frameFeatures,scoreFrame,detectSceneCuts,analyzeMediaAssets,audioBeatTimes,pacing,candidatesFor,planEdit,createAutoCutPlan};
});
