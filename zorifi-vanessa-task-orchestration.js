(function(root,factory){
  const commonJs=typeof window==='undefined'&&typeof module==='object'&&module.exports&&typeof require==='function';
  const api=factory(commonJs?require('./zorifi-vanessa-workflow.js'):root.ZorifiVanessaWorkflow,commonJs?require('./zorifi-vanessa-execution-feedback.js'):root.ZorifiVanessaExecutionFeedback);
  if(commonJs)module.exports=api;else root.ZorifiVanessaTaskOrchestration=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Workflow,Feedback){
  'use strict';
  if(!Workflow||!Feedback)throw new Error('Task orchestration requires Vanessa Workflow and Execution Feedback.');

  const TASK_STATUS=Object.freeze({CONVERSATION:'CONVERSATION',NEEDS_CLARIFICATION:'NEEDS_CLARIFICATION',AWAITING_CONFIRMATION:'AWAITING_CONFIRMATION',READY:'READY',RUNNING:'RUNNING',COMPLETED:'COMPLETED',PARTIAL:'PARTIAL',FAILED:'FAILED',BLOCKED:'BLOCKED',REJECTED:'REJECTED',RECOVERED:'RECOVERED'});
  const OPERATION_STATUS=Object.freeze({PENDING:'PENDING',READY:'READY',RUNNING:'RUNNING',COMPLETED:'COMPLETED',PARTIAL:'PARTIAL',FAILED:'FAILED',BLOCKED:'BLOCKED',REJECTED:'REJECTED'});
  const LIMITS=Object.freeze({operations:12,text:400,history:30,permissions:8});
  const NON_MUTATING=new Set(['SAVE','EXPORT','REFERENCE_ANALYSIS','PREVIEW']);
  const PROJECT_TARGETS=new Set(['CAPTIONS_ADD','CAPTIONS_REMOVE','ASPECT_RATIO','EXPORT','SAVE','MUSIC','AUDIO_ADD','AUDIO_EXTRACT']);
  const EDIT_SIGNAL=/\b(?:add|apply|change|copy|crop|cut|delete|export|extract|generate|increase|lower|make|move|raise|remove|render|resize|rotate|save|set|slow|speed|split|trim|use)\b/i;
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const clean=(value,max=LIMITS.text)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
  const stable=value=>{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object'){const output={};for(const key of Object.keys(value).sort())output[key]=stable(value[key]);return output;}return value;};
  const hash=value=>{let result=2166136261,input=JSON.stringify(stable(value));for(let index=0;index<input.length;index++){result^=input.charCodeAt(index);result=Math.imul(result,16777619);}return (result>>>0).toString(36);};
  const unique=items=>[...new Set(items.filter(Boolean))];
  const safeError=Feedback.safeError;
  function expectation(intent){
    const labels={CAPTIONS_ADD:'captions are added',CAPTIONS_REMOVE:'captions are removed',CAPTION_STYLE:'caption styling changes',ASPECT_RATIO:'project aspect ratio changes',TRIM:'clip timing changes',SPEED:'clip speed changes',ZOOM:'zoom keyframes are added',TRANSITION:'a transition is applied',FILTER:'visual treatment changes',VOLUME:'audio level changes',MUSIC:'project music changes',TEXT:'text is added or updated',EFFECT:'effect state changes',ANIMATION:'animation state changes',BACKGROUND_REMOVE:'background removal is applied',CHROMA_KEY:'chroma-key settings change',MASK:'mask settings change',KEYFRAME:'keyframe state changes',SPLIT:'a new clip segment is created',AUDIO_EXTRACT:'extracted audio is available',AUDIO_ADD:'audio is added to the timeline',SAVE:'the project is saved',EXPORT:'an export is prepared',REFERENCE_ANALYSIS:'the selected reference is analysed'};
    return {mutates:!NON_MUTATING.has(intent),description:labels[intent]||'the verified editor state changes as requested'};
  }
  function operationFromStep(step,index){
    const requiredPermissions=step.intent==='SAVE'||step.intent==='EXPORT'?['project.read']:['project.read','project.edit'];
    return {id:`operation-${String(index+1).padStart(2,'0')}`,workflowStepId:clean(step.id,60),intent:clean(step.intent,60),description:clean(step.description||step.commandText),commandText:clean(step.commandText),target:clean(step.target,120),dependencies:(step.dependencies||[]).map(id=>clean(id,60)).filter(Boolean),requiredPermissions,requiresConfirmation:Boolean(step.requiresConfirmation),expectedStateChange:expectation(step.intent),reversible:!['EXPORT','SAVE'].includes(step.intent),supported:step.executable!==false,status:step.executable===false?OPERATION_STATUS.BLOCKED:OPERATION_STATUS.PENDING,result:null,error:null,verification:null};
  }
  function remapDependencies(operations){
    const ids=new Map(operations.map(item=>[item.workflowStepId,item.id]));
    for(const operation of operations)operation.dependencies=operation.dependencies.map(id=>ids.get(id)||id).filter(id=>operations.some(item=>item.id===id));
    return operations;
  }
  function concisePlan(task){
    if(!task)return '';
    const actions=task.operations.map((operation,index)=>`${index+1}. ${operation.description}`).join(' ');
    return `I planned ${task.operations.length} controlled step${task.operations.length===1?'':'s'}: ${actions}${task.confirmation.required?' Confirm before I apply them.':''}`;
  }
  function buildTask(message,{userId='guest',projectId='open-project',workflow=null,intentContext={},responsePlan={},editorContext={},editorState=null}={}){
    const text=clean(message,1200),route=clean(intentContext?.route?.type||intentContext?.category||'',80);
    const steps=(workflow?.steps||Workflow.parseWorkflowSteps(text,{intentContext,responsePlan,editorContext,maxSteps:LIMITS.operations})).slice(0,LIMITS.operations);
    if(!steps.length){
      if(!EDIT_SIGNAL.test(text)||/^(?:how are you|what(?:'s| is) your name|can i talk|tell me|hello|hi|hey)\b/i.test(text))return {activated:false,status:TASK_STATUS.CONVERSATION,message:'No editor task was created.'};
      return {activated:true,status:TASK_STATUS.NEEDS_CLARIFICATION,requiresClarification:true,clarification:'I could not safely resolve that into a supported editor action. Which edit should I apply?',operations:[]};
    }
    const operations=remapDependencies(steps.map(operationFromStep)),unsupported=operations.filter(item=>!item.supported),ambiguous=operations.filter(item=>!PROJECT_TARGETS.has(item.intent)&&['selected_clip',''].includes(item.target)&&!editorContext.selectedClipId),requiredPermissions=unique(operations.flatMap(item=>item.requiredPermissions)).slice(0,LIMITS.permissions),confirmationRequired=operations.length>1||operations.some(item=>item.requiresConfirmation),snapshot=Feedback.captureEditorState(editorState||{});
    const task={id:`task-${hash({userId,projectId,text,operations:operations.map(item=>({intent:item.intent,command:item.commandText,target:item.target,dependencies:item.dependencies}))})}`,userId:clean(userId,100)||'guest',projectId:clean(projectId,120)||'open-project',userIntent:text,route:route||'EDITING_COMMAND',operations,dependencies:operations.flatMap(item=>item.dependencies.map(dependency=>({operationId:item.id,dependsOn:dependency}))),requiredPermissions,confirmation:{required:confirmationRequired,confirmed:false,rejected:false,summary:null},expectedStateChanges:operations.map(item=>({operationId:item.id,...item.expectedStateChange})),recovery:{boundaryFingerprint:snapshot.fingerprint,snapshotId:null,undoAvailable:false,rollbackAttempted:false,rolledBack:false,recommended:null},baseline:snapshot,status:TASK_STATUS.READY,requiresClarification:false,clarification:null,execution:{startedAt:null,completedAt:null,currentOperationId:null,results:[]},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(unsupported.length){task.status=TASK_STATUS.NEEDS_CLARIFICATION;task.requiresClarification=true;task.clarification=`I can’t safely perform ${unsupported.map(item=>item.description).join(', ')} with the available editor capabilities. Choose a supported edit instead.`;}
    else if(ambiguous.length){task.status=TASK_STATUS.NEEDS_CLARIFICATION;task.requiresClarification=true;task.clarification=`Which clip or layer should I use for ${ambiguous[0].description}?`;}
    else if(confirmationRequired)task.status=TASK_STATUS.AWAITING_CONFIRMATION;
    task.confirmation.summary=concisePlan(task);return clone(task);
  }
  function refreshReadiness(task){
    const byId=new Map(task.operations.map(item=>[item.id,item]));
    for(const operation of task.operations){
      if([OPERATION_STATUS.COMPLETED,OPERATION_STATUS.RUNNING,OPERATION_STATUS.FAILED,OPERATION_STATUS.PARTIAL,OPERATION_STATUS.REJECTED].includes(operation.status))continue;
      const dependencies=operation.dependencies.map(id=>byId.get(id)).filter(Boolean);
      if(dependencies.some(item=>[OPERATION_STATUS.FAILED,OPERATION_STATUS.PARTIAL,OPERATION_STATUS.BLOCKED,OPERATION_STATUS.REJECTED].includes(item.status)))operation.status=OPERATION_STATUS.BLOCKED;
      else operation.status=dependencies.every(item=>item.status===OPERATION_STATUS.COMPLETED)?OPERATION_STATUS.READY:OPERATION_STATUS.PENDING;
    }
    return task;
  }
  function taskFeedback(task){
    const completed=task.operations.filter(item=>item.status===OPERATION_STATUS.COMPLETED).length,failed=task.operations.filter(item=>[OPERATION_STATUS.FAILED,OPERATION_STATUS.PARTIAL].includes(item.status)).length;
    if(task.status===TASK_STATUS.COMPLETED)return `I completed all ${completed} steps and verified the result.`;
    if(task.status===TASK_STATUS.PARTIAL)return `I completed ${completed} step${completed===1?'':'s'}, but ${failed||1} could not be completed. I stopped before dependent edits could produce an incorrect result.`;
    if(task.status===TASK_STATUS.FAILED)return `I couldn’t complete the first edit, so I stopped the task without running dependent steps.`;
    if(task.status===TASK_STATUS.BLOCKED)return task.failure?.kind===Feedback.FAILURE_KIND.EDITOR_STATE_CHANGED?'The project changed after this plan was prepared. I stopped so I would not apply it to stale editor state.':'I stopped the task because a required permission or safe execution condition was not available.';
    if(task.status===TASK_STATUS.REJECTED)return 'Okay. I did not apply the planned edits.';
    return concisePlan(task);
  }
  class TaskOrchestrationManager{
    constructor({userId='guest'}={}){this.userId=clean(userId,100)||'guest';this.pending=null;this.history=[];this.ledger=new Map();}
    prepare(message,options={}){this.pending=buildTask(message,{...options,userId:this.userId});if(this.pending.activated!==false)refreshReadiness(this.pending);return this.inspect().pending;}
    confirm(){if(!this.pending||this.pending.status!==TASK_STATUS.AWAITING_CONFIRMATION)return this.inspect().pending;this.pending.confirmation.confirmed=true;this.pending.status=TASK_STATUS.READY;this.pending.updatedAt=new Date().toISOString();refreshReadiness(this.pending);return this.inspect().pending;}
    reject(){if(!this.pending)return null;if(this.pending.status===TASK_STATUS.COMPLETED)return this.inspect().pending;this.pending.status=TASK_STATUS.REJECTED;this.pending.confirmation.rejected=true;this.pending.operations.forEach(item=>{if(![OPERATION_STATUS.COMPLETED,OPERATION_STATUS.FAILED].includes(item.status))item.status=OPERATION_STATUS.REJECTED;});this.finish();return this.inspect().pending;}
    async execute(adapters={}){
      const task=this.pending;if(!task)return {status:TASK_STATUS.BLOCKED,userFeedback:{message:'There is no prepared edit task to run.'}};
      const committed=this.ledger.get(task.id);if(committed)return {status:TASK_STATUS.BLOCKED,duplicate:true,failure:{kind:Feedback.FAILURE_KIND.DUPLICATE_OPERATION},userFeedback:{message:'That task was already completed, so I did not apply it again.'},task:clone(committed)};
      if(task.requiresClarification)return {status:TASK_STATUS.NEEDS_CLARIFICATION,userFeedback:{message:task.clarification},task:clone(task)};
      if(task.confirmation.required&&!task.confirmation.confirmed)return {status:TASK_STATUS.AWAITING_CONFIRMATION,userFeedback:{message:task.confirmation.summary},task:clone(task)};
      if(typeof adapters.readEditorState!=='function'||typeof adapters.permissionCheck!=='function'||typeof adapters.executeOperation!=='function')return {status:TASK_STATUS.BLOCKED,failure:{kind:Feedback.FAILURE_KIND.INVALID_REQUEST},userFeedback:{message:'The safe editor execution interface is not available.'},task:clone(task)};
      let current;try{current=Feedback.captureEditorState(await adapters.readEditorState());}catch(error){return {status:TASK_STATUS.BLOCKED,failure:{kind:Feedback.classifyFailure(error),message:safeError(error)},userFeedback:{message:'I could not safely read the current project state, so I did not run the task.'},task:clone(task)};}
      if(task.baseline?.fingerprint&&task.baseline.fingerprint!==current.fingerprint){task.status=TASK_STATUS.BLOCKED;task.failure={kind:Feedback.FAILURE_KIND.EDITOR_STATE_CHANGED,message:'The editor changed after planning.'};task.recovery.recommended=Feedback.RECOVERY_ACTION.REVALIDATE;return {status:task.status,failure:clone(task.failure),userFeedback:{message:taskFeedback(task)},task:clone(task)};}
      task.status=TASK_STATUS.RUNNING;task.execution.startedAt=new Date().toISOString();task.execution.currentOperationId=null;
      if(typeof adapters.createRecoveryBoundary==='function'){try{const boundary=await adapters.createRecoveryBoundary(clone(task));task.recovery.snapshotId=clean(boundary?.id||boundary,120)||null;task.recovery.undoAvailable=Boolean(boundary?.undoAvailable);}catch{}}
      let expected=current,stopped=false;refreshReadiness(task);
      for(const operation of task.operations){
        if(operation.status===OPERATION_STATUS.COMPLETED)continue;
        refreshReadiness(task);if(operation.status!==OPERATION_STATUS.READY)continue;
        let before;try{before=Feedback.captureEditorState(await adapters.readEditorState());}catch(error){operation.status=OPERATION_STATUS.FAILED;operation.error=safeError(error);stopped=true;break;}
        if(expected.fingerprint!==before.fingerprint){operation.status=OPERATION_STATUS.BLOCKED;operation.error='The editor state changed before this step could run.';task.failure={kind:Feedback.FAILURE_KIND.EDITOR_STATE_CHANGED,message:operation.error};stopped=true;break;}
        let allowed=true;for(const permission of operation.requiredPermissions){try{if(!await adapters.permissionCheck(permission,clone(operation),clone(task))){allowed=false;break;}}catch{allowed=false;break;}}
        if(!allowed){operation.status=OPERATION_STATUS.FAILED;operation.error='Required permission was not granted.';task.failure={kind:Feedback.FAILURE_KIND.PERMISSION_DENIED,message:operation.error};stopped=true;break;}
        operation.status=OPERATION_STATUS.RUNNING;task.execution.currentOperationId=operation.id;let raw;
        try{raw=await adapters.executeOperation(clone(operation),{taskId:task.id,baseline:clone(before)});}catch(error){raw={status:'FAILED',message:safeError(error)};}
        let after;try{after=Feedback.captureEditorState(await adapters.readEditorState());}catch{after=before;}
        const diff=Feedback.diffEditorState(before,after),reportedSuccess=raw?.success===true||/^(?:SUCCESS|COMPLETED)$/i.test(raw?.status||''),partial=raw?.partial===true||String(raw?.status||'').toUpperCase()==='PARTIAL',verified=raw?.verified===true||((reportedSuccess||partial)&&(operation.expectedStateChange.mutates?diff.changed:true));
        operation.verification={status:verified?(partial?Feedback.VERIFICATION_STATUS.PARTIAL:Feedback.VERIFICATION_STATUS.VERIFIED):Feedback.VERIFICATION_STATUS.FAILED,stateDiff:diff};operation.result=verified?clean(raw?.message||'Completed'):null;operation.error=verified?null:safeError(raw?.message||raw?.error||'The requested editor state was not verified.');operation.status=verified?(partial?OPERATION_STATUS.PARTIAL:OPERATION_STATUS.COMPLETED):OPERATION_STATUS.FAILED;task.execution.results.push({operationId:operation.id,status:operation.status,message:operation.result||operation.error,verification:operation.verification.status});expected=after;
        if(operation.status!==OPERATION_STATUS.COMPLETED){task.failure={kind:Feedback.classifyFailure(operation.error),message:operation.error};stopped=true;break;}
      }
      if(stopped)for(const operation of task.operations)if([OPERATION_STATUS.PENDING,OPERATION_STATUS.READY].includes(operation.status))operation.status=OPERATION_STATUS.BLOCKED;
      const completed=task.operations.filter(item=>item.status===OPERATION_STATUS.COMPLETED).length,failed=task.operations.some(item=>[OPERATION_STATUS.FAILED,OPERATION_STATUS.PARTIAL].includes(item.status));
      task.status=failed?(completed?TASK_STATUS.PARTIAL:TASK_STATUS.FAILED):task.operations.every(item=>item.status===OPERATION_STATUS.COMPLETED)?TASK_STATUS.COMPLETED:TASK_STATUS.BLOCKED;task.execution.currentOperationId=null;task.execution.completedAt=new Date().toISOString();task.finalState=expected;task.finalVerification={verified:task.status===TASK_STATUS.COMPLETED,completed,total:task.operations.length};task.recovery.recommended=task.status===TASK_STATUS.PARTIAL?Feedback.RECOVERY_ACTION.UNDO_PARTIAL:task.status===TASK_STATUS.FAILED?Feedback.RECOVERY_ACTION.RETRY:null;task.userFeedback={message:taskFeedback(task),facts:{completed,total:task.operations.length,status:task.status}};this.finish();if(task.status===TASK_STATUS.COMPLETED)this.ledger.set(task.id,clone(task));return {status:task.status,userFeedback:clone(task.userFeedback),task:clone(task)};
    }
    retry({confirmed=false,currentEditorState}={}){const task=this.pending;if(!task||![TASK_STATUS.FAILED,TASK_STATUS.PARTIAL,TASK_STATUS.BLOCKED].includes(task.status))return {status:TASK_STATUS.BLOCKED,message:'There is no failed task to retry.'};if(!confirmed)return {status:TASK_STATUS.AWAITING_CONFIRMATION,message:'Retry the failed step using the latest verified editor state?'};const snapshot=Feedback.captureEditorState(currentEditorState||task.finalState||{});task.baseline=snapshot;task.recovery.boundaryFingerprint=snapshot.fingerprint;task.failure=null;let reset=false;for(const operation of task.operations){if([OPERATION_STATUS.FAILED,OPERATION_STATUS.PARTIAL,OPERATION_STATUS.BLOCKED].includes(operation.status)){operation.status=OPERATION_STATUS.PENDING;operation.error=null;operation.verification=null;reset=true;}}task.status=TASK_STATUS.READY;task.confirmation.confirmed=true;task.execution.completedAt=null;refreshReadiness(task);return {status:reset?TASK_STATUS.READY:TASK_STATUS.BLOCKED,task:clone(task)};}
    async recover({action=Feedback.RECOVERY_ACTION.UNDO_PARTIAL,confirmed=false,adapters={}}={}){const task=this.pending;if(!task)return {status:TASK_STATUS.BLOCKED,message:'There is no task to recover.'};if(!confirmed)return {status:TASK_STATUS.AWAITING_CONFIRMATION,message:'Undo the completed part of this task?'};if(action!==Feedback.RECOVERY_ACTION.UNDO_PARTIAL||typeof adapters.undo!=='function')return {status:TASK_STATUS.BLOCKED,message:'That recovery action is not available.'};try{const value=await adapters.undo(clone(task));task.status=TASK_STATUS.RECOVERED;task.recovery.rollbackAttempted=true;task.recovery.rolledBack=value===true||value?.success===true;return {status:task.status,task:clone(task)};}catch(error){return {status:TASK_STATUS.FAILED,failure:{kind:Feedback.FAILURE_KIND.RECOVERY_FAILED,message:safeError(error)}};}}
    finish(){if(!this.pending)return;this.pending.updatedAt=new Date().toISOString();if([TASK_STATUS.COMPLETED,TASK_STATUS.PARTIAL,TASK_STATUS.FAILED,TASK_STATUS.REJECTED,TASK_STATUS.RECOVERED].includes(this.pending.status)){this.history.push(clone(this.pending));this.history=this.history.slice(-LIMITS.history);}}
    inspect(){return {userId:this.userId,pending:clone(this.pending),history:this.history.map(clone),committed:[...this.ledger.keys()]};}
    clear(){this.pending=null;this.history=[];this.ledger.clear();}
  }
  return {TASK_STATUS,OPERATION_STATUS,LIMITS,TaskOrchestrationManager,buildTask,refreshReadiness,concisePlan,taskFeedback,expectation};
});
