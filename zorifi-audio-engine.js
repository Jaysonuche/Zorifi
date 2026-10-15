(function(global){
  'use strict';

  const EQ_BANDS=[
    {id:'low',type:'lowshelf',frequency:120},
    {id:'lowMid',type:'peaking',frequency:350,Q:1},
    {id:'mid',type:'peaking',frequency:1000,Q:1},
    {id:'highMid',type:'peaking',frequency:3500,Q:1},
    {id:'high',type:'highshelf',frequency:9000}
  ];
  const DEFAULTS={
    enabled:true,muted:false,role:'music',fadeIn:0,fadeOut:0,
    noise:{enabled:false,amount:0},
    eq:{enabled:false,low:0,lowMid:0,mid:0,highMid:0,high:0},
    compressor:{enabled:false,threshold:-24,ratio:4,attack:.01,release:.25,makeup:0},
    limiter:{enabled:true,ceiling:-1},
    ducking:{enabled:false,amount:55,attack:.15,release:.45,threshold:-36}
  };
  const PRESETS={
    studioDialogue:{name:'Studio Dialogue (filters)',settings:{role:'dialogue',noise:{enabled:true,amount:59},eq:{enabled:true,low:0,lowMid:0,mid:0,highMid:3.5,high:0},compressor:{enabled:true,threshold:-20,ratio:8,attack:.005,release:.15,makeup:0}}},
    balanced:{name:'Balanced',settings:{}},
    voiceClear:{name:'Voice Clear',settings:{role:'dialogue',noise:{enabled:true,amount:35},eq:{enabled:true,low:-2,lowMid:-1,mid:2,highMid:3,high:2},compressor:{enabled:true,threshold:-22,ratio:3,attack:.008,release:.18,makeup:2}}},
    dialogue:{name:'Dialogue',settings:{role:'dialogue',noise:{enabled:true,amount:25},eq:{enabled:true,low:-3,lowMid:0,mid:2,highMid:2,high:1},compressor:{enabled:true,threshold:-24,ratio:3.5,attack:.01,release:.22,makeup:2}}},
    podcast:{name:'Podcast',settings:{role:'voiceover',noise:{enabled:true,amount:42},eq:{enabled:true,low:1,lowMid:-2,mid:1,highMid:3,high:1},compressor:{enabled:true,threshold:-20,ratio:4,attack:.006,release:.16,makeup:3},limiter:{enabled:true,ceiling:-1}}},
    music:{name:'Music',settings:{role:'music',eq:{enabled:true,low:1,lowMid:0,mid:0,highMid:1,high:1},compressor:{enabled:true,threshold:-16,ratio:2,attack:.025,release:.3,makeup:1}}},
    reduceNoise:{name:'Reduce Background Noise',settings:{noise:{enabled:true,amount:65},eq:{enabled:true,low:-4,lowMid:-2,mid:1,highMid:1,high:-1}}},
    bassBoost:{name:'Bass Boost',settings:{eq:{enabled:true,low:7,lowMid:3,mid:0,highMid:0,high:1},compressor:{enabled:true,threshold:-14,ratio:2.5,attack:.02,release:.28,makeup:0}}}
  };

  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
  const clone=value=>JSON.parse(JSON.stringify(value));
  function merge(base,extra){const result=clone(base);Object.entries(extra||{}).forEach(([key,value])=>{result[key]=value&&typeof value==='object'&&!Array.isArray(value)?{...(result[key]||{}),...clone(value)}:value;});return result;}
  function normalize(settings={}){
    const value=merge(DEFAULTS,settings);value.fadeIn=clamp(value.fadeIn,0,30);value.fadeOut=clamp(value.fadeOut,0,30);value.noise.amount=clamp(value.noise.amount,0,100);
    EQ_BANDS.forEach(band=>value.eq[band.id]=clamp(value.eq[band.id],-24,24));value.compressor.threshold=clamp(value.compressor.threshold,-80,0);value.compressor.ratio=clamp(value.compressor.ratio,1,20);value.compressor.attack=clamp(value.compressor.attack,0,.5);value.compressor.release=clamp(value.compressor.release,.01,2);value.compressor.makeup=clamp(value.compressor.makeup,-12,24);value.limiter.ceiling=clamp(value.limiter.ceiling,-12,0);value.ducking.amount=clamp(value.ducking.amount,0,100);value.ducking.attack=clamp(value.ducking.attack,.01,2);value.ducking.release=clamp(value.ducking.release,.01,4);value.ducking.threshold=clamp(value.ducking.threshold,-80,0);return value;
  }
  function ensure(clip){clip.audioEffects=normalize(clip.audioEffects);return clip.audioEffects;}
  function dbToGain(db){return Math.pow(10,Number(db||0)/20);}
  function fadeGain(clip,time){const settings=normalize(clip.audioEffects),local=Math.max(0,time-clip.start),remaining=Math.max(0,clip.start+clip.duration-time),fadeIn=Math.max(0,clip.audioFadeIn??settings.fadeIn),fadeOut=Math.max(0,clip.audioFadeOut??settings.fadeOut);return Math.min(fadeIn?clamp(local/fadeIn,0,1):1,fadeOut?clamp(remaining/fadeOut,0,1):1);}
  function duckGain(settings,dialogueActive){const audio=normalize(settings);return audio.ducking.enabled&&dialogueActive?1-clamp(audio.ducking.amount,0,100)/100:1;}
  function effectiveGain({clipVolume=100,keyframedVolume=clipVolume,trackVolume=100,masterVolume=100,time=0,clip={start:0,duration:1},dialogueActive=false}){const settings=normalize(clip.audioEffects);if(settings.muted)return 0;return clamp(keyframedVolume,0,200)/100*clamp(trackVolume,0,200)/100*clamp(masterVolume,0,200)/100*fadeGain(clip,time)*duckGain(settings,dialogueActive);}
  function effectivePan(clipPan=0,trackPan=0){return clamp((Number(clipPan)||0)+(Number(trackPan)||0),-100,100)/100;}

  function waveformFromChannels(channels,sampleCount=320){if(!channels?.length||!channels[0]?.length)return [];const length=channels[0].length,count=Math.min(length,Math.max(1,Math.min(2048,Math.round(sampleCount)))),block=Math.max(1,Math.floor(length/count)),peaks=[];for(let index=0;index<count;index++){const from=index*block,to=index===count-1?length:Math.min(length,from+block);let peak=0;for(let sample=from;sample<to;sample++){let value=0;for(const channel of channels)value+=Math.abs(channel[sample]||0);peak=Math.max(peak,value/channels.length);}peaks.push(Math.round(clamp(peak,0,1)*1000)/1000);}return peaks;}
  let waveformWorker=null;
  function disposeWaveformWorker(){waveformWorker?.terminate();waveformWorker=null;}
  async function decodeWaveform(file,AudioClass,sampleCount=480){if(!AudioClass||!file?.arrayBuffer)throw new Error('Audio decoding is not supported on this device');const context=new AudioClass();try{const buffer=await context.decodeAudioData(await file.arrayBuffer()),channels=Array.from({length:buffer.numberOfChannels},(_,index)=>buffer.getChannelData(index));let peaks;if(global.ZorifiOptimization&&typeof global.Worker==='function'){try{if(!waveformWorker||waveformWorker.closed)waveformWorker=new global.ZorifiOptimization.AudioWorkerPipeline();peaks=await waveformWorker.analyzeChannels(channels,sampleCount);}catch{disposeWaveformWorker();peaks=waveformFromChannels(channels,sampleCount);}}else peaks=waveformFromChannels(channels,sampleCount);return {peaks,duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels};}catch(error){throw new Error('This audio file could not be decoded. Try WAV, MP3, M4A, AAC or WebM audio.');}finally{await context.close().catch(()=>{});}}
  function sliceWaveform(peaks=[],assetDuration=1,sourceStart=0,clipDuration=1,points=96,playbackRate=1){if(!peaks.length)return [];const start=clamp(sourceStart/Math.max(.01,assetDuration),0,1),end=clamp((sourceStart+clipDuration*Math.max(.05,playbackRate))/Math.max(.01,assetDuration),start,1),output=[];for(let index=0;index<points;index++){const progress=index/Math.max(1,points-1),sourceIndex=Math.min(peaks.length-1,Math.floor((start+(end-start)*progress)*peaks.length));output.push(peaks[sourceIndex]||0);}return output;}

  function connect(source,node){source.connect(node);return node;}
  function createProcessingChain(context,source,destination,settings={}){
    const noiseHigh=context.createBiquadFilter(),noiseLow=context.createBiquadFilter();noiseHigh.type='highpass';noiseLow.type='lowpass';let tail=connect(source,noiseHigh);tail=connect(tail,noiseLow);
    const eq=EQ_BANDS.map(config=>{const node=context.createBiquadFilter();node.type=config.type;node.frequency.value=config.frequency;if(config.Q)node.Q.value=config.Q;tail=connect(tail,node);return node;});
    const compressor=context.createDynamicsCompressor();tail=connect(tail,compressor);const makeup=context.createGain();tail=connect(tail,makeup);const limiter=context.createDynamicsCompressor();tail=connect(tail,limiter);const pan=context.createStereoPanner?.()||context.createGain();tail=connect(tail,pan);const gain=context.createGain();tail=connect(tail,gain);const analyser=context.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.72;tail=connect(tail,analyser);analyser.connect(destination||context.destination);
    const graph={context,source,noiseHigh,noiseLow,eq,compressor,makeup,limiter,pan,gain,analyser,peak:0,settings:null};updateProcessingChain(graph,settings);return graph;
  }
  function setParam(param,value,time,constant=.012){if(!param)return;const now=Number.isFinite(time)?time:param.context?.currentTime||0;try{param.cancelScheduledValues(now);param.setTargetAtTime(value,now,Math.max(.001,constant));}catch{param.value=value;}}
  function updateProcessingChain(graph,settings={},dynamic={}){if(!graph)return;const value=normalize(settings),now=graph.context.currentTime,noise=value.noise.enabled?value.noise.amount:0;setParam(graph.noiseHigh.frequency,28+noise*1.22,now);setParam(graph.noiseLow.frequency,20000-noise*92,now);graph.eq.forEach((node,index)=>setParam(node.gain,value.eq.enabled?value.eq[EQ_BANDS[index].id]:0,now));const compressor=value.compressor;setParam(graph.compressor.threshold,compressor.enabled?compressor.threshold:0,now);setParam(graph.compressor.ratio,compressor.enabled?compressor.ratio:1,now);setParam(graph.compressor.attack,compressor.enabled?compressor.attack:.003,now);setParam(graph.compressor.release,compressor.enabled?compressor.release:.25,now);setParam(graph.makeup.gain,dbToGain(compressor.enabled?compressor.makeup:0),now);const limiter=value.limiter;setParam(graph.limiter.threshold,limiter.enabled?limiter.ceiling:0,now);setParam(graph.limiter.knee,0,now);setParam(graph.limiter.ratio,limiter.enabled?20:1,now);setParam(graph.limiter.attack,.001,now);setParam(graph.limiter.release,.06,now);if(graph.pan.pan)setParam(graph.pan.pan,clamp(dynamic.pan??0,-1,1),now);setParam(graph.gain.gain,clamp(dynamic.gain??1,0,4),now,dynamic.gainTime??.012);graph.settings=value;return graph;}
  function meter(graph){if(!graph?.analyser)return {level:0,peak:0,clipping:false};const data=new Float32Array(graph.analyser.fftSize);graph.analyser.getFloatTimeDomainData(data);let sum=0,peak=0;for(const value of data){sum+=value*value;peak=Math.max(peak,Math.abs(value));}const level=Math.sqrt(sum/data.length);graph.peak=Math.max(peak,graph.peak*.94);return {level,peak:graph.peak,clipping:peak>=.985};}
  function applyPreset(clip,id){const preset=PRESETS[id];if(!preset)throw new Error('Unknown audio preset');clip.audioEffects=normalize(merge(ensure(clip),preset.settings));clip.audioPreset=id;return clip.audioEffects;}
  function setEffectEnabled(clip,effect,enabled){const settings=ensure(clip);if(!['noise','eq','compressor','limiter','ducking'].includes(effect))throw new Error('Unknown audio effect');settings[effect].enabled=Boolean(enabled);return settings;}
  function resetEffects(clip){clip.audioEffects=normalize();delete clip.audioPreset;return clip.audioEffects;}
  function applyAction(clip,action,args={}){if(!clip)throw new Error('An audio or video clip must be selected');if(action==='preset')return applyPreset(clip,args.id);if(action==='mute'){ensure(clip).muted=Boolean(args.value);return clip.audioEffects;}if(action==='fade'){clip.audioFadeIn=clamp(args.in,0,clip.duration);clip.audioFadeOut=clamp(args.out,0,clip.duration);return ensure(clip);}if(action==='duck'){const settings=ensure(clip);settings.ducking.enabled=true;settings.ducking.amount=clamp(args.amount??55,0,100);return settings;}throw new Error('Unsupported audio action');}

  class ZorifiAudioStudio{
    constructor({audioContext=null}={}){
      const AudioClass=global.AudioContext||global.webkitAudioContext;
      if(!audioContext&&!AudioClass)throw new Error('Web Audio is not supported on this device.');
      this.audioContext=audioContext||new AudioClass();this.ownsContext=!audioContext;
      this.tracks=new Map();this.disposed=false;this.playGeneration=0;
      this.masterGainNode=this.audioContext.createGain();this.masterGainNode.connect(this.audioContext.destination);
    }
    assertOpen(){if(this.disposed)throw new Error('Audio studio has been disposed.');}
    async addStemTrack(trackId,audioBuffer,stemType='master'){
      this.assertOpen();
      if(typeof trackId!=='string'||!trackId.trim())throw new TypeError('A track ID is required.');
      if(!audioBuffer||typeof audioBuffer.getChannelData!=='function'||!(audioBuffer.length>0)||!(audioBuffer.sampleRate>0))throw new TypeError('A non-empty decoded AudioBuffer is required.');
      stemType=stemType==='leads'?'lead':stemType;
      if(!['master','vocals','drums','bass','lead','fx'].includes(stemType))throw new TypeError('Unknown stem type.');
      this.removeTrack(trackId);
      const gainNode=this.audioContext.createGain(),panNode=this.audioContext.createStereoPanner?.()||null;
      if(panNode){gainNode.connect(panNode);panNode.connect(this.masterGainNode);}else gainNode.connect(this.masterGainNode);
      const track={id:trackId,audioBuffer,source:null,gainNode,panNode,stemType,isPlaying:false,volume:1,pan:0};
      this.tracks.set(trackId,track);return track;
    }
    setTrackVolume(trackId,volume){
      this.assertOpen();if(!Number.isFinite(Number(volume)))throw new TypeError('Volume must be finite.');
      const track=this.tracks.get(trackId);if(!track)return false;
      track.volume=clamp(volume,0,1);track.gainNode.gain.setValueAtTime(track.volume,this.audioContext.currentTime);return true;
    }
    setTrackPan(trackId,pan){
      this.assertOpen();if(!Number.isFinite(Number(pan)))throw new TypeError('Pan must be finite.');
      const track=this.tracks.get(trackId);if(!track)return false;
      if(!track.panNode)throw new Error('Stereo panning is not supported on this device.');
      track.pan=clamp(pan,-1,1);track.panNode.pan.setValueAtTime(track.pan,this.audioContext.currentTime);return true;
    }
    stopTrack(track){
      const source=track.source;track.source=null;track.isPlaying=false;
      if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();}
    }
    removeTrack(trackId){
      const track=this.tracks.get(trackId);if(!track)return false;
      this.stopTrack(track);track.gainNode.disconnect();track.panNode?.disconnect();this.tracks.delete(trackId);return true;
    }
    async playAll(){
      this.assertOpen();const generation=this.playGeneration;
      if(this.audioContext.state==='suspended'&&typeof this.audioContext.startRendering!=='function')await this.audioContext.resume();
      if(this.disposed||generation!==this.playGeneration)return;
      const when=this.audioContext.currentTime+.02,started=[];
      try{
        for(const track of this.tracks.values()){
          if(track.isPlaying)continue;
          const source=this.audioContext.createBufferSource();source.buffer=track.audioBuffer;source.connect(track.gainNode);
          track.source=source;track.isPlaying=true;started.push(track);
          source.onended=()=>{source.disconnect();if(track.source===source){track.source=null;track.isPlaying=false;}};
          source.start(when);
        }
      }catch(error){started.forEach(track=>this.stopTrack(track));throw error;}
    }
    stopAll(){this.playGeneration++;this.tracks.forEach(track=>this.stopTrack(track));}
    analyzeBeatsAndWaveforms(audioBuffer){
      if(!audioBuffer||typeof audioBuffer.getChannelData!=='function'||!(audioBuffer.sampleRate>0)||!(audioBuffer.numberOfChannels>0))throw new TypeError('A decoded AudioBuffer is required.');
      const channels=Array.from({length:audioBuffer.numberOfChannels},(_,i)=>audioBuffer.getChannelData(i));
      const peaks=waveformFromChannels(channels,150),estimatedBeats=[];
      // Approximate transient onsets in 10 ms windows, independent of display resolution.
      const step=Math.max(1,Math.round(audioBuffer.sampleRate*.01));let previous=0,last=-Infinity;
      for(let from=0;from<audioBuffer.length;from+=step){
        const end=Math.min(audioBuffer.length,from+step);let energy=0;
        for(const channel of channels)for(let i=from;i<end;i++){const value=Number.isFinite(channel[i])?channel[i]:0;energy+=value*value;}
        energy=Math.sqrt(energy/((end-from)*channels.length));const time=from/audioBuffer.sampleRate;
        if(energy>.08&&energy>previous*1.5&&time-last>=.15){estimatedBeats.push(time);last=time;}
        previous=energy;
      }
      return {peaks,estimatedBeats};
    }
    buildAIMusicPrompt(options){return global.ZorifiMusicStudio.buildAIMusicPrompt(options);}
    async dispose(){
      if(this.disposed)return;this.disposed=true;this.stopAll();
      for(const id of [...this.tracks.keys()])this.removeTrack(id);
      this.masterGainNode.disconnect();if(this.ownsContext&&this.audioContext.state!=='closed')await this.audioContext.close();
    }
  }
  // Local DSP, not learned voice isolation or dereverberation. No live audio
  // context is needed: rendering is silent and does not request a microphone.
  class ZorifiAudioCleanupEngine {
    constructor({OfflineAudioContext:Context=global.OfflineAudioContext||global.webkitOfflineAudioContext}={}){this.Context=Context;}
    async enhanceDialogueTrack(audioBuffer,{strength='professional'}={}){
      if(!['professional','gentle'].includes(strength))throw new RangeError('Use professional or gentle dialogue enhancement.');
      if(!audioBuffer||typeof audioBuffer.getChannelData!=='function'||!Number.isInteger(audioBuffer.length)||audioBuffer.length<1||!Number.isInteger(audioBuffer.numberOfChannels)||audioBuffer.numberOfChannels<1||audioBuffer.numberOfChannels>32||!Number.isFinite(audioBuffer.sampleRate)||audioBuffer.sampleRate<8000||audioBuffer.sampleRate>192000)throw new TypeError('A decoded, nonempty AudioBuffer is required.');
      if(audioBuffer.length*audioBuffer.numberOfChannels>32*1024*1024)throw new RangeError('This audio is too large for local cleanup. Process a shorter segment.');
      if(!this.Context)throw new Error('Offline audio rendering is unavailable in this browser.');
      const ctx=new this.Context(audioBuffer.numberOfChannels,audioBuffer.length,audioBuffer.sampleRate),nodes=[];
      try{
        const source=ctx.createBufferSource();nodes.push(source);source.buffer=audioBuffer;
        const highPass=ctx.createBiquadFilter();nodes.push(highPass);highPass.type='highpass';highPass.frequency.value=strength==='professional'?100:80;
        const presence=ctx.createBiquadFilter();nodes.push(presence);presence.type='peaking';presence.frequency.value=Math.min(3500,audioBuffer.sampleRate*.45);presence.Q.value=1;presence.gain.value=strength==='professional'?3.5:2;
        const compressor=ctx.createDynamicsCompressor();nodes.push(compressor);
        for(const [key,value] of Object.entries({threshold:-20,knee:25,ratio:strength==='professional'?8:3,attack:.005,release:.15}))compressor[key].setValueAtTime(value,ctx.currentTime);
        source.connect(highPass);highPass.connect(presence);presence.connect(compressor);compressor.connect(ctx.destination);source.start(0);
        return await ctx.startRendering();
      }finally{for(const node of nodes)node.disconnect();}
    }
  }
  function validateCleanupBuffer(buffer){
    if(!buffer||!Number.isInteger(buffer.length)||buffer.length<1||!Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||buffer.numberOfChannels>2||!Number.isInteger(buffer.sampleRate)||buffer.sampleRate<8000||buffer.sampleRate>192000||typeof buffer.getChannelData!=='function')throw new TypeError('A nonempty mono or stereo decoded AudioBuffer is required.');
    if(buffer.length*buffer.numberOfChannels>32*1024*1024)throw new RangeError('Process a shorter audio segment.');
    for(let c=0;c<buffer.numberOfChannels;c++)if(buffer.getChannelData(c).length!==buffer.length)throw new TypeError('Audio channel lengths do not match.');
  }
  function cleanupWavBlob(buffer){
    validateCleanupBuffer(buffer);const channels=buffer.numberOfChannels,size=buffer.length*channels*2,view=new DataView(new ArrayBuffer(44+size));
    const text=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
    text(0,'RIFF');view.setUint32(4,size+36,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,size,true);
    const data=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));let at=44;
    for(let i=0;i<buffer.length;i++)for(let c=0;c<channels;c++){const raw=data[c][i],value=Number.isFinite(raw)?Math.max(-1,Math.min(1,raw)):0;view.setInt16(at,Math.round(value*(value<0?32768:32767)),true);at+=2;}
    return new Blob([view.buffer],{type:'audio/wav'});
  }
  class ZorifiVanessaAudioCleanup {
    constructor(audioContext){this.audioContext=audioContext||null;}
    async processAudio(buffer,{mode='dialogue_cleanup',strength=.75}={}){
      if(mode!=='dialogue_cleanup')throw new Error('Only dialogue_cleanup is available. AI isolation and reverb removal require a separate trained model.');
      if(!Number.isFinite(strength)||strength<0||strength>1)throw new RangeError('Cleanup strength must be between 0 and 1.');
      validateCleanupBuffer(buffer);
      const Context=global.OfflineAudioContext||global.webkitOfflineAudioContext;if(!Context)throw new Error('Offline audio rendering is unavailable.');
      const ctx=new Context(buffer.numberOfChannels,buffer.length,buffer.sampleRate),nodes=[];
      try{
        const source=ctx.createBufferSource();nodes.push(source);source.buffer=buffer;
        if(strength===0){source.connect(ctx.destination);source.start(0);return await ctx.startRendering();}
        const low=ctx.createBiquadFilter(),high=ctx.createBiquadFilter(),presence=ctx.createBiquadFilter(),compressor=ctx.createDynamicsCompressor();nodes.push(low,high,presence,compressor);
        low.type='highpass';low.frequency.value=20+80*strength;
        high.type='lowpass';high.frequency.value=Math.min(buffer.sampleRate*.49,18000-10500*strength);
        presence.type='peaking';presence.frequency.value=Math.min(2500,buffer.sampleRate*.4);presence.Q.value=1.2;presence.gain.value=5*strength;
        // Compression controls loud peaks; it is not a gate or dereverberator.
        for(const [key,value] of Object.entries({threshold:-12*strength,knee:2,ratio:1+19*strength,attack:.001,release:.1}))compressor[key].setValueAtTime(value,0);
        source.connect(low);low.connect(high);high.connect(presence);presence.connect(compressor);compressor.connect(ctx.destination);source.start(0);
        return await ctx.startRendering();
      }finally{for(const node of nodes)node.disconnect();}
    }
    audioBufferToWavBlob(buffer){return cleanupWavBlob(buffer);}
  }
  global.ZorifiVanessaAudioCleanup=ZorifiVanessaAudioCleanup;
  // Compatibility name for the supplied snippet; capabilities remain local DSP.
  global.ZorifiVanessaTrueAudioAI=ZorifiVanessaAudioCleanup;
  global.ZorifiAudioCleanupEngine=ZorifiAudioCleanupEngine;
  global.ZorifiAudioStudio=ZorifiAudioStudio;
  global.ZorifiAudioEngine={ZorifiAudioCleanupEngine,ZorifiAudioStudio,EQ_BANDS,DEFAULTS,PRESETS,normalize,ensure,dbToGain,fadeGain,duckGain,effectiveGain,effectivePan,waveformFromChannels,decodeWaveform,disposeWaveformWorker,sliceWaveform,createProcessingChain,updateProcessingChain,meter,applyPreset,setEffectEnabled,resetEffects,applyAction};
  Object.assign(global.ZorifiAudioEngine,{ZorifiVanessaAudioCleanup,ZorifiVanessaTrueAudioAI:ZorifiVanessaAudioCleanup,audioBufferToWavBlob:cleanupWavBlob});
})(typeof window!=='undefined'?window:globalThis);
