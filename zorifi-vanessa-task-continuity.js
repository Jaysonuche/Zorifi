(function(root,factory){
  const commonJs=typeof window==='undefined'&&typeof module==='object'&&module.exports&&typeof require==='function';
  const api=factory(commonJs?require('./zorifi-vanessa-task-orchestration.js'):root.ZorifiVanessaTaskOrchestration,commonJs?require('./zorifi-vanessa-execution-feedback.js'):root.ZorifiVanessaExecutionFeedback);
  if(commonJs)module.exports=api;else root.ZorifiVanessaTaskContinuity=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Tasks,Feedback){
  'use strict';
  if(!Tasks||!Feedback)throw new Error('Task continuity requires Vanessa Task Orchestration and Execution Feedback.');

  const RESOLUTION=Object.freeze({NONE:'NONE',CONVERSATION:'CONVERSATION',RESOLVED:'RESOLVED',AMBIGUOUS:'AMBIGUOUS',STALE:'STALE',CONFIRM:'CONFIRM',REJECT:'REJECT',RETRY:'RETRY',UNDO:'UNDO'});
  const CONTEXT_STATUS=Object.freeze({ACTIVE:'ACTIVE',PENDING:'PENDING',COMPLETED:'COMPLETED',FAILED:'FAILED',REJECTED:'REJECTED',RECOVERED:'RECOVERED',STALE:'STALE'});
  const LIMITS=Object.freeze({tasks:3,objects:24,text:500,turns:8});
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const clean=(value,max=LIMITS.text)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
  const uniqueBy=(items,key)=>[...new Map(items.filter(Boolean).map(item=>[key(item),item])).values()];
  const taskTerminal=status=>[Tasks.TASK_STATUS.COMPLETED,Tasks.TASK_STATUS.PARTIAL,Tasks.TASK_STATUS.FAILED,Tasks.TASK_STATUS.REJECTED,Tasks.TASK_STATUS.RECOVERED].includes(status);
  const confirmation=/^(?:yes|yeah|yep|confirm|apply|apply it|do it|go ahead)[.!]?$/i;
  const rejection=/^(?:no|nope|reject|cancel|don['’]?t do it)[.!]?$/i;
  const retry=/^(?:retry|retry that|try it again|try again|do it again)[.!]?$/i;
  const undo=/^(?:undo|undo that|go back to (?:what we had|before the last change)|restore (?:the )?previous change)[.!]?$/i;
  const conversational=/^(?:what did we do earlier|tell me what you changed|how does .+ work|what does .+ do|i(?:'m| am) tired|that['’]?s funny|how are you|tell me a joke|what['’]?s your name|can i talk to you)\??[.!]?$/i;
  const referenceSignal=/\b(?:this|that|it|them|those|previous|next|other|same|again|before|just did|just applied|transition|captions?|subtitles?|effect|music|soundtrack|style|change)\b/i;
  const explicitNewTask=/\b(?:new task|different project|start over|forget that task|unrelated edit)\b/i;

  function snapshot(input){return Feedback.captureEditorState(input||{});}
  function projectId(input){return clean(snapshot(input).project.id,120)||'open-project';}
  function objectFromClip(clip,role='clip'){return clip?{id:clean(clip.id,120),name:clean(clip.name||role,120),type:clean(clip.type||'unknown',30),role,track:Number(clip.track)||0,start:Number(clip.start)||0}:null;}
  function inferRole(intent,clip){
    if(intent==='CAPTIONS_ADD'||intent==='CAPTION_STYLE'||clip?.autoCaption)return 'captions';
    if(intent==='TRANSITION')return 'transition';if(intent==='EFFECT'||intent==='FILTER')return 'effect';
    if(intent==='MUSIC'||intent==='VOLUME'||clip?.type==='audio')return 'music';if(intent==='TEXT'||clip?.type==='text')return 'text';
    if(intent==='BACKGROUND_REMOVE'||intent==='CHROMA_KEY'||intent==='MASK'||intent==='SPEED'||intent==='TRIM'||intent==='ZOOM')return 'clip';
    if(intent==='EXPORT'||intent==='SAVE'||intent==='ASPECT_RATIO'||intent==='PREVIEW')return 'project';return 'clip';
  }
  function operationObjects(operation,state){
    const clips=state.clips||[],diff=operation?.verification?.stateDiff||{},ids=[];
    if(operation?.target&&!['selected_clip','captions','music','project'].includes(operation.target))ids.push(operation.target);
    const changed=[...(diff.added||[]),...(diff.changedClips||[])];
    if(['CAPTIONS_ADD','CAPTION_STYLE','CAPTIONS_REMOVE'].includes(operation?.intent))for(const item of changed)if(item.autoCaption||clips.find(clip=>clip.id===item.id)?.autoCaption)ids.push(item.id);
    else if(['VOLUME','MUSIC','AUDIO_ADD','AUDIO_EXTRACT'].includes(operation?.intent))for(const item of changed)if(['audio','video'].includes(clips.find(clip=>clip.id===item.id)?.type)&&(/music|soundtrack|song/i.test(clips.find(clip=>clip.id===item.id)?.name||'')||clips.find(clip=>clip.id===item.id)?.type==='audio'))ids.push(item.id);
    else if(!ids.length)for(const item of changed)ids.push(item.id);
    const objects=uniqueBy(ids.map(id=>clips.find(clip=>clip.id===id)).filter(Boolean).map(clip=>objectFromClip(clip,inferRole(operation.intent,clip))),item=>item.id);
    if(operation?.intent==='CAPTIONS_ADD'||operation?.intent==='CAPTION_STYLE')for(const clip of clips.filter(item=>item.autoCaption))objects.push(objectFromClip(clip,'captions'));
    if(operation?.intent==='VOLUME'||operation?.intent==='MUSIC')for(const clip of clips.filter(item=>item.type==='audio'||/music|soundtrack|song/i.test(item.name)))objects.push(objectFromClip(clip,'music'));
    if(['TRANSITION','EFFECT','FILTER'].includes(operation?.intent)&&!objects.length){const selected=clips.find(item=>item.id===state.selection?.clipId);if(selected)objects.push(objectFromClip(selected,inferRole(operation.intent,selected)));}
    return uniqueBy(objects,item=>`${item.id}:${item.role}`).slice(0,LIMITS.objects);
  }
  function contextFromTask(task,editorState,userVisibleResult=''){
    const state=snapshot(editorState||task?.finalState||task?.baseline||{}),operations=(task?.operations||[]).map(operation=>({id:clean(operation.id,80),intent:clean(operation.intent,60),description:clean(operation.description,180),commandText:clean(operation.commandText,300),target:clean(operation.target,120),status:clean(operation.status,40),objects:operationObjects(operation,state),recovery:clone(task?.recovery||null)})),objects=uniqueBy(operations.flatMap(item=>item.objects),item=>`${item.id}:${item.role}`);
    return {taskId:clean(task?.id,140)||`continuity-${Date.now().toString(36)}`,projectId:clean(task?.projectId||state.project.id,120)||'open-project',status:clean(task?.status,40)||CONTEXT_STATUS.ACTIVE,userIntent:clean(task?.userIntent,500),operations,objects:objects.slice(0,LIMITS.objects),verifiedStateFingerprint:state.fingerprint,pendingConfirmation:task?.status===Tasks.TASK_STATUS.AWAITING_CONFIRMATION,recovery:clone(task?.recovery||null),userVisibleResult:clean(userVisibleResult||task?.userFeedback?.message,300),turnAge:0,updatedAt:new Date().toISOString()};
  }
  function wordsForRole(role){return {captions:'captions',transition:'transition',effect:'effect',music:'music',style:'style',text:'text',clip:'clip',project:'project'}[role]||role;}
  function requestedRole(text){if(/\b(?:captions?|subtitles?|them|those)\b/i.test(text)&&/\b(?:caption|subtitle|them|those)\b/i.test(text))return /\b(?:captions?|subtitles?)\b/i.test(text)?'captions':'';if(/\btransition\b/i.test(text))return 'transition';if(/\beffect\b/i.test(text))return 'effect';if(/\b(?:music|soundtrack|song)\b/i.test(text))return 'music';if(/\bstyle\b/i.test(text))return 'style';if(/\btext\b/i.test(text))return 'text';if(/\b(?:clip|video|image|it|this|that)\b/i.test(text))return 'clip';return '';}
  function existsInState(reference,state){
    if(!reference)return false;if(reference.role==='project')return true;
    if(reference.role==='captions')return state.clips.some(item=>item.autoCaption&&(!reference.id||item.id===reference.id));
    if(reference.role==='transition'){const clip=state.clips.find(item=>item.id===reference.id);return Boolean(clip?.transition);}
    if(reference.role==='effect'){const clip=state.clips.find(item=>item.id===reference.id);return Boolean(clip&&(clip.effects?.length||clip.effectStack?.length||clip.filter||Object.keys(clip.adjustments||{}).length));}
    return state.clips.some(item=>item.id===reference.id);
  }
  function neighbour(reference,state,direction){const ordered=state.clips.filter(item=>['video','image'].includes(item.type)).sort((a,b)=>a.start-b.start||a.track-b.track),index=ordered.findIndex(item=>item.id===reference?.id),target=ordered[index+(direction==='previous'?-1:1)];return objectFromClip(target,'clip');}
  function rewrite(text,reference,context,state){
    let result=clean(text),target=reference;
    if(/\b(?:next|other) clip\b/i.test(result)){target=neighbour(reference,state,'next');if(!target)return {stale:true,message:'There is no next editable clip in the current timeline.'};result=result.replace(/\b(?:the )?(?:next|other) clip\b/ig,target.name||'selected clip');}
    if(/\bprevious clip\b/i.test(result)){target=neighbour(reference,state,'previous');if(!target)return {stale:true,message:'There is no previous editable clip in the current timeline.'};result=result.replace(/\b(?:the )?previous clip\b/ig,target.name||'selected clip');}
    const noun=wordsForRole(target.role);
    result=result.replace(/\b(?:them|those)\b/ig,noun).replace(/\b(?:it|this|that)\b/ig,noun).replace(/\bwhat we just did\b/ig,context.operations.at(-1)?.commandText||noun).replace(/\bthe previous change\b/ig,context.operations.at(-1)?.commandText||noun);
    if(/^now export (?:the project|it)[.!]?$/i.test(result))result='Export the current project';
    if(/^do the same thing to /i.test(result)){const previous=context.operations.at(-1)?.commandText;if(!previous)return {ambiguous:true,message:'Which previous edit do you want me to repeat?'};result=`${previous} on ${target.name||'the selected clip'}`;}
    if(!/\bcaptions?\b/i.test(result)&&/\b(?:lower|make).*(?:music).*(?:quieter|lower)|\bmake the music quieter/i.test(result))result='Lower the music volume';
    return {resolvedText:clean(result),target};
  }

  class TaskContinuityManager{
    constructor({userId='guest'}={}){this.userId=clean(userId,100)||'guest';this.current=null;this.previous=null;this.history=[];this.turn=0;}
    observeTask(task,{editorState,userVisibleResult=''}={}){if(!task)return null;const next=contextFromTask(task,editorState,userVisibleResult);if(this.current&&this.current.taskId!==next.taskId){this.previous=this.current;this.history.push(this.current);this.history=this.history.slice(-LIMITS.tasks);}this.current=next;return clone(this.current);}
    observeResult({message,status='COMPLETED',editorState,userVisibleResult=''}={}){
      const state=snapshot(editorState),role=requestedRole(message)||(/\bcaption/i.test(message)?'captions':/\bmusic|audio/i.test(message)?'music':/\btransition/i.test(message)?'transition':/\beffect|filter/i.test(message)?'effect':'clip'),candidates=role==='captions'?state.clips.filter(item=>item.autoCaption):role==='music'?state.clips.filter(item=>item.type==='audio'||/music|song|soundtrack/i.test(item.name)):role==='transition'?state.clips.filter(item=>item.transition):role==='effect'?state.clips.filter(item=>item.effects?.length||item.effectStack?.length||item.filter):state.clips.filter(item=>item.id===state.selection.clipId),objects=candidates.map(item=>objectFromClip(item,role));
      const task={id:`result-${Date.now().toString(36)}`,projectId:state.project.id,status,userIntent:message,operations:[{id:'operation-01',intent:role.toUpperCase(),description:message,commandText:message,target:objects[0]?.id||role,status,verification:{stateDiff:{changedClips:objects.map(item=>({id:item.id}))}}}],finalState:state,userFeedback:{message:userVisibleResult}};return this.observeTask(task,{editorState:state,userVisibleResult});
    }
    supersede(){if(this.current){this.previous=this.current;this.history.push(this.current);this.history=this.history.slice(-LIMITS.tasks);}this.current=null;return this.inspect();}
    resolve(message,{editorState,projectId:requestedProjectId}={}){
      const text=clean(message),state=snapshot(editorState),currentProject=clean(requestedProjectId||state.project.id,120)||'open-project';this.turn++;
      if(!text)return {status:RESOLUTION.NONE};if(conversational.test(text)){if(this.current)this.current.turnAge++;return {status:RESOLUTION.CONVERSATION,mutates:false};}
      let current=/\bprevious task\b/i.test(text)&&this.previous?this.previous:this.current;if(explicitNewTask.test(text)){this.supersede();return {status:RESOLUTION.NONE,newBoundary:true};}
      if(confirmation.test(text)){if(current?.pendingConfirmation&&current.projectId===currentProject)return {status:RESOLUTION.CONFIRM,taskId:current.taskId,mutates:false};return {status:RESOLUTION.CONVERSATION,mutates:false,message:'There is no pending edit to confirm.'};}
      if(rejection.test(text)){if(current?.pendingConfirmation&&current.projectId===currentProject)return {status:RESOLUTION.REJECT,taskId:current.taskId,mutates:false};return {status:RESOLUTION.CONVERSATION,mutates:false};}
      if(retry.test(text)){if(current&&[Tasks.TASK_STATUS.FAILED,Tasks.TASK_STATUS.PARTIAL,Tasks.TASK_STATUS.BLOCKED].includes(current.status)&&current.projectId===currentProject)return {status:RESOLUTION.RETRY,taskId:current.taskId,mutates:false};return {status:RESOLUTION.STALE,mutates:false,message:'I can’t identify a failed edit that is safe to retry.'};}
      if(undo.test(text)){if(current&&taskTerminal(current.status)&&current.projectId===currentProject&&current.recovery?.undoAvailable)return {status:RESOLUTION.UNDO,taskId:current.taskId,mutates:false};return {status:RESOLUTION.STALE,mutates:false,message:'I can’t identify a verified recent edit that is safe to undo.'};}
      if(!referenceSignal.test(text)){if(current)current.turnAge++;return {status:RESOLUTION.NONE};}
      if(!current)return {status:RESOLUTION.AMBIGUOUS,mutates:false,message:'What do you want me to apply that change to?'};
      if(current.projectId!==currentProject){current.status=CONTEXT_STATUS.STALE;return {status:RESOLUTION.STALE,mutates:false,message:'You changed projects, so I need you to identify the clip or element again.'};}
      if(current.status===CONTEXT_STATUS.RECOVERED)return {status:RESOLUTION.STALE,mutates:false,message:'That edit was undone, so I need you to choose the current clip or element again.'};
      if(current.turnAge>=LIMITS.turns)return {status:RESOLUTION.STALE,mutates:false,message:'That earlier edit is no longer the active task. Which clip or element do you mean?'};
      current.turnAge++;
      let role=requestedRole(text);if(/\b(?:them|those)\b/i.test(text)){const contextualRoles=[...new Set(current.objects.map(item=>item.role))],explicitRoles=[/\b(?:music|soundtrack|song)\b/i.test(text)&&'music',/\btransition\b/i.test(text)&&'transition',/\beffect\b/i.test(text)&&'effect'].filter(Boolean),implicit=contextualRoles.filter(item=>!explicitRoles.includes(item));if(implicit.length===1)role=implicit[0];}
      let candidates=current.objects.filter(item=>!role||item.role===role||(role==='clip'&&['clip','text','captions','music'].includes(item.role)));
      if(!role&&/\b(?:them|those)\b/i.test(text)){const roles=[...new Set(current.objects.map(item=>item.role))];if(roles.length===1){role=roles[0];candidates=current.objects;}else return {status:RESOLUTION.AMBIGUOUS,mutates:false,candidates:roles,message:`I can do that, but “them” could mean ${roles.map(wordsForRole).join(' or ')}. Which do you mean?`};}
      if(!role&&/\b(?:it|this|that)\b/i.test(text)){const operation=current.operations.at(-1),operationObjectsList=operation?.objects||[];candidates=operationObjectsList.length?operationObjectsList:current.objects;if(candidates.length>1){const roles=[...new Set(candidates.map(item=>item.role))];if(roles.length>1)return {status:RESOLUTION.AMBIGUOUS,mutates:false,candidates:roles,message:`There are several possible targets for “it”: ${roles.map(wordsForRole).join(', ')}. Which one do you mean?`};}}
      if(role==='style'){const operation=[...current.operations].reverse().find(item=>['FILTER','EFFECT','REFERENCE_ANALYSIS'].includes(item.intent));if(!operation)return {status:RESOLUTION.AMBIGUOUS,mutates:false,message:'Which recently applied style do you mean?'};candidates=operation.objects;}
      candidates=uniqueBy(candidates,item=>item.id);
      const valid=candidates.filter(item=>existsInState(item,state));
      if(!valid.length){const noun=wordsForRole(role||candidates[0]?.role||'item');return {status:RESOLUTION.STALE,mutates:false,message:`The previous ${noun} is no longer available in the current timeline. Please choose another target.`};}
      let reference=valid[0];if(valid.length>1&&!['captions'].includes(role)&&!/^do the same thing to (?:the )?(?:next|other) clip/i.test(text))return {status:RESOLUTION.AMBIGUOUS,mutates:false,candidates:valid.map(item=>({name:item.name,type:item.type})),message:`I found ${valid.length} possible targets. Which ${wordsForRole(role||reference.role)} do you mean?`};
      const rewritten=rewrite(text,reference,current,state);if(rewritten.stale)return {status:RESOLUTION.STALE,mutates:false,message:rewritten.message};if(rewritten.ambiguous)return {status:RESOLUTION.AMBIGUOUS,mutates:false,message:rewritten.message};reference=rewritten.target||reference;
      return {status:RESOLUTION.RESOLVED,mutates:false,resolvedText:rewritten.resolvedText,targetId:reference.id,targetRole:reference.role,taskId:current.taskId,grounded:true,verifiedStateFingerprint:state.fingerprint};
    }
    markRecovered(editorState){if(!this.current)return null;this.current.status=CONTEXT_STATUS.RECOVERED;this.current.verifiedStateFingerprint=snapshot(editorState).fingerprint;this.current.turnAge=0;return clone(this.current);}
    expireForProject(id){if(this.current&&this.current.projectId!==clean(id,120))this.current.status=CONTEXT_STATUS.STALE;return this.inspect();}
    inspect(){return {userId:this.userId,current:clone(this.current),previous:clone(this.previous),history:this.history.map(clone),turn:this.turn};}
    clear(){this.current=null;this.previous=null;this.history=[];this.turn=0;}
  }

  return {RESOLUTION,CONTEXT_STATUS,LIMITS,TaskContinuityManager,contextFromTask,existsInState,rewrite};
});
