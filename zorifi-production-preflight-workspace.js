/* Manual and Vanessa access to the same read-only local preflight. */
(function(global){
 'use strict';
 const Core=global.ZorifiProductionPreflight,lifecycle=new AbortController();
 let pane=null,controller=null,result=null,scope=null,monitor=null,epoch=0;
 const owner=()=>String(currentUser?.id||'local')+'|'+String(currentUser?.cloudUid||'');
 const revision=()=>JSON.stringify(ProjectModel.captureHistory(state));
 function capture(){return {owner:owner(),project:state,projectId:state.projectId,revision:revision(),sources:state.mediaAssets.map(a=>({id:a.id,url:a.url,file:a.file}))};}
 function valid(s){return s&&s.owner===owner()&&s.project===state&&s.projectId===state.projectId&&state.view==='editor'&&s.revision===revision()&&s.sources.length===state.mediaAssets.length&&s.sources.every((a,i)=>{const b=state.mediaAssets[i];return a.id===b.id&&a.url===b.url&&a.file===b.file;});}
 function check(s){if(!valid(s))throw new DOMException('The project or account changed. Run a fresh preflight.','AbortError');}
 function cancel(){controller?.abort();controller=null;epoch++;}
 function close(){cancel();clearInterval(monitor);monitor=null;pane?.remove();pane=null;scope=null;result=null;}
 function element(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
 function button(text,action,attribute){const node=element('button',text);node.type='button';if(attribute)node.setAttribute(attribute,'');node.onclick=()=>{try{action();}catch(error){toast(error.message);}};return node;}
 function paint(report,stage){if(!pane)return;const body=pane.querySelector('[data-preflight-content]');body.replaceChildren();body.append(element('p',stage,'preflight-stage'));if(!report)return;
  const output=report.checks.find(c=>c.id==='output_dimensions'&&!c.scope.length)?.details;if(output)body.append(element('p',`Output check: ${output.width} × ${output.height}. Render samples use the composition aspect ratio; the entire timeline is inspected even when exporting a selected range.`));
  const s=report.summary;body.append(element('p',`${s.errors} errors · ${s.warnings} warnings · ${s.layers} layers · ${s.compositions} composition${s.compositions===1?'':'s'}`,'preflight-summary'));
  body.append(element('p',`${s.frames} sampled frames · ${s.audioSeconds.toFixed(2)} seconds of measured root audio. This check makes no edits and uses no AI credits.`));
  const gallery=element('div',undefined,'preflight-frames');for(const frame of report.rendered?.frames||[]){if(!/^data:image\/jpeg;base64,/.test(frame.image||''))continue;const figure=element('figure'),image=element('img');image.src=frame.image;image.alt=`Actual rendered sample at ${frame.time.toFixed(2)} seconds`;figure.append(image,element('figcaption',`${frame.time.toFixed(2)}s`));gallery.append(figure);}body.append(gallery);
  if(report.rendered?.audio){const m=report.rendered.audio.metrics;body.append(element('p',`Sampled mono PCM: peak ${m.samplePeak.toFixed(4)}, RMS ${m.rmsDbfs.toFixed(1)} dBFS, ${m.clippedSamples} full-scale samples. This is not a full-program LUFS measurement.`));}
  const findings=element('section');findings.append(element('h3','Findings'));if(!report.issues.length)findings.append(element('p','No structural errors were found within the review limits. Play the complete export before delivery.'));
  for(const item of report.issues){const row=element('article',undefined,'preflight-finding '+item.severity);row.append(element('strong',`${item.severity.toUpperCase()} · ${item.code.replaceAll('_',' ')}`),element('p',item.message));if(item.scope?.length)row.append(element('small','Nested timeline: '+item.scope.join(' / ')));if(item.range)row.append(element('small',`Timeline interval ${item.range.from}s–${item.range.to}s`));findings.append(row);}body.append(findings);
  const limits=element('details');limits.open=true;limits.append(element('summary','Still needs review'));for(const item of report.unassessed)limits.append(element('p',item.reason));body.append(limits);
 }
 function show(){close();scope=capture();pane=element('dialog',undefined,'zorifi-preflight');pane.dataset.productionPreflight='';pane.setAttribute('aria-labelledby','preflight-title');const header=element('header'),heading=element('h2','Production preflight');heading.id='preflight-title';header.append(heading,button('Close',close,'data-preflight-close'));const body=element('div');body.dataset.preflightContent='';const footer=element('footer');footer.append(button('Stop sampling',()=>{cancel();if(result)paint(result,'Sampling stopped. Structural findings remain; unmeasured output still needs review.');},'data-preflight-stop'),button('Run again',()=>void run().catch(error=>toast(error.message)),'data-preflight-run'));pane.append(header,body,footer);pane.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(pane);pane.showModal();monitor=setInterval(()=>{if(!valid(scope))close();},200);return pane;}
 async function run({samples=true,kind=typeof editorWorkspaceMode!=='undefined'&&editorWorkspaceMode==='music'?'audio':'video',open=true,outputResolution}={}){
  if(state.view!=='editor'||!state.projectId)throw Error('Open an editing project before running preflight.');
  if(!['audio','video'].includes(kind))throw Error('Choose video or audio preflight.');
  if(open)show();else cancel();const captured=capture(),job=++epoch,local=new AbortController();controller=local;scope=captured;
  const snapshot={...ProjectModel.captureHistory(state),projectId:state.projectId,mediaAssets:state.mediaAssets.map(a=>({...a}))};
  if(outputResolution)snapshot.proSettings={...snapshot.proSettings,exportResolution:outputResolution};
  result=Core.audit(snapshot,{kind});paint(result,samples?'Checking structure and sampling the actual renderer…':'Structural inspection completed; rendering has not been measured.');
  try{
   if(samples&&result.summary.errors===0){
    const rendered=await global.ZorifiProfessionalStudio.sampleCurrentProject({signal:local.signal,check:()=>check(captured),maxFrames:Core.LIMITS.frames,kind,onProgress:p=>{if(job===epoch&&valid(captured))paint(result,`Measuring native preview frames ${p.completed}/${p.total}…`);}});
    check(captured);if(local.signal.aborted||job!==epoch)throw new DOMException('Preflight stopped.','AbortError');result=Core.audit(snapshot,{kind,rendered});
   }else if(samples)result=Core.audit(snapshot,{kind,error:'Rendered sampling was not attempted because structural errors need attention first.'});
   check(captured);if(job!==epoch)throw new DOMException('Preflight stopped.','AbortError');paint(result,'Preflight completed. Review the findings and the full export before delivery.');return result;
  }catch(error){
   if(job!==epoch)throw new DOMException('Preflight stopped.','AbortError');
   if(!valid(captured)){close();throw error;}
   if(job===epoch){result=Core.audit(snapshot,{kind,error:error.message});paint(result,'Some output could not be measured. Structural findings are available below.');}
   if(error.name==='AbortError')throw error;return result;
  }finally{if(controller===local)controller=null;}
 }
 function attachExport(modal,kind){if(!modal||modal.querySelector('[data-open-preflight]'))return;const node=button('Check before export',()=>{const field=modal.querySelector('[data-export-resolution]');let outputResolution=field?.value;if(outputResolution==='custom')outputResolution=Math.max(2,Math.min(7680,Number(modal.querySelector('[data-export-width]').value)))+'x'+Math.max(2,Math.min(4320,Number(modal.querySelector('[data-export-height]').value)));void run({kind,outputResolution}).catch(error=>{if(error.name!=='AbortError')toast(error.message);});},'data-open-preflight');(modal.querySelector('footer')||modal).prepend(node);}
 const previousRender=render;function guardedRender(...args){if(scope&&!valid(scope))close();return previousRender(...args);}render=guardedRender;
 const bridge=global.ZorifiEditorWorkflowBridge,oldTurn=bridge?.turn,oldCancel=bridge?.cancel;
 if(bridge){bridge.turn=async function(message){if(state.view!=='editor'||!Core.intent(message))return oldTurn.apply(this,arguments);global.ZorifiProductionBridge.identity();const report=await run();return {status:'SUCCESS',readOnly:true,message:`I ran the local production preflight: ${report.summary.errors} structural errors, ${report.summary.warnings} warnings, ${report.summary.frames} rendered frame samples and ${report.summary.audioSeconds.toFixed(2)} seconds of measured root audio. The findings are open. Your timeline and Undo history are unchanged. The complete encoded export still needs playback review.`,preflight:report};};bridge.cancel=function(){cancel();return oldCancel.apply(this,arguments);};}
 function dispose(){close();lifecycle.abort();if(render===guardedRender)render=previousRender;if(bridge){bridge.turn=oldTurn;bridge.cancel=oldCancel;}}
 global.addEventListener('pagehide',close,{signal:lifecycle.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)close();},{signal:lifecycle.signal});
 global.ZorifiPreflightWorkspace={run,close,cancel,attachExport,dispose,inspect:()=>({busy:Boolean(controller),report:result})};
})(window);
