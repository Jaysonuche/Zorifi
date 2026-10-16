(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiAutoCutRenderer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  // A standalone renderer: it reads an AutoCut plan without opening or changing
  // the editor. Media stays on the device. Canvas recording runs in real time.
  const LIMITS=Object.freeze({duration:180,clips:120,assets:17,maxDimension:1920,maxPixels:2073600});
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
      const start=number(clip.start,NaN),duration=number(clip.duration,NaN),sourceStart=number(clip.sourceStart,0),playbackRate=number(clip.playbackRate,1);
      if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<=0||sourceStart<0||playbackRate<=0||playbackRate>4)throw new Error('AutoCut contains invalid shot timing.');
      if(asset.type==='audio'&&clip.type!=='audio')throw new Error('An audio file cannot be used as an AutoCut picture.');
      return {clip:{...clip,start,duration,sourceStart,playbackRate,volume:clamp(number(clip.volume,100),0,100)},asset};
    });
    const visuals=clips.filter(item=>item.clip.type!=='audio').sort((a,b)=>a.clip.start-b.clip.start);
    const audio=clips.filter(item=>item.clip.type==='audio');
    if(!visuals.length)throw new Error('Select a video or photo for AutoCut.');
    let end=0;
    for(const item of visuals){
      if(Math.abs(item.clip.start-end)>.025)throw new Error('AutoCut shots must form a continuous sequence. Generate the edit again.');
      end=item.clip.start+item.clip.duration;
    }
    if(end>LIMITS.duration+.025)throw new Error('AutoCut can render up to 3 minutes. Choose a shorter edit.');
    if(audio.length>1)throw new Error('AutoCut supports one soundtrack per generated edit.');
    if(new Set(clips.map(item=>String(item.asset.id))).size>LIMITS.assets)throw new Error('Select up to 16 visual files and one soundtrack.');
    return {visuals,audio,duration:end};
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
    checkAbort(signal);
    const target=Math.max(0,Math.min(time,Number.isFinite(media.duration)?Math.max(0,media.duration-.002):time));
    if(Math.abs(media.currentTime-target)<.015&&media.readyState>=2&&!media.seeking)return;
    const ready=waitFor(media,'seeked',{signal,label:'An AutoCut source could not seek to the selected moment.'});
    media.currentTime=target;
    await ready;
    if(media.readyState<2)await waitFor(media,'loadeddata',{signal,ready:()=>media.readyState>=2});
  }

  function drawFrame(context,media,asset,clip,time,width,height,totalDuration){
    const sourceWidth=media.videoWidth||media.naturalWidth,sourceHeight=media.videoHeight||media.naturalHeight;
    if(!sourceWidth||!sourceHeight)throw new Error(`A frame of ${asset.name||'your media'} could not be decoded.`);
    const scale=Math.max(width/sourceWidth,height/sourceHeight);
    const w=sourceWidth*scale,h=sourceHeight*scale;
    context.fillStyle='#000';context.fillRect(0,0,width,height);
    context.save();
    context.globalAlpha=clamp(number(clip.opacity,100)/100,0,1);
    context.drawImage(media,(width-w)/2,(height-h)/2,w,h);context.restore();
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
    const sources=new Map(),ownedUrls=[],nodes=[],chunks=[];let audioContext,stream,recorder,recordingError;
    const notify=(phase,progress,currentTime=0)=>{if(typeof onProgress==='function')onProgress({phase,progress:clamp(progress,0,1),currentTime,duration});};
    const pauseAll=()=>{for(const source of sources.values()){source.media.pause?.();if(source.gain)source.gain.gain.value=0;}};
    try{
      notify('preparing',0);
      const canvas=root.document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('The video canvas could not start.');
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
      const unique=[...new Map(all.map(item=>[String(item.asset.id),item])).values()];
      for(const [index,item] of unique.entries()){
        checkAbort(signal);const {asset}=item;
        let url=asset.url;
        if(asset.file instanceof root.Blob){url=root.URL.createObjectURL(asset.file);ownedUrls.push(url);}
        if(typeof url!=='string'||!url)throw new Error(`${asset.name||'A media file'} is unavailable.`);
        const image=asset.type==='image',media=root.document.createElement(image?'img':asset.type==='audio'?'audio':'video');
        const source={media,asset,gain:null};sources.set(String(asset.id),source);
        if(/^https?:/i.test(url)&&!url.startsWith(root.location?.origin+'/'))media.crossOrigin='anonymous';
        if(!image){media.preload='auto';media.playsInline=true;media.muted=true;}
        const ready=waitFor(media,image?'load':'loadeddata',{signal,label:`${asset.name||'A source'} could not be decoded. Re-import the original file.`});
        media.src=url;await ready;
        if(!image&&audioContext&&all.some(candidate=>candidate.asset.id===asset.id&&candidate.clip.volume>0)){
          const input=audioContext.createMediaElementSource(media),gain=audioContext.createGain();gain.gain.value=0;input.connect(gain);gain.connect(master);nodes.push(input,gain);source.gain=gain;media.muted=false;
        }
        for(const candidate of all.filter(entry=>entry.asset.id===asset.id)){
          if(!image&&Number.isFinite(media.duration)&&candidate.clip.sourceStart+candidate.clip.duration*candidate.clip.playbackRate>media.duration+.1)throw new Error(`${asset.name||'A source'} ends before the selected AutoCut shot. Generate the edit again.`);
        }
        notify('preparing',.12*(index+1)/unique.length);
      }
      stream=canvas.captureStream(30);const videoTrack=stream.getVideoTracks()[0];if(!videoTrack)throw new Error('The video recorder could not capture frames.');
      audioDestination?.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
      recorder=recorderFor(stream,width,height);recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};recorder.addEventListener('error',event=>{recordingError=event.error||new Error('AutoCut video recording failed.');});
      for(const item of prepared.visuals){
        checkAbort(signal);if(recordingError)throw recordingError;
        if(recorder.state==='recording'){const paused=waitFor(recorder,'pause',{signal,label:'The AutoCut recorder did not pause.'});recorder.pause();await paused;}
        pauseAll();
        const {clip,asset}=item,source=sources.get(String(asset.id));
        if(asset.type!=='image'){source.media.playbackRate=clip.playbackRate;await seek(source.media,clip.sourceStart,signal);}
        const playing=[];
        if(asset.type!=='image')playing.push({source,clip});
        for(const soundtrack of prepared.audio){
          const end=soundtrack.clip.start+soundtrack.clip.duration;
          if(clip.start<end&&clip.start+clip.duration>soundtrack.clip.start){
            const track=sources.get(String(soundtrack.asset.id));track.media.playbackRate=soundtrack.clip.playbackRate;
            await seek(track.media,soundtrack.clip.sourceStart+Math.max(0,clip.start-soundtrack.clip.start)*soundtrack.clip.playbackRate,signal);playing.push({source:track,clip:soundtrack.clip});
          }
        }
        drawFrame(context,source.media,asset,clip,clip.start,width,height,duration);videoTrack.requestFrame?.();
        for(const entry of playing){
          if(entry.clip.start<=clip.start){if(entry.source.gain)entry.source.gain.gain.value=audioLevel(entry.clip,clip.start);await abortable(entry.source.media.play(),signal,5000,'Media playback was blocked. Click Generate again.');}
        }
        const event=recorder.state==='inactive'?'start':'resume',ready=waitFor(recorder,event,{signal,label:'The AutoCut recorder could not start.'});
        if(event==='start')recorder.start(500);else recorder.resume();videoTrack.requestFrame?.();await ready;
        const started=root.performance.now();
        while(true){
          checkAbort(signal);if(recordingError)throw recordingError;
          const elapsed=Math.min(clip.duration,(root.performance.now()-started)/1000),time=clip.start+elapsed;
          for(const entry of playing){
            const active=time>=entry.clip.start&&time<entry.clip.start+entry.clip.duration;
            if(entry.source.gain)entry.source.gain.gain.setValueAtTime(active?audioLevel(entry.clip,time):0,audioContext.currentTime);
            if(active&&entry.source.media.paused)await abortable(entry.source.media.play(),signal,5000);
            if(!active&&!entry.source.media.paused)entry.source.media.pause();
          }
          drawFrame(context,source.media,asset,clip,time,width,height,duration);videoTrack.requestFrame?.();
          notify('rendering',.12+.85*time/duration,time);
          if(elapsed>=clip.duration)break;
          await abortable(new Promise(resolve=>setTimeout(resolve,Math.min(1000/30,(clip.duration-elapsed)*1000))),signal);
        }
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
      for(const {media} of sources.values()){media.removeAttribute('src');media.load?.();}
      for(const url of ownedUrls)root.URL.revokeObjectURL(url);
    }
  }

  return {LIMITS,preparePlan,outputSize,audioLevel,render};
});
