/* One companion, one microphone, and the editor's existing validated tools. */
(function(global){
  'use strict';
  let engine=null,owner='',preferences={idleHelp:true,mode:'companion'},caption='',captionStatus='idle',captionKind='message',wordRange=null,hint=false;
  let captionTimer=null,introTimer=null,hintTimer=null,disposed=false,lastMovement=0;
  const lifecycle=new AbortController();
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const key=name=>`zorifi-director-${name}-v1:${owner}`;
  const currentScope=()=>({project:state,projectId:state.projectId,userId:currentUser?.id,view:state.view});
  const isCurrent=scope=>Boolean(scope&&!disposed&&scope.userId===currentUser?.id&&scope.project===state&&scope.projectId===state.projectId&&scope.view===state.view);
  const ready=()=>Boolean(currentUser&&document.visibilityState==='visible'&&!document.getElementById('app')?.inert&&!document.querySelector('.zorifi-opening,.zorifi-tour-backdrop,.beta-welcome-backdrop,.modal-backdrop,.zorifi-settings-screen'));
  const allowedCommands=['clip.trim','clip.move','clip.set','visual.adjust','visual.filter','visual.effect','transition.apply','audio.set','audio.fade','keyframe.animation','animation.apply'];

  function openVanessa({listen=false}={}){
    if(disposed||!currentUser)return;
    unlockVanessaAudio();vanessaOpen=true;
    if(state.view==='editor'&&editorWorkspaceMode!=='music'&&runtimeMode.platform==='desktop')selectInspectorTab('vanessa');
    else mountVanessa();
    if(listen&&!vanessaListening)startVanessaVoice();
    else document.querySelector('[data-vanessa-form] [name="message"]')?.focus({preventScroll:true});
  }
  function clearCaption(){clearTimeout(captionTimer);captionTimer=null;caption='';captionStatus='idle';captionKind='message';wordRange=null;hint=false;syncSurface();}
  const surface=ZorifiDirectorCompanion.create({document,onOpen:()=>openVanessa(),onDismiss:clearCaption,onInteract:()=>engine?.recordInteraction()});
  function syncSurface(){
    if(disposed)return;
    const speaking=captionStatus==='speaking'&&vanessaVoicePlaybackState==='speaking';
    if(captionStatus==='speaking'&&!speaking){caption='';captionStatus='idle';}
    surface.update({userId:currentUser?.id||'',visible:Boolean(currentUser)&&['home','editor','scenes','ai-video','photos'].includes(state.view)&&!document.getElementById('app')?.inert,chatOpen:vanessaOpen,mode:engine?.currentMode||'companion',status:engine?.busy?'thinking':vanessaListening?'listening':speaking?'speaking':captionStatus,caption,captionKind,wordRange,hint});
  }
  function announce(text,{voice=true,duration=12000,introduction=false}={}){
    if(disposed||!currentUser||!String(text||'').trim())return;
    clearTimeout(captionTimer);caption=String(text);captionStatus='idle';captionKind='message';wordRange=null;hint=introduction;syncSurface();
    const expectedOwner=owner;
    captionTimer=setTimeout(()=>{if(owner===expectedOwner)clearCaption();},duration);
    if(voice&&vanessaVoiceEnabled&&ZorifiPrivacy.consent(localStorage,currentUser.id))void speakAsVanessa(text);
  }
  function canPrompt(){
    return Boolean(ready()&&state.view==='editor'&&state.projectId&&preferences.idleHelp&&!vanessaOpen&&!state.playing&&!vanessaBusy&&!vanessaListening&&!engine?.busy&&!['preparing','speaking','blocked'].includes(vanessaVoicePlaybackState)&&!document.querySelector('.mobile-tool-sheet,.mobile-clip-inspector')&&!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'));
  }
  function tryIntroduction(){
    clearTimeout(introTimer);introTimer=null;
    if(!owner||read(key('introduced'),false)||state.view!=='home'||!ready()||vanessaOpen)return;
    const expectedOwner=owner;
    introTimer=setTimeout(()=>{
      introTimer=null;if(owner!==expectedOwner||state.view!=='home'||!ready()||vanessaOpen)return;
      try{localStorage.setItem(key('introduced'),'true');}catch{}
      const text='Hi, I’m Vanessa, your creative co-partner in Zorifi. Open my tab whenever you want guidance, an edit, or a soundtrack. You can also enable Hands-Free and say “Hey Vanessa”.';
      announce(text,{introduction:true,duration:16000});clearTimeout(hintTimer);hintTimer=setTimeout(()=>{hint=false;syncSurface();},10000);
    },1500);
  }
  function resetAccount(){
    engine?.dispose();engine=null;global.ZorifiVanessaDirector=null;if(global.ZorifiMasterApp)global.ZorifiMasterApp.directorEngine=null;owner=currentUser?.id||'';
    clearTimeout(captionTimer);clearTimeout(introTimer);clearTimeout(hintTimer);caption='';captionStatus='idle';captionKind='message';wordRange=null;hint=false;
    if(!owner){syncSurface();return;}
    const saved=read(key('preferences'),{});preferences={idleHelp:saved.idleHelp!==false,mode:saved.mode==='director'?'director':'companion'};
    engine=new ZorifiDirectorEngine.ZorifiVanessaDirectorEngine(()=>state,global.ZorifiMasterApp?.aiGateway,{
      getScope:currentScope,isCurrent,canPrompt,
      execute:executePass,guide:provideGuidance,
      converse:async({instruction,checkCurrent})=>{const result=await safeVanessaRequest('vanessa-global',{message:instruction,context:vanessaContext(),preferredLanguage:currentUser?.language||globalI18n.locale});checkCurrent();return {status:result.ok?'SUCCESS':'FAILED',message:result.data?.reply||result.data?.text||'I could not reach the conversation provider. Please try again.'};},
      onProgress:progress=>{clearTimeout(captionTimer);captionKind='message';wordRange=null;caption=progress.text;const terminal=['failed','cancelled','complete','awaiting-confirmation'].includes(progress.stage);captionStatus=progress.stage==='failed'?'error':terminal?'idle':'thinking';syncSurface();if(terminal)captionTimer=setTimeout(clearCaption,12000);const status=document.querySelector('[data-vanessa-inline-status]');if(status&&progress.text)status.textContent=progress.text;const thinking=document.querySelector('.vanessa-messages .thinking small');if(thinking&&progress.text)thinking.textContent=progress.text;},
      onModeChange:mode=>{preferences.mode=mode;try{localStorage.setItem(key('preferences'),JSON.stringify(preferences));}catch{}decorateControls();syncSurface();},
      onIdle:({analysis})=>announce(analysis.clipCount?'Need a hand with this edit? I can review the timeline, explain a tool, or make a Director pass when you ask.':'Ready to create? Start a new edit, or open Vanessa for a walkthrough.'),
      onSpeak:text=>announce(text),toggleChatPanel:()=>{if(vanessaOpen){vanessaOpen=false;if(inspectorTab==='vanessa')inspectorTab='details';render();}else openVanessa();},openChatAndListen:()=>openVanessa({listen:true})
    });
    global.ZorifiVanessaDirector=engine;if(global.ZorifiMasterApp)global.ZorifiMasterApp.directorEngine=engine;engine.setMode(preferences.mode);engine.start();syncSurface();
  }
  function decorateControls(){
    const controls=document.querySelector('.vanessa-session-controls');if(!controls||!engine)return;
    let row=controls.querySelector('[data-director-mode-controls]');
    if(!row){
      row=document.createElement('div');row.className='director-mode-controls';row.dataset.directorModeControls='';
      row.innerHTML='<label><select data-director-mode aria-label="Vanessa mode"><option value="companion">Companion</option><option value="director">Director</option></select></label><label class="director-idle-setting"><input type="checkbox" data-director-idle-help>Idle help</label><button type="button" data-director-review>Review timeline</button>';
      controls.classList.add('has-director-controls');controls.appendChild(row);
      row.querySelector('[data-director-mode]').onchange=event=>{engine?.setMode(event.target.value);engine?.recordInteraction();};
      row.querySelector('[data-director-idle-help]').onchange=event=>{preferences.idleHelp=event.target.checked;try{localStorage.setItem(key('preferences'),JSON.stringify(preferences));}catch{}engine?.recordInteraction();if(!preferences.idleHelp)clearCaption();};
      row.querySelector('[data-director-review]').onclick=()=>{engine?.recordInteraction();void global.ZorifiMasterApp.consultVanessa('Guide me through this edit.');};
    }
    row.querySelector('[data-director-mode]').value=engine.currentMode;row.querySelector('[data-director-idle-help]').checked=preferences.idleHelp;
  }
  function sync(){
    if(disposed)return;
    if(owner!==(currentUser?.id||''))resetAccount();
    if(engine){engine.isListeningForWakeWord=Boolean(vanessaWakeEnabled&&vanessaListeningEngine);engine.recognition=vanessaRecognition||vanessaWakeRecognition||null;}
    decorateControls();syncSurface();tryIntroduction();
  }
  function guidanceText(analysis,skill){
    if(state.view!=='editor')return 'Open a project or create a new edit first. Import a video or photo, then I can explain its timeline and tools.';
    if(!analysis.clipCount)return 'Your timeline is empty. Import media, then tap it or drag it onto the timeline. Place the playhead where you want the next clip to start. I can also build a scene plan from your imported media.';
    const opening=analysis.openingClip,details=`This project has ${analysis.visualClipCount} visual clips and ${analysis.audioClipCount} separate audio clips across ${analysis.trackCount} tracks.`;
    const measured=opening?` The first visual clip starts at ${opening.start.toFixed(1)}s and lasts ${opening.duration.toFixed(1)}s.`:'';
    const gap=analysis.gaps.length?` There ${analysis.gaps.length===1?'is':'are'} ${analysis.gaps.length} uncovered visual gap${analysis.gaps.length===1?'':'s'} to review.`:'';
    return details+measured+gap+(skill==='professional'?' Tell me the desired pacing, colour treatment, or exact tool changes; I can validate a Director pass and keep it in one Undo.':' Select a clip to adjust it in Properties. Use Audio, Text, Effects, and Motion for more tools. Tell me your goal, or say “take over and add smooth transitions” for an undoable Director pass.')+' These observations use timeline timings, rather than a judgement of the footage’s story.';
  }
  async function provideGuidance({analysis,userSkillLevel}){return {status:'SUCCESS',message:guidanceText(analysis,userSkillLevel),director:{mode:'companion',basis:'timeline-metadata'}};}
  async function requestPlan(instruction,analysis,context,signal){
    if(!navigator.onLine||!ZorifiPrivacy.consent(localStorage,currentUser.id))return {plan:ZorifiDirectorTimeline.localPlan(instruction,state,context),planner:'device'};
    const request=global.ZorifiMasterApp.aiGateway.generateAIResponse('vanessa',{message:`Make a conservative Director pass for this request: ${instruction}. Use only the supplied allowed commands and existing clip IDs. Preserve clip order, content, framing and sound unless the request explicitly calls for changing them. Do not delete content, invent source analysis, move clips to new tracks, create gaps, trim speech based only on duration, or modify automatic endings. Return no actions when the requested improvement cannot be inferred from the supplied data.`,context:{...context,capabilities:{...context.capabilities,commands:allowedCommands},directorAnalysis:analysis,assistanceStyle:engine.userSkillLevel},history:[]},{signal});
    let data;
    try{data=await request;}catch(error){if(signal.aborted||error.name==='AbortError')throw error;return {plan:ZorifiDirectorTimeline.localPlan(instruction,state,context),planner:'device'};}
    const actions=Array.isArray(data?.actions)?data.actions.map(action=>{if(action.parameters)return action;let parameters;try{parameters=JSON.parse(action.parametersJson||'{}');}catch{throw new Error('The Director returned invalid tool parameters.');}return {...action,parameters};}):[];
    return {plan:{actions,reason:instruction},planner:'gemini'};
  }
  async function executePass({instruction,analysis,signal,report,checkCurrent,scope}){
    if(state.view!=='editor'||!state.projectId)throw new Error('Open a video or music project before asking Vanessa to direct it.');
    if(!analysis.clipCount)return {status:'NEEDS_INPUT',message:'Add media to your timeline first, or ask me to build a scene plan from imported media.'};
    const original=scope.project,selectedClipId=original.selected,signature=ZorifiDirectorTimeline.signature(original),sources=original.mediaAssets.map(asset=>({asset,url:asset.url,file:asset.file,duration:asset.duration})),context=vanessaEditorContext();
    const check=()=>{checkCurrent();if(original.selected!==selectedClipId||ZorifiDirectorTimeline.signature(original)!==signature||sources.some(source=>!original.mediaAssets.includes(source.asset)||source.asset.url!==source.url||source.asset.file!==source.file||source.asset.duration!==source.duration))throw new DOMException('The timeline, selection or source media changed while Vanessa was planning. Nothing was applied.','AbortError');};
    const planning=await requestPlan(instruction,analysis,context,signal);check();
    const plan=ZorifiDirectorTimeline.validatePlan(planning.plan,original,context);
    if(!plan.actions.length)return {status:'NEEDS_INPUT',message:'I have not changed the project. Tell me a specific goal, such as adding smooth transitions, a cinematic look, or fading the music. Duration alone cannot tell me which footage to remove.',director:{mode:'director',planner:planning.planner}};
    const staged={...original,clips:structuredClone(original.clips),trackStates:structuredClone(original.trackStates||{}),mediaAssets:[...original.mediaAssets],undo:[],redo:[]};
    const adapter=vanessaActionAdapter({project:staged,detached:true}),apply=adapter.apply;let completed=0;
    adapter.apply=async(action,clip)=>{
      check();report('preparing',`Preparing change ${completed+1} of ${plan.actions.length}: ${action.command.replace('.', ' ')}.`);
      await new Promise(resolve=>requestAnimationFrame(resolve));check();
      const previousStart=clip?.start,result=await apply(action,clip);
      if(action.command==='clip.move'&&clip?.keyframes){const delta=clip.start-previousStart;for(const frames of Object.values(clip.keyframes))for(const frame of frames)frame.time+=delta;}
      completed++;return result;
    };
    const result=await VanessaActions.execute(plan,context,adapter,{confirmed:false});check();
    if(result.status!=='SUCCESS')return result;
    ZorifiDirectorTimeline.validateResult(staged,original);
    const duration=Math.max(1,Math.ceil(EditorOverhaul.projectDuration(staged.clips,{minimum:1})*10)/10);
    if(!Number.isFinite(duration))throw new Error('The Director pass contains invalid timeline timing.');
    report('applying','Applying the validated Director pass.');check();
    stopProjectPlayback('vanessa-director');snapshot();original.clips=staged.clips;original.duration=duration;
    try{render();scheduleProjectSave(0);}catch(error){console.warn('Director view refresh failed',error.message);}
    return {...result,message:`Applied ${completed} validated change${completed===1?'':'s'} in one Undo. ${result.message}${planning.planner==='device'?' This pass used the on-device planner.':''}`,director:{mode:'director',planner:planning.planner,changes:completed}};
  }
  async function handleTurn(message){
    sync();if(disposed||!engine)return null;engine.observeUserSkillLevel(message);engine.recordInteraction();
    const intent=engine.classifyIntent(message);
    if(intent==='takeover')return engine.handleUserRequest(message);
    if(intent==='guidance'&&state.view==='editor'&&/\b(?:edit|video|timeline|clip|project|zorifi|start|tool|beginner)\b/i.test(message))return engine.handleUserRequest(message);
    return null;
  }
  function dispose(){if(disposed)return;disposed=true;lifecycle.abort();observer.disconnect();engine?.dispose();surface.dispose();clearTimeout(captionTimer);clearTimeout(introTimer);clearTimeout(hintTimer);global.ZorifiVanessaDirector=null;}
  const baseMount=mountVanessa;mountVanessa=function(){const value=baseMount.apply(this,arguments);sync();return value;};
  const baseRender=render;render=function(){const value=baseRender.apply(this,arguments);sync();return value;};
  const baseFinish=finishVanessaTurn;finishVanessaTurn=function(reply){const result=baseFinish.apply(this,arguments);if(!vanessaVoiceEnabled)announce(reply,{voice:false});return result;};
  const editorContext=vanessaEditorContext;vanessaEditorContext=function(){const context=editorContext();if(engine)context.director={mode:engine.currentMode,skillHint:engine.userSkillLevel,requiresExplicitRequest:true};return context;};
  const generalContext=vanessaContext;vanessaContext=function(){const context=generalContext();if(engine)context.director={mode:engine.currentMode,skillHint:engine.userSkillLevel};return context;};
  global.addEventListener('zorifi:vanessa-speech',event=>{
    const detail=event.detail;if(detail?.userId!==owner||detail.request!==vanessaSpeechRequest)return;
    clearTimeout(captionTimer);
    if(['ended','stopped','cancelled','error','blocked','unavailable'].includes(detail.status)){clearCaption();return;}
    if(!['preparing','speaking','boundary'].includes(detail.status))return;
    captionKind='speech';caption=String(detail.text||'');hint=false;
    captionStatus=detail.status==='preparing'?'thinking':'speaking';
    if(detail.status==='preparing'||detail.status==='speaking')wordRange=null;
    if(detail.status==='boundary'&&['speech-boundary','provider-boundary'].includes(detail.timingSource)&&Number.isInteger(detail.charIndex)&&detail.charIndex>=0&&detail.charIndex<caption.length&&detail.boundaryType!=='sentence')wordRange={charIndex:detail.charIndex,charLength:detail.charLength||0};
    syncSurface();
  },{signal:lifecycle.signal});
  for(const name of ['pointerdown','keydown','wheel','pointermove'])global.addEventListener(name,event=>{if(name==='pointermove'){if(Date.now()-lastMovement<500)return;lastMovement=Date.now();}if(event.isTrusted)engine?.recordInteraction();},{passive:true,signal:lifecycle.signal});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){engine?.cancel();clearCaption();}else{engine?.recordInteraction();sync();}},{signal:lifecycle.signal});
  global.addEventListener('pagehide',event=>{if(!event.persisted)dispose();},{signal:lifecycle.signal});
  const observer=new MutationObserver(()=>{if(owner!==(currentUser?.id||''))sync();else tryIntroduction();});observer.observe(document.body,{childList:true});
  global.ZorifiDirectorBridge={sync,handleTurn,open:openVanessa,announce,dispose};
  global.ZorifiUI={...global.ZorifiUI,toggleVanessaPanel:()=>engine?.toggleChatPanel()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})(window);
