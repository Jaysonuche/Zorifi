(function(global,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else global.ZorifiPhase8=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PHOTO_PRESETS=Object.freeze([1,2,3,5,8,10,15,30]);
  const AUDIO_EXTENSIONS=new Set(['mp3','wav','m4a','aac','ogg','oga','opus','webm','flac','mp4']);
  const VISUAL_EXTENSIONS=new Set(['jpg','jpeg','png','webp','gif','avif','mp4','webm','mov','m4v','avi','mkv']);
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,finite(value,min)));
  const extension=name=>String(name||'').toLowerCase().split('.').pop();
  function frameTime(value,fps=30){const rate=clamp(fps,1,240);return Math.max(0,Math.round(finite(value)*rate)/rate);}
  function snapTimelineTime(value,{fps=30,enabled=true,threshold=.16,playhead=0,clips=[],excludeId='',track=null}={}){
    const raw=Math.max(0,finite(value));if(!enabled)return frameTime(raw,fps);
    const targets=[finite(playhead),...clips.filter(clip=>clip?.id!==excludeId&&(track===null||clip.track===track)).flatMap(clip=>[finite(clip.start),finite(clip.start)+Math.max(0,finite(clip.duration))])].filter(Number.isFinite);
    let best=raw,distance=Infinity;for(const target of targets){const next=Math.abs(target-raw);if(next<=threshold&&next<distance){best=target;distance=next;}}
    return frameTime(best,fps);
  }
  function mediaKind(asset={}){if(asset.type==='image'||asset.kind==='image')return 'image';if(asset.type==='audio'||asset.kind==='audio')return 'audio';return 'video';}
  function trimClip(clip,asset,{side,time,fps=30,minimumFrames=2}={}){
    if(!clip)throw new Error('A clip is required.');const next=structuredClone(clip),kind=mediaKind(asset),minimum=Math.max(1/fps,minimumFrames/fps),start=finite(clip.start),end=start+Math.max(minimum,finite(clip.duration,minimum)),rate=Math.max(.01,finite(clip.playbackRate,1)),target=frameTime(time,fps);
    if(side==='left'){
      const newStart=clamp(target,0,end-minimum),change=newStart-start;next.start=frameTime(newStart,fps);next.duration=Math.max(minimum,frameTime(end-next.start,fps));
      if(kind!=='image')next.sourceStart=Math.max(0,finite(clip.sourceStart)+change*rate);
    }else if(side==='right'){
      let newEnd=Math.max(start+minimum,target);if(kind!=='image'&&finite(asset?.duration)>0)newEnd=Math.min(newEnd,start+Math.max(minimum,(finite(asset.duration)-finite(clip.sourceStart))/rate));next.duration=Math.max(minimum,frameTime(newEnd-start,fps));
    }else throw new Error('Trim side must be left or right.');
    return next;
  }
  function setPhotoDuration(clip,asset,duration,fps=30){if(mediaKind(asset)!=='image')throw new Error('Photo duration can only be set on an image.');const next=structuredClone(clip),minimum=Math.max(1/fps,2/fps);next.duration=Math.max(minimum,frameTime(duration,fps));next.sourceStart=0;return next;}
  function validateImport(file,kind){const name=String(file?.name||''),ext=extension(name),size=Math.max(0,finite(file?.size)),mime=String(file?.type||'').toLowerCase();if(!name||!size)throw new Error('The selected file is empty or unreadable.');if(kind==='audio'&&!mime.startsWith('audio/')&&!AUDIO_EXTENSIONS.has(ext))throw new Error('This audio format is not supported.');if(kind==='visual'&&!mime.startsWith('video/')&&!mime.startsWith('image/')&&!VISUAL_EXTENSIONS.has(ext))throw new Error('This media format is not supported.');return {name,size,mime:mime||'application/octet-stream',extension:ext};}
  function normalizeCaption(segment,index=0){const start=Math.max(0,finite(segment?.start)),end=Math.max(start+.05,finite(segment?.end,start+.05)),text=String(segment?.text||'').replace(/\s+/g,' ').trim();if(!text)throw new Error(`Caption ${index+1} is empty.`);return {id:String(segment.id||`caption-${index}`),start,end,text,words:Array.isArray(segment.words)?segment.words.filter(word=>String(word?.text||'').trim()).map(word=>({text:String(word.text).trim(),start:clamp(word.start,start,end),end:clamp(word.end,start,end)})):[]};}
  function normalizeCaptions(segments=[]){if(!Array.isArray(segments))throw new Error('The transcription response is invalid.');const result=segments.map(normalizeCaption).sort((a,b)=>a.start-b.start);for(let index=1;index<result.length;index++)if(result[index].start<result[index-1].start)throw new Error('Caption timing is invalid.');return result;}
  function editCaption(caption,changes={},fps=30){const next=structuredClone(caption),start=changes.start===undefined?next.start:frameTime(changes.start,fps),end=changes.end===undefined?next.start+next.duration:frameTime(changes.end,fps),text=changes.text===undefined?next.name:String(changes.text).replace(/\s+/g,' ').trim();if(!text)throw new Error('Caption text cannot be empty.');next.name=text;next.start=Math.max(0,start);next.duration=Math.max(1/fps,end-next.start);return next;}
  function splitCaption(caption,time,fps=30){const split=frameTime(time,fps),start=finite(caption.start),end=start+finite(caption.duration);if(split<=start+1/fps||split>=end-1/fps)throw new Error('Move the playhead inside the caption.');const words=String(caption.name||'').trim().split(/\s+/),pivot=Math.max(1,Math.min(words.length-1,Math.round(words.length*(split-start)/(end-start)))),first=editCaption(caption,{text:words.slice(0,pivot).join(' '),end:split},fps),second=editCaption({...structuredClone(caption),id:`${caption.id}-split-${Date.now()}`},{text:words.slice(pivot).join(' ')||words.at(-1),start:split,end},fps);return [first,second];}
  function mergeCaptions(first,second,fps=30){if(!first||!second)throw new Error('Two captions are required.');if(first.track!==second.track)throw new Error('Captions must be on the same track.');const ordered=[first,second].sort((a,b)=>a.start-b.start);return editCaption(ordered[0],{text:`${ordered[0].name} ${ordered[1].name}`,start:ordered[0].start,end:Math.max(ordered[0].start+ordered[0].duration,ordered[1].start+ordered[1].duration)},fps);}
  function effectCover(id='effect'){const value=String(id).toLowerCase();if(/blur/.test(value))return 'blur';if(/shake|motion/.test(value))return 'shake';if(/glow|neon|light/.test(value))return 'glow';if(/zoom|scale/.test(value))return 'zoom';if(/vhs|retro|film/.test(value))return 'vhs';if(/rgb|chromatic/.test(value))return 'rgb';if(/glitch/.test(value))return 'glitch';if(/pixel/.test(value))return 'pixelate';if(/distort|warp|wave/.test(value))return 'distortion';if(/key|green/.test(value))return 'keying';return 'grade';}
  function animationCover(id='',category='COMBO'){const value=String(id).toLowerCase();if(/fade/.test(value))return 'fade';if(/zoom|scale/.test(value))return 'zoom';if(/bounce|elastic/.test(value))return 'bounce';if(/slide|pan/.test(value))return 'slide';if(/pop/.test(value))return 'pop';if(/shake/.test(value))return 'shake';if(/rotate|spin/.test(value))return 'rotate';if(/blur/.test(value))return 'blur';if(/type|word|text/.test(value))return 'type';return String(category).toLowerCase();}
  function virtualWindow(items=[],{scrollTop=0,viewport=600,itemHeight=110,columns=1,overscan=2}={}){const rows=Math.ceil(items.length/Math.max(1,columns)),startRow=Math.max(0,Math.floor(scrollTop/itemHeight)-overscan),endRow=Math.min(rows,Math.ceil((scrollTop+viewport)/itemHeight)+overscan),start=startRow*columns,end=Math.min(items.length,endRow*columns);return {items:items.slice(start,end),start,end,paddingTop:startRow*itemHeight,paddingBottom:Math.max(0,(rows-endRow)*itemHeight),total:items.length};}
  function captionChunkPlan({samples=0,sampleRate=48000,channels=2,maxBytes=18*1024*1024}={}){
    const total=Math.max(0,Math.floor(finite(samples))),rate=clamp(sampleRate,1,384000),channelCount=clamp(channels,1,32),payload=Math.max(1024,Math.floor(finite(maxBytes,18*1024*1024))-44),perChunk=Math.max(1,Math.floor(payload/(channelCount*2))),chunks=[];
    for(let startSample=0;startSample<total;startSample+=perChunk){const endSample=Math.min(total,startSample+perChunk);chunks.push({index:chunks.length,startSample,endSample,offset:startSample/rate,duration:(endSample-startSample)/rate});}
    return chunks;
  }
  return {PHOTO_PRESETS,AUDIO_EXTENSIONS,VISUAL_EXTENSIONS,frameTime,snapTimelineTime,mediaKind,trimClip,setPhotoDuration,validateImport,normalizeCaption,normalizeCaptions,editCaption,splitCaption,mergeCaptions,effectCover,animationCover,virtualWindow,captionChunkPlan};
});
