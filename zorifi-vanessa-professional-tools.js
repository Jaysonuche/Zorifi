/* Strict tool descriptions and postconditions over Zorifi's existing editor API.
 * No editor store, network access, dynamic code, or ownership bypass lives here. */
(function(root,factory){const api=factory(root,typeof module==='object'&&module.exports?require('./zorifi-timeline-tracks.js'):root.ZorifiTimelineTracks);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiProfessionalTools=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root,Tracks){
  'use strict';
  const VERSION=1,MAX_ACTIONS=120,MAX_TIME=86400;
  const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
  const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
  const fail=message=>{throw new Error(message);};
  const num=(min,max,required=false)=>({type:'number',minimum:min,maximum:max,required});
  const str=(max=160,required=false)=>({type:'string',maxLength:max,minLength:1,required});
  const bool=()=>({type:'boolean'});
  const choose=(values,required=false)=>({type:'string',enum:values,required});
  const id=(required=false)=>({...str(160,required),pattern:'^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$'});
  const color=()=>({type:'string',pattern:'^#[a-fA-F0-9]{6}$'});
  const track=()=>({...num(0,Number.MAX_SAFE_INTEGER),type:'integer'});
  const EASINGS=['linear','hold','ease-in','ease-out','ease-in-out'];
  const CLIP_RANGES={positionX:[-150,150],positionY:[-150,150],scale:[5,500],scaleX:[5,500],scaleY:[5,500],rotation:[-360,360],opacity:[0,100],playbackRate:[.1,8],volume:[0,200],audioPan:[-100,100],blur:[0,30],cropTop:[0,45],cropRight:[0,45],cropBottom:[0,45],cropLeft:[0,45],cornerRadius:[0,50]};
  const VISUAL_RANGES={brightness:[-100,100],contrast:[-100,100],saturation:[0,200],exposure:[-100,100],temperature:[-100,100],tint:[-100,100],highlights:[-100,100],shadows:[-100,100],blur:[0,30],vignette:[0,100]};
  const AUDIO_RANGES={volume:[0,200],audioPan:[-100,100],playbackRate:[.1,8]};
  const definitions={};
  function add(command,category,parameters={},options={}){definitions[command]={command,category,parameters,execution:'editor',permission:'authenticated-project',confirmation:'review-plan',undo:'project-checkpoint',verification:'editor-state-postcondition',...options};}
  const targeted=(command,category,params,options={})=>add(command,category,params,{target:true,...options});
  add('clip.add','timeline',{id:id(true),mediaId:id(true),start:num(0,MAX_TIME,true),duration:num(.05,MAX_TIME,true),sourceStart:num(0,MAX_TIME),track:track(),volume:num(0,200),playbackRate:num(.1,8),fit:choose(['contain','cover','crop'])},{creation:true});
  targeted('clip.select','timeline',{}, {undo:'not-required'});
  targeted('clip.trim','timeline',{duration:num(.05,MAX_TIME,true),from:choose(['start','end'])});
  targeted('clip.split','timeline',{time:num(0,MAX_TIME,true)});
  targeted('clip.delete','timeline',{}, {destructive:true});
  targeted('clip.ripple_delete','timeline',{}, {destructive:true});
  targeted('clip.move','timeline',{start:num(0,MAX_TIME,true),track:{...track(),required:true}});
  targeted('clip.set','transform',{property:choose(Object.keys(CLIP_RANGES),true),value:num(-360,500,true)});
  targeted('visual.adjust','colour',{property:choose(Object.keys(VISUAL_RANGES),true),value:num(-100,200,true)});
  targeted('visual.filter','colour',{id:id(true),intensity:num(0,100)},{catalogue:'filters'});
  targeted('visual.remove_filter','colour',{});
  targeted('visual.effect','effects',{id:id(true)},{catalogue:'effects'});
  targeted('visual.remove_effect','effects',{id:id(true)});
  targeted('visual.chroma','compositing',{enabled:bool(),color:color(),tolerance:num(0,100),softness:num(0,100),spill:num(0,100)});
  targeted('visual.mask','compositing',{shape:choose(['none','circle','rectangle','triangle'],true),scale:num(5,200),x:num(-100,100),y:num(-100,100),feather:num(0,100)});
  targeted('effect.apply','effects',{id:id(true),params:{type:'object',additionalProperties:{type:'number'}}},{catalogue:'elementEffects'});
  targeted('effect.remove','effects',{instanceId:id(true)});
  targeted('effect.toggle','effects',{instanceId:id(true),enabled:{...bool(),required:true}});
  targeted('effect.parameter','effects',{instanceId:id(true),property:str(80,true),value:num(-1000,1000,true),time:num(0,MAX_TIME),easing:choose(EASINGS)});
  targeted('animation.apply','animation',{id:id(true),duration:num(.05,600),easing:choose(EASINGS),loops:{type:'integer',minimum:1,maximum:30}},{catalogue:'animations'});
  targeted('animation.remove','animation',{instanceId:id(true)});
  targeted('audio.set','audio',{property:choose(Object.keys(AUDIO_RANGES),true),value:num(-100,200,true)});
  targeted('audio.fade','audio',{in:num(0,30),out:num(0,30)});
  targeted('audio.preset','audio',{id:id(true)},{catalogue:'audioPresets'});
  targeted('audio.noise_reduction','audio',{enabled:bool(),amount:num(0,100)});
  targeted('audio.compressor','audio',{enabled:bool(),threshold:num(-80,0),ratio:num(1,20),attack:num(0,.5),release:num(.01,2),makeup:num(-12,24)});
  targeted('audio.limiter','audio',{enabled:bool(),ceiling:num(-12,0)});
  targeted('audio.ducking','audio',{enabled:bool(),amount:num(0,100),attack:num(.01,2),release:num(.01,4),threshold:num(-80,0)});
  targeted('audio.mute','audio',{enabled:{...bool(),required:true}});
  targeted('keyframe.set','keyframes',{property:choose(Object.keys(CLIP_RANGES),true),time:num(0,MAX_TIME,true),value:num(-360,500,true),easing:choose(EASINGS)});
  targeted('keyframe.delete','keyframes',{property:choose(Object.keys(CLIP_RANGES),true),time:num(0,MAX_TIME,true)});
  targeted('keyframe.animation','keyframes',{preset:choose(['zoom_in','left_to_right','rotate','fade_out','audio_fade_out'],true),duration:num(.05,600),from:num(-360,500),to:num(-360,500),easing:choose(EASINGS)});
  add('text.add','titles',{id:id(true),text:str(160,true),start:num(0,MAX_TIME,true),duration:num(.05,MAX_TIME,true),track:track(),fontId:id(),fontSize:num(10,180),fontWeight:{type:'integer',minimum:100,maximum:900},color:color(),position:num(0,90)},{creation:true});
  targeted('text.edit','titles',{text:str(160,true)});
  targeted('text.style','titles',{fontId:id(),size:num(10,180),color:color(),position:num(0,90)});
  targeted('text.delete','titles',{}, {destructive:true});
  add('caption.style','captions',{fontId:id(),size:num(10,180),color:color(),position:num(0,90)});
  add('caption.delete','captions',{}, {destructive:true});
  targeted('transition.apply','transitions',{id:id(true),duration:num(.1,3)},{catalogue:'transitions'});
  targeted('transition.remove','transitions',{});
  add('project.rename','project',{name:str(80,true)});
  add('project.ratio','project',{value:choose(['16:9','9:16','1:1','4:5'],true)});
  add('project.favorite','project',{enabled:{...bool(),required:true}});
  // These existing actions leave the staged state or start asynchronous external
  // work. Discovery exposes them, but an AI timeline batch cannot invoke them.
  const workflows=[
    ['clip.duplicate','timeline','app.js vanessaActionAdapter: chooseTrack uses the live state'],
    ['clip.freeze','timeline','app.js createFreezeFrame: decodes a real source frame'],
    ['timeline.seek','timeline','app.js seekProject'],['timeline.select_track','timeline','app.js vanessaSelectedTrack'],['timeline.zoom','timeline','app.js state.zoom'],['timeline.snapping','timeline','app.js state.snapping'],
    ['caption.open','captions','app.js captionsPanel'],['caption.generate','captions','app.js generateSmartCaptions; authenticated speech provider'],['caption.translate','captions','app.js translateSmartCaptions; authenticated language provider'],['caption.import','captions','app.js importLocalCaptions; SRT/VTT parser'],['caption.export','captions','app.js exportCaptionSRT'],
    ['colour.lut','colour','zorifi-visual-tools.js parseCube; approximate LUT filter'],['colour.scopes','colour','zorifi-color-scopes.js analyzePixels/ZorifiColorScopesEngine'],
    ['audio.beats','audio','zorifi-audio-engine.js real decoded audio; zorifi-device-lab.js Pulse Desk'],['audio.waveform','audio','zorifi-audio-engine.js decodeWaveform'],['audio.extract','audio','app.js extractAudio'],['audio.record','audio','app.js microphone recording; user gesture/permission'],['audio.stems','audio','netlify/functions/vanessa-stems.mjs'],['audio.sfx','audio','zorifi-sfx.js synthesize'],['audio.music_generate','generation','zorifi-music-studio.js; netlify/functions/vanessa-music.mjs'],
    ['ai.image','generation','netlify/functions/vanessa-image.mjs'],['ai.video','generation','netlify/functions/vanessa-motion.mjs and vanessa-video.mjs'],['ai.voice','generation','netlify/functions/vanessa-voice.mjs'],['ai.background','compositing','zorifi-background-cutout.js and vanessa-background.mjs'],['ai.person_cutout','compositing','zorifi-person-cutout.js; local model download'],['ai.video_enhance','generation','netlify/functions/vanessa-video-tool.mjs; configured media job'],
    ['media.import','media','app.js importFiles; device file chooser'],['media.relink','media','app.js restore/relink local files'],['overlay.layout','compositing','app.js overlay layouts'],['layer.mask_paint','compositing','zorifi-mask-painter.js'],['layer.motion_track','compositing','zorifi-advanced-editing.js estimateFrameTranslation/trackingKeyframes'],['layer.multicam','timeline','zorifi-multicam.js'],['layer.precompose','compositing','zorifi-composition-workspace.js'],['layer.null_camera','compositing','zorifi-composition-workspace.js'],['speed.ramp','speed','zorifi-advanced-editing.js RAMP_PRESETS/sourceTiming'],
    ['project.save','project','app.js saveProject + localStorage/IndexedDB readback'],['project.duplicate','project','app.js copyProjectMedia'],['project.info','project','app.js vanessaActionAdapter'],['project.open_recent','project','app.js loadProject'],['project.versions','project','zorifi-phase11.js addVersion/validateVersion'],['history.undo','history','app.js undo'],['history.redo','history','app.js redo'],
    ['template.create','templates','app.js CreatorPlatform.createTemplate'],['template.use','templates','app.js showUseTemplate'],['template.find','templates','app.js ZorifiTemplateFeed.open'],['template.favorite','templates','app.js saveTemplates'],['creator.format','export','app.js applyCreatorFormat'],['creator.stage','project','app.js creatorSettings.workflowStage'],['export.prepare','export','app.js showExport'],['export.preset','export','app.js showExport'],['export.render','export','app.js export pipeline; actual codec/browser support'],
    ['studio.open','workspace','zorifi-device-integration.js'],['tool.create','recipes','zorifi-tool-registry.js validateRecipe; data recipes only'],['tool.apply','recipes','zorifi-tool-registry.js applyTools; renderer capability checks'],['photos.collage','photos','zorifi-photos.js; separate photo workspace']
  ];
  for(const [command,category,implementation] of workflows)add(command,category,{}, {execution:'workflow',implementation,permission:command==='audio.record'?'explicit-microphone-consent':'authenticated-project',verification:'workflow-specific-result',undo:command==='export.render'?'cancel-if-supported; retain project':'workflow-specific-checkpoint'});
  Object.values(definitions).forEach(Object.freeze);Object.freeze(definitions);
  function defaultCatalog(){return {filters:Object.keys(root.ZorifiVisualTools?.FILTERS||{}),elementEffects:(root.ZorifiMotionEffects?.EFFECTS||[]).map(x=>x.id),effectLibrary:root.ZorifiMotionEffects?.EFFECTS||[],animations:(root.ZorifiMotionEffects?.ANIMATIONS||[]).map(x=>x.id),audioPresets:Object.keys(root.ZorifiAudioEngine?.PRESETS||{})};}
  function catalogFor(options={}){return {...defaultCatalog(),...(options.catalog||options.capabilities||{})};}
  function schemaRule(rule){const out={...rule};delete out.required;return out;}
  function schemaForDefinition(definition,catalog){
    const params=Object.fromEntries(Object.entries(definition.parameters).map(([key,value])=>[key,schemaRule(value)]));
    if(definition.catalogue&&Array.isArray(catalog[definition.catalogue])&&catalog[definition.catalogue].length)params.id={type:'string',enum:catalog[definition.catalogue]};
    if(definition.command==='effect.apply')params.params={type:'object',properties:{},additionalProperties:{type:'number'},description:'Only exact numeric parameter names/ranges from the selected effect definition; unknown names rejected.'};
    return {
      type:'object',additionalProperties:false,required:['command','target','parameters'],
      properties:{
        command:{type:'string',enum:[definition.command]},
        target:definition.target?schemaRule(id()):{anyOf:[schemaRule(id()),{type:'null'}]},
        parameters:{type:'object',additionalProperties:false,properties:params,required:Object.entries(definition.parameters).filter(([,x])=>x.required).map(([key])=>key)}
      }
    };
  }
  function catalogue(options={}){const catalog=catalogFor(options);return Object.values(definitions).map(definition=>({...copy(definition),schema:schemaForDefinition(definition,catalog)}));}
  function actionSchema(options={}){const catalog=catalogFor(options);return {anyOf:Object.values(definitions).filter(d=>d.execution==='editor').map(d=>schemaForDefinition(d,catalog))};}
  function checkValue(value,rule,label){
    if(rule.type==='object'){if(!plain(value)||Object.keys(value).length>16)fail(`Invalid ${label}.`);for(const [key,item] of Object.entries(value)){if(!/^[a-zA-Z][a-zA-Z0-9]{0,47}$/.test(key)||typeof item!=='number'||!Number.isFinite(item))fail(`Invalid ${label}.${key}.`);}return;}
    if(rule.type==='number'||rule.type==='integer'){if(typeof value!=='number'||!Number.isFinite(value)||rule.type==='integer'&&!Number.isSafeInteger(value)||value<rule.minimum||value>rule.maximum)fail(`Invalid ${label}.`);return;}
    if(typeof value!==rule.type)fail(`Invalid ${label}.`);
    if(rule.type==='string'&&(value.length<(rule.minLength||0)||value.length>(rule.maxLength||10000)||rule.pattern&&!new RegExp(rule.pattern).test(value)||rule.enum&&!rule.enum.includes(value)))fail(`Invalid ${label}.`);
  }
  function resolveClip(project,action){return (project.clips||[]).find(clip=>clip.id===(action.target==='selected_clip'?project.selected:action.target));}
  function locked(project,trackId){return project.trackStates?.[trackId]?.locked===true;}
  function visual(clip){return ['video','image','text','shape','solid'].includes(clip?.type);}
  function range(value,limits,label){if(!limits||typeof value!=='number'||value<limits[0]||value>limits[1])fail(`Invalid ${label}.`);}
  function libraryItem(catalog,key,value){const list=catalog[key];return Array.isArray(list)&&list.find(item=>(typeof item==='string'?item:item.id)===value);}
  function validateStructure(input,options={}){
    if(!plain(input)||Object.keys(input).some(key=>!['command','target','parameters'].includes(key))||typeof input.command!=='string'||!plain(input.parameters))fail('Malformed professional editing action.');
    const definition=definitions[input.command];if(!definition||definition.execution!=='editor')fail('This tool requires its separate verified workflow.');
    const action=copy(input),p=action.parameters,catalog=catalogFor(options);
    if(Object.keys(p).some(key=>!Object.hasOwn(definition.parameters,key)))fail(`Unknown ${action.command} parameter.`);
    for(const [key,rule] of Object.entries(definition.parameters)){if(p[key]===undefined){if(rule.required)fail(`Missing ${action.command}.${key}.`);}else checkValue(p[key],rule,`${action.command}.${key}`);}
    if(action.target!==undefined&&action.target!==null)checkValue(action.target,id(),`${action.command}.target`);
    if(definition.target&&(typeof action.target!=='string'||!action.target))fail('A clip target is required.');
    if(definition.catalogue&&!libraryItem(catalog,definition.catalogue,p.id))fail(`The requested ${definition.catalogue} ID is unavailable.`);
    if(['clip.set','visual.adjust','audio.set','keyframe.set'].includes(action.command))range(p.value,(action.command==='visual.adjust'?VISUAL_RANGES:action.command==='audio.set'?AUDIO_RANGES:CLIP_RANGES)[p.property],p.property);
    if(['text.add','text.style','caption.style'].includes(action.command)&&p.fontId&&!libraryItem(catalog,'fonts',p.fontId))fail('The requested font is unavailable.');
    if(action.command==='effect.apply'){const effect=(catalog.effectLibrary||root.ZorifiMotionEffects?.EFFECTS||[]).find(x=>x.id===p.id);if(!effect?.parameters)fail('The actual effect parameter definition is unavailable.');for(const [key,value] of Object.entries(p.params||{})){const rule=Object.hasOwn(effect.parameters,key)?effect.parameters[key]:null;if(!rule||value<rule.min||value>rule.max)fail(`Invalid effect parameter ${key}.`);}}
    return action;
  }
  function validateAction(input,project,options={}){
    const action=validateStructure(input,options),p=action.parameters,definition=definitions[action.command],catalog=catalogFor(options);
    if(!Array.isArray(project?.clips)||!Array.isArray(project?.mediaAssets))fail('A real editor project is required.');
    const clip=definition.target?resolveClip(project,action):null;
    if(definition.target&&!clip)fail('The target clip does not exist.');
    if(clip&&action.command!=='clip.select'&&(locked(project,clip.track)||clip.zorifiEnding))fail('The target clip is locked or is the automatic ending.');
    if(/^visual\.|^transition\.|^effect\.|^animation\./.test(action.command)&&!visual(clip))fail('This tool requires a visual clip.');
    if(/^audio\./.test(action.command)&&!['audio','video'].includes(clip.type))fail('This tool requires video or audio media.');
    if(/^text\.(?!add)/.test(action.command)&&clip.type!=='text')fail('This tool requires a text clip.');
    if(definition.catalogue&&!libraryItem(catalog,definition.catalogue,p.id))fail(`The requested ${definition.catalogue} ID is unavailable.`);
    if(['clip.set','visual.adjust','audio.set','keyframe.set'].includes(action.command))range(p.value,(action.command==='visual.adjust'?VISUAL_RANGES:action.command==='audio.set'?AUDIO_RANGES:CLIP_RANGES)[p.property],p.property);
    if(action.command==='clip.trim'&&(p.duration>clip.duration||p.duration===clip.duration))fail('Trim duration must shorten the selected clip.');
    if(action.command==='clip.split'&&(p.time<=clip.start+.05||p.time>=clip.start+clip.duration-.05))fail('Split time must be inside the clip.');
    if(action.command==='clip.move'&&(locked(project,p.track)||Tracks.kind(p.track)!==Tracks.kind(clip.track)))fail('The destination track is locked or has the wrong kind.');
    if(action.command==='audio.fade'&&(!Object.keys(p).length||(p.in||0)>clip.duration||(p.out||0)>clip.duration))fail('Audio fades must fit the selected clip.');
    if(action.command==='transition.apply'&&(p.duration??.6)>clip.duration)fail('The transition is longer than the selected clip.');
    if(action.command==='animation.apply'&&p.duration!==undefined&&p.duration>clip.duration)fail('The animation is longer than the selected clip.');
    if(['keyframe.set','keyframe.delete','effect.parameter'].includes(action.command)&&p.time!==undefined&&(p.time<clip.start||p.time>clip.start+clip.duration))fail('The keyframe must be inside the clip.');
    if(['effect.remove','effect.toggle','effect.parameter'].includes(action.command)&&!(clip.effectStack||[]).some(x=>x.id===p.instanceId))fail('The effect instance does not exist.');
    if(action.command==='animation.remove'&&!(clip.animations||[]).some(x=>x.id===p.instanceId))fail('The animation instance does not exist.');
    if(action.command==='effect.apply'||action.command==='effect.parameter'){
      const effectId=action.command==='effect.apply'?p.id:clip.effectStack.find(x=>x.id===p.instanceId).effectId;
      const effect=(catalog.effectLibrary||root.ZorifiMotionEffects?.EFFECTS||[]).find(x=>x.id===effectId);
      if(!effect?.parameters)fail('The actual effect parameter definition is unavailable.');
      const values=action.command==='effect.apply'?(p.params||{}):{[p.property]:p.value};
      for(const [key,value] of Object.entries(values)){const rule=Object.hasOwn(effect.parameters,key)?effect.parameters[key]:null;if(!rule||value<rule.min||value>rule.max)fail(`Invalid effect parameter ${key}.`);}
    }
    if((action.command==='text.style'||action.command==='caption.style')&&!Object.keys(p).length)fail('Choose at least one text style property.');
    if(['text.add','text.style','caption.style'].includes(action.command)&&p.fontId&&!libraryItem(catalog,'fonts',p.fontId))fail('The requested font is unavailable.');
    if(action.command==='caption.style'||action.command==='caption.delete'){const targets=project.clips.filter(x=>x.autoCaption);if(!targets.length||targets.some(x=>locked(project,x.track)))fail('Generated captions are unavailable or locked.');}
    if(definition.creation){if(project.clips.some(x=>x.id===p.id))fail('New clip IDs must be unique.');const kind=action.command==='text.add'?'text':project.mediaAssets.find(x=>x.id===p.mediaId)?.type==='audio'?'audio':'video';if(p.track!==undefined&&(locked(project,p.track)||Tracks.kind(p.track)!==kind))fail('The destination track is locked or has the wrong kind.');
      if(action.command==='clip.add'){const asset=project.mediaAssets.find(x=>x.id===p.mediaId);if(!asset||!['video','image','audio'].includes(asset.type)||!(asset.url||asset.builtin||asset.available===true))fail('The source media is unavailable.');if(asset.type==='image'&&((p.sourceStart||0)!==0||(p.playbackRate??1)!==1))fail('Still images use source start zero and normal playback speed.');if(asset.type!=='image'&&(!Number.isFinite(asset.duration)||asset.duration<=0||(p.sourceStart||0)+p.duration*(p.playbackRate||1)>asset.duration+.025))fail('The clip exceeds its source media.');}
    }
    if(action.command==='clip.set'&&p.property==='playbackRate'||action.command==='audio.set'&&p.property==='playbackRate'){const asset=project.mediaAssets.find(x=>x.id===clip.mediaId);if(asset&&asset.type!=='image'&&clip.duration*p.value+(clip.sourceStart||0)>asset.duration+.025)fail('This speed would exceed the available source.');}
    return action;
  }
  function validatePlan(actions,project,options={}){if(!Array.isArray(actions)||!actions.length||actions.length>(options.maxActions||MAX_ACTIONS))fail(`Use between 1 and ${options.maxActions||MAX_ACTIONS} actions.`);return actions.map(action=>validateStructure(action,options));}
  function applyCreation(project,input,options={}){
    const action=validateAction(input,project,options),p=action.parameters;if(!definitions[action.command].creation)fail('This is not a clip creation action.');
    const catalog=catalogFor(options),asset=action.command==='clip.add'?project.mediaAssets.find(x=>x.id===p.mediaId):null,type=asset?.type==='audio'?'audio':asset?'video':'text';
    const trackId=p.track??Tracks.id(type==='text'?'text':type==='audio'?'audio':'video',1);if(locked(project,trackId))fail('The destination track is locked.');
    const clip={id:p.id,type,name:asset?.name||p.text,start:p.start,duration:p.duration,track:trackId,opacity:100,volume:p.volume??(asset?.type==='image'?0:100),playbackRate:p.playbackRate??1,createdByVanessa:true};
    if(asset)Object.assign(clip,{mediaId:asset.id,sourceStart:p.sourceStart??0,scale:100,positionX:0,positionY:0,rotation:0,fit:p.fit||'contain',blendMode:'normal',localFile:Boolean(asset.localFile)});
    else{const fonts=catalog.fonts||[],font=fonts.find(x=>x.id===(p.fontId||'modern'));if(!font||typeof font==='string'||typeof font.family!=='string')fail('The actual font definition is unavailable.');Object.assign(clip,{fontId:font.id,fontFamily:font.family,fontSize:p.fontSize??44,fontWeight:p.fontWeight??700,color:p.color||'#ffffff',align:'center',style:'default',subtitle:'',bottom:p.position??20,letterSpacing:'-.045em',background:'transparent'});}
    project.clips.push(clip);project.selected=clip.id;return {status:'SUCCESS',clipId:clip.id,message:`Added ${clip.name}.`};
  }
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),near=(a,b)=>Math.abs(Number(a)-Number(b))<.00001;
  function verifyAction(action,before,after,options={}){
    const p=action.parameters||{},old=resolveClip(before,action),clip=resolveClip(after,action),command=action.command;
    const yes=condition=>{if(!condition)fail(`The editor did not verify ${command}.`);return true;};
    if(definitions[command]?.creation){const added=after.clips.find(x=>x.id===p.id);return yes(!before.clips.some(x=>x.id===p.id)&&after.clips.length===before.clips.length+1&&added&&near(added.start,p.start)&&near(added.duration,p.duration)&&(command==='text.add'?added.name===p.text:added.mediaId===p.mediaId));}
    if(command==='clip.select')return yes(after.selected===old?.id);
    if(command==='clip.delete'||command==='text.delete'||command==='clip.ripple_delete')return yes(old&&!after.clips.some(x=>x.id===old.id)&&after.clips.length===before.clips.length-1);
    if(command==='clip.split'){const pieces=after.clips.filter(x=>x.id===old.id||!before.clips.some(y=>y.id===x.id));return yes(after.clips.length===before.clips.length+1&&pieces.length===2&&pieces.some(x=>near(x.start,p.time))&&near(pieces.reduce((n,x)=>n+x.duration,0),old.duration));}
    if(command==='clip.trim')return yes(clip&&near(clip.duration,p.duration)&&near(clip.start,old.start)&&near(clip.sourceStart||0,(old.sourceStart||0)+(p.from==='start'?(old.duration-p.duration)*(old.playbackRate||1):0)));
    if(command==='clip.move')return yes(clip&&near(clip.start,p.start)&&clip.track===p.track);
    if(command==='clip.set'||command==='audio.set')return yes(clip&&near(clip[p.property],p.value));
    if(command==='visual.adjust')return yes(near(clip?.visualEffects?.adjustments?.[p.property],p.value));
    if(command==='visual.filter')return yes(clip?.visualEffects?.filter?.id===p.id&&near(clip.visualEffects.filter.intensity,p.intensity??100));
    if(command==='visual.remove_filter')return yes(clip?.visualEffects?.filter?.id==='none');
    if(command==='visual.effect')return yes(clip?.clipEffects?.includes(p.id));
    if(command==='visual.remove_effect')return yes(clip&&!clip.clipEffects?.includes(p.id));
    if(command==='visual.chroma')return yes(clip&&clip.chromaKey===(p.enabled!==false)&&clip.chromaColor===(p.color||old.chromaColor||'#00ff00')&&near(clip.chromaTolerance,p.tolerance??38)&&near(clip.chromaSoftness,p.softness??18)&&near(clip.chromaSpill,p.spill??45));
    if(command==='visual.mask')return yes(clip?.maskShape===p.shape&&near(clip.maskScale,p.scale??100)&&near(clip.maskX,p.x??0)&&near(clip.maskY,p.y??0)&&near(clip.maskFeather,p.feather??0));
    if(command==='effect.apply'){const added=(clip?.effectStack||[]).filter(x=>!(old.effectStack||[]).some(y=>y.id===x.id));return yes(added.length===1&&added[0].effectId===p.id&&Object.entries(p.params||{}).every(([key,v])=>near(added[0].params[key],v)));}
    if(command==='effect.remove')return yes(clip&&!(clip.effectStack||[]).some(x=>x.id===p.instanceId));
    if(command==='effect.toggle')return yes(clip?.effectStack?.find(x=>x.id===p.instanceId)?.enabled===p.enabled);
    if(command==='effect.parameter')return yes(near(clip?.effectStack?.find(x=>x.id===p.instanceId)?.params?.[p.property],p.value)&&(p.time===undefined||clip.keyframes?.[`fx:${p.instanceId}:${p.property}`]?.some(x=>near(x.time,p.time)&&near(x.value,p.value))));
    if(command==='animation.apply')return yes((clip?.animations||[]).length===(old.animations||[]).length+1&&(clip.animations||[]).some(x=>x.animationId===p.id&&!old.animations?.some(y=>y.id===x.id))&&Object.keys(clip.keyframes||{}).length>0);
    if(command==='animation.remove')return yes(clip&&!(clip.animations||[]).some(x=>x.id===p.instanceId));
    if(command==='audio.fade')return yes(clip&&Object.entries(p).every(([key,v])=>near(clip[key==='in'?'audioFadeIn':'audioFadeOut'],v)));
    if(command==='audio.mute')return yes(clip?.audioEffects?.muted===p.enabled);
    if(command==='audio.preset')return yes(clip?.audioEffects&&clip.audioPreset===p.id);
    if(command==='audio.noise_reduction')return yes(clip?.audioEffects?.noise?.enabled===(p.enabled!==false)&&near(clip.audioEffects.noise.amount,p.amount??65));
    if(['audio.compressor','audio.limiter','audio.ducking'].includes(command)){const section=clip?.audioEffects?.[command.split('.')[1]];return yes(section&&section.enabled===(p.enabled!==false)&&Object.entries(p).filter(([k])=>k!=='enabled').every(([k,v])=>near(section[k],v)));}
    if(command==='keyframe.set')return yes(clip?.keyframes?.[p.property]?.some(x=>near(x.time,p.time)&&near(x.value,p.value)));
    if(command==='keyframe.delete')return yes(clip&&!clip.keyframes?.[p.property]?.some(x=>Math.abs(x.time-p.time)<.06));
    if(command==='keyframe.animation')return yes(clip&&Object.values(clip.keyframes||{}).flat().length>=2&&!same(old.keyframes,clip.keyframes));
    if(command==='text.edit')return yes(clip?.name===p.text);
    if(command==='text.style'||command==='caption.style'){const targets=command==='text.style'?[clip]:after.clips.filter(x=>x.autoCaption);return yes(targets.length&&targets.every(x=>x&&(!p.fontId||x.fontId===p.fontId)&&(p.size===undefined||near(x.fontSize,p.size))&&(!p.color||x.color===p.color)&&(p.position===undefined||near(x.bottom,p.position))));}
    if(command==='caption.delete')return yes(!after.clips.some(x=>x.autoCaption));
    if(command==='transition.apply')return yes(clip?.transition===p.id&&near(clip.transitionDuration,p.duration??.6));
    if(command==='transition.remove')return yes(clip&&clip.transition==null&&clip.transitionDuration===undefined);
    if(command==='project.rename')return yes(after.currentProject===p.name);
    if(command==='project.ratio')return yes(String(after.ratio).replaceAll(' ','').replace('/',':')===p.value);
    if(command==='project.favorite')return yes(after.favorite===p.enabled);
    fail('No verified editor postcondition is registered for this action.');
  }
  function validateScope(actions,project,{targetIds,range}={}){
    if(!targetIds&&!range)return true;const targets=targetIds?new Set(targetIds):null,clips=new Map((project.clips||[]).map(clip=>[clip.id,copy(clip)]));
    if(targets&&!targets.size)fail('Select the section to fix, or give a timeline time containing media.');
    const inside=clip=>!range||clip.start>=range[0]-.001&&clip.start+clip.duration<=range[1]+.001;
    for(const action of actions){const definition=definitions[action.command],p=action.parameters,clip=clips.get(action.target);
      if(definition?.creation){if(targets||!inside({start:p.start,duration:p.duration}))fail('The proposal adds material outside the requested section.');clips.set(p.id,{id:p.id,start:p.start,duration:p.duration});continue;}
      if(!definition?.target||!clip||targets&&!targets.has(clip.id))fail('The proposal changes material outside the requested section.');
      if(action.command==='clip.split'&&range&&Math.abs(p.time-range[1])<.001&&clip.start>=range[0]&&clip.start<range[1]&&clip.start+clip.duration>range[1]){clip.duration=p.time-clip.start;continue;}
      if(action.command==='clip.select'&&range&&clip.start<range[1]&&clip.start+clip.duration>range[0])continue;
      if(!inside(clip)||action.command==='clip.move'&&!inside({start:p.start,duration:clip.duration}))fail('Split at the section boundary before changing a clip that extends outside it.');
      if(action.command==='clip.trim')clip.duration=p.duration;
      if(action.command==='clip.move')clip.start=p.start;
      if(['clip.delete','clip.ripple_delete','text.delete'].includes(action.command)){if(action.command==='clip.ripple_delete')fail('Ripple deletion could move material outside the requested section.');clips.delete(clip.id);}
    }return true;
  }
  return Object.freeze({VERSION,MAX_ACTIONS,DEFINITIONS:definitions,CLIP_RANGES,VISUAL_RANGES,AUDIO_RANGES,catalogue,actionSchema,validateStructure,validateAction,validatePlan,applyCreation,verifyAction,resolveClip,validateScope});
});
