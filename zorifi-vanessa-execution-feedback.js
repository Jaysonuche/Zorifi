(function(root,factory){
  const commonJs=typeof window==='undefined'&&typeof module==='object'&&module.exports&&typeof require==='function';
  const api=factory(commonJs?require('./zorifi-vanessa-edit-planner.js'):root.ZorifiVanessaEditPlanner);
  if(commonJs)module.exports=api;else root.ZorifiVanessaExecutionFeedback=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Planner){
  'use strict';
  if(!Planner)throw new Error('Execution feedback requires Vanessa Step 14 edit planning.');

  const RESULT_STATUS=Object.freeze({SUCCESS:'success',PARTIAL_SUCCESS:'partial_success',FAILED:'failed',CANCELLED:'cancelled',BLOCKED:'blocked',NEEDS_CONFIRMATION:'needs_confirmation',UNKNOWN:'unknown'});
  const VERIFICATION_STATUS=Object.freeze({VERIFIED:'verified',PARTIAL:'partial',FAILED:'failed',NOT_RUN:'not_run',UNKNOWN:'unknown'});
  const FAILURE_KIND=Object.freeze({INVALID_REQUEST:'invalid_request',MISSING_ASSET:'missing_asset',AMBIGUOUS_TARGET:'ambiguous_target',PERMISSION_DENIED:'permission_denied',VALIDATION_FAILED:'validation_failed',EDITOR_STATE_CHANGED:'editor_state_changed',OPERATION_FAILED:'operation_failed',TIMEOUT:'timeout',DUPLICATE_OPERATION:'duplicate_operation',UNSUPPORTED_OPERATION:'unsupported_operation',SAFETY_BLOCK:'safety_block',RECOVERY_FAILED:'recovery_failed'});
  const RECOVERY_ACTION=Object.freeze({RETRY:'retry',REVALIDATE:'revalidate',REFRESH:'refresh_editor_state',RECALCULATE:'recalculate_target',REBUILD:'rebuild_plan',UNDO_PARTIAL:'undo_partial',CLARIFY:'clarify',CONFIRM:'confirm',STOP:'stop'});
  const LIMITS=Object.freeze({clips:120,changes:120,actions:40,text:260,results:80,payloadChars:14000});
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const clean=(value,max=LIMITS.text)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
  const finite=value=>Number.isFinite(Number(value))?Number(value):null;
  const rounded=value=>{const number=finite(value);return number===null?null:Math.round(number*1000)/1000;};
  const bounded=(value,limit)=>Array.isArray(value)?value.slice(0,limit):[];
  function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object'){const result={};for(const key of Object.keys(value).sort())result[key]=stable(value[key]);return result;}return value;}
  function hash(value){let result=2166136261,input=JSON.stringify(stable(value));for(let index=0;index<input.length;index++){result^=input.charCodeAt(index);result=Math.imul(result,16777619);}return (result>>>0).toString(36);}
  function same(a,b){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
  function safeError(error){
    const message=clean(error?.message||error||'');
    if(!message)return 'The editor operation did not complete.';
    if(/failed to fetch|networkerror|load failed|ecconn|socket|stack|typeerror|referenceerror/i.test(message))return 'The editor service was temporarily unavailable.';
    return message;
  }
  function safeSettings(value,depth=0){
    if(depth>3||value==null)return value==null?value:null;
    if(typeof value==='boolean')return value;
    if(typeof value==='number')return Number.isFinite(value)?rounded(value):null;
    if(typeof value==='string')return clean(value,120);
    if(Array.isArray(value))return value.slice(0,20).map(item=>safeSettings(item,depth+1));
    if(typeof value==='object'){const output={};for(const [key,item] of Object.entries(value).slice(0,30)){if(/(?:url|uri|path|file|blob|data|frame|password|token|secret|credential|api.?key)/i.test(key))continue;output[clean(key,60)]=safeSettings(item,depth+1);}return output;}
    return null;
  }
  function compactEffect(item){
    if(typeof item==='string')return {id:clean(item,100)};
    return item&&typeof item==='object'?{id:clean(item.id||item.effectId,100),enabled:item.enabled!==false,parameters:item.parameters&&typeof item.parameters==='object'?safeSettings(item.parameters):undefined}:null;
  }
  function compactKeyframes(value){
    if(!value||typeof value!=='object')return {};
    const output={};
    for(const [property,frames] of Object.entries(value).slice(0,30))output[clean(property,80)]=bounded(frames,80).map(frame=>({time:rounded(frame.time),value:typeof frame.value==='number'?rounded(frame.value):clean(frame.value,80),easing:clean(frame.easing,40)}));
    return output;
  }
  function compactClip(clip={}){
    const visual=clip.visualEffects&&typeof clip.visualEffects==='object'?clip.visualEffects:null,audio=clip.audioEffects&&typeof clip.audioEffects==='object'?clip.audioEffects:null;
    return {id:clean(clip.id,120),mediaId:clean(clip.mediaId,120),name:clean(clip.name||'Clip',120),type:clean(clip.type||'unknown',30),start:rounded(clip.start)||0,duration:rounded(clip.duration)||0,track:finite(clip.track)||0,sourceStart:rounded(clip.sourceStart)||0,positionX:rounded(clip.positionX)||0,positionY:rounded(clip.positionY)||0,scale:rounded(clip.scale)??100,scaleX:rounded(clip.scaleX)??null,scaleY:rounded(clip.scaleY)??null,rotation:rounded(clip.rotation)||0,opacity:rounded(clip.opacity)??100,volume:rounded(clip.volume)??100,audioPan:rounded(clip.audioPan)||0,playbackRate:rounded(clip.playbackRate)??1,text:clip.type==='text'?clean(clip.text||clip.name,180):'',fontSize:rounded(clip.fontSize)??null,bottom:rounded(clip.bottom)??null,color:clean(clip.color,30),autoCaption:Boolean(clip.autoCaption),transition:clip.transition?safeSettings(clip.transition):null,transitionDuration:rounded(clip.transitionDuration??clip.transition?.duration)??null,effects:bounded([...(clip.effects||clip.clipEffects||[]),...(clip.effectStack||[])],24).map(compactEffect).filter(Boolean),animations:bounded(clip.animations,20).map(compactEffect).filter(Boolean),adjustments:visual?.adjustments?safeSettings(visual.adjustments):{},filter:visual?.filter?safeSettings(visual.filter):null,audio:audio?safeSettings(audio):{},keyframes:compactKeyframes(clip.keyframes)};
  }
  function captureEditorState(input){
    const source=input?.project&&Array.isArray(input?.clips)?input:input||{},project=source.project||{};
    const snapshot={project:{id:clean(project.id||source.projectId,120),name:clean(project.name||source.currentProject,120),duration:rounded(project.duration??source.duration)||0,ratio:clean(project.ratio||source.ratio,30),width:finite(project.width||source.frameWidth),height:finite(project.height||source.frameHeight),frameRate:finite(project.frameRate||source.frameRate)},playhead:rounded(source.playhead??source.currentTime)||0,selection:{clipId:clean(source.selectedClipId||source.selected,120),track:finite(source.selectedTrack)},clips:bounded(source.clips,LIMITS.clips).map(compactClip)};
    snapshot.fingerprint=stateFingerprint(snapshot);return snapshot;
  }
  function stateFingerprint(snapshot){return `state-${hash({project:snapshot?.project,clips:snapshot?.clips,selection:snapshot?.selection})}`;}
  function byId(snapshot){return new Map((snapshot?.clips||[]).map(item=>[item.id,item]));}
  function clipDiff(before,after){
    const fields=['start','duration','track','sourceStart','positionX','positionY','scale','scaleX','scaleY','rotation','opacity','volume','audioPan','playbackRate','text','fontSize','bottom','color','autoCaption','transition','transitionDuration','effects','animations','adjustments','filter','audio','keyframes'],changes={};
    for(const field of fields)if(!same(before?.[field],after?.[field]))changes[field]={before:clone(before?.[field]),after:clone(after?.[field])};
    return changes;
  }
  function diffEditorState(beforeInput,afterInput){
    const before=beforeInput?.fingerprint?beforeInput:captureEditorState(beforeInput),after=afterInput?.fingerprint?afterInput:captureEditorState(afterInput),old=byId(before),current=byId(after),added=[],removed=[],changed=[];
    for(const clip of after.clips)if(!old.has(clip.id))added.push(clone(clip));else{const changes=clipDiff(old.get(clip.id),clip);if(Object.keys(changes).length)changed.push({id:clip.id,name:clip.name,type:clip.type,changes});}
    for(const clip of before.clips)if(!current.has(clip.id))removed.push(clone(clip));
    const moved=changed.filter(item=>item.changes.start||item.changes.track),trimmed=changed.filter(item=>item.changes.duration||item.changes.sourceStart),effectsChanged=changed.filter(item=>item.changes.effects||item.changes.adjustments||item.changes.filter),transitionsChanged=changed.filter(item=>item.changes.transition),textChanged=changed.filter(item=>item.changes.text||item.changes.autoCaption),audioChanged=changed.filter(item=>item.changes.volume||item.changes.audioPan||item.changes.audio||item.changes.playbackRate),keyframesChanged=changed.filter(item=>item.changes.keyframes),split=added.filter(item=>item.mediaId&&before.clips.some(oldClip=>oldClip.mediaId===item.mediaId)&&trimmed.some(change=>old.get(change.id)?.mediaId===item.mediaId));
    return {changed:Boolean(added.length||removed.length||changed.length||!same(before.project,after.project)||!same(before.selection,after.selection)),added:bounded(added,LIMITS.changes),removed:bounded(removed,LIMITS.changes),changedClips:bounded(changed,LIMITS.changes),moved:bounded(moved,LIMITS.changes),trimmed:bounded(trimmed,LIMITS.changes),split:bounded(split,LIMITS.changes),effectsChanged:bounded(effectsChanged,LIMITS.changes),transitionsChanged:bounded(transitionsChanged,LIMITS.changes),textChanged:bounded(textChanged,LIMITS.changes),audioChanged:bounded(audioChanged,LIMITS.changes),keyframesChanged:bounded(keyframesChanged,LIMITS.changes),project:!same(before.project,after.project)?{before:before.project,after:after.project}:null,selection:!same(before.selection,after.selection)?{before:before.selection,after:after.selection}:null,beforeFingerprint:before.fingerprint,afterFingerprint:after.fingerprint};
  }
  function targetChange(diff,targetId){return diff.changedClips.find(item=>item.id===targetId);}
  function verifyAction(action,diff,executionItem={}){
    const type=action?.type,target=clean(action?.target?.id,120),parameters=action?.parameters||{},change=targetChange(diff,target),completed=/^(?:COMPLETED|SUCCESS|success)$/i.test(executionItem?.status||action?.status||'');
    let verified=false,evidence='';
    if(type===Planner.ACTION_TYPE.ASSIGN_MATCHED_CONTENT)return {actionId:action.id,status:VERIFICATION_STATUS.VERIFIED,evidence:'The planning-only content assignment was retained; it did not directly mutate the editor.'};
    if([Planner.ACTION_TYPE.INSERT_CLIP,Planner.ACTION_TYPE.ADD_OVERLAY,Planner.ACTION_TYPE.ADD_AUDIO].includes(type)){verified=diff.added.some(item=>(!parameters.mediaId||item.mediaId===parameters.mediaId)&&(!target||item.id===target||item.mediaId===target));evidence=verified?'A matching timeline item was added.':'No matching timeline item appeared.';}
    else if(type===Planner.ACTION_TYPE.REMOVE_CLIP){verified=diff.removed.some(item=>item.id===target);evidence=verified?'The target clip was removed.':'The target clip is still present.';}
    else if(type===Planner.ACTION_TYPE.REORDER_CLIP){verified=Boolean(change&&(change.changes.start||change.changes.track));evidence=verified?'The target position or track changed.':'The target position and track did not change.';}
    else if(type===Planner.ACTION_TYPE.TRIM_CLIP){verified=Boolean(change&&(change.changes.duration||change.changes.sourceStart));evidence=verified?'The target duration or source range changed.':'The target trim range did not change.';}
    else if(type===Planner.ACTION_TYPE.SPLIT_CLIP){verified=diff.split.some(item=>!target||item.mediaId===byId({clips:[...diff.removed]}).get(target)?.mediaId)||Boolean(diff.split.length&&change?.changes.duration);evidence=verified?'A new segment was created and the source segment changed.':'No verified split was found.';}
    else if(type===Planner.ACTION_TYPE.APPLY_TRANSITION){verified=Boolean(change?.changes.transition);evidence=verified?'The transition state changed.':'The transition state did not change.';}
    else if(type===Planner.ACTION_TYPE.APPLY_EFFECT){verified=Boolean(change&&(change.changes.effects||change.changes.adjustments||change.changes.filter));evidence=verified?'The target effect state changed.':'The target effect state did not change.';}
    else if(type===Planner.ACTION_TYPE.ADD_TEXT||type===Planner.ACTION_TYPE.ADD_CAPTION){verified=Boolean(diff.added.some(item=>item.type==='text'&&(type!==Planner.ACTION_TYPE.ADD_CAPTION||item.autoCaption)));evidence=verified?'A matching text timeline item was added.':'No matching text timeline item appeared.';}
    else if(type===Planner.ACTION_TYPE.SET_ASPECT_RATIO){verified=Boolean(diff.project&&diff.project.before.ratio!==diff.project.after.ratio);evidence=verified?'The project aspect ratio changed.':'The project aspect ratio did not change.';}
    else if(type===Planner.ACTION_TYPE.MODIFY_TIMING){verified=Boolean(change&&(change.changes.duration||change.changes.start||change.changes.playbackRate));evidence=verified?'The target timing changed.':'The target timing did not change.';}
    else if(type===Planner.ACTION_TYPE.UPSERT_KEYFRAME){verified=Boolean(change?.changes.keyframes);evidence=verified?'The target keyframe state changed.':'The target keyframe state did not change.';}
    else if(type===Planner.ACTION_TYPE.SET_PROPERTY){const property=parameters.property==='textPosition'?'bottom':parameters.property,visual=['brightness','contrast','saturation','exposure','temperature','tint','highlights','shadows','blur','vignette'].includes(property),propertyChange=visual&&change?.changes?.adjustments?{before:change.changes.adjustments.before?.[property],after:change.changes.adjustments.after?.[property]}:property&&change?.changes?.[property];verified=Boolean(propertyChange)&&(Number.isFinite(Number(parameters.value))?Number(propertyChange.after)===Number(parameters.value):propertyChange.after===parameters.value);evidence=verified?`The target ${parameters.property} changed to the requested value.`:`The target ${parameters.property||'property'} did not reach the requested value.`;}
    else return {actionId:action?.id,status:completed?VERIFICATION_STATUS.UNKNOWN:VERIFICATION_STATUS.FAILED,evidence:completed?'The operation completed, but this action has no state verifier yet.':'The operation did not complete.'};
    return {actionId:action?.id,status:verified?VERIFICATION_STATUS.VERIFIED:completed?VERIFICATION_STATUS.FAILED:VERIFICATION_STATUS.FAILED,evidence};
  }
  function classifyFailure(value={}){
    const text=clean(value?.message||value?.error||value).toLowerCase();
    if(/cancel/.test(text))return FAILURE_KIND.OPERATION_FAILED;if(/permission|not granted|forbidden|unauthori[sz]ed/.test(text))return FAILURE_KIND.PERMISSION_DENIED;if(/missing|not found|could not be found|no asset/.test(text))return FAILURE_KIND.MISSING_ASSET;if(/ambiguous|which clip|clarif/.test(text))return FAILURE_KIND.AMBIGUOUS_TARGET;if(/validat|malformed|invalid/.test(text))return FAILURE_KIND.VALIDATION_FAILED;if(/state changed|revision|stale/.test(text))return FAILURE_KIND.EDITOR_STATE_CHANGED;if(/timeout|timed out/.test(text))return FAILURE_KIND.TIMEOUT;if(/duplicate|already (?:ran|completed|applied)/.test(text))return FAILURE_KIND.DUPLICATE_OPERATION;if(/unsupported|not supported|unavailable/.test(text))return FAILURE_KIND.UNSUPPORTED_OPERATION;if(/safety|blocked by policy|unsafe/.test(text))return FAILURE_KIND.SAFETY_BLOCK;if(/recover|rollback|undo/.test(text))return FAILURE_KIND.RECOVERY_FAILED;return FAILURE_KIND.OPERATION_FAILED;
  }
  function operationIdFor(plan,provided){return clean(provided,140)||`operation-${hash({planId:plan?.planId,version:plan?.version,actions:(plan?.actions||[]).map(item=>({id:item.id,type:item.type,target:item.target,parameters:item.parameters}))})}`;}
  function actionLists(plan,executionResult){
    const results=new Map((executionResult?.results||plan?.execution?.results||[]).map(item=>[item.actionId,item])),requested=[],completed=[],failed=[],skipped=[];
    for(const action of bounded(plan?.actions,LIMITS.actions)){if(!action.executable){skipped.push({id:action.id,type:action.type,reason:clean(action.reason||'Planning-only or unavailable action.')});continue;}requested.push({id:action.id,type:action.type,target:clone(action.target),parameters:clone(action.parameters)});const result=results.get(action.id),status=result?.status||action.status;if(/^(?:COMPLETED|SUCCESS|success)$/i.test(status))completed.push({id:action.id,type:action.type,target:clone(action.target),message:clean(result?.message||action.result||'Completed')});else if(/^(?:FAILED|BLOCKED)$/i.test(status))failed.push({id:action.id,type:action.type,target:clone(action.target),message:safeError(result?.message||action.error)});else skipped.push({id:action.id,type:action.type,reason:'Execution stopped before this action ran.'});}
    return {requested,completed,failed,skipped};
  }
  function statusFrom(plan,executionResult,verification){
    const raw=clean(executionResult?.status||plan?.status).toUpperCase();
    if(raw==='CANCELLED')return RESULT_STATUS.CANCELLED;if(raw==='BLOCKED')return RESULT_STATUS.BLOCKED;if(raw==='AWAITING_CONFIRMATION'||raw==='REQUIRES_CONFIRMATION')return RESULT_STATUS.NEEDS_CONFIRMATION;
    if(verification===VERIFICATION_STATUS.FAILED)return RESULT_STATUS.FAILED;if(verification===VERIFICATION_STATUS.PARTIAL)return RESULT_STATUS.PARTIAL_SUCCESS;
    if(raw==='COMPLETED'||raw==='SUCCESS')return RESULT_STATUS.SUCCESS;if(raw==='PARTIAL')return RESULT_STATUS.PARTIAL_SUCCESS;if(raw==='FAILED')return RESULT_STATUS.FAILED;return RESULT_STATUS.UNKNOWN;
  }
  function recoveryFor(result){
    if(result.status===RESULT_STATUS.SUCCESS)return {recommended:RECOVERY_ACTION.STOP,options:[],requiresConfirmation:false,message:'No recovery is needed.'};
    if(result.status===RESULT_STATUS.CANCELLED)return {recommended:RECOVERY_ACTION.STOP,options:[RECOVERY_ACTION.STOP],requiresConfirmation:false,message:'The operation was cancelled and will not resume automatically.'};
    if(result.status===RESULT_STATUS.NEEDS_CONFIRMATION)return {recommended:RECOVERY_ACTION.CONFIRM,options:[RECOVERY_ACTION.CONFIRM,RECOVERY_ACTION.STOP],requiresConfirmation:true,message:'Review and confirm the validated plan before it runs.'};
    const kind=result.failure?.kind,options=[];
    if(kind===FAILURE_KIND.AMBIGUOUS_TARGET)options.push(RECOVERY_ACTION.CLARIFY,RECOVERY_ACTION.RECALCULATE);
    else if(kind===FAILURE_KIND.PERMISSION_DENIED||kind===FAILURE_KIND.SAFETY_BLOCK)options.push(RECOVERY_ACTION.STOP);
    else if(kind===FAILURE_KIND.EDITOR_STATE_CHANGED)options.push(RECOVERY_ACTION.REFRESH,RECOVERY_ACTION.REVALIDATE,RECOVERY_ACTION.REBUILD);
    else if(result.completedOperations.length)options.push(RECOVERY_ACTION.UNDO_PARTIAL,RECOVERY_ACTION.REVALIDATE,RECOVERY_ACTION.RETRY);
    else options.push(RECOVERY_ACTION.REVALIDATE,RECOVERY_ACTION.RETRY,RECOVERY_ACTION.STOP);
    return {recommended:options[0],options:[...new Set(options)],requiresConfirmation:options.includes(RECOVERY_ACTION.UNDO_PARTIAL)||options.includes(RECOVERY_ACTION.RETRY),message:'Recovery is available through the existing validated editor adapters.'};
  }
  function feedbackMessage(result){
    const completed=result.completedOperations.length,failed=result.failedOperations.length,targets=[...new Set(result.affectedAssets.map(item=>item.name).filter(Boolean))].slice(0,3).join(', ');
    if(result.status===RESULT_STATUS.SUCCESS)return `Done. I verified ${completed} completed edit${completed===1?'':'s'}${targets?` affecting ${targets}`:''}.`;
    if(result.status===RESULT_STATUS.PARTIAL_SUCCESS)return `I completed and verified ${completed} edit${completed===1?'':'s'}, but ${failed||result.skippedOperations.length} could not be completed. ${result.recovery.message}`;
    if(result.status===RESULT_STATUS.NEEDS_CONFIRMATION)return 'The edit is ready, but it still needs your confirmation before anything changes.';
    if(result.status===RESULT_STATUS.CANCELLED)return 'Cancelled. I did not continue the edit.';
    if(result.status===RESULT_STATUS.BLOCKED)return `I did not run that edit because ${result.failure?.message||'it was blocked by a safety or permission check.'}`;
    if(result.status===RESULT_STATUS.FAILED)return `I couldn’t verify the requested edit. ${result.failure?.message||'The project was left in the safest available state.'}`;
    return 'I could not confirm whether that edit completed. I have not claimed it succeeded.';
  }
  function buildResult({plan,executionResult={},before,after,operationId,transactionId,userId='guest'}={}){
    const prior=before?.fingerprint?before:captureEditorState(before),current=after?.fingerprint?after:captureEditorState(after),diff=diffEditorState(prior,current),lists=actionLists(plan,executionResult),resultMap=new Map((executionResult.results||plan?.execution?.results||[]).map(item=>[item.actionId,item])),checks=lists.requested.map(request=>verifyAction((plan.actions||[]).find(item=>item.id===request.id),diff,resultMap.get(request.id)));
    let verification=VERIFICATION_STATUS.NOT_RUN;if(checks.length){const verified=checks.filter(item=>item.status===VERIFICATION_STATUS.VERIFIED).length,failed=checks.filter(item=>item.status===VERIFICATION_STATUS.FAILED).length;verification=verified===checks.length?VERIFICATION_STATUS.VERIFIED:verified&&failed?VERIFICATION_STATUS.PARTIAL:failed===checks.length?VERIFICATION_STATUS.FAILED:VERIFICATION_STATUS.UNKNOWN;}
    const errorSource=lists.failed[0]?.message||executionResult.message||'',failure=lists.failed.length||verification===VERIFICATION_STATUS.FAILED?{kind:classifyFailure(errorSource||'The requested state change was not verified.'),message:safeError(errorSource||'The requested state change was not verified.')} :null,status=statusFrom(plan,executionResult,verification),affected=[...diff.added,...diff.removed,...diff.changedClips.map(item=>({id:item.id,name:item.name,type:item.type}))].slice(0,LIMITS.changes),result={id:`execution-result-${hash({operationId,transactionId,after:current.fingerprint})}`,userId:clean(userId,100)||'guest',operationId,transactionId:clean(transactionId||executionResult.transactionId||plan?.execution?.transactionId,140)||null,planId:clean(plan?.planId,140)||null,projectId:clean(plan?.projectId||current.project.id,140)||null,status,requestedOperations:lists.requested,completedOperations:lists.completed,failedOperations:lists.failed,skippedOperations:lists.skipped,affectedAssets:affected,beforeState:prior,afterState:current,stateDiff:diff,verification:{status:verification,checks},failure,recovery:null,userFeedback:null,createdAt:new Date().toISOString()};result.recovery=recoveryFor(result);result.userFeedback={message:feedbackMessage(result),facts:{completed:result.completedOperations.length,failed:result.failedOperations.length,skipped:result.skippedOperations.length,verification:result.verification.status,affected:result.affectedAssets.map(item=>item.name).filter(Boolean).slice(0,5)}};return result;
  }
  function duplicateResult(existing){const copy=clone(existing);return {...copy,id:`execution-result-${hash({duplicate:existing.id,time:Date.now()})}`,status:RESULT_STATUS.BLOCKED,completedOperations:[],failedOperations:[{id:null,type:'DUPLICATE',message:'This operation already completed and was not run again.'}],failure:{kind:FAILURE_KIND.DUPLICATE_OPERATION,message:'This operation already completed and was not run again.'},verification:{status:VERIFICATION_STATUS.NOT_RUN,checks:[]},recovery:{recommended:RECOVERY_ACTION.STOP,options:[RECOVERY_ACTION.STOP],requiresConfirmation:false,message:'The successful operation is already committed.'},userFeedback:{message:'That edit was already completed, so I did not apply it again.',facts:{duplicateOf:existing.id}}};}
  class ExecutionFeedbackManager{
    constructor({userId='guest'}={}){this.userId=clean(userId,100)||'guest';this.pending=new Map();this.results=[];this.ledger=new Map();}
    begin({plan,editorStateBefore,operationId,transactionId}={}){
      const id=operationIdFor(plan,operationId),existing=this.ledger.get(id);if(existing?.status===RESULT_STATUS.SUCCESS)return {duplicate:true,operationId:id,result:duplicateResult(existing)};
      const record={id:`execution-${hash({id,userId:this.userId,planId:plan?.planId})}`,operationId:id,transactionId:clean(transactionId,140)||null,plan:clone(plan),before:captureEditorState(editorStateBefore),startedAt:new Date().toISOString()};this.pending.set(record.id,record);return {duplicate:false,...clone(record)};
    }
    finalize({executionId,plan,executionResult,editorStateAfter,operationId,transactionId}={}){
      const pending=this.pending.get(executionId),effectivePlan=plan||pending?.plan,id=operationIdFor(effectivePlan,operationId||pending?.operationId),existing=this.ledger.get(id);if(existing?.status===RESULT_STATUS.SUCCESS&&!pending)return duplicateResult(existing);
      const result=buildResult({plan:effectivePlan,executionResult,before:pending?.before,after:editorStateAfter,operationId:id,transactionId:transactionId||pending?.transactionId,userId:this.userId});if(pending)this.pending.delete(pending.id);this.results.push(result);this.results=this.results.slice(-LIMITS.results);if(result.status===RESULT_STATUS.SUCCESS)this.ledger.set(id,result);return clone(result);
    }
    record(options={}){const started=this.begin(options);if(started.duplicate)return started.result;return this.finalize({...options,executionId:started.id});}
    async execute(plan,adapters={}){
      if(typeof adapters.readEditorState!=='function')return this.record({plan,editorStateBefore:{},editorStateAfter:{},executionResult:{status:'BLOCKED',message:'A safe EditorBridge state reader is required.'},operationId:adapters.operationId});
      let before;try{before=await adapters.readEditorState();}catch(error){return this.record({plan,editorStateBefore:{},editorStateAfter:{},executionResult:{status:'BLOCKED',message:safeError(error)},operationId:adapters.operationId});}
      const started=this.begin({plan,editorStateBefore:before,operationId:adapters.operationId,transactionId:adapters.transactionId});if(started.duplicate)return started.result;
      let execution;try{execution=await Planner.executePlan(plan,adapters);}catch(error){execution={plan,result:{status:'FAILED',message:safeError(error)}};}
      let after;try{after=await adapters.readEditorState();}catch{after=before;}
      return this.finalize({executionId:started.id,plan:execution.plan||plan,executionResult:{...(execution.result||{}),results:execution.plan?.execution?.results||execution.result?.results||[]},editorStateAfter:after,transactionId:execution.result?.transactionId});
    }
    proposeRecovery(resultOrId,{currentEditorState}={}){const result=typeof resultOrId==='string'?this.results.find(item=>item.id===resultOrId):resultOrId;if(!result)return null;const current=currentEditorState?captureEditorState(currentEditorState):null,stateChanged=Boolean(current&&result.afterState?.fingerprint!==current.fingerprint);return {...clone(result.recovery),stateChanged,requiresRevalidation:stateChanged||[RECOVERY_ACTION.RETRY,RECOVERY_ACTION.REBUILD].includes(result.recovery.recommended)};}
    async recover(resultOrId,{action,confirmed=false,currentEditorState,adapters={}}={}){
      const result=typeof resultOrId==='string'?this.results.find(item=>item.id===resultOrId):resultOrId;if(!result)return {status:RESULT_STATUS.BLOCKED,failure:{kind:FAILURE_KIND.INVALID_REQUEST,message:'The execution result could not be found.'}};
      if(result.status===RESULT_STATUS.SUCCESS)return duplicateResult(result);const proposal=this.proposeRecovery(result,{currentEditorState}),selected=action||proposal?.recommended;if(!proposal?.options.includes(selected))return {status:RESULT_STATUS.BLOCKED,failure:{kind:FAILURE_KIND.INVALID_REQUEST,message:'That recovery action is not available.'}};
      if([RECOVERY_ACTION.RETRY,RECOVERY_ACTION.UNDO_PARTIAL,RECOVERY_ACTION.CONFIRM].includes(selected)&&!confirmed)return {status:RESULT_STATUS.NEEDS_CONFIRMATION,recovery:{...proposal,recommended:selected,requiresConfirmation:true}};
      const handler=adapters[selected];if(typeof handler!=='function')return {status:RESULT_STATUS.BLOCKED,failure:{kind:FAILURE_KIND.RECOVERY_FAILED,message:'The existing editor does not provide that recovery adapter.'},recovery:proposal};
      if(proposal.stateChanged&&selected===RECOVERY_ACTION.RETRY)return {status:RESULT_STATUS.BLOCKED,failure:{kind:FAILURE_KIND.EDITOR_STATE_CHANGED,message:'The editor changed after the failure. Revalidate before retrying.'},recovery:{...proposal,recommended:RECOVERY_ACTION.REVALIDATE}};
      try{const value=await handler(clone(result));return {status:RESULT_STATUS.SUCCESS,action:selected,result:clone(value)};}catch(error){return {status:RESULT_STATUS.FAILED,failure:{kind:FAILURE_KIND.RECOVERY_FAILED,message:safeError(error)},recovery:proposal};}
    }
    inspect(){return {userId:this.userId,pending:[...this.pending.values()].map(clone),results:this.results.map(clone),committed:[...this.ledger.keys()]};}
    latest(){return clone(this.results.at(-1)||null);}
    continuity(){const result=this.results.at(-1);if(!result)return null;return {executionResultId:result.id,operationId:result.operationId,status:result.status,affectedAssets:result.affectedAssets.map(item=>({id:item.id,name:item.name,type:item.type})).slice(0,12),completedOperations:result.completedOperations.map(item=>({type:item.type,target:item.target})).slice(0,12),failure:clone(result.failure),verification:result.verification.status};}
    clear(){this.pending.clear();this.results=[];this.ledger.clear();}
  }
  function providerPayload(result){if(!result)return null;const payload={status:result.status,operationId:result.operationId,planId:result.planId,completed:result.completedOperations,failed:result.failedOperations,skipped:result.skippedOperations,affectedAssets:result.affectedAssets.map(item=>({id:item.id,name:item.name,type:item.type})),verification:result.verification,failure:result.failure,recovery:result.recovery,stateDiff:result.stateDiff,userFeedback:result.userFeedback};while(JSON.stringify(payload).length>LIMITS.payloadChars&&payload.affectedAssets.length)payload.affectedAssets.pop();return clone(payload);}

  return {RESULT_STATUS,VERIFICATION_STATUS,FAILURE_KIND,RECOVERY_ACTION,LIMITS,ExecutionFeedbackManager,captureEditorState,stateFingerprint,diffEditorState,verifyAction,classifyFailure,buildResult,feedbackMessage,providerPayload,safeError};
});
