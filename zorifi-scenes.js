(function(global){
  'use strict';

  const DIRECTIONS=['cinematic','energetic','creative','commercial'];
  const PACING=['slow','medium','fast','dynamic','experimental'];
  const OPERATION_TYPES=['set_scene_duration','move_scene','remove_scene','set_direction','set_scene_pacing','open_captions'];
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||min));
  const clean=(value,max=180)=>String(value||'').trim().slice(0,max);
  const unique=values=>[...new Set(values.filter(Boolean))];
  const id=(prefix='scene')=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  function analyseMedia(media){
    return (Array.isArray(media)?media:[]).map(item=>({
      id:clean(item.id,100),name:clean(item.name||'Untitled media',120),type:['video','audio','image'].includes(item.type)?item.type:'video',
      duration:clamp(item.duration||5,.1,21600),width:clamp(item.width||0,0,16384),height:clamp(item.height||0,0,16384),
      analysis:{source:'metadata',sceneChanges:[],importantMoments:[],speech:null,subjects:[],duplicateOf:null,notes:'Only reliable file metadata is available on this device. Visual and semantic analysis was not invented.'}
    })).filter(item=>item.id);
  }

  function inferBrief(prompt,direction){
    const text=clean(prompt,800).toLowerCase(),type=/football|sport|match|goal/.test(text)?'sports':/birthday|friend|memory|memories/.test(text)?'celebration':/travel|trip|holiday|vacation|city|beach/.test(text)?'travel':/funny|comedy|meme/.test(text)?'comedy':/product|brand|advert|promo/.test(text)?'promo':'story';
    const mood=direction==='energetic'?'bold and high-energy':direction==='creative'?'playful and unexpected':/emotional|memory|birthday/.test(text)?'warm and emotional':'cinematic and intentional';
    return {videoType:type,mood,style:direction,pacing:direction==='energetic'?'fast':direction==='creative'?'experimental':'slow-to-medium',story:direction==='energetic'?'hook, rapid highlights, peak, clean finish':direction==='creative'?'unexpected hook, contrast, playful escalation, visual payoff':'establish, develop, emotional highlight, resolve'};
  }

  function sceneBlueprint(direction,count){
    if(direction==='commercial')return ['Problem Setup','Product Reveal','Key Benefits','Call to Action'].map(purpose=>({purpose,pacing:'medium'}));
    if(direction==='energetic')return Array.from({length:Math.max(4,count+2)},(_,index)=>({purpose:index===0?'Immediate hook':index===Math.max(4,count+2)-1?'Final hit':index%3===0?'Peak moment':'Rapid highlight',pacing:'fast'}));
    if(direction==='creative')return Array.from({length:Math.max(4,count+1)},(_,index)=>({purpose:index===0?'Unexpected opening':index===Math.max(4,count+1)-1?'Alternative ending':index%2?'Visual contrast':'Creative reveal',pacing:index%2?'experimental':'dynamic'}));
    return [{purpose:'Introduction',pacing:'slow'},{purpose:'Story development',pacing:'medium'},{purpose:'Main memories',pacing:'medium'},{purpose:'Emotional highlight',pacing:'medium'},{purpose:'Ending',pacing:'slow'}].slice(0,Math.max(3,Math.min(5,count+1)));
  }

  function createScenePlan(input){
    const prompt=clean(input?.prompt,800),direction=DIRECTIONS.includes(input?.direction)?input.direction:'cinematic',media=analyseMedia(input?.media||input?.mediaItems);
    if(!prompt)throw new Error('Describe what you want Vanessa to create.');if(!media.length)throw new Error('Select at least one supported image or video file.');
    const visuals=media.filter(item=>item.type!=='audio'),audio=media.filter(item=>item.type==='audio');if(!visuals.length)throw new Error('Add a photo or video for the visual scenes. Audio can be added as the soundtrack.');const brief=inferBrief(prompt,direction),blueprint=sceneBlueprint(direction,visuals.length),availableDuration=visuals.reduce((sum,item)=>sum+(item.type==='image'?5:item.duration),0)||20;
    const base=direction==='energetic'?Math.max(.65,Math.min(2.2,availableDuration/blueprint.length)):direction==='creative'?Math.max(1.2,Math.min(4,availableDuration/blueprint.length)):Math.max(1.8,Math.min(5.5,availableDuration/blueprint.length));
    const transitions=input?.transitions?.length?input.transitions:['dissolve'],effects=input?.effects?.length?input.effects:['cinema'];
    const order=direction==='creative'&&visuals.length>2?[visuals[1],visuals.at(-1),visuals[0],...visuals.slice(2,-1)]:visuals;
    const scenes=blueprint.map((entry,index)=>{
      const primary=order[index%Math.max(1,order.length)],secondary=direction==='creative'&&order.length>1?order[(index+1)%order.length]:null,duration=Number((base*(direction==='cinematic'&&(index===0||index===blueprint.length-1)?1.25:1)).toFixed(2));
      return {id:id('scene'),purpose:entry.purpose,mediaIds:unique([primary?.id,secondary?.id]),duration,pacing:entry.pacing,transition:index===0?'none':direction==='energetic'?(transitions.find(value=>/whip|flash|zoom|glitch|velocity/i.test(value))||transitions[index%transitions.length]):direction==='creative'?(transitions[(index*2+1)%transitions.length]||'dissolve'):(transitions.find(value=>/dissolve|fade|film/i.test(value))||transitions[0]),text:index===0?clean(prompt.replace(/^(make|create|turn)\s+/i,''),70):index===blueprint.length-1?'Made with Zorifi':'',effects:unique([direction==='energetic'?(effects.find(value=>/shake|flash|glitch|punch|vivid/i.test(value))||effects[index%effects.length]):direction==='creative'?(effects[(index*2)%effects.length]||effects[0]):(effects.find(value=>/cinema|film|dream|warm/i.test(value))||effects[0])]),audio:{mediaId:audio[0]?.id||null,placement:index===0?'start':'continue',level:direction==='energetic'?58:42},notes:`${entry.purpose}; ${brief.mood}. Media selection is based on available metadata and user order.`};
    });
    return validateScenePlan({version:1,id:id('plan'),title:clean(prompt,70)||'Zorifi Scenes project',description:`${brief.videoType} · ${brief.mood} · ${brief.story}`,prompt,direction,brief,mediaIds:media.map(item=>item.id),createdAt:new Date().toISOString(),scenes},{mediaIds:media.map(item=>item.id),transitions,effects});
  }

  function validateScenePlan(plan,capabilities={}){
    if(!plan||typeof plan!=='object'||!Array.isArray(plan.scenes))throw new Error('Vanessa returned an invalid Scene Plan.');
    const mediaIds=new Set(capabilities.mediaIds||plan.mediaIds||[]),transitions=new Set(['none',...(capabilities.transitions||[])]),effects=new Set(capabilities.effects||[]);
    const scenes=plan.scenes.slice(0,40).map((scene,index)=>{
      if(!scene||typeof scene!=='object')throw new Error(`Scene ${index+1} is invalid.`);const sceneMedia=unique((scene.mediaIds||[scene.mediaId]).map(value=>clean(value,100))).filter(value=>mediaIds.has(value));if(!sceneMedia.length)throw new Error(`Scene ${index+1} does not reference available media.`);
      const transition=clean(scene.transition||'none',80),sceneEffects=unique((scene.effects||[]).map(value=>clean(value,80))).filter(value=>!effects.size||effects.has(value));
      return {id:clean(scene.id,100)||id('scene'),purpose:clean(scene.purpose||scene.title||`Scene ${index+1}`,100),mediaIds:sceneMedia,duration:clamp(scene.duration,.25,120),pacing:PACING.includes(scene.pacing)?scene.pacing:'medium',transition:transitions.has(transition)?transition:'none',text:clean(scene.text,180),effects:sceneEffects,audio:{mediaId:mediaIds.has(scene.audio?.mediaId)?scene.audio.mediaId:null,placement:['start','continue','none'].includes(scene.audio?.placement)?scene.audio.placement:'none',level:clamp(scene.audio?.level||42,0,200)},notes:clean(scene.notes||scene.description,300)};
    });
    if(!scenes.length)throw new Error('The Scene Plan must contain at least one scene.');
    const briefSource=plan.brief&&typeof plan.brief==='object'?plan.brief:{};
    const brief={videoType:clean(briefSource.videoType,80),mood:clean(briefSource.mood,120),style:clean(briefSource.style,80),pacing:clean(briefSource.pacing,80),story:clean(briefSource.story,220)};
    const referenced=unique(scenes.flatMap(scene=>scene.mediaIds).concat(scenes.map(scene=>scene.audio?.mediaId))).filter(value=>mediaIds.has(value));
    return {version:1,id:clean(plan.id,100)||id('plan'),title:clean(plan.title||'Zorifi Scenes project',70),description:clean(plan.description,240),prompt:clean(plan.prompt,800),direction:DIRECTIONS.includes(plan.direction)?plan.direction:'cinematic',brief,mediaIds:referenced,totalDuration:scenes.reduce((sum,scene)=>sum+scene.duration,0),status:'ready',createdAt:/^\d{4}-\d{2}-\d{2}T/.test(String(plan.createdAt||''))?String(plan.createdAt):new Date().toISOString(),scenes};
  }

  function remixPlan(plan,direction,capabilities){return createScenePlan({prompt:plan.prompt,direction:DIRECTIONS.includes(direction)?direction:'cinematic',media:(capabilities.media||[]).filter(item=>plan.mediaIds.includes(item.id)),transitions:capabilities.transitions,effects:capabilities.effects});}

  function planToOperations(plan,capabilities={}){
    const valid=validateScenePlan(plan,capabilities),operations=[];let start=0;
    valid.scenes.forEach((scene,index)=>{scene.mediaIds.forEach((mediaId,layer)=>operations.push({type:'add_clip',target:{sceneId:scene.id,mediaId},parameters:{start,duration:scene.duration,layer,transition:layer?'none':scene.transition,pacing:scene.pacing}}));if(scene.text)operations.push({type:'add_text',target:{sceneId:scene.id},parameters:{start,duration:scene.duration,text:scene.text,direction:valid.direction}});scene.effects.forEach(effectId=>operations.push({type:'add_effect',target:{sceneId:scene.id,effectId},parameters:{start,duration:scene.duration,strength:valid.direction==='energetic'?72:valid.direction==='creative'?62:48}}));start+=scene.duration;});
    const audioId=valid.scenes.map(scene=>scene.audio?.mediaId).find(Boolean);if(audioId)operations.push({type:'add_audio',target:{mediaId:audioId},parameters:{start:0,duration:start,level:valid.scenes[0].audio.level}});
    return validateEditingOperations(operations,{mediaIds:valid.mediaIds,sceneIds:valid.scenes.map(scene=>scene.id),effects:capabilities.effects||[]});
  }

  function validateEditingOperations(operations,capabilities={}){
    const mediaIds=new Set(capabilities.mediaIds||[]),sceneIds=new Set(capabilities.sceneIds||[]),effects=new Set(capabilities.effects||[]),allowed=new Set(['add_clip','add_text','add_effect','add_audio']);
    return (Array.isArray(operations)?operations:[]).map(operation=>{if(!operation||!allowed.has(operation.type))throw new Error('An unsupported editing operation was rejected.');const target=operation.target||{},parameters=operation.parameters||{};if(target.sceneId&&!sceneIds.has(target.sceneId))throw new Error('An editing operation referenced an unknown scene.');if((operation.type==='add_clip'||operation.type==='add_audio')&&!mediaIds.has(target.mediaId))throw new Error('An editing operation referenced missing media.');if(operation.type==='add_effect'&&effects.size&&!effects.has(target.effectId))throw new Error('An editing operation referenced an unavailable effect.');return {type:operation.type,target:{...target},parameters:{...parameters,start:clamp(parameters.start||0,0,21600),duration:clamp(parameters.duration||1,.1,21600)}};});
  }

  function commandToOperation(command,plan){
    const text=clean(command,500).toLowerCase(),scenes=plan?.scenes||[];if(!scenes.length)return null;
    const numbered=Number(text.match(/scene\s+(\d+)/)?.[1]||0),sceneId=numbered&&scenes[numbered-1]?.id;
    if(/add captions|create captions|generate captions/.test(text))return {type:'open_captions',target:{},parameters:{}};
    if(/remove|delete/.test(text)&&sceneId)return {type:'remove_scene',target:{sceneId},parameters:{}};
    if(/intro.*short|shorter.*intro/.test(text))return {type:'set_scene_duration',target:{sceneId:scenes[0].id},parameters:{duration:Math.max(.5,scenes[0].duration*.65)}};
    if(/slow down/.test(text))return {type:'set_scene_pacing',target:{sceneId:sceneId||scenes[Math.min(1,scenes.length-1)].id},parameters:{pacing:'slow',duration:(sceneId?scenes[numbered-1]:scenes[Math.min(1,scenes.length-1)]).duration*1.35}};
    if(/energetic/.test(text))return {type:'set_direction',target:{},parameters:{direction:'energetic'}};if(/creative|experimental/.test(text))return {type:'set_direction',target:{},parameters:{direction:'creative'}};if(/dramatic|cinematic/.test(text))return {type:'set_direction',target:{},parameters:{direction:'cinematic'}};
    if(/best clip.*begin|best clip.*start|move.*beginning/.test(text))return {type:'move_scene',target:{sceneId:scenes[Math.floor(scenes.length/2)].id},parameters:{index:0}};
    return null;
  }

  function applyPlanOperation(plan,operation,capabilities={}){
    if(!operation||!OPERATION_TYPES.includes(operation.type))throw new Error('Vanessa suggested an unsupported Scene operation.');const copy=JSON.parse(JSON.stringify(plan)),index=copy.scenes.findIndex(scene=>scene.id===operation.target?.sceneId);
    if(['set_scene_duration','move_scene','remove_scene','set_scene_pacing'].includes(operation.type)&&index<0)throw new Error('The requested scene no longer exists.');
    if(operation.type==='remove_scene'){if(copy.scenes.length===1)throw new Error('A Scene Plan must keep at least one scene.');copy.scenes.splice(index,1);}if(operation.type==='move_scene'){const [scene]=copy.scenes.splice(index,1);copy.scenes.splice(clamp(operation.parameters?.index,0,copy.scenes.length),0,scene);}if(operation.type==='set_scene_duration')copy.scenes[index].duration=clamp(operation.parameters?.duration,.25,120);if(operation.type==='set_scene_pacing'){copy.scenes[index].pacing=PACING.includes(operation.parameters?.pacing)?operation.parameters.pacing:'medium';if(operation.parameters?.duration)copy.scenes[index].duration=clamp(operation.parameters.duration,.25,120);}if(operation.type==='set_direction')copy.direction=DIRECTIONS.includes(operation.parameters?.direction)?operation.parameters.direction:copy.direction;
    return validateScenePlan(copy,capabilities);
  }

  class ZorifiScenePlanner{
    constructor(){this.currentPlan=null;}
    createScenePlan(input){this.currentPlan=createScenePlan(input);return this.currentPlan;}
    validateScenePlan(plan,capabilities={}){return validateScenePlan(plan,capabilities);}
    applyToTimeline(state,plan){
      if(!state||!Array.isArray(state.clips)||!Array.isArray(state.mediaAssets))throw new Error('A project with clips and media assets is required.');
      const assets=new Map(state.mediaAssets.map(asset=>[asset.id,asset]));
      if(!plan?.scenes?.every(scene=>Number.isFinite(Number(scene.duration))&&Number(scene.duration)>0))throw new Error('Every scene needs a positive finite duration.');
      const valid=validateScenePlan(plan,{mediaIds:[...assets.keys()]});
      // Prepare everything before changing state. Never replace missing media with unrelated footage.
      const additions=[];let cursor=state.clips.reduce((end,clip)=>Math.max(end,(Number(clip.start)||0)+(Number(clip.duration)||0)),0);
      const offset=cursor;
      for(const scene of valid.scenes){
        for(const [layer,mediaId] of scene.mediaIds.entries()){
          const asset=assets.get(mediaId);if(!['video','image'].includes(asset.type))throw new Error('Visual scenes require image or video media.');
          if(asset.type==='video'&&(!Number.isFinite(Number(asset.duration))||Number(asset.duration)<=0))throw new Error('Video duration metadata is required.');
          if(asset.type==='video'&&scene.duration>Number(asset.duration))throw new Error('Trim the scene duration to fit its source video.');
          additions.push({id:id('scene-clip'),mediaId,type:asset.type,name:scene.purpose,start:cursor,duration:scene.duration,sourceStart:0,track:layer?layer+3:0,opacity:100,volume:asset.type==='video'?100:0,playbackRate:1,scale:100,positionX:0,positionY:0,rotation:0,fit:'cover',sceneGenerated:true,sceneId:scene.id,transition:scene.transition==='none'?null:scene.transition});
        }
        if(scene.text)additions.push({id:id('scene-text'),type:'text',name:scene.text,start:cursor,duration:scene.duration,track:2,opacity:100,fontFamily:'Arial, sans-serif',fontSize:30,fontWeight:700,color:'#ffffff',align:'center',bottom:12,sceneGenerated:true,sceneId:scene.id});
        scene.effects.forEach((effectId,index)=>additions.push({id:id('scene-effect'),type:'effect',effectId,name:effectId,start:cursor,duration:scene.duration,track:index?299+index:3,strength:48,opacity:100,sceneGenerated:true,sceneId:scene.id}));
        cursor+=scene.duration;
      }
      const audioId=valid.scenes.map(scene=>scene.audio.mediaId).find(Boolean);
      if(audioId){const asset=assets.get(audioId);if(asset.type!=='audio'||!Number.isFinite(Number(asset.duration))||Number(asset.duration)<=0)throw new Error('Soundtrack needs valid audio duration metadata.');additions.push({id:id('scene-audio'),type:'audio',mediaId:audioId,name:asset.name||'Scene audio',start:offset,duration:Math.min(valid.totalDuration,Number(asset.duration)),sourceStart:0,track:1,volume:valid.scenes[0].audio.level,opacity:100,playbackRate:1,sceneGenerated:true,sceneId:'scene-audio'});}
      state.clips=[...state.clips,...additions];state.scenePlan=valid;state.duration=Math.max(Number(state.duration)||0,cursor);this.currentPlan=valid;return state;
    }
  }
  global.ZorifiScenePlanner=ZorifiScenePlanner;
  global.ZorifiScenes=Object.freeze({ZorifiScenePlanner,directions:[...DIRECTIONS],analyseMedia,createScenePlan,validateScenePlan,remixPlan,planToOperations,validateEditingOperations,commandToOperation,applyPlanOperation});
})(window);
