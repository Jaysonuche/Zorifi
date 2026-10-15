(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.ZorifiMulticam=api;root.ZorifiMulticamSyncEngine=api.ZorifiMulticamSyncEngine;}
  if(typeof self!=='undefined'&&typeof document==='undefined'&&typeof self.postMessage==='function')self.onmessage=event=>{
    try{self.postMessage({result:api.correlate(event.data.master,event.data.target,event.data.options)});}
    catch(error){self.postMessage({error:error.message});}
  };
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function correlate(master,target,{maxOffsetSeconds=15,minConfidence=.65}={}){
    const rate=master?.sampleRate,a=master?.envelope,b=target?.envelope;
    if(!Number.isFinite(rate)||rate<=0||rate!==target?.sampleRate||!(a instanceof Float32Array)||!(b instanceof Float32Array))throw new Error('Envelopes require equal sample rates and Float32 samples.');
    if(!Number.isFinite(maxOffsetSeconds)||maxOffsetSeconds<0||maxOffsetSeconds>60||!Number.isFinite(minConfidence)||minConfidence<0||minConfidence>1)throw new Error('Invalid sync search settings.');
    if(a.some(v=>!Number.isFinite(v))||b.some(v=>!Number.isFinite(v)))throw new Error('Audio contains invalid samples.');
    const minimum=Math.max(Math.ceil(rate),Math.ceil(Math.min(a.length,b.length)*.5));
    if(Math.min(a.length,b.length)<minimum)throw new Error('At least one second of overlapping audio is required.');
    const limit=Math.min(Math.round(maxOffsetSeconds*rate),Math.max(a.length,b.length)-minimum);
    if((2*limit+1)*Math.min(a.length,b.length)>40000000)throw new Error('Audio search is too large. Use a lower envelope sample rate or shorter recordings.');
    const scores=[];let best=null;
    // lag is the target start relative to the master, not the opposite sign.
    for(let lag=-limit;lag<=limit;lag++){
      const from=Math.max(0,lag),to=Math.min(a.length,b.length+lag),n=to-from;if(n<minimum)continue;
      let sa=0,sb=0,saa=0,sbb=0,sab=0;
      for(let i=from;i<to;i++){const x=a[i],y=b[i-lag];sa+=x;sb+=y;saa+=x*x;sbb+=y*y;sab+=x*y;}
      const va=saa-sa*sa/n,vb=sbb-sb*sb/n;if(va<1e-10*n||vb<1e-10*n)continue;
      const score=Math.max(-1,Math.min(1,(sab-sa*sb/n)/Math.sqrt(va*vb))),item={lag,score,overlapSeconds:n/rate};scores.push(item);if(!best||score>best.score)best=item;
    }
    if(!best||best.score<minConfidence)throw new Error('No reliable audio match was found. Use recordings with shared, audible sound.');
    const runner=scores.filter(item=>Math.abs(item.lag-best.lag)>Math.max(1,Math.round(rate*.1))).reduce((score,item)=>Math.max(score,item.score),-1);
    if(best.score-runner<.03)throw new Error('Audio match is ambiguous. Try a less repetitive section.');
    return {offsetSeconds:best.lag/rate,confidence:best.score,overlapSeconds:best.overlapSeconds,resolutionSeconds:1/rate};
  }
  class ZorifiMulticamSyncEngine{
    constructor({audioContext=null,fetchMedia=(url,options)=>fetch(url,options),workerFactory=()=>new Worker('./zorifi-multicam.js?v=1'),beforeApply=()=>{}}={}){
      this.audioContext=audioContext;this.ownsContext=!audioContext;this.fetchMedia=fetchMedia;this.workerFactory=workerFactory;this.beforeApply=beforeApply;this.pending=new Set();this.disposed=false;this.lastResults=[];this.busy=false;
    }
    async extractWaveformEnvelope(audioBuffer,targetSampleRate=100){
      const rate=audioBuffer?.sampleRate;
      if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(targetSampleRate)||targetSampleRate<1||targetSampleRate>Math.min(rate,1000)||!(audioBuffer.numberOfChannels>0))throw new Error('Invalid audio or envelope sample rate.');
      const length=Math.min(audioBuffer.length,Math.floor(rate*60)),ratio=rate/targetSampleRate,count=Math.ceil(length/ratio),envelope=new Float32Array(count);
      const channels=Array.from({length:audioBuffer.numberOfChannels},(_,i)=>audioBuffer.getChannelData(i));
      for(let i=0;i<count;i++){
        const from=Math.floor(i*ratio),to=Math.min(length,Math.floor((i+1)*ratio));let energy=0;
        for(const channel of channels)for(let j=from;j<to;j++){const value=Number.isFinite(channel[j])?channel[j]:0;energy+=Math.abs(value);}
        envelope[i]=to>from?energy/((to-from)*channels.length):0;
        if(i%1000===999){await new Promise(resolve=>setTimeout(resolve,0));if(this.disposed)throw new Error('Audio sync cancelled.');}
      }
      return {envelope,sampleRate:targetSampleRate};
    }
    calculateAudioOffset(master,target,options){return correlate(master,target,options).offsetSeconds;}
    matchEnvelopes(master,target,{signal,...options}={}){
      if(this.disposed||signal?.aborted)return Promise.reject(new Error('Audio sync cancelled.'));
      return new Promise((resolve,reject)=>{
        const worker=this.workerFactory();let timer,settled=false;
        const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);this.pending.delete(cancel);worker.terminate();error?reject(error):resolve(result);};
        const cancel=()=>finish(new Error('Audio sync cancelled.'));this.pending.add(cancel);signal?.addEventListener('abort',cancel,{once:true});
        timer=setTimeout(()=>finish(new Error('Audio matching timed out.')),30000);
        worker.onmessage=event=>event.data.error?finish(new Error(event.data.error)):finish(null,event.data.result);
        worker.onerror=()=>finish(new Error('Audio sync worker failed.'));worker.onmessageerror=()=>finish(new Error('Audio sync result could not be read.'));
        try{worker.postMessage({master,target,options});}catch(error){finish(error);}
      });
    }
    async decode(asset,signal){
      if(this.disposed||signal?.aborted)throw new Error('Audio sync cancelled.');
      let file=asset?.file;if(!file?.size){if(!asset?.url)throw new Error('Restore the source media before syncing.');const response=await this.fetchMedia(asset.url,{signal});if(!response.ok)throw new Error('Source media could not be loaded.');file=await response.blob();}
      if(!file.size||file.size>100*1024*1024)throw new Error('Use nonempty media files under 100 MB for audio sync.');
      if(!this.audioContext){const AudioClass=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AudioClass)throw new Error('Audio decoding is unavailable.');this.audioContext=new AudioClass();}
      const buffer=await this.audioContext.decodeAudioData(await file.arrayBuffer());if(this.disposed||signal?.aborted)throw new Error('Audio sync cancelled.');
      return this.extractWaveformEnvelope(buffer);
    }
    async synchronizeMulticamTracks(state,masterId,targetIds,{signal}={}){
      if(this.busy||this.disposed)throw new Error('Audio sync is busy or closed.');this.busy=true;
      try{
        const ids=[masterId,...new Set(targetIds.filter(id=>id!==masterId))];if(ids.length<2)throw new Error('Select a master and at least one target clip.');
        const clips=ids.map(id=>state.clips.find(c=>c.id===id));if(clips.some(c=>!c||!['audio','video'].includes(c.type)))throw new Error('Select audio or video clips with recorded sound.');
        if(clips.some(c=>state.trackStates?.[c.track]?.locked))throw new Error('Unlock the selected tracks first.');
        const master=clips[0],rate=master.playbackRate||1;
        if(clips.some(c=>!Number.isFinite(c.start)||c.start<0||!Number.isFinite(c.duration)||c.duration<=0||!Number.isFinite(c.sourceStart||0)||(c.sourceStart||0)<0||!Number.isFinite(c.playbackRate||1)||(c.playbackRate||1)<=0||(c.playbackRate||1)!==rate||c.speedRamp||c.reverse||c.keyframes?.playbackRate?.length))throw new Error('Sync requires valid clips with matching constant playback speeds and no reverse or speed ramps.');
        const assets=clips.map(c=>state.mediaAssets.find(a=>a.id===c.mediaId));if(assets.some(a=>!a))throw new Error('Source media is missing.');
        const snapshot=()=>JSON.stringify([state.projectId,state.clips,state.trackStates,state.mediaAssets.map(a=>[a.id,a.url])]),before=snapshot(),files=assets.map(a=>a.file);
        const masterEnv=await this.decode(assets[0],signal),results=[];
        for(let i=1;i<clips.length;i++){const env=await this.decode(assets[i],signal),match=await this.matchEnvelopes(masterEnv,env,{signal});results.push({clipId:clips[i].id,...match,start:master.start+((clips[i].sourceStart||0)-(master.sourceStart||0)+match.offsetSeconds)/rate});}
        if(signal?.aborted||this.disposed)throw new Error('Audio sync cancelled.');
        if(before!==snapshot()||clips.some((c,i)=>state.mediaAssets.find(a=>a.id===c.mediaId)?.file!==files[i]))throw new Error('The project changed during analysis. Run sync again.');
        if(results.some(r=>r.start<0))throw new Error('An aligned clip would start before zero. Move the master later and retry.');
        const changes=new Map(results.map(r=>[r.clipId,r])),used=new Set(state.clips.map(c=>c.track)),groupId='multicam-'+Date.now()+'-'+Math.random().toString(36).slice(2);
        const move=(clip,delta)=>{const next={...clip,start:clip.start+delta};if(clip.keyframes)next.keyframes=Object.fromEntries(Object.entries(clip.keyframes).map(([property,frames])=>[property,frames.map(frame=>({...frame,time:frame.time+delta}))]));for(const key of ['captionWords','kineticWords'])if(clip[key])next[key]=clip[key].map(word=>({...word,start:word.start+delta,end:word.end+delta}));return next;};
        const next=state.clips.map(clip=>{
          const change=changes.get(clip.id),sourceChange=changes.get(clip.autoCaptionSourceId);
          if(sourceChange&&state.trackStates?.[clip.track]?.locked)throw new Error('Unlock linked caption tracks first.');
          if(sourceChange)return move(clip,sourceChange.start-clips.find(c=>c.id===clip.autoCaptionSourceId).start);
          if(!change)return clip.id===masterId?{...clip,multicamGroupId:groupId,multicamRole:'master'}:clip;
          let track=clip.type==='audio'?100:4,limit=clip.type==='audio'?200:100;while(used.has(track)&&track<limit)track++;if(track>=limit)throw new Error('No spare track is available.');used.add(track);
          return {...move(clip,change.start-clip.start),track,multicamGroupId:groupId,multicamRole:'angle',multicamConfidence:change.confidence};
        });
        if(next.some(c=>c.start<0))throw new Error('Linked captions would move before zero. Move the master later and retry.');
        this.beforeApply();state.clips=next;state.duration=Math.max(0,...next.map(c=>c.start+c.duration));this.lastResults=results;return state;
      }finally{this.busy=false;}
    }
    async dispose(){if(this.disposed)return;this.disposed=true;for(const cancel of [...this.pending])cancel();if(this.ownsContext&&this.audioContext&&this.audioContext.state!=='closed')await this.audioContext.close();}
  }
  return {correlate,ZorifiMulticamSyncEngine};
});
