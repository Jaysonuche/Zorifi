(function(global,factory){const api=factory(typeof module==='object'&&module.exports?require('./zorifi-timeline-tracks.js'):global.ZorifiTimelineTracks);if(typeof module==='object'&&module.exports)module.exports=api;else {global.ZorifiPhase8=api;global.ZorifiAutoCaptionsEngine=api.ZorifiAutoCaptionsEngine;global.ZorifiCaptionEditorBridge=api.ZorifiCaptionEditorBridge;}})(typeof globalThis!=='undefined'?globalThis:this,function(TimelineTracks){
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
      const earliest=kind==='image'?0:Math.max(0,start-finite(clip.sourceStart)/rate),newStart=clamp(target,earliest,end-minimum),change=newStart-start;next.start=frameTime(newStart,fps);next.duration=Math.max(minimum,frameTime(end-next.start,fps));
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
  class ZorifiAutoCaptionsEngine{
    constructor({transcribe=null}={}){
      this.transcribe=transcribe;this.captions=[];this.requestId=0;
      this.settings={source:'playing',language:'en',animationStyle:'kinetic-pop',maxCharsPerLine:42,fontName:'Inter',fontSize:24,fontColor:'#FFFFFF',backgroundColor:'rgba(0, 0, 0, 0.6)'};
    }
    normalizeSegments(segments){
      if(!Array.isArray(segments))throw new TypeError('Transcription must contain caption segments.');
      const ids=new Set();return segments.map((segment,index)=>{
        const start=Number(segment?.start),end=Number(segment?.end),text=String(segment?.text||'').replace(/\s+/g,' ').trim();
        if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||!text)throw new Error(`Caption ${index+1} has invalid text or timing.`);
        let id=String(segment.id||`caption-${index}`);while(ids.has(id))id+='-copy';ids.add(id);
        const words=(Array.isArray(segment.words)?segment.words:[]).filter(word=>Number.isFinite(Number(word.start))&&Number.isFinite(Number(word.end))&&Number(word.end)>Number(word.start)&&Number(word.end)>start&&Number(word.start)<end&&String(word.text||'').trim()).map(word=>({text:String(word.text).trim(),start:Math.max(start,Number(word.start)),end:Math.min(end,Number(word.end))}));
        return {id,start,end,text,words};
      }).sort((a,b)=>a.start-b.start||a.end-b.end);
    }
    async generateCaptions(audio,options={}){
      if(typeof this.transcribe!=='function')throw new Error('Configure a real speech transcription transport first.');
      if(!audio||!(audio.size>0||audio.length>0&&typeof audio.getChannelData==='function'))throw new TypeError('Provide actual audio media, not only its duration.');
      const {signal,...settings}=options,requestId=++this.requestId;
      if(signal?.aborted)throw signal.reason||new Error('Transcription cancelled.');
      const nextSettings={...this.settings,...settings};
      const data=await this.transcribe(audio,{...nextSettings,signal});
      if(signal?.aborted)throw signal.reason||new Error('Transcription cancelled.');
      if(requestId!==this.requestId)throw new Error('A newer transcription request replaced this one.');
      const captions=this.normalizeSegments(data?.captions);
      if(!captions.length)throw new Error('No speech captions were returned.');
      this.settings=nextSettings;this.captions=captions;return captions;
    }
    updateCaptionText(id,newText){
      const target=this.captions.find(c=>c.id===id);if(!target)return false;
      const text=String(newText||'').replace(/\s+/g,' ').trim();if(!text)throw new Error('Caption text cannot be empty.');
      target.text=text;target.words=[];return true;
    }
    updateCaptionTiming(id,start,end){
      const target=this.captions.find(c=>c.id===id);if(!target)return false;
      start=Number(start);end=Number(end);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new Error('Caption end must be later than its nonnegative start.');
      const oldStart=target.start,scale=(end-start)/(target.end-oldStart);
      target.words=(target.words||[]).map(word=>({...word,start:start+(word.start-oldStart)*scale,end:start+(word.end-oldStart)*scale}));
      target.start=start;target.end=end;this.captions.sort((a,b)=>a.start-b.start);return true;
    }
    _formatTimestampSRT(seconds){
      if(!Number.isFinite(Number(seconds))||Number(seconds)<0)throw new Error('Invalid subtitle timestamp.');
      const ms=Math.round(Number(seconds)*1000),pad=(value,width=2)=>String(value).padStart(width,'0');
      return `${pad(Math.floor(ms/3600000))}:${pad(Math.floor(ms/60000)%60)}:${pad(Math.floor(ms/1000)%60)},${pad(ms%1000,3)}`;
    }
    wrapText(text){
      const width=Math.round(Number(this.settings.maxCharsPerLine));if(!Number.isFinite(width)||width<1||width>200)throw new Error('Caption line length must be between 1 and 200.');
      const lines=[];let line='';for(const word of String(text).split(/\s+/)){
        if(line&&Array.from(line+' '+word).length>width){lines.push(line);line='';}
        const chars=Array.from(word);while(chars.length>width){if(line){lines.push(line);line='';}lines.push(chars.splice(0,width).join(''));}
        if(chars.length)line+=(line?' ':'')+chars.join('');
      }if(line)lines.push(line);return lines.join('\n');
    }
    exportToSRT(){
      return this.normalizeSegments(this.captions).map((cap,index)=>{
        const start=Math.round(cap.start*1000)/1000,end=Math.max(Math.round(cap.end*1000),Math.round(cap.start*1000)+1)/1000;
        return `${index+1}\n${this._formatTimestampSRT(start)} --> ${this._formatTimestampSRT(end)}\n${this.wrapText(cap.text)}`;
      }).join('\n\n');
    }
    applyToTimeline(editorState){
      if(!Array.isArray(editorState?.clips))throw new TypeError('An editor with clips is required.');
      const captions=this.normalizeSegments(this.captions);if(!captions.length)return editorState;
      const track=TimelineTracks.next(editorState.clips,'text');
      const style={'kinetic-pop':'word-caption',fade:'shadow',highlight:'karaoke'}[this.settings.animationStyle];if(!style)throw new Error('Unsupported caption animation.');
      const stamp=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const clips=captions.map((cap,index)=>({id:`caption-clip-${stamp}-${index}`,name:this.wrapText(cap.text),start:cap.start,duration:cap.end-cap.start,type:'text',track,opacity:100,volume:100,playbackRate:1,fontId:'modern',fontFamily:this.settings.fontName,fontSize:clamp(this.settings.fontSize,8,180),fontWeight:700,color:this.settings.fontColor,background:this.settings.backgroundColor,align:'center',bottom:10,style,autoCaption:true,captionLanguage:this.settings.language,captionWords:cap.words,keyframes:this.settings.animationStyle==='fade'?{opacity:[{time:cap.start,value:0,easing:'linear'},{time:cap.start+Math.min(.2,(cap.end-cap.start)/4),value:100,easing:'linear'},{time:cap.end-Math.min(.2,(cap.end-cap.start)/4),value:100,easing:'linear'},{time:cap.end,value:0,easing:'linear'}]}:{}}));
      editorState.clips=[...editorState.clips,...clips];editorState.duration=Math.max(Number(editorState.duration)||0,...clips.map(c=>c.start+c.duration));return editorState;
    }
  }
  class ZorifiCaptionEditorBridge{
    constructor(editorState,captionEngine,{fetchMedia=(url,options)=>fetch(url,options),beforeApply=()=>{}}={}){
      this.state=editorState;this.captionEngine=captionEngine;this.fetchMedia=fetchMedia;this.beforeApply=beforeApply;this.source=null;this.requestId=0;
    }
    sourceSnapshot(clip){return JSON.stringify([this.state.projectId,clip.id,clip.mediaId,clip.type,clip.start,clip.duration,clip.sourceStart||0,clip.playbackRate||1]);}
    assertSource(){
      const clip=this.state.clips.find(c=>c.id===this.source?.clipId),asset=this.state.mediaAssets.find(a=>a.id===clip?.mediaId);
      if(!clip||!asset||this.sourceSnapshot(clip)!==this.source.snapshot||asset.url!==this.source.url||asset.file!==this.source.file)throw new Error('The source clip or project changed. Generate captions again.');
      return clip;
    }
    async generateForSelectedClip(selectedClipId,{signal}={}){
      const clip=this.state.clips.find(c=>c.id===selectedClipId);
      if(!clip||!['audio','video'].includes(clip.type))throw new Error('Select an audio or video clip for captions.');
      const asset=this.state.mediaAssets.find(a=>a.id===clip.mediaId);if(!asset)throw new Error('Associated media asset was not found.');
      const requestId=++this.requestId;this.source=null;
      const source={clipId:clip.id,snapshot:this.sourceSnapshot(clip),url:asset.url,file:asset.file};
      let audio=asset.file;
      if(!audio?.size){if(!asset.url)throw new Error('Restore the source audio before transcribing.');const response=await this.fetchMedia(asset.url,{signal});if(!response.ok)throw new Error('The source media could not be read.');audio=await response.blob();}
      if(!audio?.size)throw new Error('The source media is empty.');
      const captions=await this.captionEngine.generateCaptions(audio,{language:this.state.captionSettings?.language||'en',signal});
      if(requestId!==this.requestId)throw new Error('A newer caption request replaced this one.');
      this.source=source;this.assertSource();return captions;
    }
    applyCaptionsToEditingTimeline(captionsList,styleTemplate='kinetic-pop'){
      if(!Array.isArray(captionsList))throw new TypeError('Captions must be an array.');if(!captionsList.length)return this.state;
      const clip=this.assertSource(),start=Number(clip.start),duration=Number(clip.duration),sourceStart=Number(clip.sourceStart||0),rate=Number(clip.playbackRate||1);
      if(![start,duration,sourceStart,rate].every(Number.isFinite)||start<0||sourceStart<0||duration<=0||rate<=0)throw new Error('The source clip has invalid timing.');
      const end=sourceStart+duration*rate,removeFillers=Boolean(this.state.captionSettings?.removeFillers),filler=/\b(?:um+|uh+|erm+|hmm+)\b[,.]?\s*/gi;
      const segments=this.captionEngine.normalizeSegments(captionsList).filter(cap=>cap.end>sourceStart&&cap.start<end).map(cap=>{
        const from=Math.max(sourceStart,cap.start),to=Math.min(end,cap.end),text=removeFillers?cap.text.replace(filler,'').trim():cap.text;
        return {...cap,text,start:start+(from-sourceStart)/rate,end:start+(to-sourceStart)/rate,words:cap.words.filter(word=>word.end>from&&word.start<to&&(!removeFillers||word.text.replace(filler,'').trim())).map(word=>({...word,start:start+(Math.max(from,word.start)-sourceStart)/rate,end:start+(Math.min(to,word.end)-sourceStart)/rate}))};
      }).filter(cap=>cap.text);
      if(!segments.length)throw new Error('No speech captions remain in this clip after trimming and text cleanup.');
      const engine=new ZorifiAutoCaptionsEngine();engine.settings={...this.captionEngine.settings};
      const styles={clean:'fade',bold:'kinetic-pop',minimal:'fade',karaoke:'highlight','kinetic-pop':'kinetic-pop',fade:'fade',highlight:'highlight'};
      if(!styles[styleTemplate])throw new Error('Unsupported caption template.');engine.settings.animationStyle=styles[styleTemplate];
      if(['clean','bold','minimal','karaoke'].includes(styleTemplate))Object.assign(engine.settings,{fontName:'Arial, sans-serif',fontSize:styleTemplate==='bold'?34:styleTemplate==='minimal'?22:28,backgroundColor:styleTemplate==='minimal'?'rgba(0,0,0,.56)':'transparent'});
      engine.captions=segments;
      const kept=this.state.clips.filter(c=>!((c.autoCaption||c.isAutoCaption)&&c.autoCaptionSourceId===clip.id&&!c.translatedFromId)),draft={clips:[...kept],duration:this.state.duration};engine.applyToTimeline(draft);
      const additions=draft.clips.slice(kept.length);for(const caption of additions){caption.autoCaptionSourceId=clip.id;caption.fontWeight=['bold','karaoke'].includes(styleTemplate)?900:700;if(['clean','minimal'].includes(styleTemplate))caption.keyframes={};if(styleTemplate==='bold')caption.style='social';}
      this.beforeApply();this.state.clips=draft.clips;this.state.duration=draft.duration;this.state.selected=additions.at(-1).id;this.state.hasCaptions=false;return this.state;
    }
    exportTimelineCaptionsToSRT({track,originalsOnly=false}={}){
      const engine=new ZorifiAutoCaptionsEngine();engine.settings={...this.captionEngine.settings};
      engine.captions=this.state.clips.filter(c=>c.type==='text'&&(c.autoCaption||c.isAutoCaption)&&(track===undefined||c.track===track)&&(!originalsOnly||!c.translatedFromId)).map(c=>({id:c.id,start:c.start,end:Number(c.start)+Number(c.duration),text:c.autoCaption?c.name:c.textStyle?.content||c.name}));
      return engine.exportToSRT();
    }
    _toSrtTime(seconds){return this.captionEngine._formatTimestampSRT(seconds);}
  }
  return {ZorifiCaptionEditorBridge,ZorifiAutoCaptionsEngine,PHOTO_PRESETS,AUDIO_EXTENSIONS,VISUAL_EXTENSIONS,frameTime,snapTimelineTime,mediaKind,trimClip,setPhotoDuration,validateImport,normalizeCaption,normalizeCaptions,editCaption,splitCaption,mergeCaptions,effectCover,animationCover,virtualWindow,captionChunkPlan};
});
