/* Shared, staged director workflow. The application supplies permissioned I/O. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiStudioDirector=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const clean=value=>String(value||'').trim();
 function classifyIntent(value){
  const text=clean(value).toLowerCase().replace(/^(?:hey\s+)?vanessa[,!\s]*/,'').replace(/^(?:please\s+|(?:can|could|would|will) you (?:please )?)+/,'');
  if(!text||/^(?:what|who|why|when|where|how|explain|tell me|do you|can you explain)\b/.test(text))return {music:false,video:false,kind:'conversational'};
  const action=/\b(?:make|create|generate|compose|produce|build|assemble|plan|storyboard|write|turn)\b/.test(text);
  const video=action&&(/\b(?:make|create|build|assemble|plan|storyboard|turn)\b(?:(?!\b(?:music|soundtrack|beat|song|track|score|about|for|text|captions?|subtitles?|keyframes?|effects?|transitions?|overlay|markers?)\b)[^.!?;]){0,100}\b(?:montage|teaser|storyboard|scene plan|scenes?|edit)\b/.test(text)||/\bvideo\b.*\b(?:from|using|with)\b.*\b(?:my|these|selected|imported|existing|footage|clips|media|photos)\b/.test(text));
  const noMusic=/\b(?:don['’]?t|do not|never)\s+(?:\w+\s+){0,3}(?:generate|create|make|compose|add)\s+(?:\w+\s+){0,3}(?:music|soundtrack|beat|song|track)\b|\bwithout\s+(?:any\s+)?(?:music|soundtrack)\b/.test(text);
  const music=action&&!noMusic&&(text.split(/\band\b|\bthen\b|[.;]/).some(clause=>/\b(?:generate|create|make|compose|produce|write)\b(?:(?!\b(?:captions?|subtitles?|text|keyframes?|effects?|markers?)\b)[^.!?;]){0,120}\b(?:music(?!\s+video)|soundtrack|beat(?!\s+markers?)|song|score)\b|\b(?:generate|compose|produce)\b(?:(?!\b(?:captions?|subtitles?|text|markers?)\b)[^.!?;]){0,90}\btrack\b/.test(clause))||video&&/\bwith\b[^.!?;]{0,70}\b(?:music(?!\s+video)|soundtrack|score)\b/.test(text))&&!/\b(?:my|the|an?)\s+(?:existing|imported|selected|uploaded)\s+(?:music|soundtrack|song|track)\b/.test(text);
  const kind=video&&music?'combined':video?'video':music?'music':'conversational';return {music,video,kind};
 }
 function musicSettings(prompt,state={},studio={}){
  const text=prompt.toLowerCase(),previous=state.creatorSettings?.musicStudio||{},fast=/\b(?:upbeat|fast|energetic|driving)\b/.test(text),tempo=text.match(/\b(\d{2,3})\s*bpm\b/),duration=text.match(/\b(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/),key=prompt.match(/\b([A-G](?:#|b)?)\s+(major|minor|pentatonic)\b/i);
  const genre=/\bsynthwave\b/.test(text)?'Synthwave':/\b(?:lo[- ]?fi)\b/.test(text)?'Lo-Fi':/\bhip[- ]?hop\b/.test(text)?'Hip-Hop':/\bjazz\b/.test(text)?'Jazz':fast?'Electronic Pop':'Cinematic Ambient';
  const settings={...previous,prompt,genre,mood:fast?'Energetic and driving':'Moody and atmospheric',bpm:tempo?Number(tempo[1]):fast?128:Number(previous.bpm)||92,key:key?key[1][0].toUpperCase()+key[1].slice(1):previous.key||'D',scaleMode:key?key[2].toLowerCase():previous.scaleMode||'minor',timeSignature:previous.timeSignature||'4/4',duration:duration?Number(duration[1]):30,vocals:/\b(?:with vocals|include vocals|singing)\b/.test(text)?'vocal':'instrumental',requestedStems:[]};
  if(typeof studio.buildAIMusicPrompt!=='function')throw new Error('The music studio is not connected to Vanessa.');
  studio.buildAIMusicPrompt({genre:settings.genre,mood:settings.mood,tempoBpm:settings.bpm,musicalKey:`${settings.key} ${settings.scaleMode}`,timeSignature:settings.timeSignature,durationSeconds:settings.duration});
  const payload=typeof studio.providerPayload==='function'?studio.providerPayload(settings):{prompt,genre:settings.genre,mood:settings.mood,bpm:settings.bpm,tempo:settings.bpm,key:settings.key,scaleMode:settings.scaleMode,timeSignature:settings.timeSignature,duration:settings.duration,vocals:settings.vocals};
  return {settings,payload};
 }
 function validatePlan(planner,raw,media,capabilities={}){
  if(!raw||!Array.isArray(raw.scenes)||!raw.scenes.length||raw.scenes.length>40)throw new Error('The director returned an invalid scene plan.');
  const byId=new Map(media.map(item=>[item.id,item])),effects=new Set(capabilities.effects||[]),transitions=new Set(['none',...(capabilities.transitions||[])]);
  for(const scene of raw.scenes){const ids=scene.mediaIds||[scene.mediaId];if(!ids.length||ids.some(id=>!byId.has(id)))throw new Error('The scene plan references missing media.');if(ids.some(id=>!['image','video'].includes(byId.get(id).type)))throw new Error('Scene visuals must be photos or video clips.');if(!Number.isFinite(Number(scene.duration))||Number(scene.duration)<=0||Number(scene.duration)>120)throw new Error('Scene durations must be positive and no longer than 120 seconds.');if(ids.some(id=>byId.get(id).type==='video'&&(!Number.isFinite(Number(byId.get(id).duration))||Number(scene.duration)>Number(byId.get(id).duration))))throw new Error('A scene is longer than its source video.');if(effects.size&&(scene.effects||[]).some(id=>!effects.has(id)))throw new Error('The scene plan references an unavailable effect.');if(capabilities.transitions&&!transitions.has(scene.transition||'none'))throw new Error('The scene plan references an unavailable transition.');if(scene.audio?.mediaId&&(!byId.has(scene.audio.mediaId)||byId.get(scene.audio.mediaId).type!=='audio'))throw new Error('The scene soundtrack references unavailable audio.');}
  const valid=planner.validateScenePlan(raw,{...capabilities,mediaIds:[...byId.keys()]});
  if(valid.scenes.some(scene=>scene.mediaIds.some(id=>byId.get(id).type==='video'&&scene.duration>Number(byId.get(id).duration))))throw new Error('A scene is longer than its source video.');
  return valid;
 }
 class ZorifiVanessaStudioDirector{
  constructor(aiGateway,scenePlanner,audioStudio,hooks={}){this.aiGateway=aiGateway;this.scenePlanner=scenePlanner;this.audioStudio=audioStudio;this.hooks=hooks;this.busy=false;this.closed=false;this.controller=null;this.status={stage:'idle'};}
  processUserPrompt(prompt){const app=root.ZorifiMasterApp;if(!app)throw new Error('Open Zorifi before using Vanessa’s studio director.');return app.consultVanessa(prompt);}
  cancel(){this.controller?.abort(Object.assign(new Error('Studio direction was cancelled.'),{name:'AbortError'}));}
  dispose(){this.closed=true;this.cancel();}
  async executeDirectorCommand(userIntent,editorState,mediaItems=editorState?.mediaAssets||[],{signal}={}){
   const prompt=clean(userIntent);if(!prompt||prompt.length>4000)throw new Error('Describe the studio request in 1–4000 characters.');
   if(!this.hooks.commit){const app=root.ZorifiMasterApp;if(app?.studioDirector&&app.studioDirector!==this)return app.executeDirectorCommand(prompt,mediaItems,{signal});throw new Error('Connect the director to a running Zorifi workspace before applying edits.');}
   if(this.closed)throw new Error('The studio director has closed.');if(this.busy)throw new Error('Vanessa is already directing a studio request.');
   const intent=classifyIntent(prompt);if(intent.kind==='conversational')return {type:'conversational',kind:intent.kind,status:'UNHANDLED',message:'I’m listening. I can plan an edit from your media, create a soundtrack, or build both together.'};
   if(!editorState||!editorState.projectId||!Array.isArray(editorState.clips)||!Array.isArray(editorState.mediaAssets))throw new Error('Open a video or music project first.');
   const media=mediaItems.filter(item=>item&&!item.zorifiEnding),projectId=editorState.projectId,scope=this.hooks.getScope?.(editorState,media)||{projectId},capabilities=scope.capabilities||{};
   if(intent.video&&!media.some(item=>['image','video'].includes(item.type)))throw new Error('Import at least one photo or video before asking Vanessa to plan an edit.');
   const controller=new AbortController(),abort=()=>controller.abort(signal.reason||Object.assign(new Error('Studio direction was cancelled.'),{name:'AbortError'}));this.controller=controller;this.busy=true;
   if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
   const check=()=>{if(controller.signal.aborted)throw controller.signal.reason;if(this.closed||editorState.projectId!==projectId||this.hooks.isCurrent?.(scope)===false)throw new Error('The account, project or source media changed. The studio result was not applied.');};
   const progress=stage=>{this.status={stage,kind:intent.kind,projectId};try{this.hooks.onProgress?.(this.status);}catch{/* Status observers cannot change whether a transaction succeeded. */}};
   let plan=null,result=null,music=null,committed=false,settings=null,planning=null;
   const direction=/\bcommercial\b/i.test(prompt)?'commercial':/\b(?:energetic|fast|upbeat)\b/i.test(prompt)?'energetic':/\bcreative\b/i.test(prompt)?'creative':'cinematic';
   try{
    check();
    if(intent.video){progress('planning');planning=this.hooks.requestScenePlan?await this.hooks.requestScenePlan({prompt,direction,media,capabilities,signal:controller.signal}):await this.scenePlanner.createScenePlan({prompt,direction,mediaItems:media,...capabilities});check();plan=validatePlan(this.scenePlanner,planning.plan||planning,media,capabilities);if(intent.music)plan={...plan,scenes:plan.scenes.map(scene=>({...scene,audio:{...scene.audio,mediaId:null,placement:'none'}}))};}
    if(intent.music){const brief=musicSettings(prompt,editorState,this.audioStudio);settings=brief.settings;progress('generating-music');result=this.hooks.generateMusic?await this.hooks.generateMusic({prompt,settings,payload:brief.payload,scope,signal:controller.signal}):await this.aiGateway.generateAIResponse('vanessa-music',{action:'start',...brief.payload},{signal:controller.signal});check();if(result?.status!=='complete'||!result.url||!/^https:\/\/|^data:audio\/(?:mpeg|mp3|wav|ogg|webm|mp4);base64,/i.test(result.url))throw new Error('Music generation did not return completed, playable audio.');if(typeof this.hooks.prepareMusic!=='function')throw new Error('The audio importer is not connected to the studio director.');progress('preparing-audio');music=await this.hooks.prepareMusic(result,{settings,signal:controller.signal,scope});check();if(!music?.asset||!Number.isFinite(Number(music.sourceDuration))||Number(music.sourceDuration)<=0)throw new Error('Generated music could not be decoded and prepared.');}
    check();progress('applying');const applied=this.hooks.commit({plan,music,settings,direction,prompt,scope,signal:controller.signal,result});if(applied&&typeof applied.then==='function')throw new Error('Studio commits must be synchronous after media preparation.');committed=true;progress('complete');
    const sceneCount=plan?.scenes.length||0,seconds=plan?Number(plan.totalDuration.toFixed(2)):Number(Number(applied?.musicDuration??music.sourceDuration).toFixed(2));
    const message=(intent.kind==='combined'?`Added ${sceneCount} editable scenes and the generated soundtrack to your project in one undoable action.`:intent.video?`Added ${sceneCount} ${direction} scenes (${seconds}s) to your timeline.`:`Added ${seconds}s of generated ${settings.genre} music to your project.`)+(planning?.planner==='device'?' The scene plan used the on-device planner.':'');
    return {type:intent.kind==='combined'?'studio_directed':intent.video?'video_planned':'music_generated',kind:intent.kind,status:'SUCCESS',message,reply:message,plan,music:result,applied,planner:planning?.planner,warning:planning?.warning||'',state:editorState};
   }catch(error){progress(controller.signal.aborted?'cancelled':'failed');throw error;}
   finally{signal?.removeEventListener('abort',abort);if(music&&!committed)try{await this.hooks.release?.(music);}catch{this.status={...this.status,cleanupWarning:'Staged audio could not be completely removed.'};}this.controller=null;this.busy=false;}
  }
 }
 return {ZorifiVanessaStudioDirector,classifyIntent,musicSettings,validatePlan};
});
