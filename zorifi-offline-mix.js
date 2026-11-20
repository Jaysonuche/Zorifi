/* Bounded native PCM rendering; no editor store, provider or project mutation. */
(function(root,factory){
 const common=typeof module==='object'&&module.exports;
 if(common){require('./zorifi-audio-engine.js');require('./zorifi-composition-audio.js');}
 const api=factory(root,common?require('./zorifi-motion-graph.js'):root.ZorifiMotionGraph,root.ZorifiAudioEngine);
 if(common)module.exports=api;else root.ZorifiOfflineMix=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root,Graph,Audio){
 'use strict';
 const LIMITS=Object.freeze({duration:600,sources:64,encodedSourceBytes:64*1024*1024,encodedBytes:128*1024*1024,decodedBytes:256*1024*1024,outputBytes:128*1024*1024,automationEvaluations:1200000});
 const fail=message=>{throw Error(message);},finite=value=>typeof value==='number'&&Number.isFinite(value);
 function stopped(signal){if(signal?.aborted)throw new DOMException('Audio export stopped.','AbortError');}
 function abortable(promise,signal){stopped(signal);if(!signal)return promise;return new Promise((resolve,reject)=>{const abort=()=>{cleanup();reject(new DOMException('Audio export stopped.','AbortError'));},cleanup=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(value=>{cleanup();signal.aborted?abort():resolve(value);},error=>{cleanup();reject(error);});});}
 function constant(clip){if(clip.speedRamp?.enabled||Array.isArray(clip.speedRamp)||clip.keyframes?.sourceTime?.length||clip.keyframes?.playbackRate?.length||clip.motion?.expressions?.sourceTime||clip.motion?.expressions?.playbackRate)fail('WAV mixing currently supports constant positive source rates. Variable-speed/remapped audio was not exported.');const rate=clip.playbackRate??1;if(!finite(rate)||rate<=0||rate>16)fail('Use a constant audio source rate greater than zero and at most16.');return rate;}
 function containerSupported(clip){const a=Audio.normalize(clip.audioEffects);if(a.eq.enabled||a.noise.enabled||a.compressor.enabled||a.limiter.enabled!==Audio.DEFAULTS.limiter.enabled||a.limiter.ceiling!==Audio.DEFAULTS.limiter.ceiling||a.ducking.enabled)fail('Nested container audio processing needs a supported mix-down. The source clips were not exported with those settings omitted.');}
 function plan(project,{start=0,end}={}){
  if(!Graph||!Array.isArray(project?.clips))fail('A native editing project is required for the audio mix.');
  const duration=Number(project.creatorSettings?.compositionDuration)||Number(project.duration)||Math.max(1,...project.clips.map(c=>c.start+c.duration));end??=duration;
  if(!finite(start)||!finite(end)||!finite(duration)||start<0||end<=start||end>duration+.000001||end-start>LIMITS.duration)fail('Choose an audio range inside the composition, no longer than600 seconds.');
  Graph.validateGraph(project);
  const assets=new Map((project.mediaAssets||[]).map(a=>[a.id,a])),segments=[],boundaries=new Set([start,end]);let audioLayers=0;
  function walk(clips,a,b,from,to,tracks={},enabled=true,depth=0){
   if(depth>Graph.MAX_DEPTH)fail('The nested audio tree is too deep.');
   const trackSolo=Object.values(tracks).some(t=>t.solo),clipSolo=clips.some(c=>c.solo);
   for(const clip of clips){
    const begin=Math.max(from,(clip.start-b)/a),finish=Math.min(to,(clip.start+clip.duration-b)/a),asset=assets.get(clip.mediaId),track=tracks[clip.track]||{};
    const audible=enabled&&!clip.muted&&!clip.audioEffects?.muted&&!track.muted&&(!trackSolo||track.solo)&&(!clipSolo||clip.solo);
    if(clip.composition){if(finish<=begin)continue;if(!audible){audioLayers+=countAudio(clip.composition.clips,assets);continue;}const rate=constant(clip);containerSupported(clip);boundaries.add(begin);boundaries.add(finish);walk(clip.composition.clips,a*rate,(b-clip.start)*rate+(clip.sourceStart||0),begin,finish,clip.composition.trackStates||{},audible,depth+1);continue;}
    if(!asset||!['audio','video'].includes(asset.type))continue;audioLayers++;
    if(!audible||finish<=begin)continue;
    if(clip.motion?.expressions?.volume||clip.motion?.expressions?.audioPan)fail('WAV mixing does not yet support expression-driven audio gain/pan. No incomplete mix was exported.');
    const rate=constant(clip),offset=(clip.sourceStart||0)+(a*begin+b-clip.start)*rate,effectiveRate=a*rate;
    if(!finite(effectiveRate)||effectiveRate<=0||effectiveRate>64)fail('The combined nested source rate exceeds the supported audio range.');
    if(offset<-.000001||offset+(finish-begin)*effectiveRate>asset.duration+.025)fail('An audible clip extends outside its original audio recording.');
    boundaries.add(begin);boundaries.add(finish);segments.push({clipId:clip.id,mediaId:asset.id,start:begin,end:finish,offset:Math.max(0,offset),rate:effectiveRate});
   }
  }
  walk(project.clips,1,0,start,end,project.trackStates||{});
  if(!audioLayers)fail('Add an available audio or video source before exporting a mix.');
  if(segments.length>LIMITS.sources)fail('This device mix is bounded to64 audible source layers. No partial mix was exported.');
  const layers=Graph.validateGraph(project).layers||project.clips.length;
  const steps=Math.ceil((end-start)*50);if(steps*Math.max(layers,segments.length)>LIMITS.automationEvaluations)fail('The audio automation graph exceeds this device-render budget. Export a shorter range.');
  return {start,end,duration:end-start,compositionDuration:duration,segments,boundaries:[...boundaries].sort((a,b)=>a-b),silent:segments.length===0};
 }
 async function render(project,{sampleRate=48000,start=0,end,signal,check=()=>{},onProgress=()=>{},gainAt,panAt,limits={}}={}){
  for(const [key,value]of Object.entries(limits))if(!Object.hasOwn(LIMITS,key)||!finite(value)||value<=0||value>LIMITS[key])fail('Audio render limits may only lower the bounded defaults.');const bounds={...LIMITS,...limits};stopped(signal);if(![16000,22050,44100,48000].includes(sampleRate))fail('Choose a supported PCM sample rate.');
  const schedule=plan(project,{start,end});if(schedule.segments.length>bounds.sources)fail('The mix exceeds its audible-source sampling budget.');const frames=Math.ceil(schedule.duration*sampleRate);if(frames*2*4>bounds.outputBytes)fail('The decoded output exceeds the device memory budget. Export a shorter range.');
  const Offline=root.OfflineAudioContext||root.webkitOfflineAudioContext;if(!Offline)fail('Offline audio rendering is unavailable on this device.');
  const checkJob=()=>{stopped(signal);check();};checkJob();const context=new Offline(2,frames,sampleRate),buffers=new Map(),sources=[],chains=[];let encoded=0,decoded=0;
  const stopNodes=()=>{for(const n of sources)try{n.stop();}catch{}};signal?.addEventListener('abort',stopNodes,{once:true});
  async function read(asset){
   let file=typeof asset.file?.arrayBuffer==='function'?asset.file:null;
   if(!file&&asset.builtin&&root.ZorifiSFX?.byId(asset.sfxId||asset.audioTrackId))file=root.ZorifiSFX.blob(asset.sfxId||asset.audioTrackId);
   const known=file?.size||asset.size;if(known>bounds.encodedSourceBytes||known&&encoded+known>bounds.encodedBytes)fail('An original audio source exceeds the bounded decode budget. No partial mix was exported.');
   let bytes;
   if(file){bytes=await abortable(file.arrayBuffer(),signal);}
   else{
    if(!asset.url)fail('An original audio source is missing. Relink it before exporting.');
    const response=await fetch(asset.url,{signal});checkJob();if(!response.ok)fail('An original audio source could not be read. Relink it before exporting.');
    const length=Number(response.headers.get('content-length'))||0;if(length>bounds.encodedSourceBytes||length&&encoded+length>bounds.encodedBytes)fail('The audio source exceeds the bounded read budget.');
    if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const part=await abortable(reader.read(),signal);checkJob();if(part.done)break;size+=part.value.byteLength;if(size>bounds.encodedSourceBytes||encoded+size>bounds.encodedBytes)fail('The audio source exceeds the bounded read budget.');chunks.push(part.value);}bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}bytes=bytes.buffer;}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
    else bytes=await abortable(response.arrayBuffer(),signal);
   }
   checkJob();encoded+=bytes.byteLength;if(bytes.byteLength>bounds.encodedSourceBytes||encoded>bounds.encodedBytes)fail('Original audio sources exceed the bounded read budget.');
   let buffer;try{buffer=await abortable(context.decodeAudioData(bytes),signal);}catch(error){if(error.name==='AbortError')throw error;fail('An audible source could not be decoded. No partial mix was exported.');}
   checkJob();decoded+=buffer.length*buffer.numberOfChannels*4;if(decoded>bounds.decodedBytes)fail('Decoded originals exceed the device memory budget. No partial mix was exported.');return buffer;
  }
  try{
   for(const segment of schedule.segments){const at=(segment.start+segment.end)/2,frame=Graph.evaluate(project,at),node=frame.layers.find(n=>n.id===segment.clipId);if(frame.errors.length||!node||Math.abs(node.sourceTime-(segment.offset+(at-segment.start)*segment.rate))>.001||Math.abs(node.playbackRate-segment.rate)>.001)fail('Native source timing is not supported by this offline mix. No incomplete mix was exported.');}
   const ids=[...new Set(schedule.segments.map(s=>s.mediaId))];for(let i=0;i<ids.length;i++){checkJob();onProgress({phase:'decoding',completed:i,total:ids.length});const asset=project.mediaAssets.find(a=>a.id===ids[i]);buffers.set(ids[i],await read(asset));}
   for(const segment of schedule.segments){const original=find(project.clips,segment.clipId),buffer=buffers.get(segment.mediaId);if(segment.offset+(segment.end-segment.start)*segment.rate>buffer.duration+.025)fail('An audible clip exceeds its decoded recording. No partial mix was exported.');const source=context.createBufferSource();source.buffer=buffer;source.playbackRate.value=segment.rate;sources.push(source);const chain=Audio.createProcessingChain(context,source,context.destination,Audio.normalize(original.audioEffects));chains.push(chain);chain.gain.gain.cancelScheduledValues(0);chain.gain.gain.setValueAtTime(0,0);chain.pan.pan?.cancelScheduledValues(0);segment.chain=chain;segment.clip=original;source.start(segment.start-schedule.start,segment.offset,Math.min(buffer.duration-segment.offset,(segment.end-segment.start)*segment.rate));source.stop(segment.end-schedule.start);}
   const times=[...new Set([...schedule.boundaries,...Array.from({length:Math.ceil(schedule.duration*50)+1},(_,i)=>Math.min(schedule.end,schedule.start+i/50))])].sort((a,b)=>a-b);
   for(let i=0;i<times.length;i++){const time=times[i];checkJob();const frame=Graph.evaluate(project,Math.min(schedule.end-.0000001,time));if(frame.errors.length)fail('The native audio graph could not be evaluated. No partial mix was exported.');const nodes=new Map(frame.layers.map(n=>[n.id,n]));for(const segment of schedule.segments){if(time<segment.start-.0000001||time>segment.end+.0000001)continue;const node=nodes.get(segment.clipId),t=time-schedule.start,gain=node?(gainAt?gainAt(node,time,frame):defaultGain(project,node,frame)):0,pan=node?(panAt?panAt(node,time,frame):Audio.effectivePan(Graph.sampleKeys(node.clip.keyframes?.audioPan,node.localTime,node.clip.audioPan||0),node.audio.pan)):0;if(!finite(gain)||gain<0||!finite(pan))fail('Audio automation produced an invalid value.');segment.chain.gain.gain.setValueAtTime(Math.min(4,gain),t);segment.chain.pan.pan?.setValueAtTime(Math.max(-1,Math.min(1,pan)),t);}if(i%25===0){onProgress({phase:'scheduling',completed:i,total:times.length});await new Promise(resolve=>setTimeout(resolve,0));}}
   checkJob();onProgress({phase:'rendering',completed:0,total:1});const buffer=await abortable(context.startRendering(),signal);checkJob();const pcm=await measure(buffer,{check:checkJob});return {buffer,report:{duration:buffer.duration,from:schedule.start,to:schedule.end,sourceCount:ids.length,layers:schedule.segments.length,silent:schedule.silent,encodedBytes:encoded,decodedBytes:decoded,automationHz:50,nativeNested:true,pcm,claims:'Real stereo PCM with source-rate pitch changes; 50Hz level/pan automation. Not pitch-preserving time stretch, full LUFS or final encoded-video verification.'}};
  }finally{signal?.removeEventListener('abort',stopNodes);stopNodes();for(const source of sources){try{source.disconnect();source.buffer=null;}catch{}}for(const chain of chains)for(const node of [chain.noiseHigh,chain.noiseLow,...chain.eq,chain.compressor,chain.makeup,chain.limiter,chain.pan,chain.gain,chain.analyser])try{node.disconnect();}catch{}buffers.clear();}
 }
 async function measure(buffer,{check=()=>{}}={}){const channels=[];for(let c=0;c<buffer.numberOfChannels;c++){const samples=buffer.getChannelData(c);let peak=0,sum=0,fullScaleSamples=0;for(let i=0;i<samples.length;i++){const n=samples[i];if(!Number.isFinite(n))fail('The rendered audio contains an invalid sample.');peak=Math.max(peak,Math.abs(n));sum+=n*n;if(Math.abs(n)>=1)fullScaleSamples++;if(i%262144===0){check();await new Promise(resolve=>setTimeout(resolve,0));}}const rms=Math.sqrt(sum/Math.max(1,samples.length));channels.push({samplePeak:peak,rmsDbfs:rms>0?20*Math.log10(rms):-120,fullScaleSamples});}check();return {method:'full-rendered-stereo-sample-metrics',sampleRate:buffer.sampleRate,sampleCount:buffer.length,channels,claims:'Sample peaks and RMS only; not true-peak or LUFS.'};}
 function countAudio(clips,assets){return clips.reduce((n,c)=>n+(c.composition?countAudio(c.composition.clips,assets):['audio','video'].includes(assets.get(c.mediaId)?.type)?1:0),0);}
 function find(clips,id){for(const clip of clips){if(clip.id===id)return clip;const nested=clip.composition&&find(clip.composition.clips,id);if(nested)return nested;}return null;}
 function defaultGain(project,node,frame){if(!node.audio.enabled)return 0;const clip=node.clip,role=Audio.normalize(clip.audioEffects).role,category=role==='music'?(project.proSettings?.music??100):(project.proSettings?.dialogue??100),ducking=role==='music'&&frame.layers.some(n=>n.id!==node.id&&n.audio.enabled&&['dialogue','voiceover'].includes(Audio.normalize(n.clip.audioEffects).role));return Audio.effectiveGain({clip,keyframedVolume:Graph.sampleKeys(clip.keyframes?.volume,node.localTime,clip.volume??100),trackVolume:node.audio.gain*100,masterVolume:(project.proSettings?.audioMaster??100)*category/100,time:node.localTime,dialogueActive:ducking})*(root.ZorifiCompositionAudio?.ancestorGain(frame,node)??1);}
 return Object.freeze({LIMITS,plan,render,measure});
});
