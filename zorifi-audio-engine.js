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
  async function decodeWaveform(file,AudioClass,sampleCount=480){if(!AudioClass||!file?.arrayBuffer)throw new Error('Audio decoding is not supported on this device');const context=new AudioClass();try{const buffer=await context.decodeAudioData(await file.arrayBuffer()),channels=Array.from({length:buffer.numberOfChannels},(_,index)=>buffer.getChannelData(index));return {peaks:waveformFromChannels(channels,sampleCount),duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels};}catch(error){throw new Error('This audio file could not be decoded. Try WAV, MP3, M4A, AAC or WebM audio.');}finally{await context.close().catch(()=>{});}}
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

  global.ZorifiAudioEngine={EQ_BANDS,DEFAULTS,PRESETS,normalize,ensure,dbToGain,fadeGain,duckGain,effectiveGain,effectivePan,waveformFromChannels,decodeWaveform,sliceWaveform,createProcessingChain,updateProcessingChain,meter,applyPreset,setEffectEnabled,resetEffects,applyAction};
})(typeof window!=='undefined'?window:globalThis);
