(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.ZorifiTimelineInteractions=api;api.install(root);}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const copy=value=>structuredClone(value);
  const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  function movedClip(clip,start,track=clip.track){
    const next=copy(clip),delta=Math.max(0,start)-number(clip.start);next.start=Math.max(0,start);next.track=track;
    for(const frames of Object.values(next.keyframes||{}))for(const frame of frames)frame.time=Math.max(0,number(frame.time)+delta);
    for(const word of next.kineticWords||[]) {if(Number.isFinite(word.start))word.start+=delta;if(Number.isFinite(word.end))word.end+=delta;}
    return next;
  }
  function trimmedClip(clip,asset,{side,time,fps=30}){
    const next=copy(clip),frame=1/Math.max(1,fps),minimum=2*frame,start=number(clip.start),end=start+number(clip.duration),rate=Math.max(.01,number(clip.playbackRate,1)),source=number(clip.sourceStart),bounded=['audio','video'].includes(asset?.type),snap=value=>Math.round(value/frame)*frame;
    if(side==='left'){
      const earliest=bounded?Math.max(0,start-source/rate):0;
      next.start=Math.max(earliest,Math.min(end-minimum,snap(time)));next.duration=end-next.start;
      if(bounded)next.sourceStart=Math.max(0,source+(next.start-start)*rate);
    }else if(side==='right'){
      const latest=bounded&&number(asset.duration)>0?start+(asset.duration-source)/rate:Infinity;
      next.duration=Math.max(minimum,Math.min(latest,Math.max(start+minimum,snap(time)))-start);
    }else throw new Error('Choose the start or end trim handle.');
    return next;
  }
  // A local-adaptive onset detector: repeated pulses do not have to exceed the
  // entire song's average, and trims are analyzed only inside their source range.
  function detectBeats(channels,sampleRate,{start=0,duration=Infinity,minGap=.2}={}){
    if(!channels?.length||!channels[0]?.length||sampleRate<8000)return [];
    const first=Math.max(0,Math.floor(start*sampleRate)),last=Math.min(channels[0].length,Math.ceil((start+duration)*sampleRate)),hop=Math.max(128,Math.round(sampleRate*.012)),energy=[];
    for(let at=first;at<last;at+=hop){let sum=0,count=0;for(const channel of channels)for(let i=at;i<Math.min(at+hop,last,channel.length);i++){sum+=channel[i]*channel[i];count++;}energy.push(Math.sqrt(sum/Math.max(1,count)));}
    const beats=[];let previous=-Infinity;
    for(let i=1;i<energy.length-1;i++){
      const nearby=energy.slice(Math.max(0,i-20),i).sort((a,b)=>a-b),baseline=nearby[Math.floor(nearby.length*.5)]||0,onset=energy[i]-energy[i-1],time=(first+i*hop)/sampleRate;
      if(energy[i]>.008&&energy[i]>=energy[i-1]&&energy[i]>energy[i+1]&&energy[i]>Math.max(.008,baseline*1.35)&&onset>Math.max(.003,baseline*.08)&&time-previous>=minGap){beats.push(time);previous=time;}
    }
    return beats;
  }
  function pcmChannels(bytes){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),word=at=>String.fromCharCode(...bytes.subarray(at,at+4));
    if(bytes.length<44||word(0)!=='RIFF'||word(8)!=='WAVE')return null;
    let format=null,data=null;
    for(let at=12;at+8<=bytes.length;){const size=view.getUint32(at+4,true),offset=at+8;if(offset+size>bytes.length)break;if(word(at)==='fmt '&&size>=16)format={encoding:view.getUint16(offset,true),channels:view.getUint16(offset+2,true),rate:view.getUint32(offset+4,true),bits:view.getUint16(offset+14,true)};if(word(at)==='data')data={offset,size};at=offset+size+(size%2);}
    if(!format||!data||format.encoding!==1||format.bits!==16||![1,2].includes(format.channels)||format.rate<8000)return null;
    const frames=Math.floor(data.size/(2*format.channels)),channels=Array.from({length:format.channels},()=>new Float32Array(frames));
    for(let i=0;i<frames;i++)for(let ch=0;ch<channels.length;ch++)channels[ch][i]=view.getInt16(data.offset+(i*channels.length+ch)*2,true)/32768;
    return {channels,sampleRate:format.rate};
  }
  function install(root){
    if(!root.document||typeof state==='undefined')return;
    let activeGesture=null,suppressClickUntil=0,beatJob=null,activeLibraryDrag=null;
    const scope=()=>`${currentUser?.id||'guest'}:${state.projectId}`;
    const validScope=id=>scope()===id&&state.view==='editor';
    const fps=()=>state.creatorSettings.customFrameRate||30;
    const snap=(time,clip)=>Phase8.snapTimelineTime(time,{fps:fps(),enabled:state.snapping,threshold:.12,playhead:state.currentTime,clips:state.clips,excludeId:clip?.id,track:clip?.track});
    const clearGesture=()=>activeGesture?.cancel();
    root.addEventListener('blur',clearGesture);root.document.addEventListener('visibilitychange',()=>{if(document.hidden)clearGesture();});
    root.document.addEventListener('click',event=>{if(Date.now()<suppressClickUntil&&event.target.closest('.timeline-area,[draggable]')){event.preventDefault();event.stopImmediatePropagation();}},true);
    function gesture(event,element,{move,finish,cancel}){
      clearGesture();const owner=scope(),id=event.pointerId;event.preventDefault();event.stopPropagation();element._cancelMobileLongPress?.();
      const controller=new AbortController(),signal=controller.signal;
      const end=(pointer,aborted=false)=>{if(pointer&&pointer.pointerId!==id)return;controller.abort();activeGesture=null;document.body.classList.remove('timeline-pointer-edit');try{element.releasePointerCapture?.(id);}catch{}if(aborted||!validScope(owner)){cancel?.(validScope(owner));return;}finish?.(pointer);};
      activeGesture={cancel:()=>end(null,true)};document.body.classList.add('timeline-pointer-edit');try{element.setPointerCapture?.(id);}catch{}
      root.addEventListener('pointermove',pointer=>{if(pointer.pointerId!==id)return;if(!validScope(owner)){end(pointer,true);return;}pointer.preventDefault();move(pointer);},{signal,passive:false});
      root.addEventListener('pointerup',pointer=>end(pointer),{signal});root.addEventListener('pointercancel',pointer=>end(pointer,true),{signal});
      root.addEventListener('keydown',key=>{if(key.key==='Escape')end(null,true);},{signal});
    }
    function clearDropFeedback(){
      document.querySelectorAll('[data-track-lane]').forEach(lane=>{lane.classList.remove('drop-ready','drop-invalid');lane.style.removeProperty('--drop-x');});
      document.querySelector('.timeline-new-track-drop')?.classList.remove('drag');
      document.querySelector('[data-track-create-guide]')?.classList.remove('show');
    }
    function timelineDropAt(x,y,kind,{edgeNew=false}={}){
      const scroll=document.querySelector('.timeline-scroll'),timeline=document.querySelector('.timeline-content');if(!scroll||!timeline)return null;
      const viewport=scroll.getBoundingClientRect(),rect=timeline.getBoundingClientRect();
      if(x<viewport.left||x>viewport.right||y<viewport.top||y>viewport.bottom)return null;
      const lanes=[...timeline.querySelectorAll('[data-track-lane]')],lane=lanes.find(item=>{const box=item.getBoundingClientRect();return y>=box.top&&y<=box.bottom;});
      if(lane){const track=Number(lane.dataset.trackLane),box=lane.getBoundingClientRect();
        if(trackState(track).locked)return {valid:false,lane,track,locked:true};
        const atEdge=edgeNew&&(y-box.top<7||box.bottom-y<7);
        return atEdge||trackKind(track)!==kind?{valid:true,newTrack:true,lane,y}:{valid:true,track,lane,y};
      }
      // The visible blank space and the explicit + lane are both deliberate
      // new-layer targets. The ruler and playhead transport never create lanes.
      const first=lanes[0]?.getBoundingClientRect();
      if(y>=(first?.top??rect.top+25))return {valid:true,newTrack:true,y};
      return null;
    }
    function showDropFeedback(target,x,y,kind){
      clearDropFeedback();if(!target)return;
      if(target.lane){target.lane.classList.add(target.valid?'drop-ready':'drop-invalid');const box=target.lane.getBoundingClientRect();target.lane.style.setProperty('--drop-x',`${Math.max(0,Math.min(100,(x-box.left)/box.width*100))}%`);}
      const guide=document.querySelector('[data-track-create-guide]');
      if(target.newTrack&&guide){guide.classList.add('show');guide.style.top=`${Math.max(25,y-document.querySelector('.timeline-content').getBoundingClientRect().top)}px`;const label=guide.querySelector('span');if(label)label.textContent=`Release to create ${trackLabel(nextTrack(kind))}`;}
      if(target.newTrack)document.querySelector('.timeline-new-track-drop')?.classList.add('drag');
    }
    function editClip(event,element,side=null){
      if(event.button>0||event.isPrimary===false||!side&&event.target.closest('[data-trim],[data-clip-keyframe]'))return;
      const clip=state.clips.find(item=>item.id===element.dataset.clip);if(!clip)return;
      if(trackState(clip.track).locked)return toast('Unlock this track first');
      if(!side&&runtimeMode.touch&&event.pointerType!=='mouse'&&state.selected!==clip.id)return; // First tap selects. Dragging empty space always scrolls.
      if(!side&&state.timelineTool!=='select')return;
      const timeline=document.querySelector('.timeline-content'),scroll=document.querySelector('.timeline-scroll');if(!timeline||!scroll)return;
      const original=copy(clip),initialDuration=state.duration,width=timeline.getBoundingClientRect().width,initialX=event.clientX,initialY=event.clientY,initialScroll=scroll.scrollLeft,asset=state.mediaAssets.find(item=>item.id===clip.mediaId);let changed=false,newTrack=false,target=null,ghost=null,activated=false;
      const cleanup=()=>{ghost?.remove();element.style.removeProperty('opacity');element.classList.remove('moving');clearDropFeedback();};
      const update=pointer=>{
        const rect=scroll.getBoundingClientRect();if(pointer.clientX<rect.left+22)scroll.scrollLeft-=8;else if(pointer.clientX>rect.right-22)scroll.scrollLeft+=8;
        const delta=(pointer.clientX-initialX+scroll.scrollLeft-initialScroll)/width*initialDuration;
        if(!activated&&Math.hypot(pointer.clientX-initialX,pointer.clientY-initialY)<3)return;activated=true;
        if(side)Object.assign(clip,trimmedClip(original,asset,{side,time:snap((side==='left'?original.start:original.start+original.duration)+delta,clip),fps:fps()}));
        else {
          target=timelineDropAt(pointer.clientX,pointer.clientY,trackKind(original.track),{edgeNew:Math.abs(pointer.clientY-initialY)>10});newTrack=Boolean(target?.valid&&target.newTrack);
          Object.assign(clip,movedClip(original,snap(original.start+delta,{...clip,track:target?.track??original.track}),target?.valid&&!newTrack?target.track:original.track));
          if(!ghost){const box=element.getBoundingClientRect();ghost=element.cloneNode(true);ghost.removeAttribute('data-clip');ghost.removeAttribute('id');ghost.querySelectorAll('button').forEach(button=>button.remove());ghost.setAttribute('aria-hidden','true');Object.assign(ghost.style,{position:'fixed',left:'0',top:'0',width:`${Math.min(box.width,240)}px`,height:`${box.height}px`,pointerEvents:'none',zIndex:'9000',margin:'0',opacity:'.95',boxShadow:'0 8px 30px #0008'});document.body.appendChild(ghost);element.style.opacity='.28';}
          ghost.style.transform=`translate(${pointer.clientX-Math.min(ghost.getBoundingClientRect().width/2,45)}px,${pointer.clientY-ghost.getBoundingClientRect().height/2}px)`;
          showDropFeedback(target,pointer.clientX,pointer.clientY,trackKind(original.track));
        }
        changed=Math.abs(clip.start-original.start)>.0001||Math.abs(clip.duration-original.duration)>.0001||clip.track!==original.track||newTrack;
        element.style.left=`${clip.start/initialDuration*100}%`;element.style.width=`${clip.duration/initialDuration*100}%`;element.classList.add('moving');
        if(side)element.querySelector('span').textContent=`${clip.name} · ${clip.duration.toFixed(2)}s`;
      };
      gesture(event,element,{move:update,cancel:same=>{cleanup();if(same){Object.assign(clip,original);render();}},finish:()=>{
        cleanup();
        if(activated&&!side&&!target?.valid){Object.assign(clip,original);suppressClickUntil=Date.now()+400;render();if(target?.locked)toast(`Unlock ${trackLabel(target.track)} first`);return;}
        if(changed){pushHistory({clips:state.clips.map(item=>item.id===clip.id?original:item)});if(newTrack)clip.track=nextTrack(trackKind(original.track));if(clip.zorifiEnding)clip.endingAutoPlaced=false;state.selected=clip.id;recalculateDuration();scheduleProjectSave(0);suppressClickUntil=Date.now()+400;render();}
      }});
    }
    const oldDrag=dragTimelineClip;
    dragTimelineClip=function(event,element){if(!event.target.closest('[data-trim],[data-clip-keyframe]')&&state.timelineTool==='select')return editClip(event,element);return oldDrag(event,element);};
    trimTimelineClip=function(event,handle){return editClip(event,handle.closest('[data-clip]'),handle.dataset.trim);};
    const oldContextItems=contextMenuItems,oldContextCommand=runTimelineContextCommand;
    contextMenuItems=function(clip){const items=oldContextItems(clip);return clip?[...items,['move-layer','Move to layer','⇵']]:items;};
    runTimelineContextCommand=function(command){if(command!=='move-layer')return oldContextCommand(command);closeTimelineContextMenu();showLayerPicker();};
    function showLayerPicker(){
      const clip=state.clips.find(item=>item.id===state.selected);if(!clip)return;
      if(trackState(clip.track).locked)return toast('Unlock this track first');
      const owner=scope(),kind=trackKind(clip.track),tracks=matchingTracks(kind),wrap=document.createElement('div');wrap.className='modal-backdrop';
      wrap.innerHTML=`<section class="modal mobile-layer-dialog" role="dialog" aria-modal="true" aria-label="Move clip to a layer"><header><b>Move ${esc(clip.name)} to a layer</b><button data-layer-close aria-label="Close layer picker">×</button></header>${tracks.map(track=>`<button data-move-layer="${track}" ${trackState(track).locked?'disabled':''}><span>${esc(trackState(track).name||trackLabel(track))}</span><span>${track===clip.track?'Current':trackState(track).locked?'Locked':'Move here'}</span></button>`).join('')}<button data-move-new-layer><b>＋ New ${kind==='effect'?'effects':kind} layer</b><span>${trackLabel(nextTrack(kind))}</span></button></section>`;
      const controller=new AbortController(),previous=document.activeElement,close=()=>{controller.abort();wrap.remove();previous?.isConnected&&previous.focus();};
      const move=track=>{if(!validScope(owner)||!state.clips.includes(clip))return close();if(trackState(clip.track).locked||trackState(track).locked)return toast('Unlock this layer first');if(track!==clip.track){snapshot();clip.track=track;state.selected=clip.id;if(clip.zorifiEnding)clip.endingAutoPlaced=false;close();render();scheduleProjectSave(0);toast(`Clip moved to ${trackLabel(track)}`);}else close();};
      wrap.querySelector('[data-layer-close]').onclick=close;wrap.querySelectorAll('[data-move-layer]').forEach(button=>button.onclick=()=>move(Number(button.dataset.moveLayer)));wrap.querySelector('[data-move-new-layer]').onclick=()=>move(nextTrack(kind));wrap.addEventListener('click',event=>{if(event.target===wrap)close();});wrap.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){const controls=[...wrap.querySelectorAll('button:not(:disabled)')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}},{signal:controller.signal});document.body.appendChild(wrap);wrap.querySelector('button').focus();
    }
    scrub=function(event){
      if(event.button>0)return;const timeline=document.querySelector('.timeline-content');if(!timeline)return;
      if(state.playing)stopProjectPlayback();
      const initialRect=timeline.getBoundingClientRect();
      const move=pointer=>{const live=document.querySelector('.timeline-content'),box=live?.getBoundingClientRect(),rect=box?.width>0?box:initialRect;if(rect.width<=0)return;seekProject(Math.max(0,Math.min(state.duration,Phase8.frameTime((pointer.clientX-rect.left)/rect.width*state.duration,fps()))));};
      move(event);gesture(event,event.currentTarget,{move,finish:()=>{suppressClickUntil=Date.now()+200;scheduleProjectSave(0);render();}});
    };
    const oldAudioPanel=audioPanel;
    audioPanel=function(){return oldAudioPanel().replace('<div class="audio-sections">','<div class="audio-sections"><button class="audio-section-button direct" data-timeline-beats><span>Beats · detect and mark</span><b>BPM</b></button>');};
    const oldBeatsPanel=beatsPanel;
    beatsPanel=function(){return oldBeatsPanel()+'<p class="timeline-gesture-note">Measured locally from the audio. Select another clip to analyze it. Long files use a memory-safe live audio pass; keep this page open.</p><button class="secondary-btn" data-beat-cancel '+(beatJob?'':'hidden')+'>Cancel analysis</button>';};
    function checkBeat(job){if(job.signal.aborted||!validScope(job.scope)||!state.clips.some(item=>item.id===job.clipId))throw new DOMException('Beat analysis cancelled.','AbortError');}
    async function liveAudioPass(asset,clip,job){
      const AudioClass=root.AudioContext||root.webkitAudioContext,context=new AudioClass(),media=document.createElement(asset.type==='video'?'video':'audio');media.preload='auto';media.playsInline=true;media.crossOrigin='anonymous';
      const source=context.createMediaElementSource(media),analyser=context.createAnalyser(),gain=context.createGain();analyser.fftSize=1024;gain.gain=0;source.connect(analyser);analyser.connect(gain);gain.connect(context.destination);
      const values=[],samples=new Float32Array(analyser.fftSize),sourceStart=number(clip.sourceStart),end=sourceStart+clip.duration*Math.max(.01,number(clip.playbackRate,1));
      try{
        await context.resume();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('The audio did not become playable.')),25000),cleanup=()=>{clearTimeout(timer);media.onloadedmetadata=media.onerror=null;job.signal.removeEventListener('abort',cancel);},cancel=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};media.onloadedmetadata=()=>{cleanup();resolve();};media.onerror=()=>{cleanup();reject(new Error('This device cannot decode this media’s audio.'));};job.signal.addEventListener('abort',cancel,{once:true});media.src=asset.url;});checkBeat(job);
        if(sourceStart>0)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error('The audio could not seek to this trim.'));},20000),cleanup=()=>{clearTimeout(timer);media.onseeked=null;job.signal.removeEventListener('abort',cancel);},cancel=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};media.onseeked=()=>{cleanup();resolve();};job.signal.addEventListener('abort',cancel,{once:true});media.currentTime=sourceStart;});
        const started=performance.now();await media.play();
        await new Promise((resolve,reject)=>{const interval=setInterval(()=>{try{checkBeat(job);if(media.currentTime>=end||media.ended){clearInterval(interval);resolve();return;}if(performance.now()-started>(clip.duration*Math.max(1,number(clip.playbackRate,1))+35)*1000)throw new Error('Audio analysis paused too long. Try a shorter clip.');analyser.getFloatTimeDomainData(samples);let sum=0;for(const value of samples)sum+=value*value;values.push({time:media.currentTime,energy:Math.sqrt(sum/samples.length)});const label=document.querySelector('[data-beat-analyze] b');if(label)label.textContent=`Listening locally · ${Math.round((media.currentTime-sourceStart)/Math.max(.1,end-sourceStart)*100)}%`; }catch(error){clearInterval(interval);reject(error);}},16);});
        const found=[];let previous=-Infinity;for(let i=1;i<values.length-1;i++){const item=values[i],near=values.slice(Math.max(0,i-24),i).map(value=>value.energy).sort((a,b)=>a-b),baseline=near[Math.floor(near.length/2)]||0;if(item.energy>.008&&item.energy>baseline*1.35&&item.energy>=values[i-1].energy&&item.energy>values[i+1].energy&&item.time-previous>.2){found.push(item.time);previous=item.time;}}return found;
      }finally{media.pause();media.removeAttribute('src');media.load();source.disconnect();analyser.disconnect();gain.disconnect();await context.close().catch(()=>{});}
    }
    analyzeSelectedBeats=async function(){
      beatJob?.controller.abort();const clip=state.clips.find(item=>item.id===state.selected&&['audio','video'].includes(item.type)),asset=clip&&state.mediaAssets.find(item=>item.id===clip.mediaId);
      if(!clip||!asset||asset.type==='image')return toast('Select a loaded song or a video containing sound first');
      if(trackState(clip.track).locked)return toast('Unlock this track first');
      const controller=new AbortController(),job={controller,signal:controller.signal,scope:scope(),clipId:clip.id},original=copy(clip);beatJob=job;
      const button=document.querySelector('[data-beat-analyze]');if(button){button.disabled=true;button.querySelector('b').textContent='Measuring audio…';}document.querySelector('[data-beat-cancel]')?.removeAttribute('hidden');
      try{
        let blob=asset.persisted?await getProjectMedia(state.projectId,asset.id):null;checkBeat(job);
        if(!blob&&asset.url&&(!asset.size||asset.size<=32*1024*1024)){const response=await fetch(asset.url,{signal:job.signal});if(!response.ok)throw new Error('This audio could not be read.');blob=await response.blob();}checkBeat(job);
        let detected;
        if(blob&&blob.size<=32*1024*1024&&original.duration<=300&&number(asset.duration,301)<=300){
          const bytes=await blob.arrayBuffer();checkBeat(job);let pcm=pcmChannels(new Uint8Array(bytes));
          if(!pcm){const AudioClass=root.AudioContext||root.webkitAudioContext;if(!AudioClass)throw new Error('Audio analysis is unavailable in this browser.');const context=new AudioClass();try{const decoded=await context.decodeAudioData(bytes);pcm={sampleRate:decoded.sampleRate,channels:Array.from({length:decoded.numberOfChannels},(_,index)=>decoded.getChannelData(index))};}finally{await context.close().catch(()=>{});}}
          checkBeat(job);detected=detectBeats(pcm.channels,pcm.sampleRate,{start:number(original.sourceStart),duration:original.duration*Math.max(.01,number(original.playbackRate,1))});
        }else{if(!asset.url)throw new Error('Reconnect this media before analyzing its sound.');detected=await liveAudioPass(asset,original,job);}
        checkBeat(job);const live=state.clips.find(item=>item.id===job.clipId);if(live.start!==original.start||live.duration!==original.duration||live.sourceStart!==original.sourceStart)throw new Error('The clip changed during analysis. Run Beats again.');
        const rate=Math.max(.01,number(original.playbackRate,1)),markers=detected.map((time,index)=>({id:`beat-${Date.now()}-${index}`,time:Phase8.frameTime(original.start+(time-number(original.sourceStart))/rate,fps()),kind:'beat',sourceClipId:clip.id,label:`Beat ${index+1}`})).filter(item=>item.time>=original.start&&item.time<=original.start+original.duration);
        if(!markers.length)throw new Error('No distinct rhythmic peaks were measured. Try a more percussive track, or add markers manually.');
        snapshot();state.markers=state.markers.filter(item=>!(item.kind==='beat'&&item.sourceClipId===clip.id)).concat(markers).sort((a,b)=>a.time-b.time);scheduleProjectSave(0);toast(`${markers.length} measured beat markers added`);
      }catch(error){if(error.name!=='AbortError'&&validScope(job.scope))toast(error.message||'Beat detection could not finish');}
      finally{if(beatJob===job){beatJob=null;if(validScope(job.scope))render();}}
    };
    // Safari may strip custom drag MIME types from native button drags. Keep a
    // same-document, account-scoped payload; never interpret external plain text.
    document.addEventListener('dragstart',event=>{
      activeLibraryDrag=null;
      const source=event.target.closest('[data-media-id],[data-text-preset],[data-text-template],[data-effect],[data-audio-track],[data-element-effect],[data-animation-preset],[data-filter],[data-transition]');if(!source)return;
      const entries=[['mediaId','media'],['textPreset','text'],['textTemplate','text-template'],['effect','timeline-effect'],['audioTrack','audio'],['elementEffect','effect'],['animationPreset','animation'],['filter','filter'],['transition','transition']];
      const match=entries.find(([key])=>source.dataset[key]);if(match)activeLibraryDrag={kind:match[1],id:source.dataset[match[0]],scope:scope()};
    },true);
    document.addEventListener('dragend',()=>{activeLibraryDrag=null;},true);
    function dropLibrary(event){
      const target=event.target.closest('[data-adaptive-track-drop],[data-track-lane],.timeline-content');if(!target)return;
      const payload=event.dataTransfer,local=activeLibraryDrag&&validScope(activeLibraryDrag.scope)?activeLibraryDrag:null;
      const nativeKind=payload?.types?.includes('application/x-zorifi-timeline-effect')?'timeline-effect':libraryDropKind(payload),kind=nativeKind||local?.kind;if(!kind)return;
      // The original handler remains responsible for applying clip-specific FX.
      const adaptive=Boolean(event.target.closest('[data-adaptive-track-drop]'));
      const clipSpecific=['effect','animation','filter','transition'].includes(kind);
      if(clipSpecific&&nativeKind)return;
      if(!adaptive&&!['timeline-effect','media','audio','overlay','sticker','text','text-template','caption-template'].includes(kind)&&!clipSpecific)return;
      if(!['media','audio','overlay','sticker','text','text-template','caption-template','timeline-effect'].includes(kind)&&!clipSpecific)return;
      event.preventDefault();event.stopImmediatePropagation();payload.dropEffect='copy';if(event.type==='dragover')return;
      const id=payload.getData(`application/x-zorifi-${kind}`)||(local?.kind===kind?local.id:''),timeline=document.querySelector('.timeline-content'),rect=timeline.getBoundingClientRect(),start=Phase8.frameTime(Math.max(0,(event.clientX-rect.left)/rect.width*state.duration),fps());
      if(!id)return;state.currentTime=Math.min(state.duration,start);clearDropFeedback();
      const lane=event.target.closest('[data-track-lane]'),track=lane?Number(lane.dataset.trackLane):undefined,newTrack=!lane&&!target.classList.contains('timeline-empty-drop');
      if(lane&&trackState(track).locked)return toast(`Unlock ${trackLabel(track)} first`);
      if(kind==='timeline-effect'){if(lane&&trackKind(track)!=='effect')return toast('Drop this effect on an FX layer or the + new layer area');addEffect(id,{start,...(newTrack?{newTrack:true}:{track})});}
      else if(kind==='media'){const asset=state.mediaAssets.find(item=>item.id===id),lane=event.target.closest('[data-track-lane]'),track=lane?Number(lane.dataset.trackLane):null;if(asset)addMediaToTimeline(id,{start,...(track!==null&&allowedTrackForAsset(asset,track)?{track}:{newTrack:!target.classList.contains('timeline-empty-drop')})});}
      else {const clip=event.target.closest('[data-clip]');applyLibraryDrop({kind,id,start,track,clipId:clip?.dataset.clip,newTrack});recalculateDuration();scheduleProjectSave(0);render();}
    }
    document.addEventListener('dragover',dropLibrary,true);document.addEventListener('drop',dropLibrary,true);
    let libraryTouch=null;
    document.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse'||event.button>0)return;
      const source=event.target.closest('[data-media-id],[data-text-preset],[data-text-template],[data-effect],[data-audio-track]');if(!source||event.target.closest('input,[data-add-media],[data-media-action],.asset-actions,[data-media-favorite],[data-preview-media]'))return;
      // Native shelf scrolling is preserved until a deliberate press-and-hold.
      const start={x:event.clientX,y:event.clientY,id:event.pointerId,scope:scope()},controller=new AbortController(),signal=controller.signal;let ghost=null,started=false;
      const begin=()=>{if(!source.isConnected||scope()!==start.scope)return;started=true;source._cancelMobileLongPress?.();ghost=document.createElement('div');ghost.className='timeline-library-ghost';ghost.textContent=source.querySelector('.asset-name')?.textContent||source.textContent.trim().slice(0,45);document.body.appendChild(ghost);ghost.style.transform=`translate(${start.x+12}px,${start.y-30}px)`;document.body.classList.add('timeline-library-drag');root.navigator.vibrate?.(15);};
      const dragGrip=event.target.closest('[data-timeline-touch-drag]');if(dragGrip){event.preventDefault();event.stopImmediatePropagation();begin();}const timer=dragGrip?null:setTimeout(begin,360);
      signal.addEventListener('abort',()=>{clearTimeout(timer);ghost?.remove();document.body.classList.remove('timeline-library-drag');},{once:true});
      const end=(pointer,cancelled=false)=>{if(pointer.pointerId!==start.id)return;clearTimeout(timer);controller.abort();ghost?.remove();document.body.classList.remove('timeline-library-drag');libraryTouch=null;if(!started||cancelled||scope()!==start.scope)return;const hit=document.elementFromPoint(pointer.clientX,pointer.clientY);if(!hit?.closest('.timeline-content'))return;const data=new DataTransfer(),entry=source.dataset;if(entry.mediaId)data.setData('application/x-zorifi-media',entry.mediaId);else if(entry.textPreset)data.setData('application/x-zorifi-text',entry.textPreset);else if(entry.textTemplate)data.setData('application/x-zorifi-text-template',entry.textTemplate);else if(entry.effect)data.setData('application/x-zorifi-timeline-effect',entry.effect);else if(entry.audioTrack)data.setData('application/x-zorifi-audio',entry.audioTrack);hit.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data,clientX:pointer.clientX,clientY:pointer.clientY}));suppressClickUntil=Date.now()+400;};
      libraryTouch={controller};root.addEventListener('pointermove',pointer=>{if(pointer.pointerId!==start.id)return;if(!started&&Math.hypot(pointer.clientX-start.x,pointer.clientY-start.y)>8){clearTimeout(timer);controller.abort();return;}if(started){pointer.preventDefault();ghost.style.transform=`translate(${pointer.clientX+12}px,${pointer.clientY-30}px)`;}},{signal,passive:false});root.addEventListener('pointerup',pointer=>end(pointer),{signal});root.addEventListener('pointercancel',pointer=>end(pointer,true),{signal});
    },true);
    function enhance(){
      document.querySelectorAll('.playhead').forEach(handle=>{if(handle.dataset.pointerReady)return;handle.dataset.pointerReady='true';handle.setAttribute('role','slider');handle.setAttribute('aria-label','Playhead');handle.setAttribute('tabindex','0');handle.setAttribute('aria-valuemin','0');handle.setAttribute('aria-valuemax',String(state.duration));handle.setAttribute('aria-valuenow',String(state.currentTime));handle.addEventListener('pointerdown',scrub);handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();seekProject(event.key==='Home'?0:event.key==='End'?state.duration:state.currentTime+(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?1:1/fps()));scheduleProjectSave(0);});});
      document.querySelectorAll('.ruler').forEach(ruler=>{if(ruler.dataset.pointerReady)return;ruler.dataset.pointerReady='true';ruler.addEventListener('pointerdown',event=>{if(!event.target.closest('button'))scrub(event);});});
      document.querySelectorAll('[data-effect]').forEach(card=>{if(card.dataset.timelineDraggable)return;card.dataset.timelineDraggable='true';card.draggable=true;card.title='Tap to add an effect lane, or drag into the timeline';card.addEventListener('dragstart',event=>{event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('application/x-zorifi-timeline-effect',card.dataset.effect);});});
      document.querySelectorAll('[data-timeline-beats]').forEach(button=>{if(button.dataset.pointerReady)return;button.dataset.pointerReady='true';button.onclick=()=>{state.activePanel='beats';render();};});
      if(runtimeMode.touch)document.querySelectorAll('[data-media-id],[data-text-preset],[data-text-template],[data-effect],[data-audio-track]').forEach(card=>{if(card.querySelector('[data-timeline-touch-drag]'))return;const grip=document.createElement('span');grip.dataset.timelineTouchDrag='true';grip.className='timeline-touch-drag-grip';grip.setAttribute('role','button');grip.setAttribute('aria-label','Drag into timeline');grip.title='Drag into timeline';grip.textContent='⠿';card.appendChild(grip);});
      document.querySelectorAll('[data-beat-cancel]').forEach(button=>button.onclick=()=>beatJob?.controller.abort());
      document.querySelectorAll('.clip').forEach(element=>{element.classList.toggle('pointer-selected',element.dataset.clip===state.selected);if(!element.hasAttribute('tabindex')){element.tabIndex=0;element.setAttribute('aria-label',`${element.querySelector('span')?.textContent||'Clip'}. Tap to select, then drag to move. Use the white edges to trim.`);}});
    }
    const observer=new MutationObserver(()=>{enhance();if(beatJob&&!validScope(beatJob.scope))beatJob.controller.abort();if(libraryTouch&&state.view!=='editor')libraryTouch.controller.abort();});observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});enhance();
    root.ZorifiTimelineInteractions.cancel=clearGesture;
  }
  return {movedClip,trimmedClip,detectBeats,pcmChannels,install};
});
