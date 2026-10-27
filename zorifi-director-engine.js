/* Vanessa's companion lifecycle and scoped execution, using the live app's tools. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiDirectorEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const clean=value=>String(value||'').trim();
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const nonnegative=value=>Math.max(0,finite(value));
  function abortError(message='Vanessa’s director request was cancelled.'){
    const error=new Error(message);error.name='AbortError';return error;
  }
  function classifyIntent(input){
    const text=clean(input).toLowerCase().replace(/^(?:hey\s+)?vanessa[,!\s]*/,'');
    if(!text)return 'conversational';
    if(/^(?:how\b|(?:can|could|would) you\s+(?:show|explain|teach|guide)\b)|\b(?:what should i|guide me|teach me|show me how|help me understand)\b/.test(text))return 'guidance';
    // Discussion of autonomy is not permission to change the timeline.
    if(/^(?:what|why|when|where|who|explain|tell me about|does|do you|is it|are you|would it|should i)\b/.test(text))return 'conversational';
    if(/\b(?:don['’]?t|do not|never|without)\s+(?:\w+\s+){0,3}(?:take\s*over|edit|change|modify|rearrange)\b/.test(text))return 'conversational';
    const command=text.replace(/^(?:please\s+|(?:can|could|would|will) you (?:please )?)+/,'');
    if(/^(?:take\s*over(?:\s+(?:the|this|my|and|editing|edit|timeline|project|video)\b|[.!?,]|$)|(?:help me\s+)?edit\s+(?:it|this|my|the)\b|help me edit\b|make\s+(?:this|my|the)\s+(?:video|edit|project)\s+(?:look\s+)?(?:professional|polished|better)\b)/.test(command))return 'takeover';
    if(/\b(?:how (?:do|can|should)|where (?:do|can|should) i start|i (?:don['’]?t|do not) know where to start)\b/.test(text))return 'guidance';
    return 'conversational';
  }
  function skillLevelFromInput(input,current='unknown'){
    const text=clean(input).toLowerCase();
    // A technical term alone says nothing reliable about someone's ability.
    if(/\b(?:i(?:['’]m| am)\s+(?:an?\s+)?(?:complete\s+|total\s+)?(?:beginner|new to (?:editing|video editing)|novice)|my (?:editing )?skill level is beginner)\b/.test(text))return 'beginner';
    if(/\b(?:i(?:['’]m| am)\s+(?:an?\s+)?(?:intermediate(?:\s+editor)?|not (?:a )?beginner)|my (?:editing )?skill level is intermediate)\b/.test(text))return 'intermediate';
    if(/\b(?:i(?:['’]m| am)\s+(?:an?\s+)?(?:professional|experienced|advanced)(?:\s+(?:video\s+)?editor)?|my (?:editing )?skill level is (?:professional|advanced))\b/.test(text))return 'professional';
    return ['unknown','beginner','intermediate','professional'].includes(current)?current:'unknown';
  }
  function analyzeProjectContext(state={}){
    const clips=Array.isArray(state.clips)?state.clips:[],assets=new Map((Array.isArray(state.mediaAssets)?state.mediaAssets:[]).map(asset=>[asset.id,asset]));
    const measured=clips.map(clip=>{
      const asset=assets.get(clip.mediaId),duration=nonnegative(clip.duration),sourceStart=nonnegative(clip.sourceStart),rate=Math.abs(finite(clip.playbackRate,1))||1;
      const sourceDuration=asset&&asset.duration!==null&&asset.duration!==undefined&&asset.duration!==''&&Number.isFinite(Number(asset.duration))&&Number(asset.duration)>=0?Number(asset.duration):null;
      const sourceEnd=sourceStart+duration*rate;
      return {id:clip.id,name:clean(clip.name),type:clip.type,mediaType:asset?.type||null,track:clip.track,start:nonnegative(clip.start),duration,end:nonnegative(clip.start)+duration,sourceStart,sourceEnd,sourceDuration,playbackRate:rate,withinSourceBounds:sourceDuration===null?null:sourceStart<=sourceDuration&&sourceEnd<=sourceDuration+.001,locked:Boolean(state.trackStates?.[clip.track]?.locked),automaticEnding:Boolean(clip.zorifiEnding&&clip.endingAutoPlaced)};
    });
    const visuals=measured.filter(clip=>['video','image'].includes(clip.type)&&!clip.automaticEnding).sort((a,b)=>a.start-b.start||finite(a.track)-finite(b.track)||String(a.id).localeCompare(String(b.id)));
    const audio=measured.filter(clip=>clip.type==='audio'),durations=visuals.map(clip=>clip.duration).sort((a,b)=>a-b),median=durations.length?(durations[Math.floor((durations.length-1)/2)]+durations[Math.ceil((durations.length-1)/2)])/2:0;
    const gaps=[];let visualEnd=0;
    for(const clip of visuals){if(clip.start>visualEnd+.001)gaps.push({start:visualEnd,end:clip.start,duration:clip.start-visualEnd});visualEnd=Math.max(visualEnd,clip.end);}
    const first=visuals[0]||null,contentDuration=measured.reduce((end,clip)=>Math.max(end,clip.end),0);
    return {projectId:state.projectId||null,view:state.view||null,selectedClipId:state.selected||null,clipCount:clips.length,visualClipCount:visuals.length,audioClipCount:audio.length,textClipCount:measured.filter(clip=>clip.type==='text').length,effectClipCount:measured.filter(clip=>clip.type==='effect').length,trackCount:new Set(clips.map(clip=>clip.track).filter(track=>track!==undefined&&track!==null)).size,totalDuration:nonnegative(state.duration),contentDuration,hasAudio:audio.length>0,isPlaying:Boolean(state.isPlaying||state.playing),openingClip:first,visualClips:visuals,audioClips:audio,clips:measured,gaps,pacing:!first?'no_visual_clips':first.duration>7?'long_opening':'measured_durations',pacingEvidence:{basis:'timeline-duration-only',openingDuration:first?.duration||0,medianVisualDuration:median,longOpening:Boolean(first&&first.duration>7),semanticAnalysis:false}};
  }
  function awaitWithAbort(value,signal){
    if(signal.aborted)return Promise.reject(signal.reason||abortError());
    return new Promise((resolve,reject)=>{
      const abort=()=>reject(signal.reason||abortError());signal.addEventListener('abort',abort,{once:true});
      Promise.resolve(value).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
    });
  }

  class ZorifiVanessaDirectorEngine{
    constructor(editorStore,aiGateway,options={}){
      this.editorStore=editorStore;this.aiGateway=aiGateway;this.options=options;
      this.isActive=false;this.isEditingMode=false;this.currentMode='companion';this.userSkillLevel='unknown';
      this.closed=false;this.busy=false;this.controller=null;this.recognition=null;this.isListeningForWakeWord=false;
      this.inactivityTimer=null;this.inactivityThresholdMs=Math.max(1,finite(options.inactivityThresholdMs,15000));
      this.idleCooldownMs=Math.max(0,finite(options.idleCooldownMs,180000));
      const clock=options.clock||{};
      this._now=options.now||clock.now?.bind(clock)||Date.now;
      // Browser timer functions need their Window receiver; never call a raw
      // window.setTimeout with the engine instance as `this`.
      this._setTimeout=options.setTimeout||clock.setTimeout?.bind(clock)||((callback,delay)=>setTimeout(callback,delay));
      this._clearTimeout=options.clearTimeout||clock.clearTimeout?.bind(clock)||(timer=>clearTimeout(timer));
      this.lastInteractionTime=this._now();this._interaction=0;this._promptedInteraction=-1;this._lastIdlePrompt=-Infinity;this._cleanups=new Map();
    }
    _state(){const state=typeof this.editorStore==='function'?this.editorStore():this.editorStore;return state&&typeof state==='object'?state:{};}
    _assertOpen(){if(this.closed)throw new Error('Vanessa’s director engine has closed.');}
    _error(error){try{this.options.onError?.(error);}catch{/* Error observers do not control the engine. */}}
    _initHook(name){if(this._cleanups.has(name))return;const cleanup=this.options[name]?.(this);this._cleanups.set(name,typeof cleanup==='function'?cleanup:null);}
    initDOMUI(){this._assertOpen();this._initHook('initDOMUI');}
    initVoiceWakeWord(){this._assertOpen();this._initHook('initVoiceWakeWord');}
    initInactivityTracker(){this._assertOpen();this.recordInteraction();}
    start(){
      this._assertOpen();if(this.isActive)return this;this.isActive=true;
      try{this.initDOMUI();this.initVoiceWakeWord();this.initInactivityTracker();}catch(error){this.stop();throw error;}
      return this;
    }
    stop(){
      this.isActive=false;this._clearIdle();this.cancel();
      for(const cleanup of this._cleanups.values())try{cleanup?.();}catch(error){this._error(error);}
      this._cleanups.clear();this.isListeningForWakeWord=false;return this;
    }
    dispose(){if(this.closed)return;this.stop();this.closed=true;}
    setMode(mode){
      this._assertOpen();if(!['companion','director'].includes(mode))throw new Error('Choose companion or director mode.');
      if(this.currentMode===mode)return mode;
      this.currentMode=mode;if(mode==='companion')this.cancel();
      try{this.options.onModeChange?.(mode);}catch(error){this._error(error);}
      return mode;
    }
    analyzeProjectContext(){return analyzeProjectContext(this._state());}
    detectPacingQuality(){return this.analyzeProjectContext().pacing;}
    classifyIntent(input){return classifyIntent(input);}
    observeUserSkillLevel(input){this.userSkillLevel=skillLevelFromInput(input,this.userSkillLevel);return this.userSkillLevel;}
    speak(text){this._assertOpen();const message=clean(text);if(message)this.options.onSpeak?.(message);return message;}
    toggleChatPanel(){this._assertOpen();return this.options.toggleChatPanel?.();}
    openChatAndListen(){this._assertOpen();return this.options.openChatAndListen?this.options.openChatAndListen():this.toggleChatPanel();}
    _clearIdle(){if(this.inactivityTimer!==null){this._clearTimeout(this.inactivityTimer);this.inactivityTimer=null;}}
    _scheduleIdle(delay){
      this._clearIdle();if(!this.isActive||this.closed||this._promptedInteraction===this._interaction)return;
      this.inactivityTimer=this._setTimeout(()=>{this.inactivityTimer=null;this.onUserInactive();if(this.isActive&&this._promptedInteraction!==this._interaction)this._scheduleIdle(Math.min(this.inactivityThresholdMs,10000));},Math.max(1,delay));
    }
    recordInteraction(){
      if(this.closed)return;this.lastInteractionTime=this._now();this._interaction++;
      this._scheduleIdle(this.inactivityThresholdMs);
    }
    onUserInactive(){
      if(!this.isActive||this.closed||this.busy||this.isEditingMode||this._promptedInteraction===this._interaction||typeof this.options.onIdle!=='function')return false;
      const now=this._now();if(now-this.lastInteractionTime<this.inactivityThresholdMs||now-this._lastIdlePrompt<this.idleCooldownMs)return false;
      const analysis=this.analyzeProjectContext();if(analysis.isPlaying)return false;
      let scope;try{scope=this.options.getScope?.(this._state(),analysis);if(this.options.isCurrent?.(scope)===false||this.options.canPrompt?.({analysis,scope})===false)return false;}catch(error){this._error(error);return false;}
      this._promptedInteraction=this._interaction;this._lastIdlePrompt=now;this._clearIdle();
      try{Promise.resolve(this.options.onIdle({analysis,scope,userSkillLevel:this.userSkillLevel})).catch(error=>this._error(error));}catch(error){this._error(error);}
      return true;
    }
    cancel(){if(!this.controller||this.controller.signal.aborted)return false;this.controller.abort(abortError());return true;}
    _captureScope(analysis){const editor=this._state();return {editor,projectId:editor.projectId,custom:this.options.getScope?.(editor,analysis)};}
    _checkCurrent(captured,signal){
      if(signal.aborted)throw signal.reason||abortError();
      const state=this._state();if(this.closed||state!==captured.editor||state.projectId!==captured.projectId||this.options.isCurrent?.(captured.custom)===false)throw abortError('The account, project or selected media changed. The director result was not applied.');
    }
    async _runRequest(kind,instruction,handler,{signal,analysis=this.analyzeProjectContext()}={}){
      this._assertOpen();if(this.busy)throw new Error('Vanessa is already handling a director request.');
      if(typeof handler!=='function')throw new Error(`Vanessa’s ${kind==='takeover'?'editing':kind} bridge is not connected.`);
      const controller=new AbortController(),captured=this._captureScope(analysis),abort=()=>controller.abort(signal.reason||abortError());
      if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
      this.controller=controller;this.busy=true;this.isEditingMode=kind==='takeover';
      const checkCurrent=()=>this._checkCurrent(captured,controller.signal);
      const notify=(stage,text)=>{try{this.options.onProgress?.({stage,text:clean(text),mode:this.currentMode,isEditingMode:this.isEditingMode,scope:captured.custom});}catch(error){this._error(error);}};
      const report=(stage,text)=>{checkCurrent();notify(stage,text);};
      try{
        checkCurrent();if(kind==='takeover')this.setMode('director');
        report(kind==='takeover'?'planning':kind,kind==='takeover'?'Checking the live timeline and supported editing tools.':'');
        const result=await awaitWithAbort(handler({instruction,analysis,signal:controller.signal,report,checkCurrent,scope:captured.custom,userSkillLevel:this.userSkillLevel}),controller.signal);
        checkCurrent();
        const status=String(result?.status||'').toUpperCase(),stage=['NEEDS_INPUT','AWAITING_CONFIRMATION','REVIEW'].includes(status)?'awaiting-confirmation':['FAILED','UNSUPPORTED'].includes(status)?'failed':'complete';
        notify(stage,result?.message||result?.reply||'');return result;
      }catch(error){
        // Do not publish progress from a replaced account or project.
        const state=this._state();if(!this.closed&&state===captured.editor&&state.projectId===captured.projectId&&this.options.isCurrent?.(captured.custom)!==false)notify(controller.signal.aborted||error.name==='AbortError'?'cancelled':'failed',error.message);
        throw error;
      }finally{
        signal?.removeEventListener('abort',abort);if(this.controller===controller)this.controller=null;this.busy=false;this.isEditingMode=false;
      }
    }
    async handleUserRequest(userInput,{signal}={}){
      const instruction=clean(userInput);if(!instruction||instruction.length>4000)throw new Error('Describe the request in 1–4000 characters.');
      this._assertOpen();this.observeUserSkillLevel(instruction);this.recordInteraction();
      const analysis=this.analyzeProjectContext(),intent=this.classifyIntent(instruction);
      if(intent==='takeover')return this.executeAutonomousEditingLoop(instruction,analysis,{signal});
      if(intent==='guidance')return this.provideGuidance(instruction,analysis,{signal});
      return this._runRequest('conversational',instruction,this.options.converse,{signal,analysis});
    }
    provideGuidance(instruction,analysis=this.analyzeProjectContext(),{signal}={}){return this._runRequest('guidance',clean(instruction),this.options.guide,{signal,analysis});}
    executeAutonomousEditingLoop(instruction,analysis=this.analyzeProjectContext(),{signal}={}){
      const prompt=clean(instruction);if(!prompt||prompt.length>4000)return Promise.reject(new Error('Describe the edit in 1–4000 characters.'));
      return this._runRequest('takeover',prompt,this.options.execute,{signal,analysis});
    }
  }
  return {ZorifiVanessaDirectorEngine,analyzeProjectContext,classifyIntent,skillLevelFromInput};
});
