/* Selected processed sample peaks over native source bytes, envelopes and history. */
(function(root,factory){
 const common=typeof module==='object'&&module.exports;
 const api=factory(root,common?require('./zorifi-offline-mix.js'):root.ZorifiOfflineMix,common?require('./zorifi-motion-graph.js'):root.ZorifiMotionGraph);
 if(common)module.exports=api;else{root.ZorifiSamplePeakNormalize=api;api.install();}
})(typeof globalThis!=='undefined'?globalThis:this,function(root,Mix,Graph){
 'use strict';
 const LIMITS=Object.freeze({seconds:120,encodedBytes:64*1024*1024,decodedBytes:128*1024*1024,outputBytes:48*1024*1024,keys:1000,sampleRate:48000});
 const finite=n=>typeof n==='number'&&Number.isFinite(n),clone=value=>structuredClone(value),fail=message=>{throw Error(message);};
 const stopped=()=>new DOMException('Sample-peak normalization stopped.','AbortError');
 function checkSignal(signal,check=()=>{}){if(signal?.aborted)throw stopped();check();}
 function abortable(promise,signal){checkSignal(signal);if(!signal)return promise;return new Promise((resolve,reject)=>{const abort=()=>{cleanup();reject(stopped());},cleanup=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(value=>{cleanup();signal.aborted?reject(stopped()):resolve(value);},error=>{cleanup();reject(error);});});}
 function envelope(clip){
  const base=clip.volume??100,keys=clip.keyframes?.volume||[];
  if(!finite(base)||base<0||base>200||!Array.isArray(keys)||keys.length>LIMITS.keys)fail('Use finite clip volume and up to 1000 volume keys between 0 and 200.');
  const times=new Set();for(const key of keys){if(!key||!finite(key.time)||key.time<clip.start||key.time>clip.start+clip.duration||times.has(key.time)||!finite(key.value)||key.value<0||key.value>200)fail('Repair invalid or duplicate volume keys before normalizing.');times.add(key.time);if(!['linear','hold','ease-in','ease-out','ease-in-out','easy-ease'].includes(key.easing||'linear'))fail('Sample-peak normalization supports monotonic native volume curves. Remove custom or overshooting volume curves first.');}
  return {base,keys};
 }
 function validate(project,{target,targetDbfs=-6}={}){
  if(!finite(targetDbfs)||targetDbfs< -24||targetDbfs> -1)fail('Choose a sample-peak target between −24 and −1 dBFS.');
  if(!Array.isArray(project?.clips)||typeof target!=='string')fail('Select one root audio or video clip.');
  const matches=project.clips.filter(c=>c.id===target),clip=matches[0];
  if(matches.length!==1||!clip||!['audio','video'].includes(clip.type)||clip.composition)fail('Select one root audio or video source, outside a composition.');
  Graph.validateGraph(project);if(clip.locked||clip.zorifiEnding||Graph.isLocked(project,target))fail('Unlock the selected clip and its track before normalizing.');
  const sources=(project.mediaAssets||[]).filter(a=>a.id===clip.mediaId),asset=sources[0];
  if(sources.length!==1||!asset||!['audio','video'].includes(asset.type))fail('Relink an actual audio or video recording before normalizing.');
  if(!finite(clip.start)||clip.start<0||!finite(clip.duration)||clip.duration<.05||clip.duration>LIMITS.seconds||!finite(asset.duration)||asset.duration<=0||asset.duration>LIMITS.seconds)fail('Selected clips and their complete source recordings must be no longer than 120 seconds.');
  const rate=clip.playbackRate??1,offset=clip.sourceStart??0;
  if(!finite(rate)||rate<=0||rate>16||!finite(offset)||offset<0||offset+clip.duration*rate>asset.duration+.000001||clip.speedRamp||clip.timeRemapSource||clip.keyframes?.sourceTime?.length||clip.keyframes?.playbackRate?.length)fail('Use a source-bounded clip with constant positive speed, no remap or speed keys.');
  if(clip.parentId||clip.motion?.matte||Object.keys(clip.motion?.expressions||{}).length)fail('Remove parent, matte and expression dependencies before normalizing this root source.');
  if(clip.muted||clip.audioEffects?.muted)fail('Unmute the selected clip before measuring its sample peak.');
  const known=asset.file?.size??asset.size;
  if(known!==undefined&&(!finite(known)||known<=0||known>LIMITS.encodedBytes))fail('The original recording must be non-empty and at most 64 MiB.');
  if(clip.duration*LIMITS.sampleRate*2*4>LIMITS.outputBytes||asset.duration*LIMITS.sampleRate*2*4>LIMITS.decodedBytes)fail('The recording exceeds the bounded audio memory budget.');
  envelope(clip);return {clip,asset,targetDbfs};
 }
 function scaleEnvelope(clip,ratio){
  if(!finite(ratio)||ratio<=0)fail('The measured normalization gain is invalid.');
  const values=envelope(clip),scaled=[values.base,...values.keys.map(k=>k.value)].map(n=>n*ratio);
  if(scaled.some(n=>!finite(n)||n>200+1e-8))fail('This target needs volume above 200%. Choose a lower sample-peak target; no levels were changed.');
  const next=clone(clip);next.volume=Math.min(200,scaled[0]);if(values.keys.length)next.keyframes.volume=values.keys.map((key,i)=>({...clone(key),value:Math.min(200,scaled[i+1])}));return next;
 }
 function isolated(project,clip,asset){return {projectId:project.projectId,duration:clip.start+clip.duration,frameWidth:project.frameWidth||320,frameHeight:project.frameHeight||180,creatorSettings:{compositionDuration:clip.start+clip.duration},proSettings:{audioMaster:100,music:100,dialogue:100},trackStates:{[clip.track]:{volume:100,pan:0}},clips:[clone(clip)],mediaAssets:[asset]};}
 function peakOf(report){const channels=report?.pcm?.channels;if(!Array.isArray(channels)||channels.length!==2||channels.some(c=>!finite(c.samplePeak)||c.samplePeak<0))fail('Both rendered audio channels need finite sample-peak measurements.');return Math.max(...channels.map(c=>c.samplePeak));}
 async function readSource(asset,{signal,check}={}){
  checkSignal(signal,check);let file=asset.file;
  if(!file?.arrayBuffer&&asset.builtin&&root.ZorifiSFX?.byId(asset.sfxId||asset.audioTrackId))file=root.ZorifiSFX.blob(asset.sfxId||asset.audioTrackId);
  if(file?.arrayBuffer){if(!finite(file.size)||file.size<=0||file.size>LIMITS.encodedBytes)fail('The original recording must be non-empty and at most 64 MiB.');return file;}
  if(typeof asset.url!=='string'||!(/^(?:blob:|data:(?:audio|video)\/)/i.test(asset.url)))fail('Import or relink this recording as a local file before normalizing. No external source is requested.');
  if(asset.url.startsWith('data:')&&asset.url.length>LIMITS.encodedBytes*1.4)fail('The recording exceeds the 64 MiB source budget.');
  const response=await fetch(asset.url,{signal});checkSignal(signal,check);if(!response.ok)fail('The original local recording could not be read. Relink it first.');
  const known=Number(response.headers.get('content-length'))||0;if(known>LIMITS.encodedBytes)fail('The original recording exceeds 64 MiB.');
  if(!response.body?.getReader)fail('Bounded local source reading is unavailable on this device.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const part=await abortable(reader.read(),signal);checkSignal(signal,check);if(part.done)break;size+=part.value.byteLength;if(size>LIMITS.encodedBytes)fail('The original recording exceeds 64 MiB.');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  if(!size)fail('The original recording is empty.');return new Blob(chunks,{type:asset.mimeType||response.headers.get('content-type')||'audio/wav'});
 }
 async function measureProposal(project,parameters,{signal,check=()=>{},onProgress=()=>{},render=(...args)=>Mix.render(...args)}={}){
  const {clip,asset,targetDbfs}=validate(project,parameters);checkSignal(signal,check);
  const file=await readSource(asset,{signal,check});checkSignal(signal,check);
  const original={...asset,file,size:file.size},options={start:clip.start,end:clip.start+clip.duration,sampleRate:LIMITS.sampleRate,signal,check,limits:{sources:1,encodedSourceBytes:LIMITS.encodedBytes,encodedBytes:LIMITS.encodedBytes,decodedBytes:LIMITS.decodedBytes,outputBytes:LIMITS.outputBytes}};
  onProgress('Measuring the selected processed clip…');let rendered=await render(isolated(project,clip,original),options);checkSignal(signal,check);
  const before=clone(rendered.report.pcm),peak=peakOf(rendered.report);rendered=null;
  if(peak<1e-7)fail('The selected processed clip is silent or too quiet to normalize safely.');
  const targetPeak=Math.pow(10,targetDbfs/20),ratio=targetPeak/peak,next=scaleEnvelope(clip,ratio);
  onProgress('Verifying the proposed sample peak…');rendered=await render(isolated(project,next,original),options);checkSignal(signal,check);
  const after=clone(rendered.report.pcm),achieved=peakOf(rendered.report);rendered=null;
  if(achieved<=0||Math.abs(20*Math.log10(achieved)-targetDbfs)>.05)fail('The proposed rendered sample peak could not be verified. No levels were changed.');
  return {clip:next,targetDbfs,targetPeak,ratio,before,after,beforePeak:peak,afterPeak:achieved,claims:'Selected processed clip before track/master levels and other clips. Stereo sample peaks and RMS only; not LUFS or true-peak. Native decode/render may finish after Stop; late results are discarded.'};
 }
 let active=null,pane=null,monitor=null,dialogScope=null,installed=false;
 function capture(){return {project:state,projectId:state.projectId,view:state.view,user:currentUser?.id,cloud:currentUser?.cloudUid,session:typeof firebaseGateway!=='undefined'?firebaseGateway.session:null,revision:JSON.stringify(ProjectModel.captureHistory(state)),undo:JSON.stringify(state.undo),redo:JSON.stringify(state.redo),assets:state.mediaAssets.map(a=>({asset:a,id:a.id,type:a.type,duration:a.duration,size:a.size,url:a.url,file:a.file}))};}
 function valid(scope){return scope&&scope.project===state&&scope.projectId===state.projectId&&scope.view===state.view&&state.view==='editor'&&scope.user===currentUser?.id&&scope.cloud===currentUser?.cloudUid&&scope.session===(typeof firebaseGateway!=='undefined'?firebaseGateway.session:null)&&scope.revision===JSON.stringify(ProjectModel.captureHistory(state))&&scope.undo===JSON.stringify(state.undo)&&scope.redo===JSON.stringify(state.redo)&&scope.assets.length===state.mediaAssets.length&&scope.assets.every((a,i)=>{const b=state.mediaAssets[i];return a.asset===b&&['id','type','duration','size','url','file'].every(k=>a[k]===b[k]);});}
 function cancel(){active?.controller.abort();}
 function close(){cancel();clearInterval(monitor);monitor=null;dialogScope=null;pane?.remove();pane=null;}
 function status(message){const node=pane?.querySelector('[data-sample-peak-status]');if(node)node.textContent=message;}
 function clearAutosave(){if(typeof autosaveTimer!=='undefined'){clearTimeout(autosaveTimer);autosaveTimer=null;}}
 function saved(){return root.ZorifiProductionBridge?.savedMatches?.()===true;}
 async function execute(parameters,{signal}={}){
  if(typeof state==='undefined'||state.view!=='editor'||!state.projectId)fail('Open an editing project first.');if(active)fail('A sample-peak operation is already running. Stop it before starting another.');
  validate(state,parameters);if(state.selected!==parameters.target)fail('Select this root clip before normalizing it.');const scope=capture(),controller=new AbortController(),abort=()=>controller.abort(),job={controller};if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});active=job;
  const check=()=>{checkSignal(controller.signal);if(!valid(scope))throw new DOMException('The account, project, selection, source or timeline changed. Normalization stopped.','AbortError');};
  try{
   const project={...ProjectModel.captureHistory(state),projectId:state.projectId,mediaAssets:state.mediaAssets.map(a=>({...a}))},result=await measureProposal(project,parameters,{signal:controller.signal,check,onProgress:status});check();
   const before=ProjectModel.captureHistory(state),undo=[...state.undo],redo=[...state.redo];let committed=false;
   try{snapshot();committed=true;const clip=state.clips.find(c=>c.id===parameters.target);clip.volume=result.clip.volume;if(result.clip.keyframes?.volume?.length)clip.keyframes.volume=clone(result.clip.keyframes.volume);render();clearAutosave();if(saveProject()!==true||!saved())fail('The normalized clip could not be verified in device storage.');}
   catch(error){if(committed){ProjectModel.restoreHistory(state,before);state.undo=undo;state.redo=redo;render();clearAutosave();if(!saved()&&(saveProject()!==true||!saved()))throw Error('Normalization was rolled back, but device storage could not save the restored project. Free storage before closing.');}throw error;}
   if(pane)dialogScope=capture();return {status:'SUCCESS',verified:true,persisted:true,clipId:parameters.target,...result,clip:undefined,message:`Sample peak changed from ${(20*Math.log10(result.beforePeak)).toFixed(2)} to ${(20*Math.log10(result.afterPeak)).toFixed(2)} dBFS and saved. One Undo restores the previous volume envelope. This measures the selected processed clip before track/master levels and other clips; not LUFS or true-peak.`};
  }finally{signal?.removeEventListener('abort',abort);if(active===job)active=null;}
 }
 function open({target=state.selected,targetDbfs=-6}={}){
  close();const {clip}=validate(state,{target,targetDbfs});if(state.selected!==target)fail('Select this root clip before opening sample-peak normalization.');dialogScope=capture();
  pane=document.createElement('dialog');pane.className='sample-peak-normalize';pane.setAttribute('aria-labelledby','sample-peak-title');
  const title=document.createElement('h2');title.id='sample-peak-title';title.textContent='Normalize selected sample peak';const description=document.createElement('p');description.textContent=`${clip.name||clip.id} · Measures this processed clip before track/master levels and other clips. Original source, timing, effects and mixer stay editable.`;
  const form=document.createElement('form');form.dataset.samplePeakForm='';const label=document.createElement('label');label.textContent='Target sample peak (dBFS)';const input=document.createElement('input');Object.assign(input,{type:'number',name:'targetDbfs',min:'-24',max:'-1',step:'.1',value:String(targetDbfs),required:true});label.append(input);
  const receipt=document.createElement('p');receipt.dataset.samplePeakStatus='';receipt.setAttribute('role','status');receipt.textContent='Two silent local renders measure and verify the change before saving. No LUFS or true-peak measurement. Later mixer gains and overlapping sources may still clip the complete mix.';
  const controls=document.createElement('div');controls.className='sample-peak-actions';const apply=document.createElement('button');apply.type='submit';apply.textContent='Measure, verify and save';apply.dataset.samplePeakApply='';const stop=document.createElement('button');stop.type='button';stop.textContent='Stop';stop.disabled=true;stop.dataset.samplePeakStop='';stop.onclick=cancel;const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='Close';dismiss.dataset.samplePeakClose='';dismiss.onclick=close;controls.append(apply,stop,dismiss);form.append(label,controls);pane.append(title,description,form,receipt);
  form.onsubmit=async event=>{event.preventDefault();if(!valid(dialogScope)){close();return;}apply.disabled=true;stop.disabled=false;input.disabled=true;const current=pane;try{const result=await execute({target,targetDbfs:Number(input.value)});if(pane===current)status(result.message);}catch(error){if(pane===current)status(error.name==='AbortError'?'Normalization stopped. No volume edit was saved.':error.message);}finally{if(pane===current){apply.disabled=false;stop.disabled=true;input.disabled=false;}}};
  pane.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(pane);pane.showModal();monitor=setInterval(()=>{if(!valid(dialogScope))close();},100);return pane;
 }
 function install(){if(installed||typeof document==='undefined')return;installed=true;document.addEventListener('click',event=>{if(!event.target.closest('[data-sample-peak-open]'))return;try{open();}catch(error){toast(error.message);}});root.addEventListener('pagehide',close);document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});if(typeof audioPanel==='function'){const previous=audioPanel;audioPanel=function(){const selected=state.clips.find(c=>c.id===state.selected&&['audio','video'].includes(c.type)&&!c.composition);return previous.apply(this,arguments)+(selected?'<button class="audio-section-button" data-sample-peak-open><span>Normalize selected sample peak</span><b>PEAK</b></button>':'');};}}
 return Object.freeze({LIMITS,validate,envelope,scaleEnvelope,isolated,peakOf,readSource,measureProposal,execute,open,close,cancel,install,inspect:()=>({busy:Boolean(active),open:Boolean(pane)})});
});
