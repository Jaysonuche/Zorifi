/* Composition fades over existing clips, clocks, history and native audio APIs. */
(function(root,factory){
 const common=typeof module==='object'&&module.exports;
 if(common)require('./zorifi-audio-engine.js');
 const api=factory(common?require('./zorifi-motion-graph.js'):root.ZorifiMotionGraph,root.ZorifiAudioEngine);
 if(common)module.exports=api;root.ZorifiCompositionAudio=api;
 if(!common&&typeof audioPanel==='function')api.install(root);
})(typeof globalThis!=='undefined'?globalThis:this,function(Graph,Audio){
 'use strict';
 const frames=new WeakMap(),fail=message=>{throw Error(message);};
 function find(project,id){function walk(clips,depth){if(depth>Graph.MAX_DEPTH)fail('The composition audio tree is too deep.');for(const clip of clips||[]){if(clip.id===id)return clip;const child=clip.composition&&walk(clip.composition.clips,depth+1);if(child)return child;}return null;}return walk(project.clips,0);}
 function setFades(project,id,parameters){
  const clip=find(project,id);if(!clip?.composition)fail('Select a native composition to fade its combined audio.');
  if(Graph.isLocked(project,id))fail('Unlock the composition and its containing tracks before changing audio fades.');
  if(!parameters||typeof parameters!=='object'||Array.isArray(parameters)||!Object.keys(parameters).length||Object.keys(parameters).some(k=>!['in','out'].includes(k)))fail('Choose fade-in and/or fade-out seconds.');
  for(const [key,value]of Object.entries(parameters))if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Math.min(30,clip.duration))fail('Composition fades must fit the clip and the30-second editing limit.');
  for(const [key,value]of Object.entries(parameters))clip[key==='in'?'audioFadeIn':'audioFadeOut']=value;
  return clip;
 }
 function ancestorGain(frame,node){
  if(!node.compositionId)return 1;
  let byId=frames.get(frame);if(!byId){byId=new Map(frame.layers.map(n=>[n.id,n]));frames.set(frame,byId);}
  let id=node.compositionId,gain=1,depth=0;const seen=new Set();
  while(id){if(seen.has(id)||++depth>Graph.MAX_DEPTH)fail('A composition audio dependency is cyclic or too deep.');seen.add(id);const parent=byId.get(id);if(!parent?.clip.composition)fail('An active composition audio parent is missing.');if(!parent.audio?.enabled||parent.clip.muted||parent.clip.audioEffects?.muted)return 0;gain*=Audio.fadeGain(parent.clip,parent.localTime);id=parent.compositionId;}
  return Math.max(0,Math.min(1,gain));
 }
 function install(root){
  const previousPanel=audioPanel,lifecycle=new AbortController();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function section(){const clip=state.clips.find(c=>c.id===state.selected&&c.composition);if(!clip)return '';const disabled=Graph.isLocked(state,clip.id),limit=Math.min(30,clip.duration);return `<section class="composition-audio-controls"><h3>Composition audio</h3><p>Fade the combined audio inside ${escape(clip.name||'this composition')}. The source files and child mix stay editable.</p><form data-composition-audio data-target="${escape(clip.id)}" data-owner="${escape(currentUser?.id||'guest')}" data-project="${escape(state.projectId)}"><label>Fade in (s)<input name="in" type="number" min="0" max="${limit}" step=".05" value="${Number(clip.audioFadeIn??clip.audioEffects?.fadeIn)||0}" ${disabled?'disabled':''}></label><label>Fade out (s)<input name="out" type="number" min="0" max="${limit}" step=".05" value="${Number(clip.audioFadeOut??clip.audioEffects?.fadeOut)||0}" ${disabled?'disabled':''}></label><button type="submit" ${disabled?'disabled':''}>Apply composition fades</button></form><small>Uses the composition’s containing timeline clock, including nested speed and source trims. Preview, MP4, WAV and preflight share this envelope. Non-default container filters still require a supported mix-down.</small></section>`;}
  function panel(){return section()+previousPanel.apply(this,arguments);}audioPanel=panel;
  document.addEventListener('submit',event=>{const form=event.target;if(!form.matches('[data-composition-audio]'))return;event.preventDefault();const before=ProjectModel.captureHistory(state),history={undo:[...state.undo],redo:[...state.redo]};let started=false;
   try{if(form.dataset.owner!==(currentUser?.id||'guest')||form.dataset.project!==state.projectId||state.view!=='editor')fail('The account or project changed. Reopen the composition audio controls.');const parameters=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,Number(v)]));setFades({...state,clips:structuredClone(state.clips)},form.dataset.target,parameters);snapshot();started=true;setFades(state,form.dataset.target,parameters);render();if(saveProject()!==true)fail('The composition fades could not be saved on this device.');toast('Composition fades saved. One Undo restores the previous mix.');}
   catch(error){if(started){ProjectModel.restoreHistory(state,before);state.undo=history.undo;state.redo=history.redo;render();if(saveProject()!==true){toast('The edit was rolled back but device storage could not save the restored project.');return;}}toast(error.message);}
  },{signal:lifecycle.signal});
  root.ZorifiCompositionAudioUI={dispose(){lifecycle.abort();if(audioPanel===panel)audioPanel=previousPanel;}};
 }
 return {find,setFades,ancestorGain,install};
});
