/* Bounded timeline plans for Vanessa's Director mode. No provider or DOM I/O. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiDirectorTimeline=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const EPS=.025;
  const ALLOWED=new Set(['clip.trim','clip.move','clip.set','visual.adjust','visual.filter','visual.effect','transition.apply','audio.set','audio.fade','keyframe.animation','animation.apply']);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const finite=value=>Number.isFinite(Number(value));
  const end=clip=>Number(clip.start)+Number(clip.duration);
  const assetFor=(state,clip)=>(state.mediaAssets||[]).find(asset=>asset.id===clip.mediaId);
  const visual=clip=>['video','image'].includes(clip.type);
  const clipKind=clip=>visual(clip)?'video':clip.type;
  const automatic=clip=>Boolean(clip.zorifiEnding||clip.endingAutoPlaced);
  function trackKind(track){
    if(root.ZorifiTimelineTracks)return root.ZorifiTimelineTracks.kind(track);
    if(track>=2**32)return ['video','audio','text','effect'][(track-2**32)%4];
    return track===0||track>=4&&track<100?'video':track===1||track>=100&&track<200?'audio':track===2||track>=200&&track<300?'text':'effect';
  }
  function checkTarget(clip,state){
    if(!clip)throw new Error('The Director plan references a missing clip.');
    if(automatic(clip))throw new Error('The automatic Zorifi ending cannot be changed by Director mode.');
    if(state.trackStates?.[clip.track]?.locked)throw new Error('Unlock the target track before running Director mode.');
  }
  function registry(){
    const api=root.ZorifiVanessaActions;
    if(!api?.validate||!api?.buildContext)throw new Error('The validated editing action registry is unavailable.');
    return api;
  }
  function noChange(action,clip){
    const p=action.parameters;
    if(action.command==='clip.trim')return Math.abs(Number(p.duration)-Number(clip.duration))<.0001;
    if(action.command==='clip.move')return Number(p.start)===Number(clip.start)&&Number(p.track)===Number(clip.track);
    if(action.command==='clip.set'||action.command==='audio.set')return Number(clip[p.property]??(['scale','scaleX','scaleY','opacity','volume'].includes(p.property)?100:0))===Number(p.value);
    if(action.command==='audio.fade')return (p.in===undefined||Number(clip.audioFadeIn||0)===Number(p.in))&&(p.out===undefined||Number(clip.audioFadeOut||0)===Number(p.out));
    if(action.command==='visual.effect')return (clip.clipEffects||[]).includes(p.id);
    if(action.command==='transition.apply')return clip.transition===p.id&&Math.abs(Number(clip.transitionDuration||.6)-Number(p.duration??.6))<.0001;
    if(action.command==='visual.filter'){const f=clip.visualEffects?.filter;return f?.id===p.id&&f.enabled!==false&&Number(f.intensity??100)===Number(p.intensity??100);}
    if(action.command==='visual.adjust')return Number(clip.visualEffects?.adjustments?.[p.property]??(p.property==='saturation'?100:0))===Number(p.value);
    return false;
  }
  function rejectNewGap(clip,newDuration,state){
    const next=state.clips.filter(other=>other!==clip&&other.track===clip.track&&Number(other.start)>=Number(clip.start)).sort((a,b)=>a.start-b.start)[0];
    if(next&&Math.max(0,next.start-clip.start-newDuration)>Math.max(0,next.start-end(clip))+EPS)throw new Error('This trim would leave a new gap before the next clip.');
  }
  function simulate(action,clip){
    const p=action.parameters;
    if(action.command==='clip.trim'){const old=Number(clip.duration);clip.duration=Number(p.duration);if(p.from==='start')clip.sourceStart=Number(clip.sourceStart||0)+(old-clip.duration)*Number(clip.playbackRate||1);}
    else if(action.command==='clip.move'){const delta=Number(p.start)-Number(clip.start);clip.start=Number(p.start);clip.track=Number(p.track);for(const frames of Object.values(clip.keyframes||{}))for(const frame of frames)frame.time+=delta;}
    else if(action.command==='clip.set'||action.command==='audio.set')clip[p.property]=Number(p.value);
    else if(action.command==='audio.fade'){if(p.in!==undefined)clip.audioFadeIn=Number(p.in);if(p.out!==undefined)clip.audioFadeOut=Number(p.out);}
    else if(action.command==='transition.apply'){clip.transition=p.id;clip.transitionDuration=Number(p.duration??.6);}
    else if(action.command==='visual.effect')clip.clipEffects=[...(clip.clipEffects||[]),p.id];
    else if(action.command==='visual.filter'){clip.visualEffects||={};clip.visualEffects.filter={id:p.id,intensity:Number(p.intensity??100),enabled:true};}
    else if(action.command==='visual.adjust'){clip.visualEffects||={};clip.visualEffects.adjustments||={};clip.visualEffects.adjustments[p.property]=Number(p.value);}
  }
  function overlap(a,b){return a.track===b.track?Math.max(0,Math.min(end(a),end(b))-Math.max(a.start,b.start)):0;}
  function validateResult(state,before){
    if(!state||!Array.isArray(state.clips))throw new Error('A live timeline is required.');
    const ids=new Set();
    for(const clip of state.clips){
      if(!clip?.id||ids.has(clip.id))throw new Error('Timeline clips must have unique IDs.');ids.add(clip.id);
      if(!finite(clip.start)||Number(clip.start)<0||!finite(clip.duration)||Number(clip.duration)<=0)throw new Error('Timeline clips need positive duration and a valid start.');
      if(!Number.isSafeInteger(clip.track)||clip.track<0||trackKind(clip.track)!==clipKind(clip))throw new Error('A clip is assigned to the wrong track type.');
      const sourceStart=Number(clip.sourceStart||0),rate=Number(clip.playbackRate??1);
      if(!Number.isFinite(sourceStart)||sourceStart<0||!Number.isFinite(rate)||rate<=0)throw new Error('The clip has invalid source timing.');
      if(['video','audio'].includes(clip.type)){
        const asset=assetFor(state,clip);
        if(!asset)throw new Error('The timeline references unavailable source media.');
        if(['video','audio'].includes(asset.type)&&(!finite(asset.duration)||Number(asset.duration)<=0||sourceStart+Number(clip.duration)*rate>Number(asset.duration)+EPS))throw new Error('A timeline clip exceeds the available source media.');
      }
      if(clip.keyframes){
        if(typeof clip.keyframes!=='object'||Array.isArray(clip.keyframes))throw new Error('The clip has invalid keyframe data.');
        for(const frames of Object.values(clip.keyframes)){
          if(!Array.isArray(frames)||frames.some(frame=>!finite(frame?.time)||Number(frame.time)<Number(clip.start)-EPS||Number(frame.time)>end(clip)+EPS))throw new Error('A change would leave keyframes outside their clip.');
        }
      }
    }
    if(before){
      const originals=new Map((before.clips||[]).map(clip=>[clip.id,clip]));
      for(let i=0;i<state.clips.length;i++)for(let j=i+1;j<state.clips.length;j++){
        const a=state.clips[i],b=state.clips[j],current=overlap(a,b);if(current<=EPS)continue;
        const oldA=originals.get(a.id),oldB=originals.get(b.id),previous=oldA&&oldB?overlap(oldA,oldB):0;
        if(current>previous+EPS)throw new Error('The Director change would create or enlarge an overlap on the same track.');
      }
    }
    return true;
  }
  function validatePlan(plan,state,context={}){
    const raw=Array.isArray(plan)?plan:plan?.actions;
    if(!Array.isArray(raw)||raw.length>12)throw new Error('Director mode accepts at most 12 bounded editing actions per pass.');
    const api=registry(),staged={...state,clips:clone(state.clips||[]),trackStates:clone(state.trackStates||{})},actions=[];
    for(const input of raw){
      if(!input||typeof input!=='object'||!ALLOWED.has(input.command))throw new Error('This action is outside Director mode’s bounded timeline tools.');
      const target=input.target==='selected_clip'||!input.target?state.selected:input.target;
      const action={command:input.command,target:String(target||''),parameters:clone(input.parameters||{})},p=action.parameters,clip=staged.clips.find(value=>value.id===target);
      checkTarget(clip,staged);
      if(['clip.set','audio.set'].includes(action.command)&&p.property==='playbackRate')throw new Error('Director mode cannot change playback rate in a polish pass.');
      if(action.command==='clip.move'){
        if(!Number.isSafeInteger(Number(p.track))||Number(p.track)<0||trackKind(Number(p.track))!==clipKind(clip))throw new Error('The destination track must match the clip type.');
        if(staged.trackStates?.[p.track]?.locked)throw new Error('The destination track is locked.');
      }
      if((/^visual\./.test(action.command)||action.command==='transition.apply')&&!visual(clip))throw new Error('This tool requires a photo or video clip.');
      if(/^audio\./.test(action.command)&&!(clip.type==='audio'||clip.type==='video'&&assetFor(staged,clip)?.type==='video'))throw new Error('This tool requires a clip with supported audio.');
      if(action.command==='keyframe.animation'&&p.preset==='audio_fade_out'&&clip.type!=='audio'&&assetFor(staged,clip)?.type!=='video')throw new Error('Audio animation requires an audio source.');
      if(action.command==='keyframe.animation'&&p.preset!=='audio_fade_out'&&!visual(clip)&&clip.type!=='text')throw new Error('Visual animation requires a photo, video or text clip.');
      const currentContext=api.buildContext(staged,{capabilities:context.capabilities||{}}),check=api.validate(action,currentContext);
      if(check.status!=='SUCCESS')throw new Error(check.message||'The Director action is invalid.');
      if(noChange(action,clip))continue;
      if(action.command==='clip.trim')rejectNewGap(clip,Number(p.duration),staged);
      simulate(action,clip);actions.push(action);
    }
    validateResult(staged,state);
    return {actions,reason:String(plan?.reason||'').slice(0,1500),reply:String(plan?.reply||'').slice(0,2000)};
  }
  function localPlan(instruction,state,context={}){
    const text=String(instruction||''),caps=context.capabilities||{},actions=[];
    const negates=subject=>new RegExp(`\\b(?:do not|don['’]?t|no|not|without|never|avoid|skip|remove)\\s+(?:\\w+\\s+){0,3}(?:${subject})\\b`,'i').test(text);
    const only=/\bonly\b/i.test(text),wantsTransitions=/\btransitions?\b/i.test(text),wantsAudio=/\b(?:music|audio|sound|fades?)\b/i.test(text);
    const unlocked=clip=>!automatic(clip)&&!state.trackStates?.[clip.track]?.locked;
    const visuals=state.clips.filter(clip=>visual(clip)&&!clip.overlay&&!automatic(clip)),tracks=[...new Set(visuals.map(clip=>clip.track))].sort((a,b)=>a-b),primary=visuals.filter(clip=>clip.track===(tracks.includes(0)?0:tracks[0])).sort((a,b)=>a.start-b.start);
    const add=(command,target,parameters)=>{if(actions.length<12)actions.push({command,target,parameters});};
    const trim=text.match(/\b(?:trim|shorten)\b[^.!?]{0,60}\b(?:opening|opener|first clip)\b[^.!?]{0,30}\bto\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/i);
    if(trim&&!negates('trim|shorten')&&primary[0]&&unlocked(primary[0])){
      const first=primary[0],duration=Number(trim[1]),later=state.clips.some(clip=>clip.id!==first.id&&clip.track===first.track&&clip.start>=first.start);
      if(!later&&duration>=.2&&duration<first.duration)add('clip.trim',first.id,{duration,from:'end'});
    }
    const polish=/\b(?:polish|professional|take over|takeover|help me edit|edit it|improve|smooth|cinematic)\b/i.test(text);
    const transition=(caps.transitions||[]).find(id=>id==='dissolve')||(caps.transitions||[]).find(id=>id==='fade');
    if(polish&&transition&&(!only||wantsTransitions)&&!negates('transitions?'))for(let i=1;i<primary.length;i++){
      const previous=primary[i-1],clip=primary[i],duration=Math.min(.35,clip.duration,previous.duration);if(duration>=.1&&unlocked(previous)&&unlocked(clip)&&['','none','cut'].includes(clip.transition||'')&&Math.abs(previous.start+previous.duration-clip.start)<=EPS)add('transition.apply',clip.id,{id:transition,duration});
    }
    if(polish&&(!only||wantsAudio)&&!negates('music|audio|sound|fades?'))for(const clip of state.clips){
      const asset=assetFor(state,clip),music=clip.audioEffects?.role==='music'||clip.role==='music'||clip.musicProduction||asset?.musicProduction||asset?.generatedKind==='music'||asset?.kind==='music';
      if(clip.type==='audio'&&music&&unlocked(clip)&&!clip.audioFadeIn&&!clip.audioFadeOut)add('audio.fade',clip.id,{in:Math.min(.35,clip.duration/4),out:Math.min(.5,clip.duration/4)});
    }
    if(/\bcinematic\b/i.test(text)&&!negates('cinematic|filters?')){
      const filter=(caps.filters||[]).find(id=>id==='cinematic')||(caps.filters||[]).find(id=>id==='cinema');
      if(filter)for(const clip of primary)if(unlocked(clip)&&(!clip.visualEffects?.filter?.id||clip.visualEffects.filter.id==='none'))add('visual.filter',clip.id,{id:filter,intensity:35});
    }
    return {actions,reason:'A local metadata-based pass: existing clip order, source media, custom fades and existing treatments are preserved.',reply:actions.length?'Prepared bounded timeline changes using available tools.':'There are no suitable untouched joins or dedicated music fades for this local pass. Ask for a specific change.'};
  }
  const urlCache=new WeakMap();
  function urlKey(asset){
    const url=String(asset.url||asset.src||'');if(url.length<=512)return url;
    const cached=urlCache.get(asset);if(cached?.url===url)return cached.key;
    let a=2166136261,b=5381;for(let i=0;i<url.length;i++){const code=url.charCodeAt(i);a=Math.imul(a^code,16777619);b=Math.imul(b,33)^code;}
    const key=`${url.length}:${a>>>0}:${b>>>0}`;urlCache.set(asset,{url,key});return key;
  }
  function signature(state){return JSON.stringify([state.projectId||'',state.clips||[],state.trackStates||{},(state.mediaAssets||[]).map(asset=>[asset.id,asset.type,asset.duration,urlKey(asset)])]);}
  return {localPlan,validatePlan,validateResult,signature};
});
