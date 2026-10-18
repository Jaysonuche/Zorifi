(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiAutoCutRenderer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  // A standalone renderer: it reads an AutoCut plan without opening or changing
  // the editor. Media stays on the device. Canvas recording runs in real time.
  const LIMITS=Object.freeze({duration:180,clips:192,assets:17,visualAssets:16,layers:4,maxDimension:1920,maxPixels:2073600});
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const aborted=()=>{const error=new Error('AutoCut generation cancelled.');error.name='AbortError';return error;};
  const checkAbort=signal=>{if(signal?.aborted)throw aborted();};

  function preparePlan(plan,assets){
    if(!Array.isArray(plan?.clips)||!plan.clips.length)throw new Error('AutoCut has no shots to render.');
    if(plan.clips.length>LIMITS.clips+1)throw new Error('This AutoCut contains too many shots.');
    const byId=new Map((Array.isArray(assets)?assets:[]).map(asset=>[String(asset.id),asset]));
    const clips=plan.clips.map(clip=>{
      const asset=byId.get(String(clip.mediaId));
      if(!asset||!['image','video','audio'].includes(asset.type)||(!asset.url&&!asset.file))throw new Error(`The source for ${clip.name||'an AutoCut shot'} is unavailable. Select the original media again.`);
      const start=number(clip.start,NaN),duration=number(clip.duration,NaN),sourceStart=number(clip.sourceStart??0,NaN),playbackRate=number(clip.playbackRate??1,NaN),track=number(clip.track??0,NaN);
      if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<=0||!Number.isFinite(sourceStart)||sourceStart<0||!Number.isFinite(playbackRate)||playbackRate<=0||playbackRate>4||!Number.isInteger(track)||track<0)throw new Error('AutoCut contains invalid shot timing.');
      if(asset.type==='audio'&&clip.type!=='audio')throw new Error('An audio file cannot be used as an AutoCut picture.');
      if(asset.type==='image'&&clip.type==='audio')throw new Error('A photo cannot be used as an AutoCut soundtrack.');
      if(asset.type!=='image'&&Number.isFinite(Number(asset.duration))&&Number(asset.duration)>0&&sourceStart+duration*playbackRate>Number(asset.duration)+.025)throw new Error(`${asset.name||'A source'} ends before the selected AutoCut shot. Generate the edit again.`);
      let collage;
      if(clip.collage){
        const cell=clip.collage.cell;
        if(!clip.collage.id||!cell||!['left','top','width','height'].every(key=>Number.isFinite(cell[key]))||cell.left<0||cell.top<0||cell.width<=0||cell.height<=0||cell.left+cell.width>100.001||cell.top+cell.height>100.001)throw new Error('AutoCut contains an invalid collage layout.');
        collage={...clip.collage,cell:{...cell}};
      }
      return {clip:{...clip,start,duration,sourceStart,playbackRate,track,volume:collage&&track>0?0:clamp(number(clip.volume,100),0,100),...(collage?{collage}:{}),...(clip.autoCutStyle?{autoCutStyle:{...clip.autoCutStyle}}:{})},asset};
    });
    const visuals=clips.filter(item=>item.clip.type!=='audio').sort((a,b)=>a.clip.start-b.clip.start||a.clip.track-b.clip.track);
    const audio=clips.filter(item=>item.clip.type==='audio');
    if(!visuals.length)throw new Error('Select a video or photo for AutoCut.');
    if(visuals.length>LIMITS.clips)throw new Error('This AutoCut contains too many shots.');
    const scenes=[];
    for(const item of visuals){
      const last=scenes[scenes.length-1],clip=item.clip;
      if(last&&Math.abs(last.start-clip.start)<.001){
        if(!clip.collage?.id||clip.collage.id!==last.collageId||Math.abs(last.duration-clip.duration)>.001)throw new Error('AutoCut shots must form a continuous sequence. Only matching collage layers can overlap.');
        last.items.push(item);
      }else scenes.push({start:clip.start,duration:clip.duration,collageId:clip.collage?.id||null,items:[item]});
    }
    let end=0;
    const collageIds=new Set();
    for(const scene of scenes){
      if(Math.abs(scene.start-end)>.025)throw new Error('AutoCut shots must form a continuous sequence. Generate the edit again.');
      if(scene.collageId){
        if(scene.items.length<2||scene.items.length>LIMITS.layers||collageIds.has(scene.collageId))throw new Error('An AutoCut collage needs two to four matching layers.');
        collageIds.add(scene.collageId);
        const ids=new Set(scene.items.map(item=>String(item.asset.id))),tracks=new Set(scene.items.map(item=>item.clip.track));
        if(ids.size!==scene.items.length)throw new Error('Choose distinct sources for each AutoCut collage layer.');
        if(tracks.size!==scene.items.length||!tracks.has(0))throw new Error('AutoCut collage layers need distinct tracks including the primary track.');
      }else if(scene.items[0].clip.track!==0)throw new Error('AutoCut shots must use the primary track.');
      end=scene.start+scene.duration;
    }
    if(end>LIMITS.duration+.025)throw new Error('AutoCut can render up to 3 minutes. Choose a shorter edit.');
    if(audio.length>1)throw new Error('AutoCut supports one soundtrack per generated edit.');
    if(new Set(visuals.map(item=>String(item.asset.id))).size>LIMITS.visualAssets||new Set(clips.map(item=>String(item.asset.id))).size>LIMITS.assets)throw new Error('Select up to 16 visual files and one soundtrack.');
    for(const soundtrack of audio){
      if(soundtrack.clip.start+soundtrack.clip.duration>end+.025)throw new Error('The AutoCut soundtrack extends past the generated edit.');
      if(visuals.some(item=>item.asset.id===soundtrack.asset.id&&item.clip.start<soundtrack.clip.start+soundtrack.clip.duration&&soundtrack.clip.start<item.clip.start+item.clip.duration))throw new Error('Choose a separate soundtrack source for this AutoCut.');
    }
    return {visuals,audio,scenes,duration:end};
  }

  function outputSize(width=1280,height=720){
    let w=number(width,1280),h=number(height,720);
    if(w<2||h<2)throw new Error('The generated video dimensions are invalid.');
    const scale=Math.min(1,LIMITS.maxDimension/w,LIMITS.maxDimension/h,Math.sqrt(LIMITS.maxPixels/(w*h)));
    return {width:Math.max(2,Math.round(w*scale/2)*2),height:Math.max(2,Math.round(h*scale/2)*2)};
  }

  function audioLevel(clip,time){
    const local=time-clip.start;
    if(local<0||local>=clip.duration)return 0;
    const fadeIn=Math.max(0,number(clip.audioFadeIn)),fadeOut=Math.max(0,number(clip.audioFadeOut));
    return clamp(number(clip.volume,100)/100,0,1)*Math.min(fadeIn?clamp(local/fadeIn,0,1):1,fadeOut?clamp((clip.duration-local)/fadeOut,0,1):1);
  }

  function waitFor(element,event,{signal,timeout=12000,label='Media could not be prepared',ready}={}){
    checkAbort(signal);
    if(ready?.())return Promise.resolve();
    return new Promise((resolve,reject)=>{
      let timer;
      const cleanup=()=>{clearTimeout(timer);element.removeEventListener(event,success);element.removeEventListener('error',failed);signal?.removeEventListener('abort',cancel);};
      const done=(callback,value)=>{cleanup();callback(value);};
      const success=()=>done(resolve),failed=e=>done(reject,e?.error||new Error(label)),cancel=()=>done(reject,aborted());
      element.addEventListener(event,success,{once:true});element.addEventListener('error',failed,{once:true});signal?.addEventListener('abort',cancel,{once:true});
      timer=setTimeout(()=>done(reject,new Error(label)),timeout);
    });
  }

  function abortable(promise,signal,timeout=12000,label='Media playback did not start.'){
    checkAbort(signal);
    return new Promise((resolve,reject)=>{
      let timer;
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);};
      const done=(fn,value)=>{cleanup();fn(value);};
      const cancel=()=>done(reject,aborted());
      signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>done(reject,new Error(label)),timeout);
      Promise.resolve(promise).then(value=>done(resolve,value),error=>done(reject,error));
    });
  }

  async function seek(media,time,signal){
    if(root.ZorifiAutoCutMedia?.seek)return root.ZorifiAutoCutMedia.seek(media,time,{signal,timeout:45000});
    checkAbort(signal);
    const target=Math.max(0,Math.min(time,Number.isFinite(media.duration)?Math.max(0,media.duration-.002):time));
    if(Math.abs(media.currentTime-target)<.015&&media.readyState>=2&&!media.seeking)return;
    const ready=waitFor(media,'seeked',{signal,label:'An AutoCut source could not seek to the selected moment.'});
    media.currentTime=target;
    await ready;
    if(media.readyState<2)await waitFor(media,'loadeddata',{signal,ready:()=>media.readyState>=2});
  }

  function drawFrame(context,media,asset,clip,time,width,height,totalDuration){
    const sourceWidth=media.videoWidth||media.naturalWidth||media.width,sourceHeight=media.videoHeight||media.naturalHeight||media.height;
    if(!sourceWidth||!sourceHeight)throw new Error(`A frame of ${asset.name||'your media'} could not be decoded.`);
    if(root.ZorifiAutoCutCreative?.draw){root.ZorifiAutoCutCreative.draw(context,media,clip,time,width,height,{skipCaption:true});return;}
    const cell=clip.collage?.cell,box=cell?{x:width*cell.left/100,y:height*cell.top/100,width:width*cell.width/100,height:height*cell.height/100}:{x:0,y:0,width,height};
    const scale=(clip.fit==='contain'?Math.min:Math.max)(box.width/sourceWidth,box.height/sourceHeight);
    const w=sourceWidth*scale,h=sourceHeight*scale;
    context.save();
    context.beginPath();context.rect(box.x,box.y,box.width,box.height);context.clip();
    context.globalAlpha=clamp(number(clip.opacity,100)/100,0,1);
    context.drawImage(media,box.x+(box.width-w)/2,box.y+(box.height-h)/2,w,h);context.restore();
  }

  function recorderFor(stream,width,height){
    const candidates=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4','video/webm;codecs=vp8,opus','video/webm'];
    for(const mimeType of candidates){
      if(!root.MediaRecorder.isTypeSupported(mimeType))continue;
      try{return new root.MediaRecorder(stream,{mimeType,videoBitsPerSecond:width*height>900000?7000000:4000000,audioBitsPerSecond:192000});}catch{}
    }
    throw new Error('This browser cannot encode AutoCut video. Open Zorifi in current Chrome or Edge.');
  }

  /**
   * render({plan,assets,width,height,signal,onProgress}) -> playable Blob result.
   * onProgress receives {phase,progress,currentTime,duration}; progress is 0..1.
   * The caller owns the returned Blob and any URL it creates for preview/download.
   */
  async function render({plan,assets,width=1280,height=720,signal,onProgress}={}){
    checkAbort(signal);
    const prepared=preparePlan(plan,assets),size=outputSize(width,height),duration=prepared.duration;
    width=size.width;height=size.height;
    if(!root.document||!root.MediaRecorder||!root.HTMLCanvasElement?.prototype.captureStream)throw new Error('AutoCut video generation needs a current browser with video recording support.');
    const sources=new Map(),nodes=[],chunks=[];let audioContext,stream,recorder,recordingError;
    const notify=(phase,progress,currentTime=0)=>{if(typeof onProgress==='function')onProgress({phase,progress:clamp(progress,0,1),currentTime,duration});};
    const pauseAll=()=>{for(const source of sources.values()){source.media.pause?.();if(source.gain)source.gain.gain.value=0;}};
    const releaseSource=id=>{
      const source=sources.get(id);if(!source)return;
      sources.delete(id);source.media.pause?.();
      for(const node of [source.input,source.gain])try{node?.disconnect();}catch{}
      try{source.dispose();}catch{}
    };
    try{
      notify('preparing',0);
      const canvas=root.document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('The video canvas could not start.');
      const previousCanvas=root.document.createElement('canvas');previousCanvas.width=width;previousCanvas.height=height;
      const previousContext=previousCanvas.getContext('2d',{alpha:false});let hasPreviousFrame=false;
      if(!previousContext)throw new Error('The AutoCut transition canvas could not start.');
      const drawScene=(scene,time)=>{
        const background=scene.items[0].clip.collage?.background;
        context.fillStyle=/^#[0-9a-f]{6}$/i.test(background||'')?background:'#000';context.fillRect(0,0,width,height);
        for(const {clip,asset} of scene.items)drawFrame(context,sources.get(String(asset.id)).media,asset,clip,time,width,height,duration);
        root.ZorifiAutoCutCreative?.drawCaption?.(context,scene.items[0].clip,time,width,height);
        const transition=scene.items[0].clip.autoCutStyle?.transition;
        const fadeDuration=Math.min(.22,scene.duration*.25),local=time-scene.start;
        // Hold the outgoing frame while the incoming scene fades in. This keeps
        // the source ranges and edit duration exact without decoding a source twice.
        if(hasPreviousFrame&&transition==='dissolve'&&local<fadeDuration){
          context.save();context.globalAlpha=clamp(1-local/fadeDuration,0,1);context.drawImage(previousCanvas,0,0);context.restore();
        }
      };
      const all=[...prepared.visuals,...prepared.audio],audible=all.some(item=>item.asset.type!=='image'&&item.clip.volume>0);
      const AudioClass=root.AudioContext||root.webkitAudioContext;
      let audioDestination,master;
      if(audible){
        if(!AudioClass)throw new Error('This browser cannot mix the selected audio.');
        audioContext=new AudioClass();audioDestination=audioContext.createMediaStreamDestination();master=audioContext.createGain();
        const limiter=audioContext.createDynamicsCompressor();limiter.threshold.value=-1;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.001;limiter.release.value=.08;
        master.connect(limiter);limiter.connect(audioDestination);nodes.push(master,limiter);
        await abortable(audioContext.resume(),signal,5000,'Audio could not start. Click Generate again to allow media playback.');
        if(audioContext.state!=='running')throw new Error('Audio could not start. Click Generate again to allow media playback.');
      }
      // Full-size camera originals can occupy hundreds of megabytes per decoded
      // image. Retain only the current scene and soundtrack, never the library.
      const prepareSource=async asset=>{
        const id=String(asset.id);if(sources.has(id))return sources.get(id);
        checkAbort(signal);
        const image=asset.type==='image',helper=root.ZorifiAutoCutMedia;
        let media,dispose;
        if(image&&helper?.loadImage){
          const resource=await helper.loadImage(asset,{signal,maxDimension:LIMITS.maxDimension,maxPixels:LIMITS.maxPixels});
          media=resource.image;dispose=()=>resource.dispose?.();
        }else if(asset.type==='video'&&helper?.openVideo){
          const resource=await helper.openVideo(asset,{signal});
          media=resource.media;dispose=()=>resource.dispose?.();
        }else{
          let url=asset.url,ownedUrl;
          if(!url&&asset.file instanceof root.Blob){url=root.URL.createObjectURL(asset.file);ownedUrl=url;}
          if(typeof url!=='string'||!url)throw new Error(`${asset.name||'A media file'} is unavailable.`);
          media=root.document.createElement(image?'img':asset.type==='audio'?'audio':'video');
          dispose=()=>{media.removeAttribute('src');media.load?.();if(ownedUrl)root.URL.revokeObjectURL(ownedUrl);};
          // Register before loading so a decode failure or cancellation releases
          // even a partially prepared element and its owned object URL.
          sources.set(id,{media,asset,gain:null,dispose});
          if(/^https?:/i.test(url)&&!url.startsWith(root.location?.origin+'/'))media.crossOrigin='anonymous';
          if(!image){media.preload='auto';media.playsInline=true;media.muted=true;}
          const ready=waitFor(media,image?'load':'loadeddata',{signal,timeout:45000,label:`${asset.name||'A source'} could not be decoded. Re-import the original file.`});
          media.src=url;await ready;
        }
        const source={media,asset,gain:null,input:null,dispose};sources.set(id,source);
        checkAbort(signal);
        if(!image&&media.readyState<2)await waitFor(media,'loadeddata',{signal,timeout:45000,ready:()=>media.readyState>=2});
        if(!image&&audioContext&&all.some(candidate=>String(candidate.asset.id)===id&&candidate.clip.volume>0)){
          const input=audioContext.createMediaElementSource(media),gain=audioContext.createGain();gain.gain.value=0;input.connect(gain);gain.connect(master);source.input=input;source.gain=gain;media.muted=false;
        }
        for(const candidate of all.filter(entry=>String(entry.asset.id)===id)){
          if(!image&&Number.isFinite(media.duration)&&candidate.clip.sourceStart+candidate.clip.duration*candidate.clip.playbackRate>media.duration+.1)throw new Error(`${asset.name||'A source'} ends before the selected AutoCut shot. Generate the edit again.`);
        }
        return source;
      };
      stream=canvas.captureStream(30);const videoTrack=stream.getVideoTracks()[0];if(!videoTrack)throw new Error('The video recorder could not capture frames.');
      audioDestination?.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
      recorder=recorderFor(stream,width,height);recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};recorder.addEventListener('error',event=>{recordingError=event.error||new Error('AutoCut video recording failed.');});
      for(const [sceneIndex,scene] of prepared.scenes.entries()){
        checkAbort(signal);if(recordingError)throw recordingError;
        if(recorder.state==='recording'){const paused=waitFor(recorder,'pause',{signal,label:'The AutoCut recorder did not pause.'});recorder.pause();await paused;}
        pauseAll();
        const needed=new Map(scene.items.map(item=>[String(item.asset.id),item.asset]));
        for(const soundtrack of prepared.audio){
          if(scene.start<soundtrack.clip.start+soundtrack.clip.duration&&scene.start+scene.duration>soundtrack.clip.start)needed.set(String(soundtrack.asset.id),soundtrack.asset);
        }
        // Release outgoing decoders before opening the incoming scene. The
        // transition uses the small output canvas already copied below.
        for(const id of [...sources.keys()])if(!needed.has(id))releaseSource(id);
        for(const asset of needed.values())await prepareSource(asset);
        if(!sceneIndex)notify('preparing',.12);
        checkAbort(signal);
        const playing=[];
        const seeking=[];
        for(const {clip,asset} of scene.items){
          const source=sources.get(String(asset.id));
          if(asset.type!=='image'){source.media.playbackRate=clip.playbackRate;seeking.push(seek(source.media,clip.sourceStart,signal));playing.push({source,clip});}
        }
        for(const soundtrack of prepared.audio){
          const end=soundtrack.clip.start+soundtrack.clip.duration;
          if(scene.start<end&&scene.start+scene.duration>soundtrack.clip.start){
            const track=sources.get(String(soundtrack.asset.id));track.media.playbackRate=soundtrack.clip.playbackRate;
            seeking.push(seek(track.media,soundtrack.clip.sourceStart+Math.max(0,scene.start-soundtrack.clip.start)*soundtrack.clip.playbackRate,signal));playing.push({source:track,clip:soundtrack.clip});
          }
        }
        await Promise.all(seeking);checkAbort(signal);
        drawScene(scene,scene.start);videoTrack.requestFrame?.();
        await Promise.all(playing.filter(entry=>entry.clip.start<=scene.start).map(entry=>{
          if(entry.source.gain)entry.source.gain.gain.value=audioLevel(entry.clip,scene.start);
          return abortable(entry.source.media.play(),signal,5000,'Media playback was blocked. Click Generate again.');
        }));
        const event=recorder.state==='inactive'?'start':'resume',ready=waitFor(recorder,event,{signal,label:'The AutoCut recorder could not start.'});
        const started=root.performance.now();
        if(event==='start')recorder.start(500);else recorder.resume();videoTrack.requestFrame?.();await ready;
        while(true){
          checkAbort(signal);if(recordingError)throw recordingError;
          const frameStarted=root.performance.now(),elapsed=(frameStarted-started)/1000;
          if(elapsed>=scene.duration)break;
          const time=scene.start+elapsed;
          for(const entry of playing){
            const active=time>=entry.clip.start&&time<entry.clip.start+entry.clip.duration;
            if(entry.source.gain)entry.source.gain.gain.setValueAtTime(active?audioLevel(entry.clip,time):0,audioContext.currentTime);
            if(active&&entry.source.media.paused)await abortable(entry.source.media.play(),signal,5000);
            if(!active&&!entry.source.media.paused)entry.source.media.pause();
          }
          drawScene(scene,time);videoTrack.requestFrame?.();
          notify('rendering',.12+.85*time/duration,time);
          const remaining=scene.duration*1000-(root.performance.now()-started);
          if(remaining<=0)break;
          // Rendering a perspective mesh or segmentation mask takes time too.
          // Count that work inside the frame budget and pause before copying
          // transition surfaces, rather than recording an extra end frame.
          const wait=Math.min(Math.max(0,1000/30-(root.performance.now()-frameStarted)),remaining);
          await abortable(new Promise(resolve=>setTimeout(resolve,wait)),signal);
        }
        if(recorder.state==='recording'){const paused=waitFor(recorder,'pause',{signal,label:'The AutoCut recorder did not pause.'});recorder.pause();await paused;}
        pauseAll();
        previousContext.drawImage(canvas,0,0);hasPreviousFrame=true;
      }
      pauseAll();checkAbort(signal);notify('finalizing',.98,duration);
      const stopped=waitFor(recorder,'stop',{signal,label:'AutoCut could not finish the video file.'});recorder.stop();await stopped;
      if(recordingError)throw recordingError;
      const mimeType=recorder.mimeType||chunks[0]?.type||'video/webm',blob=new root.Blob(chunks,{type:mimeType});
      if(blob.size<64)throw new Error('AutoCut produced an empty video. Please try again.');
      checkAbort(signal);notify('finalizing',1,duration);
      return {blob,mimeType,duration,width,height};
    }finally{
      pauseAll();if(recorder&&recorder.state!=='inactive')try{recorder.stop();}catch{}
      stream?.getTracks().forEach(track=>track.stop());
      for(const node of nodes)try{node.disconnect();}catch{}
      if(audioContext&&audioContext.state!=='closed')await audioContext.close().catch(()=>{});
      for(const id of [...sources.keys()])releaseSource(id);
    }
  }

  return {LIMITS,preparePlan,outputSize,audioLevel,render};
});
