(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiAutoCutDirector=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const check=signal=>{if(signal?.aborted){const e=new Error('AutoCut cancelled.');e.name='AbortError';throw e;}};
  const round=n=>Math.round(n*1000)/1000;
  const styles=['balanced','energetic','cinematic','anime-impact','motivational'];
  const registry=()=>root.ZorifiToolRegistry||(typeof require==='function'?require('./zorifi-tool-registry.js'):null);
  function samples(duration,count){return Array.from({length:count},(_,i)=>round(count===1?0:Math.min(Math.max(0,duration-.05),i*duration/(count-1))));}
  function wait(element,event,signal,{timeout=90000,ready}={}){check(signal);if(ready?.())return Promise.resolve();return new Promise((resolve,reject)=>{let timer,settled=false;const events=Array.isArray(event)?event:[event],done=e=>{if(settled)return;settled=true;clearTimeout(timer);events.forEach(name=>element.removeEventListener(name,ok));element.removeEventListener('error',fail);signal?.removeEventListener('abort',abort);e?reject(e):resolve();},ok=()=>{if(!ready||ready())done();},fail=()=>done(new Error('A source could not be decoded for Gemini analysis. Check its media format.')),abort=()=>{const e=new Error('AutoCut cancelled.');e.name='AbortError';done(e);};events.forEach(name=>element.addEventListener(name,ok));element.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>done(new Error('A source took too long to decode for analysis. Check that this device supports its codec.')),timeout);});}
  async function openSource(asset,video,signal){
    if(root.ZorifiAutoCutMedia)return video?root.ZorifiAutoCutMedia.openVideo(asset,{signal}):root.ZorifiAutoCutMedia.loadImage(asset,{signal,maxDimension:384,maxPixels:384*384});
    const element=root.document.createElement(video?'video':'img');let owned;const dispose=()=>{if(video){element.pause();element.removeAttribute('src');element.load();}else element.src='';if(owned)root.URL.revokeObjectURL(owned);};
    try{element.crossOrigin='anonymous';if(video){element.muted=true;element.playsInline=true;element.preload='metadata';}const ready=wait(element,video?'loadedmetadata':'load',signal);element.src=asset.file instanceof root.Blob?(owned=root.URL.createObjectURL(asset.file)):asset.url;await ready;return {media:element,image:element,duration:element.duration,width:element.videoWidth||element.naturalWidth,height:element.videoHeight||element.naturalHeight,dispose};}catch(error){dispose();throw error;}
  }
  async function seekSource(video,time,signal){
    if(root.ZorifiAutoCutMedia)return root.ZorifiAutoCutMedia.seek(video,time,{signal,timeout:60000});
    if(Math.abs(video.currentTime-time)<=.02&&video.readyState>=2)return;
    const sought=wait(video,['seeked','loadeddata'],signal,{timeout:60000,ready:()=>video.readyState>=2&&!video.seeking&&Math.abs(video.currentTime-time)<=.05});video.currentTime=time;await sought;
  }
  function base64(bytes){let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return root.btoa(out);}
  function wavExcerpt(buffer,start=0,duration=12){
    const rate=16000,length=Math.max(1,Math.floor(Math.min(duration,buffer.duration-start)*rate)),data=new ArrayBuffer(44+length*2),view=new DataView(data),write=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
    write(0,'RIFF');view.setUint32(4,data.byteLength-8,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,length*2,true);
    const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),ratio=buffer.sampleRate/rate;
    for(let i=0;i<length;i++){const from=Math.floor((start*buffer.sampleRate)+i*ratio),to=Math.max(from+1,Math.floor(start*buffer.sampleRate+(i+1)*ratio));let sum=0,count=0;for(const channel of channels)for(let j=from;j<to&&j<channel.length;j++){sum+=channel[j];count++;}view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,sum/Math.max(1,count)))*32767),true);}
    return {bytes:new Uint8Array(data),duration:length/rate,start};
  }
  async function collect(assets,{signal,onProgress,includeAudio=true}={}){
    if(!Array.isArray(assets)||!assets.length||assets.length>16)throw new Error('Choose between 1 and 16 source files.');
    const perVideo=Math.min(8,Math.max(2,Math.floor(48/assets.length))),media=[],warnings=[];let audioSeconds=0,audioContext;
    try{
      // One decoder at a time keeps a batch of large sources from exhausting
      // memory. Only compact thumbnails, never the source files, go online.
      for(const [index,asset] of assets.entries()){
        check(signal);const video=asset.type==='video';let loaded,canvas;
        try{
          onProgress?.({phase:'opening',assetIndex:index+1,assetCount:assets.length,name:asset.name,frame:0,frames:1});
          loaded=await openSource(asset,video,signal);check(signal);const element=video?loaded.media:loaded.image;
          const duration=video?loaded.duration:Math.max(.1,Number(asset.duration)||5),width=loaded.width,height=loaded.height;
          if(!Number.isFinite(duration)||duration<=0||!width||!height)throw new Error('A source has unreadable media information.');
          canvas=root.document.createElement('canvas');const factor=Math.min(1,384/Math.max(width,height));canvas.width=Math.max(2,Math.round(width*factor));canvas.height=Math.max(2,Math.round(height*factor));const ctx=canvas.getContext('2d'),frames=[];
          if(!ctx)throw new Error('Frame analysis is unavailable on this device.');
          const times=video?samples(duration,Math.min(perVideo,Math.max(2,Math.ceil(duration/2)))):[0];let missed=0;
          for(const time of times){
            check(signal);try{if(video)await seekSource(element,time,signal);check(signal);ctx.drawImage(element,0,0,canvas.width,canvas.height);frames.push({time,image:canvas.toDataURL('image/jpeg',.62)});}catch(error){if(signal?.aborted||error.name==='AbortError')throw error;missed++;}
            onProgress?.({phase:'sampling',assetIndex:index+1,assetCount:assets.length,name:asset.name,frame:frames.length,frames:times.length});
          }
          if(!frames.length)throw new Error(`${asset.name||'A source'} has no readable preview frames. Check that this device supports its media format.`);
          if(missed)warnings.push(`${asset.name||'Media'}: ${missed} preview frame${missed===1?'':'s'} could not be read; Vanessa reviewed ${frames.length} readable samples.`);
          const entry={id:String(asset.id),name:String(asset.name||'Media').slice(0,200),type:video?'video':'image',duration,width,height,frames};
          // Full-file audio decoding is limited by duration as well as bytes.
          // Large/long sources stay usable through visual samples, with an
          // explicit audio limitation rather than a hidden out-of-memory error.
          if(video&&includeAudio&&audioSeconds<48){
            let audioFile=asset.file;
            if(!audioFile&&duration<=180&&/^blob:/.test(asset.url||'')&&Number(asset.size)>0&&Number(asset.size)<=40*1024*1024){try{const response=await root.fetch(asset.url,{signal});if(response.ok)audioFile=await response.blob();}catch(error){if(signal?.aborted)throw error;}}
            if(duration<=180&&audioFile?.size<=40*1024*1024){
              try{const Audio=root.AudioContext||root.webkitAudioContext;if(Audio){audioContext||=new Audio();const bytes=await audioFile.arrayBuffer();check(signal);const buffer=await audioContext.decodeAudioData(bytes);check(signal);const excerpt=wavExcerpt(buffer,0,Math.min(12,48-audioSeconds,buffer.duration));entry.audio={start:0,duration:excerpt.duration,dataUrl:'data:audio/wav;base64,'+base64(excerpt.bytes)};audioSeconds+=excerpt.duration;}}
              catch(error){if(signal?.aborted)throw error;warnings.push(`${asset.name}: audio could not be sampled; Vanessa reviewed visual frames only.`);}
            }else warnings.push(`${asset.name}: audio sampling skipped for this large or long source; review dialogue cuts.`);
          }
          media.push(entry);
        }finally{loaded?.dispose();if(canvas){canvas.width=1;canvas.height=1;}}
      }
      return {media,warnings};
    }finally{if(audioContext&&audioContext.state!=='closed')await audioContext.close().catch(()=>{});}
  }
  function compile(response,assets,{style='balanced',soundtrack,targetDuration=180,warnings=[],recipes=[]}={}){
    const plan=response?.plan;if(!plan||!Array.isArray(plan.shots)||!plan.shots.length||plan.shots.length>48)throw new Error('Vanessa returned no valid shots. Try again.');
    const byId=new Map(assets.map(a=>[String(a.id),a])),clips=[],notes=[...warnings,...(plan.warnings||[])].map(String);let time=0;
    for(const [index,shot] of plan.shots.entries()){
      const asset=byId.get(shot.mediaId),duration=Number(shot.duration),speed=Number(shot.speed),start=Number(shot.sourceStart),ids=[shot.mediaId,...(shot.secondaryMediaIds||[])],counts={single:1,split:2,triptych:3,grid:4,'hero-overlay':2};
      if(!asset||!Number.isFinite(duration)||duration<.25||duration>30||!Number.isFinite(speed)||speed<.5||speed>2||!Number.isFinite(start)||start<0||!counts[shot.layout]||ids.length!==counts[shot.layout]||new Set(ids).size!==ids.length)throw new Error('Vanessa returned invalid shot instructions. Generate again.');
      if(time+duration>Math.min(180,targetDuration)+.1)throw new Error('Vanessa’s plan exceeds the chosen duration.');
      const tools=registry();let operations=[];if(shot.tools?.length||shot.spatial){if(!tools)throw new Error('The editing-tool registry is unavailable. Refresh Zorifi.');operations=tools.expandTools(shot.tools||[],recipes);if(shot.spatial)operations.push({id:'spatial',params:tools.validateParams('spatial',shot.spatial)});}
      const cells=shot.layout==='hero-overlay'?[{x:0,y:0,w:101,h:101},{x:0,y:0,w:61,h:97}]:ids.length>1?root.ZorifiPhase11.collageLayout(shot.layout,ids.length):null;
      ids.forEach((id,layer)=>{
        const media=byId.get(id),sourceStart=layer?0:start,playbackRate=media?.type==='image'?1:speed;
        if(!media||media.type==='video'&&sourceStart+duration*playbackRate>media.duration+.025)throw new Error('A planned shot extends beyond the original media. Generate again.');
        const c=cells?.[layer],cell=c?{left:50+c.x-c.w/2+.5,top:50+c.y-c.h/2+.5,width:c.w-1,height:c.h-1}:null;
        const autoCutStyle={motion:shot.motion,grade:shot.grade,caption:layer?'':String(shot.caption||'').slice(0,160),captionPosition:shot.captionPosition,transition:shot.transition,focalPoint:layer?{x:.5,y:.5}:shot.focalPoint||{x:.5,y:.5},kinetic:true};
        const clip={id:`autocut-${index}-${layer}-${Date.now()}`,mediaId:id,name:media.name,type:'video',start:round(time),duration,sourceStart:media.type==='image'?0:sourceStart,playbackRate,track:layer===0?0:layer+3,volume:layer||media.type==='image'?0:100,opacity:100,scale:100,positionX:0,positionY:0,rotation:0,fit:shot.fit,autoCutStyle,autoCutEvidence:{reason:String(shot.reason||'').slice(0,400),provider:'Gemini'},audioFadeIn:Math.min(.04,duration/8),audioFadeOut:Math.min(.04,duration/8),...(cell?{collage:{id:`autocut-panels-${index}`,layout:shot.layout,index:layer,background:'#090b10',cell}}:{})};
        const layerTools=operations.filter(operation=>(!layer||operation.id!=='caption')&&(shot.layout!=='hero-overlay'||layer||operation.id!=='person-cutout'));
        clips.push(layerTools.length?{...tools.applyTools(clip,layerTools),autoCutTools:layerTools,autoCutToolsApplied:true}:clip);
      });time+=duration;
    }
    if(soundtrack?.id){const length=Math.min(time,Number(soundtrack.duration)||0);if(length>0){clips.push({id:'autocut-music-'+Date.now(),type:'audio',mediaId:soundtrack.id,name:soundtrack.name,start:0,duration:round(length),sourceStart:0,playbackRate:1,track:1,volume:25,audioFadeIn:.12,audioFadeOut:Math.min(.5,length/4)});notes.push('Soundtrack mixed quietly under original source sound. Adjust the mix with Edit further.');}}
    return {clips,duration:round(time),title:String(plan.title||'AutoCut').slice(0,140),story:String(plan.story||'').slice(0,2000),pacing:style,evidence:{method:'gemini-multimodal',provider:response.metadata?.provider||'Gemini',model:response.metadata?.model||'',sampledFrames:Number(response.metadata?.analyzedFrames)||0,audioSamples:Number(response.metadata?.audioSamples)||0,shotCount:plan.shots.length},warnings:notes};
  }
  async function createPlan(assets,{requestPlan,signal,onProgress,prompt='',style='balanced',targetDuration=30,ratio='16:9',soundtrack,includeAudio=true,recipes=[],allowPersonCutout=false,rhythm}={}){
    if(typeof requestPlan!=='function')throw new Error('The Gemini AutoCut gateway is unavailable.');
    const collected=await collect(assets,{signal,onProgress,includeAudio});check(signal);
    const savedRecipes=registry()?.validateRecipes(recipes)||[];
    if(allowPersonCutout&&!root.ZorifiPersonCutout?.ready())throw new Error('Enable the on-device person cutout model before generating this plan.');
    const input={prompt,style:styles.includes(style)?style:'balanced',targetDuration,ratio,media:collected.media,recipes:savedRecipes,allowPersonCutout:!!allowPersonCutout,...(rhythm?{rhythm:{bpm:rhythm.bpm,beatTimes:rhythm.beatTimes}}:{}),...(soundtrack?{soundtrack:{id:soundtrack.id,duration:soundtrack.duration,beatTimes:root.ZorifiAutoCut?.audioBeatTimes(soundtrack.waveform)||[]}}:{})};
    if(new root.TextEncoder().encode(JSON.stringify(input)).length>3900000)throw new Error('These previews exceed the online request size. Choose fewer media files.');
    onProgress?.({phase:'planning'});const response=await requestPlan(input,{signal});check(signal);
    const analyzedAssets=assets.map(asset=>{const item=collected.media.find(media=>media.id===String(asset.id));return item?{...asset,duration:item.duration,width:item.width,height:item.height}:asset;});
    return compile(response,analyzedAssets,{style,soundtrack,targetDuration,warnings:collected.warnings,recipes:savedRecipes});
  }
  return {styles,samples,wavExcerpt,collect,compile,createPlan};
});
