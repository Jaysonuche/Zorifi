/* Unified facade over the running editor. No duplicate project state or boot. */
(function(global){
  'use strict';
  class ZorifiApp {
    constructor({directorHooks={}}={}){
      this.audioAI=new ZorifiVanessaAudioCleanup();
      this.aiGateway=new ZorifiOptimization.SecureAIService({transport:vanessaFetch,resolveEndpoint:vanessaEndpoint,timeoutMs:120000});
      this.scenePlanner=new ZorifiScenePlanner();
      this.easing=ZorifiEasingCurves;
      this.pending=new Set();this.audioBusy=false;this.closed=false;this.cleanupUI=null;this.chatSubmitting=false;
      // Reuse the editor's music brief builder without opening a second playback
      // context or maintaining a second timeline.
      this.audioStudio={buildAIMusicPrompt:MusicStudio.buildAIMusicPrompt};
      this.directorStatus=null;
      const hooks={
        getScope:(project,media)=>this.captureDirectorScope(project,media),
        isCurrent:scope=>this.isDirectorScopeCurrent(scope),
        requestScenePlan:async options=>{
          const result=await requestVanessaScenePlan(options);
          if(result.planner==='device'){
            // Metadata-only local plans must also fit very short source clips.
            for(const scene of result.plan.scenes){const durations=scene.mediaIds.map(id=>options.media.find(item=>item.id===id)).filter(item=>item?.type==='video').map(item=>Number(item.duration)).filter(Number.isFinite);if(durations.length)scene.duration=Math.min(scene.duration,...durations);}
            result.plan.totalDuration=result.plan.scenes.reduce((sum,scene)=>sum+scene.duration,0);
          }
          return result;
        },
        generateMusic:options=>this.generateDirectorMusic(options),
        prepareMusic:(result,options)=>this.prepareDirectorMusic(result,options),
        commit:packet=>this.commitDirectorResult(packet),
        release:music=>this.releaseDirectorMusic(music),
        onProgress:progress=>{this.directorStatus=progress;try{if(typeof mountVanessa==='function')mountVanessa();}catch{/* A UI observer must not cancel a completed edit. */}},
        ...directorHooks
      };
      this.studioDirector=new global.ZorifiStudioDirector.ZorifiVanessaStudioDirector(this.aiGateway,this.scenePlanner,this.audioStudio,hooks);
    }
    get state(){return state;}
    assertOpen(){if(this.closed)throw new Error('The application session has closed.');}
    async consultVanessa(promptText){this.assertOpen();if(typeof promptText!=='string'||!promptText.trim())throw new Error('Enter a prompt for Vanessa.');if(this.chatSubmitting||vanessaBusy)throw new Error('Vanessa is finishing the previous request. Please wait or press Stop.');this.chatSubmitting=true;try{return await sendToVanessa(promptText.trim());}finally{this.chatSubmitting=false;}}
    executeDirectorCommand(prompt,mediaItems=state.mediaAssets,options={}){this.assertOpen();return this.studioDirector.executeDirectorCommand(prompt,state,mediaItems,options);}
    cancelDirectorCommand(){return this.studioDirector.cancel();}
    captureDirectorScope(project,media){
      this.assertOpen();if(project!==state||state.view!=='editor'||!state.projectId||!currentUser?.id)throw new Error('Open a signed-in Studio project first.');
      const sources=(media||[]).map(item=>{const asset=state.mediaAssets.find(value=>value.id===item.id);if(!asset)throw new Error('Selected media is no longer in this project.');return {id:asset.id,asset,url:asset.url,file:asset.file,duration:asset.duration,type:asset.type};});
      return {project:state,projectId:state.projectId,userId:currentUser.id,sources,startTime:state.currentTime,capabilities:sceneCapabilities(media||[])};
    }
    isDirectorScopeCurrent(scope){
      return Boolean(scope&&!this.closed&&state===scope.project&&state.view==='editor'&&state.projectId===scope.projectId&&currentUser?.id===scope.userId&&scope.sources.every(source=>state.mediaAssets.includes(source.asset)&&source.asset.id===source.id&&source.asset.url===source.url&&source.asset.file===source.file&&source.asset.duration===source.duration&&source.asset.type===source.type));
    }
    checkDirectorScope(scope,signal){if(signal?.aborted)throw new DOMException('Studio direction was cancelled.','AbortError');if(!this.isDirectorScopeCurrent(scope))throw new DOMException('The account, project or selected media changed. Nothing was added.','AbortError');}
    async generateDirectorMusic({prompt,settings,payload,signal,scope}){
      this.checkDirectorScope(scope,signal);
      if(musicStudioJob&&['queued','running'].includes(musicStudioJob.result?.status))throw new Error('Music generation is already running.');
      if(!ZorifiPrivacy.consent(localStorage,currentUser?.id||'guest'))throw Object.assign(new Error('Enable optional AI processing in Privacy & data first.'),{code:'PRIVACY_CONSENT_REQUIRED'});
      const provider=await getMusicProvider(true);
      this.checkDirectorScope(scope,signal);
      if(musicStudioJob&&['queued','running'].includes(musicStudioJob.result?.status))throw new Error('Music generation is already running.');
      if(!provider.configured)throw new Error(provider.error||'Connect a music provider in AI settings first.');
      const local=provider.provider==='Local CPU',lyria=String(provider.provider||'').startsWith('Gemini Lyria');
      const requested=Number(settings.duration)||30,duration=lyria?30:local?Math.min(30,Math.max(5,requested)):Math.min(600,Math.max(15,requested));
      const normalized=MusicStudio.normalize({...settings,prompt,duration,requestedStems:[],vocals:local?'instrumental':settings.vocals});
      const input=MusicStudio.providerPayload({...normalized,mood:settings.mood,outputFormat:local?'wav':'mp3'});
      // The configured server chooses the actual model; no credential or
      // client-selected model bypass is introduced by the director facade.
      const transport=musicJobTransport(provider),guardedTransport=(service,body,options)=>{this.checkDirectorScope(scope,signal);return transport(service,body,options);};
      const job=new AIProvider.Job('music',input,{transport:guardedTransport,pollInterval:1500,onUpdate:value=>{this.directorStatus={stage:'generating-music',status:value.status,progress:value.progress};}});
      const cancel=()=>{void job.cancel();};signal?.addEventListener('abort',cancel,{once:true});
      this.pending.add(job);musicStudioJob=job;
      try{if(signal?.aborted)cancel();const result=await job.start();if(signal?.aborted||result.status===AIProvider.STATES.CANCELLED)throw new DOMException('Music generation was cancelled.','AbortError');if(result.status!==AIProvider.STATES.COMPLETE||!result.url)throw new Error(result.error||'The music provider did not return completed, playable audio.');return result;}
      finally{signal?.removeEventListener('abort',cancel);this.pending.delete(job);if(musicStudioJob===job)musicStudioJob=null;}
    }
    async prepareDirectorMusic(result,{settings,signal,scope}){
      this.checkDirectorScope(scope,signal);
      const staged={asset:null,recordKey:null,url:null,sourceDuration:0};
      try{
        if(result.status!==AIProvider.STATES.COMPLETE||!result.url)throw new Error('Music generation is not complete.');
        const response=await fetch(result.url,{signal});this.checkDirectorScope(scope,signal);
        if(!response.ok)throw new Error('Generated audio could not be downloaded.');
        if(Number(response.headers.get('content-length'))>100*1024*1024)throw new Error('Generated audio exceeds the 100 MB processing limit.');
        const blob=await response.blob();this.checkDirectorScope(scope,signal);
        const mime=String(result.mimeType||blob.type||'').split(';')[0].trim().toLowerCase();
        if(blob.size<44||blob.size>100*1024*1024||!/^audio\/(?:mpeg|mp3|wav|x-wav|ogg|mp4|webm)$/.test(mime))throw new Error('The provider returned an invalid audio file.');
        const extension=/wav/.test(mime)?'wav':/ogg/.test(mime)?'ogg':/mp4/.test(mime)?'m4a':/webm/.test(mime)?'webm':'mp3';
        const id=`director-music-${crypto.randomUUID()}`,name=`${settings.genre||'Vanessa soundtrack'} · ${settings.bpm||120} BPM`;
        const file=new File([blob],`${name.replace(/[^a-z0-9]+/gi,'-')}.${extension}`,{type:mime});
        const waveform=await ZorifiAudioEngine.decodeWaveform(file,global.AudioContext||global.webkitAudioContext,480,{signal});this.checkDirectorScope(scope,signal);
        if(!Number.isFinite(waveform?.duration)||waveform.duration<=0)throw new Error('The generated file contains no decodable audio.');
        staged.recordKey=`${scope.userId}::${scope.projectId}::${id}`;
        await storeProjectMedia(scope.projectId,id,file,{signal,userId:scope.userId});this.checkDirectorScope(scope,signal);
        staged.url=editorResources.createManagedUrl(file);staged.sourceDuration=waveform.duration;
        const asset=AIProvider.asset({...result,kind:'music',duration:waveform.duration},{id,name,prompt:settings.prompt,projectId:scope.projectId});
        Object.assign(asset,{url:staged.url,persisted:true,localFile:true,size:file.size,mimeType:mime,extension,waveform});
        if(/^https:\/\//.test(result.url))asset.providerUrl=result.url;
        asset.musicProduction={bpm:settings.bpm,key:settings.key,scaleMode:settings.scaleMode,timeSignature:settings.timeSignature,genre:settings.genre};staged.asset=asset;
        return staged;
      }catch(error){await this.releaseDirectorMusic(staged);throw error;}
    }
    async releaseDirectorMusic(staged){
      if(!staged||staged.committed)return;
      if(staged.url){revokeManagedUrl(staged.url);staged.url=null;}
      if(staged.recordKey){const key=staged.recordKey;staged.recordKey=null;const db=await openMediaDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction(MEDIA_STORE_NAME,'readwrite');tx.objectStore(MEDIA_STORE_NAME).delete(key);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Staged music cleanup failed.'));});}
    }
    commitDirectorResult({plan,music,settings,scope,signal}){
      this.checkDirectorScope(scope,signal);
      const automaticEndings=state.clips.filter(clip=>clip.zorifiEnding&&clip.endingAutoPlaced),base=state.clips.filter(clip=>!automaticEndings.includes(clip));
      const staged={...state,clips:[...base],mediaAssets:[...state.mediaAssets],trackStates:{...state.trackStates}};
      const oldIds=new Set(state.clips.map(clip=>clip.id)),offset=base.reduce((end,clip)=>Math.max(end,(Number(clip.start)||0)+(Number(clip.duration)||0)),0);
      if(plan)new ZorifiScenePlanner().applyToTimeline(staged,plan,{capabilities:scope.capabilities});
      let additions=staged.clips.filter(clip=>!oldIds.has(clip.id));
      // A newly generated soundtrack replaces the plan's soundtrack choice,
      // while all existing user audio and earlier generated clips remain intact.
      if(music)additions=additions.filter(clip=>clip.type!=='audio');
      const placed=[...base],trackStates={...state.trackStates};
      const allocate=(kind,start,duration)=>{
        const candidates=[...new Set([ZorifiTimelineTracks.id(kind,1),...placed.filter(clip=>ZorifiTimelineTracks.kind(clip.track)===kind).map(clip=>clip.track)])].sort((a,b)=>ZorifiTimelineTracks.number(a)-ZorifiTimelineTracks.number(b));
        let track=candidates.find(value=>!trackStates[value]?.locked&&!trackStates[value]?.hidden&&!trackStates[value]?.muted&&!placed.some(clip=>clip.track===value&&start<clip.start+clip.duration&&start+duration>clip.start));
        if(track===undefined){const occupied=[...placed,...Object.keys(trackStates).map(value=>({track:Number(value)}))];track=ZorifiTimelineTracks.next(occupied,kind);}
        trackStates[track]={locked:false,hidden:false,muted:false,solo:false,...trackStates[track]};return track;
      };
      for(const clip of additions){const kind=['video','image'].includes(clip.type)?'video':clip.type;clip.track=allocate(kind,clip.start,clip.duration);if(kind==='video')clip.overlay=clip.track!==0;placed.push(clip);}
      const sceneClipIds=additions.map(clip=>clip.id),musicClipIds=[];let musicDuration=0;
      if(music){
        if(!music.asset?.url||!Number.isFinite(music.sourceDuration)||music.sourceDuration<=0)throw new Error('The soundtrack is not ready to add.');
        const start=plan?offset:Math.max(0,Number(scope.startTime)||0),duration=plan?Math.min(music.sourceDuration,plan.totalDuration):Math.min(music.sourceDuration,Number(settings.duration)||music.sourceDuration);
        const clip={id:`director-audio-${crypto.randomUUID()}`,mediaId:music.asset.id,type:'audio',name:music.asset.name,start,duration,sourceStart:0,track:allocate('audio',start,duration),opacity:100,volume:100,playbackRate:1,generated:true,studioDirected:true,audioEffects:{role:'music'},musicProduction:{...music.asset.musicProduction}};
        placed.push(clip);musicClipIds.push(clip.id);musicDuration=duration;staged.mediaAssets.unshift(music.asset);
      }
      if(!sceneClipIds.length&&!musicClipIds.length)throw new Error('The director produced no editable timeline content.');
      const contentEnd=placed.reduce((end,clip)=>Math.max(end,Number(clip.start)+Number(clip.duration)),0);
      placed.push(...automaticEndings.map(clip=>{
        const copy={...clip,start:contentEnd},delta=contentEnd-clip.start;
        if(clip.keyframes){copy.keyframes=JSON.parse(JSON.stringify(clip.keyframes));Object.values(copy.keyframes).flat().forEach(frame=>{frame.time+=delta;});}
        return copy;
      }));
      const duration=Math.max(1,Math.ceil(EditorOverhaul.projectDuration(placed,{minimum:1})*10)/10);
      if(!Number.isFinite(duration))throw new Error('The directed timeline has invalid timing.');
      const creatorSettings=music?{...state.creatorSettings,musicStudio:MusicStudio.normalize({...state.creatorSettings.musicStudio,...settings,generation:{status:'complete',progress:100}})}:state.creatorSettings;
      this.checkDirectorScope(scope,signal);
      stopProjectPlayback('studio-director');snapshot();
      state.clips=placed;state.mediaAssets=staged.mediaAssets;state.trackStates=trackStates;state.duration=duration;state.currentTime=Math.min(state.currentTime,duration);state.creatorSettings=creatorSettings;if(plan){state.scenePlan=staged.scenePlan;this.scenePlanner.currentPlan=staged.scenePlan;}
      if(music)music.committed=true;
      // All validation and state preparation completed before the single
      // history snapshot. UI/persistence observers run after the edit exists
      // and must never turn it into a false generation failure.
      try{recalculateDuration();}catch(error){console.warn('Studio playback refresh failed',error.message);}
      try{render();}catch(error){console.warn('Studio view refresh failed',error.message);}
      try{scheduleProjectSave(0);}catch(error){console.warn('Studio autosave scheduling failed',error.message);}
      return {state,clipIds:[...sceneClipIds,...musicClipIds],sceneClipIds,musicClipIds,musicDuration,musicSourceDuration:music?.sourceDuration||0};
    }
    generateCaptions(clipId){this.assertOpen();if(captionGenerating)return false;if(clipId!==undefined){if(!state.clips.some(c=>c.id===clipId&&['audio','video'].includes(c.type)))throw new Error('Select an audio or video clip.');state.captionSettings.source=`clip:${clipId}`;}return generateSmartCaptions();}
    exportCaptionsToSRT(options){this.assertOpen();return new Phase8.ZorifiCaptionEditorBridge(state,new Phase8.ZorifiAutoCaptionsEngine()).exportTimelineCaptionsToSRT(options);}
    async synchronizeMulticam(masterId,targetIds){
      this.assertOpen();const engine=new ZorifiMulticamSyncEngine({beforeApply:snapshot});this.pending.add(engine);
      try{stopProjectPlayback('multicam-sync');await engine.synchronizeMulticamTracks(state,masterId,targetIds);recalculateDuration();render();scheduleProjectSave(0);return engine.lastResults;}
      finally{this.pending.delete(engine);await engine.dispose();}
    }
    async enhanceSelectedClipAudio(clipId=state.selected,{strength=.8}={}){
      this.assertOpen();if(this.audioBusy)throw new Error('Audio cleanup is already running.');
      const project=state,projectId=state.projectId,userId=currentUser?.id||'guest',clip=state.clips.find(c=>c.id===clipId),asset=state.mediaAssets.find(a=>a.id===clip?.mediaId);
      if(!clip||!['audio','video'].includes(clip.type)||!asset||!['audio','video'].includes(asset.type))throw new Error('Select a video or audio clip with recorded sound.');
      const originalUrl=asset.url,originalFile=asset.file;
      const unchanged=()=>!this.closed&&state===project&&state.projectId===projectId&&(currentUser?.id||'guest')===userId&&state.clips.includes(clip)&&clip.mediaId===asset.id&&state.mediaAssets.includes(asset)&&asset.url===originalUrl&&asset.file===originalFile;
      const check=()=>{if(!unchanged())throw new Error('The source or project changed. Cleanup was not applied.');};
      const controller=new AbortController();this.pending.add(controller);this.audioBusy=true;let context,url;
      try{
        let file=originalFile;
        if(!file){if(!originalUrl)throw new Error('Restore the source media first.');const response=await fetch(originalUrl,{signal:controller.signal});if(!response.ok)throw new Error('Source audio could not be loaded.');file=await response.blob();}
        if(!file.size||file.size>100*1024*1024)throw new Error('Choose a nonempty source smaller than 100 MB.');check();
        const Context=global.AudioContext||global.webkitAudioContext;if(!Context)throw new Error('Audio decoding is unavailable.');context=new Context();
        const decoded=await context.decodeAudioData(await file.arrayBuffer());check();
        const cleaned=await this.audioAI.processAudio(decoded,{mode:'dialogue_cleanup',strength});check();
        const blob=this.audioAI.audioBufferToWavBlob(cleaned),id=`media-cleanup-${crypto.randomUUID()}`,name=`${asset.name.replace(/\.[^.]+$/,'')}-cleaned.wav`;
        // Capture the owner in the stored record; do not use a later login's ID.
        const db=await openMediaDatabase();check();
        const key=mediaRecordKey(projectId,id);
        await new Promise((resolve,reject)=>{const tx=db.transaction(MEDIA_STORE_NAME,'readwrite');tx.objectStore(MEDIA_STORE_NAME).put({key,userId,projectId,assetId:id,blob,updatedAt:Date.now()});tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(new Error('The cleaned audio could not be saved.'));});
        if(!unchanged()){await new Promise(resolve=>{const tx=db.transaction(MEDIA_STORE_NAME,'readwrite');tx.objectStore(MEDIA_STORE_NAME).delete(key);tx.oncomplete=tx.onerror=tx.onabort=resolve;});check();}
        url=editorResources.createManagedUrl(blob);
        const result={id,name,type:'audio',kind:'audio',url,duration:cleaned.duration,localFile:true,persisted:true,size:blob.size,mimeType:'audio/wav',extension:'wav',waveform:{peaks:ZorifiAudioEngine.waveformFromChannels(Array.from({length:cleaned.numberOfChannels},(_,i)=>cleaned.getChannelData(i)),480),duration:cleaned.duration,sampleRate:cleaned.sampleRate,channels:cleaned.numberOfChannels}};
        snapshot();state.mediaAssets.unshift(result);url=null;render();scheduleProjectSave(0);return result;
      }finally{if(url)revokeManagedUrl(url);if(context&&context.state!=='closed')await context.close().catch(()=>{});this.pending.delete(controller);this.audioBusy=false;}
    }
    dispose(){if(this.closed)return;this.closed=true;global.ZorifiProfessionalStudio?.dispose();global.ZorifiProductionBridge?.dispose();this.studioDirector?.dispose();for(const task of this.pending){if(task.abort)task.abort();else if(task.cancel)void task.cancel();else if(task.dispose)void task.dispose();}this.pending.clear();}
  }
  global.ZorifiApp=ZorifiApp;
  function boot(){if(global.ZorifiMasterApp)return;global.ZorifiMasterApp=new ZorifiApp();
    const editorContext=vanessaEditorContext;vanessaEditorContext=function(){const value=editorContext();value.capabilities.studioDirector={scenePlanning:true,musicGeneration:true,combinedSceneAndSoundtrack:true,atomicUndo:true,requiresOpenProject:true};return value;};
    const generalContext=vanessaContext;vanessaContext=function(){const value=generalContext();value.features=[...(value.features||[]),'Unified Studio Director: plan scenes, generate a soundtrack, or add both in one undoable action in the open video or music project'];return value;};
    document.addEventListener('click',async event=>{
      const button=event.target.closest('[data-master-cleanup]');if(!button)return;
      const app=global.ZorifiMasterApp;if(app.audioBusy||app.cleanupUI?.status==='busy')return;
      const clipId=state.selected,projectId=state.projectId,userId=currentUser?.id;
      const ui={clipId,projectId,userId,status:'busy',message:'Cleaning the source audio locally…'};app.cleanupUI=ui;render();
      try{const asset=await app.enhanceSelectedClipAudio(clipId);ui.status='success';ui.message=`${asset.name} saved to Project Media. Original media preserved.`;}
      catch(error){ui.status='error';ui.message=error.message||'Audio cleanup failed. Try again.';}
      finally{if(state.projectId===projectId&&currentUser?.id===userId)render();}
    });
    global.addEventListener('pagehide',event=>{if(!event.persisted)global.ZorifiMasterApp.dispose();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
