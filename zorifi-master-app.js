/* Unified facade over the running editor. No duplicate project state or boot. */
(function(global){
  'use strict';
  class ZorifiApp {
    constructor(){
      this.audioAI=new ZorifiVanessaAudioCleanup();
      this.aiGateway=new ZorifiOptimization.SecureAIService({transport:vanessaFetch,resolveEndpoint:vanessaEndpoint,timeoutMs:120000});
      this.scenePlanner=new ZorifiScenePlanner();
      this.easing=ZorifiEasingCurves;
      this.pending=new Set();this.audioBusy=false;this.closed=false;this.cleanupUI=null;this.chatSubmitting=false;
    }
    get state(){return state;}
    assertOpen(){if(this.closed)throw new Error('The application session has closed.');}
    async consultVanessa(promptText){this.assertOpen();if(typeof promptText!=='string'||!promptText.trim())throw new Error('Enter a prompt for Vanessa.');if(this.chatSubmitting||vanessaBusy)return;this.chatSubmitting=true;try{return await sendToVanessa(promptText.trim());}finally{this.chatSubmitting=false;}}
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
    dispose(){if(this.closed)return;this.closed=true;for(const task of this.pending){if(task.abort)task.abort();else void task.dispose();}this.pending.clear();}
  }
  global.ZorifiApp=ZorifiApp;
  function boot(){if(global.ZorifiMasterApp)return;global.ZorifiMasterApp=new ZorifiApp();
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
