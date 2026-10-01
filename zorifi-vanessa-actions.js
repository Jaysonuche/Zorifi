(function(global){
  'use strict';

  const STATUS=Object.freeze({SUCCESS:'SUCCESS',FAILED:'FAILED',REQUIRES_CONFIRMATION:'REQUIRES_CONFIRMATION',UNSUPPORTED:'UNSUPPORTED'});
  const DESTRUCTIVE=new Set(['clip.delete','clip.ripple_delete','text.delete','caption.delete']);
  const ACTIONS=new Set([
    'clip.select','clip.trim','clip.split','clip.delete','clip.ripple_delete','clip.duplicate','clip.move','clip.freeze','clip.set',
    'timeline.seek','timeline.select_track','timeline.zoom','timeline.snapping',
    'visual.adjust','visual.filter','visual.remove_filter','visual.effect','visual.remove_effect','visual.chroma','visual.mask',
    'effect.apply','effect.remove','effect.toggle','effect.parameter','animation.apply','animation.remove',
    'audio.set','audio.fade','audio.preset','audio.noise_reduction','audio.compressor','audio.limiter','audio.ducking','audio.mute',
    'keyframe.set','keyframe.animation','keyframe.delete',
    'text.add','text.edit','text.style','text.delete','caption.open','caption.generate','caption.style','caption.delete',
    'transition.apply','project.save','project.rename','project.duplicate','project.info','project.ratio','project.favorite','project.open_recent',
    'template.create','template.use','template.find','template.favorite','creator.format','creator.stage','export.prepare','export.preset'
  ]);
  const CLIP_PROPERTIES={
    positionX:[-150,150],positionY:[-150,150],scale:[5,500],scaleX:[5,500],scaleY:[5,500],rotation:[-360,360],
    opacity:[0,100],playbackRate:[.1,8],volume:[0,200],audioPan:[-100,100],blur:[0,30],cropTop:[0,45],cropRight:[0,45],cropBottom:[0,45],cropLeft:[0,45],cornerRadius:[0,50]
  };
  const VISUAL_PROPERTIES={brightness:[-100,100],contrast:[-100,100],saturation:[0,200],exposure:[-100,100],temperature:[-100,100],tint:[-100,100],highlights:[-100,100],shadows:[-100,100],blur:[0,30],vignette:[0,100]};
  const AUDIO_PROPERTIES={volume:[0,200],audioPan:[-100,100],playbackRate:[.1,8]};
  const ANIMATION_PRESETS=new Set(['zoom_in','left_to_right','rotate','fade_out','audio_fade_out']);
  const EASINGS=new Set(['linear','hold','ease-in','ease-out','ease-in-out','bezier']);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const finite=value=>Number.isFinite(Number(value));
  const number=value=>Number(value);
  const result=(status,message,extra={})=>({status,message,...extra});
  const targetId=action=>String(action.target||action.parameters?.clipId||'selected_clip');
  const findClip=(context,action)=>targetId(action)==='selected_clip'?context.clips.find(clip=>clip.id===context.selectedClipId):context.clips.find(clip=>clip.id===targetId(action));
  const range=(value,limits)=>finite(value)&&number(value)>=limits[0]&&number(value)<=limits[1];

  function buildContext(state,options={}){
    const clips=(state.clips||[]).map(clip=>({
      id:String(clip.id),name:String(clip.name||'Clip'),type:String(clip.type||'unknown'),start:number(clip.start)||0,duration:number(clip.duration)||0,
      track:number(clip.track)||0,volume:clip.volume??100,audioPan:clip.audioPan??0,opacity:clip.opacity??100,playbackRate:clip.playbackRate??1,
      positionX:clip.positionX??0,positionY:clip.positionY??0,scale:clip.scale??100,rotation:clip.rotation??0,
      visualEffects:clip.visualEffects?clone(clip.visualEffects):null,audioEffects:clip.audioEffects?clone(clip.audioEffects):null,
      effects:[...(clip.clipEffects||[])],effectStack:clone(clip.effectStack||[]),animations:clone(clip.animations||[]),transition:clip.transition||null,keyframes:clip.keyframes?clone(clip.keyframes):{},autoCaption:Boolean(clip.autoCaption)
    }));
    const selected=clips.find(clip=>clip.id===state.selected)||null;
    return {
      project:{id:String(state.projectId||''),name:String(state.currentProject||'Untitled project'),duration:number(state.duration)||0,ratio:String(state.ratio||'16 / 9').replaceAll(' ',''),width:state.frameWidth||null,height:state.frameHeight||null,frameRate:state.proSettings?.frameRate||30},
      playhead:number(state.currentTime)||0,selectedClipId:selected?.id||null,selectedTrack:selected?.track??options.selectedTrack??null,selectedClip:selected,
      clips,tracks:[...new Set(clips.map(clip=>clip.track))].sort((a,b)=>a-b).map(id=>({id,clips:clips.filter(clip=>clip.track===id).map(clip=>clip.id),...(clone(state.trackStates?.[id]||{}))})),
      media:(state.mediaAssets||[]).map(asset=>({id:String(asset.id),name:String(asset.name||'Media'),type:String(asset.type||'unknown'),duration:number(asset.duration)||0,available:Boolean(asset.url||asset.builtin||asset.generated)})),
      captions:clips.filter(clip=>clip.type==='text'&&clip.autoCaption).map(clip=>clip.id),settings:{snapping:state.snapping!==false,timelineZoom:state.zoom||100},
      capabilities:clone(options.capabilities||{})
    };
  }

  function normalizeAction(input){
    if(!input||typeof input!=='object'||Array.isArray(input))return null;
    const command=String(input.command||input.action||'').trim().toLowerCase();
    if(!command)return null;
    return {command,target:String(input.target||'selected_clip'),parameters:input.parameters&&typeof input.parameters==='object'&&!Array.isArray(input.parameters)?clone(input.parameters):{},confirmation:false};
  }
  function normalizePlan(input){
    const raw=Array.isArray(input)?input:Array.isArray(input?.actions)?input.actions:[input];
    return {actions:raw.map(normalizeAction).filter(Boolean),reply:String(input?.reply||''),reason:String(input?.reason||'')};
  }

  function validate(action,context){
    action=normalizeAction(action);if(!action)return result(STATUS.FAILED,'Malformed Vanessa action.');
    if(!ACTIONS.has(action.command))return result(STATUS.UNSUPPORTED,`Zorifi does not support “${action.command}”.`,{action});
    const p=action.parameters||{},needsClip=/^(clip|visual|audio|keyframe|effect|animation)\./.test(action.command)||/^(text\.(edit|style|delete))$/.test(action.command);
    const clip=needsClip?findClip(context,action):null;
    if(needsClip&&!clip)return result(STATUS.FAILED,'The target clip does not exist or no clip is selected.',{action});
    if(/^audio\./.test(action.command)&&!['audio','video'].includes(clip.type))return result(STATUS.FAILED,'The target clip has no supported audio.',{action});
    if(/^visual\./.test(action.command)&&clip.type!=='video')return result(STATUS.FAILED,'The target is not a visual clip.',{action});
    if(/^(effect|animation)\./.test(action.command)&&!['video','text'].includes(clip.type))return result(STATUS.FAILED,'Select a visual or text element first.',{action});
    if(/^text\.(edit|style|delete)$/.test(action.command)&&clip.type!=='text')return result(STATUS.FAILED,'The target is not a text or caption clip.',{action});
    if(action.command==='clip.trim'&&(!finite(p.duration)||number(p.duration)<.2||number(p.duration)>Math.max(.2,clip.duration)))return result(STATUS.FAILED,'Trim duration must be inside the current clip.',{action});
    if(action.command==='clip.split'&&(!finite(p.time)||number(p.time)<=clip.start+.19||number(p.time)>=clip.start+clip.duration-.19))return result(STATUS.FAILED,'The split point must be inside the clip.',{action});
    if(action.command==='clip.move'&&(!finite(p.start)||number(p.start)<0||!finite(p.track)))return result(STATUS.FAILED,'Clip position and track must be valid.',{action});
    if(action.command==='clip.set'&&(!CLIP_PROPERTIES[p.property]||!range(p.value,CLIP_PROPERTIES[p.property])))return result(STATUS.FAILED,'That clip property or value is invalid.',{action});
    if(action.command==='visual.adjust'&&(!VISUAL_PROPERTIES[p.property]||!range(p.value,VISUAL_PROPERTIES[p.property])))return result(STATUS.FAILED,'That visual adjustment or value is invalid.',{action});
    if(action.command==='visual.filter'&&(!context.capabilities?.filters?.includes(p.id)||!range(p.intensity??100,[0,100])))return result(STATUS.FAILED,'That filter or intensity is unavailable.',{action});
    if(action.command==='visual.effect'&&!context.capabilities?.effects?.includes(p.id))return result(STATUS.FAILED,'That visual effect is unavailable.',{action});
    if(action.command==='effect.apply'&&!context.capabilities?.elementEffects?.includes(p.id))return result(STATUS.FAILED,'That element effect is unavailable.',{action});
    if(action.command==='effect.parameter'&&(!String(p.instanceId||'')||!String(p.property||'')||!finite(p.value)))return result(STATUS.FAILED,'The effect instance, parameter or value is invalid.',{action});
    if(action.command==='animation.apply'&&!context.capabilities?.animations?.includes(p.id))return result(STATUS.FAILED,'That animation is unavailable.',{action});
    if(action.command==='audio.set'&&(!AUDIO_PROPERTIES[p.property]||!range(p.value,AUDIO_PROPERTIES[p.property])))return result(STATUS.FAILED,'That audio property or value is invalid.',{action});
    if(action.command==='audio.preset'&&!context.capabilities?.audioPresets?.includes(p.id))return result(STATUS.FAILED,'That audio preset is unavailable.',{action});
    if(action.command==='timeline.seek'&&(!finite(p.time)||number(p.time)<0||number(p.time)>context.project.duration))return result(STATUS.FAILED,'The requested playhead time is outside the project.',{action});
    if(action.command==='timeline.zoom'&&(!finite(p.value)||number(p.value)<25||number(p.value)>400))return result(STATUS.FAILED,'Timeline zoom must be between 25% and 400%.',{action});
    if(action.command==='keyframe.set'&&(!CLIP_PROPERTIES[p.property]&&!VISUAL_PROPERTIES[p.property]||!finite(p.time)||number(p.time)<clip.start||number(p.time)>clip.start+clip.duration||!finite(p.value)||!EASINGS.has(p.easing||'ease-in-out')))return result(STATUS.FAILED,'The keyframe property, time, value or easing is invalid.',{action});
    if(action.command==='keyframe.animation'&&(!ANIMATION_PRESETS.has(p.preset)||!EASINGS.has(p.easing||'ease-in-out')||(p.duration!==undefined&&(!finite(p.duration)||number(p.duration)<=0))))return result(STATUS.FAILED,'That animation preset, duration or easing is invalid.',{action});
    if(action.command==='audio.fade'&&((p.in!==undefined&&!range(p.in,[0,clip.duration]))||(p.out!==undefined&&!range(p.out,[0,clip.duration]))))return result(STATUS.FAILED,'Audio fades must fit inside the clip.',{action});
    if(action.command==='transition.apply'&&(!context.capabilities?.transitions?.includes(p.id)||!range(p.duration??.6,[.1,3])))return result(STATUS.FAILED,'That transition or duration is unavailable.',{action});
    if(action.command==='creator.format'&&!['vertical','widescreen','square','portrait'].includes(p.id))return result(STATUS.FAILED,'That creator format is unavailable.',{action});
    if(action.command==='creator.stage'&&!['Idea','Create','Edit','Prepare','Export','Share'].includes(p.stage))return result(STATUS.FAILED,'That creator workflow stage is unavailable.',{action});
    if(DESTRUCTIVE.has(action.command)&&!action.confirmation)return result(STATUS.REQUIRES_CONFIRMATION,`Confirm ${action.command.replace('.',' ')} for “${clip?.name||'the selected item'}”.`,{action,before:summarizeBefore(clip,action)});
    return result(STATUS.SUCCESS,'Action is valid.',{action,clip});
  }

  function summarizeBefore(clip,action){
    const p=action.parameters||{};if(!clip)return null;
    if(action.command==='clip.set')return {[p.property]:clip[p.property]};
    if(action.command==='visual.adjust')return {[p.property]:clip.visualEffects?.adjustments?.[p.property]};
    if(action.command==='audio.set')return {[p.property]:clip[p.property]??clip.audioEffects?.[p.property]};
    return {clip:clip.name,start:clip.start,duration:clip.duration,track:clip.track};
  }
  function describeChange(action,clip){
    const p=action.parameters||{},name=clip?.name||'project';
    const labels={'clip.trim':'Trimmed','clip.split':'Split','clip.delete':'Deleted','clip.ripple_delete':'Ripple deleted','clip.duplicate':'Duplicated','clip.move':'Moved','clip.freeze':'Created freeze frame from','clip.set':'Changed','visual.adjust':'Adjusted','visual.filter':'Applied filter to','visual.remove_filter':'Removed filter from','visual.effect':'Applied effect to','visual.remove_effect':'Removed effect from','effect.apply':'Applied element effect to','effect.remove':'Removed element effect from','effect.toggle':'Toggled element effect on','effect.parameter':'Adjusted element effect on','animation.apply':'Applied animation to','animation.remove':'Removed animation from','visual.chroma':'Changed chroma key on','visual.mask':'Changed mask on','audio.set':'Changed audio on','audio.fade':'Changed fades on','audio.preset':'Applied audio preset to','audio.noise_reduction':'Changed noise reduction on','audio.compressor':'Changed compressor on','audio.limiter':'Changed limiter on','audio.ducking':'Changed ducking on','audio.mute':'Changed mute on','keyframe.set':'Added keyframe to','keyframe.animation':'Added animation to','keyframe.delete':'Deleted keyframe from','text.edit':'Edited','text.style':'Styled','text.delete':'Deleted','transition.apply':'Applied transition to'};
    if(action.command==='clip.set'||action.command==='visual.adjust')return `${labels[action.command]} ${p.property} on ${name} to ${p.value}.`;
    return `${labels[action.command]||'Updated'} ${name}.`;
  }

  function preview(plan,context){
    const normalized=normalizePlan(plan);return normalized.actions.map(action=>{const check=validate(action,context),clip=findClip(context,action);return {command:action.command,target:clip?.name||action.target,status:check.status,before:summarizeBefore(clip,action),after:clone(action.parameters),message:check.message};});
  }

  async function execute(plan,context,adapter,options={}){
    const normalized=normalizePlan(plan);if(!normalized.actions.length)return result(STATUS.FAILED,'Vanessa returned no valid editing actions.',{items:[]});
    const checks=normalized.actions.map(action=>validate(action,context));
    const unsupported=checks.find(item=>item.status===STATUS.UNSUPPORTED),failed=checks.find(item=>item.status===STATUS.FAILED),confirmations=checks.filter(item=>item.status===STATUS.REQUIRES_CONFIRMATION);
    if(unsupported)return result(STATUS.UNSUPPORTED,unsupported.message,{items:checks,preview:preview(normalized,context)});
    if(failed)return result(STATUS.FAILED,failed.message,{items:checks,preview:preview(normalized,context)});
    if(confirmations.length&&!options.confirmed)return result(STATUS.REQUIRES_CONFIRMATION,'Review and confirm these destructive changes.',{items:confirmations,preview:preview(normalized,context),plan:normalized});
    const before=adapter.capture();const items=[];
    try{
      adapter.begin?.(normalized);
      for(const action of normalized.actions){const clip=adapter.resolveClip?adapter.resolveClip(action):findClip(buildContext(adapter.state()),action),value=await adapter.apply(action,clip);if(value?.status&&value.status!==STATUS.SUCCESS)throw new Error(value.message||'An editor action failed.');items.push({status:STATUS.SUCCESS,command:action.command,message:value?.message||describeChange(action,clip)});}
      adapter.commit?.(normalized);return result(STATUS.SUCCESS,items.map(item=>item.message).join(' '),{items,preview:preview(normalized,context)});
    }catch(error){adapter.restore(before);adapter.rollback?.(normalized,error);return result(STATUS.FAILED,error?.message||'Vanessa could not apply this edit.',{items:[...items,{status:STATUS.FAILED,message:error?.message||'Action failed'}],rolledBack:true});}
  }

  function parseNumber(text,fallback){const match=String(text).match(/-?\d+(?:\.\d+)?/);return match?Number(match[0]):fallback;}
  function parseNaturalLanguage(message,context){
    const original=String(message||'').trim(),text=original.toLowerCase(),selected=context?.selectedClip,actions=[];const target='selected_clip';
    const add=(command,parameters={},options={})=>actions.push({command,target:options.target||target,parameters,confirmation:Boolean(options.confirmation)});
    const duration=text.match(/(?:trim|shorten).*?(?:to|at)\s*(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/);if(duration)add('clip.trim',{duration:Number(duration[1])});
    const split=text.match(/(?:split|cut).*?(?:at|on)\s*(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/);if(/\b(?:split|cut)\b/.test(text))add('clip.split',{time:split?Number(split[1]):context.playhead});
    if(/\b(?:delete|remove)\s+(?:this |selected )?clip\b/.test(text))add(/close the gap|ripple/.test(text)?'clip.ripple_delete':'clip.delete',{},{});
    if(/\bduplicate\s+(?:this |selected )?clip\b/.test(text))add('clip.duplicate');
    if(/move (?:this |the |selected )?clip.*(?:beginning|start)/.test(text))add('clip.move',{start:0,track:selected?.track??0});
    const percentSlower=text.match(/(\d+(?:\.\d+)?)\s*%\s*slower/),percentFaster=text.match(/(\d+(?:\.\d+)?)\s*%\s*faster/);if(percentSlower)add('clip.set',{property:'playbackRate',value:Math.max(.1,(selected?.playbackRate||1)*(1-Number(percentSlower[1])/100))});else if(percentFaster)add('clip.set',{property:'playbackRate',value:Math.min(8,(selected?.playbackRate||1)*(1+Number(percentFaster[1])/100))});
    const rotation=text.match(/rotate.*?(-?\d+(?:\.\d+)?)\s*(?:degrees?|°)/);if(rotation)add('clip.set',{property:'rotation',value:Number(rotation[1])});
    const opacity=text.match(/opacity.*?(\d+(?:\.\d+)?)\s*%?/);if(opacity)add('clip.set',{property:'opacity',value:Number(opacity[1])});
    const resize=text.match(/(?:resize|scale).*(?:to|at)\s*(\d+(?:\.\d+)?)\s*%/);if(resize&&!/animate/.test(text))add('clip.set',{property:'scale',value:Number(resize[1])});
    const crop=text.match(/crop.*?(\d+(?:\.\d+)?)\s*%.*?\b(top|right|bottom|left)\b|crop.*?\b(top|right|bottom|left)\b.*?(\d+(?:\.\d+)?)\s*%/);if(crop){const rawEdge=crop[2]||crop[3],edge=rawEdge[0].toUpperCase()+rawEdge.slice(1),value=Number(crop[1]||crop[4]);add('clip.set',{property:`crop${edge}`,value});}
    const visualWords={brightness:'brightness',brighter:'brightness',darker:'brightness',contrast:'contrast',saturation:'saturation',vibrant:'saturation',exposure:'exposure',warmer:'temperature',warm:'temperature',cooler:'temperature',tint:'tint',highlights:'highlights',shadows:'shadows',blur:'blur',vignette:'vignette'};
    for(const [word,property] of Object.entries(visualWords)){if(!new RegExp(`\\b${word}\\b`).test(text))continue;let value=parseNumber(text,undefined);if(value===undefined){const base=selected?.visualEffects?.adjustments?.[property]??(property==='saturation'?100:0);value=property==='blur'?Math.max(3,base+3):property==='vignette'?Math.max(25,base+25):word==='darker'||word==='cooler'?base-20:base+20;}add('visual.adjust',{property,value});break;}
    if(/cinematic (?:look|colour|color)|make .*cinematic/.test(text))add('visual.filter',{id:'cinematic',intensity:100});if(/remove (?:the )?filter/.test(text))add('visual.remove_filter');
    const namedEffect=(context.capabilities?.effectLibrary||[]).find(item=>text.includes(String(item.name||'').toLowerCase()));if(namedEffect&&/\b(?:add|apply|use)\b/.test(text))add('effect.apply',{id:namedEffect.id});
    const namedAnimation=(context.capabilities?.animationLibrary||[]).find(item=>text.includes(String(item.name||'').toLowerCase()));if(namedAnimation&&/\b(?:add|apply|animate|use)\b/.test(text))add('animation.apply',{id:namedAnimation.id,duration:Math.min(selected?.duration||1,parseNumber(text,1)),easing:'ease-in-out'});
    const audible=context.clips.filter(clip=>['audio','video'].includes(clip.type)),musicMatches=audible.filter(clip=>clip.audioEffects?.role==='music'||/music|song|soundtrack|ambient|mix/i.test(clip.name)),voiceMatches=audible.filter(clip=>clip.audioEffects?.role==='voiceover'||clip.audioEffects?.role==='dialogue'||/voice|dialogue|speech|narration/i.test(clip.name));
    const preferDedicated=(matches,selectedClip)=>selectedClip?.type==='audio'&&matches.some(clip=>clip.id===selectedClip.id)?selectedClip:matches.find(clip=>clip.type==='audio')||matches[0],musicClip=preferDedicated(musicMatches,selected),voiceClip=preferDedicated(voiceMatches,selected),audioTarget=/music/.test(text)?musicClip:/voice/.test(text)?voiceClip:null,targetAudio=audioTarget||(['audio','video'].includes(selected?.type)?selected:musicClip||voiceClip);
    const volume=text.match(/(?:volume|music|voice).*?(\d{1,3})\s*%/);if(volume)add('audio.set',{property:'volume',value:Number(volume[1])},{target:targetAudio?.id||target});else if(/lower (?:the )?(?:music|volume)/.test(text))add('audio.set',{property:'volume',value:Math.max(0,(targetAudio?.volume??100)-20)},{target:targetAudio?.id||target});else if(/(?:raise|increase|make).*(?:voice|volume).*(?:louder|higher)|make (?:my )?voice louder/.test(text))add('audio.set',{property:'volume',value:Math.min(200,(targetAudio?.volume??100)+20)},{target:targetAudio?.id||target});
    const fadeOut=text.match(/fade (?:the )?(?:music|audio|sound)?\s*out(?: over)?(?: the last)?\s*(\d+(?:\.\d+)?)?/);if(fadeOut)add('audio.fade',{out:Number(fadeOut[1]||2)},{target:targetAudio?.id||target});const fadeIn=text.match(/fade (?:the )?(?:music|audio|sound)?\s*in(?: over)?\s*(\d+(?:\.\d+)?)?/);if(fadeIn)add('audio.fade',{in:Number(fadeIn[1]||2)},{target:targetAudio?.id||target});
    if(/(?:remove|reduce).*(?:background noise|noise)/.test(text))add('audio.noise_reduction',{enabled:true,amount:70},{target:(voiceClip||targetAudio)?.id||target});if(/voice clear/.test(text))add('audio.preset',{id:'voiceClear'},{target:(voiceClip||targetAudio)?.id||target});if(/lower .*music.*(?:speaking|dialogue)|duck(?:ing)?/.test(text))add('audio.ducking',{enabled:true,amount:55},{target:(musicClip||targetAudio)?.id||target});
    if(/slowly zoom in|animate (?:the )?scale.*(?:100).*130/.test(text))add('keyframe.animation',{preset:'zoom_in',from:100,to:Number(text.match(/(?:to|–|-)\s*(\d{2,3})\s*%/)?.[1]||130),duration:selected?.duration||3,easing:'ease-in-out'});
    if(/move .*from left to right/.test(text))add('keyframe.animation',{preset:'left_to_right',duration:parseNumber(text,3),easing:'ease-in-out'});
    if(/(?:add|create|make|animate).*(?:rotation|spin).*(?:animation|over|degrees?)/.test(text)){const degrees=Number(text.match(/(-?\d+(?:\.\d+)?)\s*(?:degrees?|°)/)?.[1]||360);add('keyframe.animation',{preset:'rotate',from:selected?.rotation??0,to:degrees,duration:Number(text.match(/(?:over|for)\s*(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)/)?.[1]||Math.min(selected?.duration||3,3)),easing:'ease-in-out'});}
    if(/fade (?:this )?clip out/.test(text))add('keyframe.animation',{preset:'fade_out',duration:parseNumber(text,1),easing:'ease-out'});
    if(/(?:gradually|slowly).*(?:music|volume).*(?:quieter|lower)/.test(text))add('keyframe.animation',{preset:'audio_fade_out',duration:parseNumber(text,3),easing:'ease-out'},{target:(musicClip||targetAudio)?.id||target});
    const title=original.match(/(?:add|create) (?:a )?(?:text |title )(?:that says |saying )?["“]?([^"”]+?)["”]?(?:\.|$)/i);if(title)add('text.add',{text:title[1].trim().slice(0,120)});
    if(/(?:add|create|generate) (?:auto )?captions/.test(text))add('caption.generate');
    if(/\b(?:save)(?: the)? project\b/.test(text))add('project.save');
    const rename=original.match(/rename (?:the )?project (?:to )?["“]?([^"”]+)["”]?$/i);if(rename)add('project.rename',{name:rename[1].trim().slice(0,80)});
    if(/(?:prepare|open).*(?:export|render)/.test(text))add('export.prepare');
    if(/(?:favorite|favourite) (?:this |the )?project/.test(text))add('project.favorite',{enabled:!/unfavorite|unfavourite/.test(text)});
    if(/open (?:my )?(?:most )?recent project/.test(text))add('project.open_recent');
    const template=original.match(/(?:create|save|make) (?:this project as |a )?(?:an )?editable template(?: called | named )?["“]?([^"”]+)?/i);if(template)add('template.create',{name:(template[1]||`${context.project.name} template`).trim().slice(0,80)});
    const useTemplate=original.match(/use (?:the )?template["“]?\s*([^"”]+)?/i);if(useTemplate)add('template.use',{name:(useTemplate[1]||'').trim().slice(0,80)});
    const findTemplate=original.match(/(?:find|search(?: for)?|show me) (?:a |the )?(.*?)\s*templates?\b/i);if(findTemplate)add('template.find',{query:(findTemplate[1]||'').trim().slice(0,80)});
    const favoriteTemplate=original.match(/(?:favorite|favourite|save) (?:the )?template["“]?\s*([^"”]+)?/i);if(favoriteTemplate&&!/project/.test(text))add('template.favorite',{name:(favoriteTemplate[1]||'').trim().slice(0,80),enabled:!/unfavorite|unfavourite|remove/.test(text)});
    if(/vertical|tiktok|reels?/.test(text))add('creator.format',{id:'vertical'});else if(/square (?:post|video|format)/.test(text))add('creator.format',{id:'square'});else if(/portrait (?:post|video|format)|4\s*:\s*5/.test(text))add('creator.format',{id:'portrait'});else if(/widescreen|youtube format/.test(text))add('creator.format',{id:'widescreen'});
    const stage=original.match(/(?:move|set) (?:the )?(?:project|workflow) (?:to|stage to) (idea|create|edit|prepare|export|share)/i);if(stage)add('creator.stage',{stage:stage[1][0].toUpperCase()+stage[1].slice(1).toLowerCase()});
    const exportPreset=original.match(/(?:use|apply) (?:the )?export preset["“]?\s*([^"”]+)$/i);if(exportPreset)add('export.preset',{name:exportPreset[1].trim().slice(0,80)});
    const ratio=text.match(/\b(16\s*[:x]\s*9|9\s*[:x]\s*16|1\s*[:x]\s*1|4\s*[:x]\s*5)\b/);if(ratio)add('project.ratio',{value:ratio[1].replace(/\s*[x:]\s*/,':')});
    return {actions:actions.filter((item,index,array)=>array.findIndex(other=>other.command===item.command&&JSON.stringify(other.parameters)===JSON.stringify(item.parameters))===index),reply:'',reason:original};
  }

  global.ZorifiVanessaActions={STATUS,ACTIONS:[...ACTIONS],CLIP_PROPERTIES,VISUAL_PROPERTIES,AUDIO_PROPERTIES,buildContext,normalizeAction,normalizePlan,validate,preview,execute,parseNaturalLanguage,clone};
})(typeof window!=='undefined'?window:globalThis);
