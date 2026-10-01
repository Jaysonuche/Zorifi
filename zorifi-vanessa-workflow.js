(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiVanessaWorkflow=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const STEP_STATUS=Object.freeze({PENDING:'PENDING',READY:'READY',RUNNING:'RUNNING',COMPLETED:'COMPLETED',FAILED:'FAILED',BLOCKED:'BLOCKED',PAUSED:'PAUSED',CANCELLED:'CANCELLED'});
  const WORKFLOW_STATUS=Object.freeze({ACTIVE:'ACTIVE',PAUSED:'PAUSED',COMPLETED:'COMPLETED',FAILED:'FAILED',CANCELLED:'CANCELLED',BLOCKED:'BLOCKED'});
  const RELATION=Object.freeze({INDEPENDENT:'INDEPENDENT',SEQUENTIAL:'SEQUENTIAL',DEPENDENT:'DEPENDENT'});
  const LIMITS=Object.freeze({steps:12,description:240,goal:300,constraints:8,dependencies:24,payload:1600,recentCompleted:12});
  const SENSITIVE=/(?:password|passcode|api[ _-]?key|access[ _-]?token|private[ _-]?key|seed phrase|recovery phrase|credit[ _-]?card|debit[ _-]?card|bank[ _-]?(?:account|routing)|\bcvv\b|\bssn\b)/i;
  const CONTROL=Object.freeze({
    CONTINUE:/^(?:please\s+)?(?:continue|do the next one|do the next step|next|keep going|resume)[.!]?$/i,
    PAUSE:/^(?:please\s+)?(?:pause|pause for now|stop for now)[.!]?$/i,
    CANCEL:/^(?:please\s+)?(?:cancel(?: that| everything| the workflow)?|stop|never mind|don['’]?t continue)[.!]?$/i,
    RETRY:/^(?:please\s+)?(?:try again|retry(?: that)?|do it again)[.!]?$/i
  });
  const ACTIONS=Object.freeze([
    {type:'REFERENCE_ANALYSIS',pattern:/(?:copy|match|use).*(?:(?:pacing|transitions?|style|edit).*(?:reference|this video)|(?:reference|this video).*(?:pacing|transitions?|style|edit))|copy (?:its|the) (?:pacing|transitions?)/i,supported:false,description:'Analyze the requested reference characteristics'},
    {type:'AUDIO_EXTRACT',pattern:/extract (?:the )?audio/i,supported:true,description:'Extract the audio from the selected media'},
    {type:'AUDIO_ADD',pattern:/(?:use|add).*(?:extracted audio|background music)/i,supported:true,description:'Add the requested audio to the timeline'},
    {type:'CAPTION_STYLE',pattern:/(?:make|set|increase|change).*(?:captions?|subtitles?).*(?:bigger|larger|size|style|colour|color|font)/i,supported:true,description:'Update the caption styling'},
    {type:'CAPTIONS_ADD',pattern:/(?:add|create|generate).*(?:captions?|subtitles?)/i,supported:true,description:'Generate captions from the selected media'},
    {type:'CAPTIONS_REMOVE',pattern:/(?:remove|delete|don['’]?t add).*(?:captions?|subtitles?)/i,supported:true,description:'Remove generated captions'},
    {type:'ASPECT_RATIO',pattern:/(?:make|set|crop|change|export).*(?:vertical|portrait|landscape|square|9\s*:\s*16|16\s*:\s*9|1\s*:\s*1|4\s*:\s*5)|^(?:vertical|portrait|landscape|square)$/i,supported:true,description:'Set the project aspect ratio'},
    {type:'EXPORT',pattern:/\b(?:export|render)\b/i,supported:true,description:'Prepare the project for export'},
    {type:'PREVIEW',pattern:/(?:preview|play|show me)(?:\s+(?:the|my))?\s*(?:result|video|edit|project)?/i,supported:true,description:'Preview the edited result'},
    {type:'TRIM',pattern:/(?:trim|shorten|cut).*(?:beginning|start|intro|ending|outro|seconds?|duration)|(?:make|keep).*(?:under|less than|no more than|maximum).*(?:seconds?|minutes?)/i,supported:true,description:'Trim the requested part of the video'},
    {type:'SPEED',pattern:/(?:make|speed|slow).*(?:intro|outro|clip|video|cuts?).*(?:faster|slower)|(?:increase|decrease).*(?:speed|pacing)|(?:faster|slower) cuts?/i,supported:true,description:'Adjust the requested clip speed'},
    {type:'ZOOM',pattern:/(?:add|apply|create|make).*(?:zoom)/i,supported:true,description:'Add a zoom animation'},
    {type:'TRANSITION',pattern:/(?:add|apply|change|copy).*(?:transitions?)/i,supported:true,description:'Apply the requested transition'},
    {type:'FILTER',pattern:/(?:add|apply|change).*(?:filter|cinematic look|colour grade|color grade)/i,supported:true,description:'Apply the requested visual treatment'},
    {type:'VOLUME',pattern:/(?:increase|decrease|raise|lower|change|set|mute|unmute).*(?:volume|music|audio|voice)/i,supported:true,description:'Adjust the requested audio level'},
    {type:'MUSIC',pattern:/(?:add|use|keep|change|replace).*(?:music|soundtrack|song)/i,supported:true,description:'Update the project music'},
    {type:'TEXT',pattern:/(?:add|create|change|edit|make).*(?:title|text)/i,supported:true,description:'Update the requested text'},
    {type:'EFFECT',pattern:/(?:add|apply|change|remove).*(?:effect)/i,supported:true,description:'Update the requested effect'},
    {type:'ANIMATION',pattern:/(?:add|apply|change|remove).*(?:animation)/i,supported:true,description:'Update the requested animation'},
    {type:'BACKGROUND_REMOVE',pattern:/(?:remove|delete).*(?:background)/i,supported:true,description:'Remove the selected media background'},
    {type:'CHROMA_KEY',pattern:/(?:add|apply|use|change).*(?:chroma key|green screen)/i,supported:true,description:'Apply chroma key controls'},
    {type:'MASK',pattern:/(?:add|apply|change).*(?:mask|masking)/i,supported:true,description:'Apply a mask'},
    {type:'KEYFRAME',pattern:/(?:add|create|change|move|delete).*(?:keyframes?)/i,supported:true,description:'Update keyframes'},
    {type:'SAVE',pattern:/(?:save).*(?:project|video|changes)/i,supported:true,description:'Save the project'},
    {type:'SPLIT',pattern:/(?:split|cut).*(?:clip|video|playhead| at )/i,supported:true,description:'Split the selected clip'},
    {type:'DEVELOPMENT',pattern:/(?:investigate|fix|test|build|deploy|document).*(?:zorifi|vanessa|bug|tests?|app|code)/i,supported:false,description:'Continue through the controlled development workflow'}
  ]);

  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const clean=(value,max=LIMITS.description)=>String(value||'').trim().replace(/\s+/g,' ').slice(0,max);
  const now=()=>new Date().toISOString();
  const id=prefix=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const terminal=status=>[STEP_STATUS.COMPLETED,STEP_STATUS.FAILED,STEP_STATUS.CANCELLED].includes(status);
  const activeWorkflow=workflow=>workflow&&![WORKFLOW_STATUS.COMPLETED,WORKFLOW_STATUS.CANCELLED].includes(workflow.status);
  function sanitise(value,max=LIMITS.description){const result=clean(value,max);return SENSITIVE.test(result)?'':result;}
  function targetFrom(text,context={}){const value=clean(text).toLowerCase();if(/\b(?:intro|opening|beginning)\b/.test(value))return 'intro';if(/\b(?:outro|ending|end)\b/.test(value))return 'outro';if(/\b(?:captions?|subtitles?)\b/.test(value))return 'captions';if(/\b(?:music|soundtrack|song)\b/.test(value))return 'music';if(/\b(?:whole|entire) (?:video|project)\b/.test(value))return 'project';if(/\bselected (?:clip|layer|media)\b/.test(value))return context.selectedClipId||'selected_clip';return context.selectedClipId||context.target||'selected_clip';}
  function actionFor(text){return ACTIONS.find(item=>item.pattern.test(clean(text)))||null;}
  function splitClauses(message){
    const protectedText=clean(message,1800).replace(/(\d)\s*,\s*(\d)/g,'$1§$2');
    return protectedText.split(/\s*(?:,|;|\bthen\b|\band then\b|\bafter that\b|\bnext\b)\s*|\s+\band\b\s+(?=(?:add|apply|change|copy|crop|cut|delete|export|extract|fix|generate|increase|keep|lower|make|move|raise|remove|render|resize|rotate|save|set|slow|speed|split|trim|use)\b)/i).map(part=>part.replace(/§/g,',').trim()).filter(Boolean);
  }
  function explicitSequence(message){return /\b(?:then|after that|next|before|after)\b/i.test(clean(message));}
  function describe(action,clause){if(!action)return clean(clause);const qualifier=clean(clause).replace(/^(?:and|then|also|please)\s+/i,'');return clean(qualifier||action.description);}
  function normalizeConstraints(items=[]){const output=[];for(const item of items){if(!item||!item.type)continue;const type=clean(item.type,40),value=typeof item.value==='number'||typeof item.value==='boolean'?item.value:sanitise(item.value,100);if(!type||value==='')continue;if(!output.some(entry=>entry.type===type&&entry.value===value))output.push({type,value,label:sanitise(item.label||'',120)});if(output.length>=LIMITS.constraints)break;}return output;}
  function inferGoal(message){const value=sanitise(message,LIMITS.goal);return value?`Complete the requested workflow: ${value}`:'';}
  function dependencyTypes(step,prior=[]){
    const deps=[];
    const last=type=>[...prior].reverse().find(item=>item.intent===type);
    if(step.intent==='CAPTION_STYLE'&&last('CAPTIONS_ADD'))deps.push(last('CAPTIONS_ADD').id);
    if(step.intent==='AUDIO_ADD'&&last('AUDIO_EXTRACT'))deps.push(last('AUDIO_EXTRACT').id);
    if(step.intent==='EXPORT')deps.push(...prior.filter(item=>!['SAVE','EXPORT'].includes(item.intent)).map(item=>item.id));
    if(step.intent==='REFERENCE_ANALYSIS')return deps;
    return [...new Set(deps)].slice(0,LIMITS.dependencies);
  }
  function parseWorkflowSteps(message,{intentContext={},responsePlan={},editorContext={},maxSteps=LIMITS.steps}={}){
    const value=sanitise(message,1800);if(!value)return [];
    const clauses=splitClauses(value),steps=[];
    for(const clause of clauses){
      const action=actionFor(clause);if(!action)continue;
      const duplicate=steps.find(item=>item.intent===action.type&&clean(item.commandText).toLowerCase()===clean(clause).toLowerCase());if(duplicate)continue;
      const step={id:`step-${String(steps.length+1).padStart(2,'0')}`,description:describe(action,clause),commandText:sanitise(clause,400),intent:action.type,action:action.type,target:targetFrom(clause,editorContext),constraints:normalizeConstraints(intentContext.constraints),dependencies:[],status:STEP_STATUS.PENDING,requiresConfirmation:/\b(?:delete|remove all|clear|replace project)\b/i.test(clause),executable:Boolean(action.supported),capability:action.supported?'existing-zorifi':'requires-capability',result:null,error:null,relation:RELATION.INDEPENDENT};
      step.dependencies=dependencyTypes(step,steps);
      if(step.dependencies.length)step.relation=RELATION.DEPENDENT;else if(explicitSequence(value)&&steps.length){step.dependencies=[steps[steps.length-1].id];step.relation=RELATION.SEQUENTIAL;}
      steps.push(step);if(steps.length>=Math.max(1,Math.min(LIMITS.steps,Number(maxSteps)||LIMITS.steps)))break;
    }
    if(steps.length===1&&intentContext.editorIntent&&responsePlan.resolvedCommand)steps[0].commandText=sanitise(responsePlan.resolvedCommand,400)||steps[0].commandText;
    return steps;
  }
  function identifyDependencies(steps=[]){return steps.flatMap(step=>step.dependencies.map(dependency=>({from:dependency,to:step.id,type:step.relation||RELATION.DEPENDENT}))).slice(0,LIMITS.dependencies);}
  function identifyParallelSteps(steps=[]){return steps.filter(step=>!step.dependencies.length).map(step=>step.id);}
  function refresh(workflow){
    if(!workflow)return null;
    const byId=new Map(workflow.steps.map(step=>[step.id,step]));
    for(const step of workflow.steps){
      if(terminal(step.status)||step.status===STEP_STATUS.RUNNING)continue;
      if(workflow.status===WORKFLOW_STATUS.PAUSED){step.status=STEP_STATUS.PAUSED;continue;}
      const deps=step.dependencies.map(item=>byId.get(item)).filter(Boolean);
      if(deps.some(item=>[STEP_STATUS.FAILED,STEP_STATUS.BLOCKED,STEP_STATUS.CANCELLED].includes(item.status))){step.status=STEP_STATUS.BLOCKED;continue;}
      if(!step.executable){step.status=STEP_STATUS.BLOCKED;continue;}
      step.status=deps.every(item=>item.status===STEP_STATUS.COMPLETED)?STEP_STATUS.READY:STEP_STATUS.PENDING;
    }
    if(workflow.steps.every(step=>[STEP_STATUS.COMPLETED,STEP_STATUS.CANCELLED].includes(step.status)))workflow.status=WORKFLOW_STATUS.COMPLETED;
    else if(workflow.steps.some(step=>step.status===STEP_STATUS.READY||step.status===STEP_STATUS.RUNNING||step.status===STEP_STATUS.PENDING))workflow.status=workflow.status===WORKFLOW_STATUS.PAUSED?WORKFLOW_STATUS.PAUSED:WORKFLOW_STATUS.ACTIVE;
    else if(workflow.steps.some(step=>step.status===STEP_STATUS.FAILED))workflow.status=WORKFLOW_STATUS.FAILED;
    else if(workflow.steps.some(step=>step.status===STEP_STATUS.BLOCKED))workflow.status=WORKFLOW_STATUS.BLOCKED;
    workflow.updatedAt=now();workflow.dependencies=identifyDependencies(workflow.steps);workflow.parallelReady=identifyParallelSteps(workflow.steps.filter(step=>step.status===STEP_STATUS.READY));return workflow;
  }
  function createWorkflow({message='',goal='',steps=[],constraints=[],target='',reference=null,userId='guest'}={}){
    const workflow={id:id('workflow'),userId:clean(userId,100)||'guest',goal:sanitise(goal||message,LIMITS.goal),source:sanitise(message,800),target:sanitise(target,100),reference:reference?{kind:clean(reference.kind,30)||'media',name:sanitise(reference.name,120),characteristics:(reference.characteristics||[]).map(item=>sanitise(item,50)).filter(Boolean).slice(0,12)}:null,constraints:normalizeConstraints(constraints),steps:clone(steps).slice(0,LIMITS.steps),dependencies:[],parallelReady:[],status:WORKFLOW_STATUS.ACTIVE,currentStepId:null,createdAt:now(),updatedAt:now(),completedAt:null};
    workflow.steps.forEach((step,index)=>{step.id=clean(step.id,40)||`step-${String(index+1).padStart(2,'0')}`;step.status=step.status||STEP_STATUS.PENDING;step.dependencies=Array.isArray(step.dependencies)?step.dependencies.slice(0,LIMITS.dependencies):[];});return refresh(workflow);
  }
  function getNextStep(workflow,{start=false}={}){if(!workflow||workflow.status===WORKFLOW_STATUS.PAUSED||workflow.status===WORKFLOW_STATUS.CANCELLED)return null;refresh(workflow);const running=workflow.steps.find(step=>step.status===STEP_STATUS.RUNNING),step=running||workflow.steps.find(item=>item.status===STEP_STATUS.READY);if(step&&start){step.status=STEP_STATUS.RUNNING;workflow.currentStepId=step.id;workflow.updatedAt=now();}return step||null;}
  function stepById(workflow,stepId){return workflow?.steps.find(step=>step.id===stepId)||workflow?.steps.find(step=>step.status===STEP_STATUS.RUNNING)||null;}
  function markStepComplete(workflow,stepId,result){const step=stepById(workflow,stepId);if(!step)return null;step.status=STEP_STATUS.COMPLETED;step.result=sanitise(typeof result==='string'?result:result?.message||'Completed',300);step.error=null;workflow.currentStepId=null;refresh(workflow);if(workflow.status===WORKFLOW_STATUS.COMPLETED)workflow.completedAt=now();return clone(step);}
  function markStepFailed(workflow,stepId,error,{unsupported=false}={}){const step=stepById(workflow,stepId);if(!step)return null;step.status=unsupported?STEP_STATUS.BLOCKED:STEP_STATUS.FAILED;step.error=sanitise(typeof error==='string'?error:error?.message||'The step could not be completed.',300)||'The step could not be completed.';workflow.currentStepId=null;refresh(workflow);return clone(step);}
  function pauseWorkflow(workflow){if(!activeWorkflow(workflow))return workflow;workflow.status=WORKFLOW_STATUS.PAUSED;workflow.steps.forEach(step=>{if([STEP_STATUS.READY,STEP_STATUS.PENDING].includes(step.status))step.status=STEP_STATUS.PAUSED;});workflow.updatedAt=now();return workflow;}
  function resumeWorkflow(workflow){if(!workflow||workflow.status!==WORKFLOW_STATUS.PAUSED)return workflow;if(workflow.steps.every(step=>terminal(step.status)))return workflow;workflow.status=WORKFLOW_STATUS.ACTIVE;workflow.steps.forEach(step=>{if(step.status===STEP_STATUS.PAUSED)step.status=STEP_STATUS.PENDING;});return refresh(workflow);}
  function cancelWorkflow(workflow){if(!workflow)return workflow;workflow.steps.forEach(step=>{if(!terminal(step.status))step.status=STEP_STATUS.CANCELLED;});workflow.status=WORKFLOW_STATUS.CANCELLED;workflow.currentStepId=null;workflow.updatedAt=now();return workflow;}
  function retryFailedStep(workflow){if(!workflow)return null;const step=workflow.steps.find(item=>item.status===STEP_STATUS.FAILED);if(!step||!step.executable)return null;step.status=STEP_STATUS.PENDING;step.error=null;workflow.status=WORKFLOW_STATUS.ACTIVE;refresh(workflow);return clone(getNextStep(workflow));}
  function removeStep(workflow,predicate){const removed=[];for(const step of workflow.steps){if(!terminal(step.status)&&predicate(step)){step.status=STEP_STATUS.CANCELLED;removed.push(step.id);}}workflow.steps.forEach(step=>{step.dependencies=step.dependencies.filter(dep=>!removed.includes(dep));});refresh(workflow);return removed;}
  function updateWorkflowFromCorrection(workflow,message,options={}){
    if(!workflow)return {workflow:null,changed:false,type:'NONE'};const text=clean(message),lower=text.toLowerCase();
    const dont=lower.match(/(?:don['’]?t|do not|remove|skip) (?:add |apply |use )?(captions?|subtitles?|music|zoom|transitions?|filter|export)/i);
    if(dont){const word=dont[1],removed=removeStep(workflow,step=>step.description.toLowerCase().includes(word.replace(/s$/,''))||step.commandText.toLowerCase().includes(word.replace(/s$/,'')));return {workflow:clone(workflow),changed:Boolean(removed.length),type:'REMOVE_STEP',removed};}
    const duration=lower.match(/(?:make|keep) it (\d+(?:\.\d+)?) seconds? instead/);if(duration){workflow.constraints=workflow.constraints.filter(item=>item.type!=='maximum-duration');workflow.constraints.push({type:'maximum-duration',value:Number(duration[1]),label:`maximum ${duration[1]} seconds`});workflow.steps.forEach(step=>{if(['TRIM','EXPORT'].includes(step.intent))step.constraints=clone(workflow.constraints);});workflow.updatedAt=now();return {workflow:clone(workflow),changed:true,type:'MODIFY_CONSTRAINT'};}
    const ratio=lower.match(/(?:export|make) it (?:in )?(9\s*:\s*16|16\s*:\s*9|1\s*:\s*1|4\s*:\s*5) instead/);if(ratio){const value=ratio[1].replace(/\s/g,'');workflow.constraints=workflow.constraints.filter(item=>item.type!=='aspect-ratio');workflow.constraints.push({type:'aspect-ratio',value,label:value});let step=workflow.steps.find(item=>item.intent==='ASPECT_RATIO');if(step){step.commandText=`Set the project aspect ratio to ${value}`;step.description=step.commandText;step.status=STEP_STATUS.PENDING;}else{step={id:`step-${String(workflow.steps.length+1).padStart(2,'0')}`,description:`Set the project aspect ratio to ${value}`,commandText:`Set the project aspect ratio to ${value}`,intent:'ASPECT_RATIO',action:'ASPECT_RATIO',target:'project',constraints:clone(workflow.constraints),dependencies:[],status:STEP_STATUS.PENDING,requiresConfirmation:false,executable:true,capability:'existing-zorifi',result:null,error:null,relation:RELATION.INDEPENDENT};workflow.steps.splice(Math.max(0,workflow.steps.length-1),0,step);}refresh(workflow);return {workflow:clone(workflow),changed:true,type:'MODIFY_CONSTRAINT'};}
    if(/^also\b/i.test(text)){const additions=parseWorkflowSteps(text.replace(/^also\s+/i,''),options).filter(step=>!workflow.steps.some(existing=>existing.intent===step.intent&&existing.status!==STEP_STATUS.CANCELLED));if(additions.length){const exportIndex=workflow.steps.findIndex(step=>step.intent==='EXPORT'&&!terminal(step.status));for(const step of additions){step.id=`step-${String(workflow.steps.length+1).padStart(2,'0')}`;if(exportIndex>=0)workflow.steps.splice(exportIndex,0,step);else workflow.steps.push(step);}refresh(workflow);return {workflow:clone(workflow),changed:true,type:'ADD_STEP',added:additions.map(item=>item.id)};}}
    return {workflow:clone(workflow),changed:false,type:'NONE'};
  }
  function resolveWorkflowReference(workflow,{attachments=[],responsePlan={},intentContext={}}={}){if(!workflow)return null;const attachment=attachments.find(item=>['video','image','media'].includes(item.kind)),planned=responsePlan.resolvedReference,intent=intentContext.reference;if(planned||intent||attachment){workflow.reference={kind:clean(planned?.kind||intent?.kind||attachment?.kind,30)||'media',name:sanitise(planned?.name||attachment?.name,120),characteristics:(planned?.characteristics||intent?.transferCharacteristics||[]).map(item=>sanitise(item,50)).filter(Boolean).slice(0,12)};}return clone(workflow.reference);}
  function buildWorkflowContext(workflow){if(!workflow)return undefined;const current=getNextStep(workflow),remaining=workflow.steps.filter(step=>![STEP_STATUS.COMPLETED,STEP_STATUS.CANCELLED].includes(step.status)).slice(0,LIMITS.steps),context={goal:sanitise(workflow.goal,LIMITS.goal),status:workflow.status,currentStep:current?{id:current.id,description:sanitise(current.description),intent:current.intent,target:sanitise(current.target,80),status:current.status}:null,remainingSteps:remaining.map(step=>({id:step.id,description:sanitise(step.description,160),status:step.status})),constraints:normalizeConstraints(workflow.constraints),target:sanitise(workflow.target||current?.target,80),reference:workflow.reference?{kind:workflow.reference.kind,name:sanitise(workflow.reference.name,100),characteristics:(workflow.reference.characteristics||[]).slice(0,8)}:undefined,responseType:current?'WORKFLOW_STEP':'WORKFLOW_STATUS'};while(JSON.stringify(context).length>LIMITS.payload&&context.remainingSteps.length>1)context.remainingSteps.pop();return context;}
  function inspectWorkflow(workflow){return clone(workflow);}
  function summary(workflow){if(!workflow)return 'There is no active workflow.';const completed=workflow.steps.filter(step=>step.status===STEP_STATUS.COMPLETED).length,current=getNextStep(workflow);return `${completed}/${workflow.steps.length} steps complete${current?`. Next: ${current.description}`:''}.`;}
  function planWorkflow(message,{active=null,userId='guest',intentContext={},responsePlan={},editorContext={},attachments=[]}={}){
    const value=clean(message,1800);
    if(CONTROL.CANCEL.test(value)&&activeWorkflow(active)){cancelWorkflow(active);return {activated:true,operation:'CANCEL',workflow:clone(active),currentStep:null,message:'Cancelled the remaining workflow steps. Completed edits were not reversed.'};}
    if(CONTROL.PAUSE.test(value)&&activeWorkflow(active)){pauseWorkflow(active);return {activated:true,operation:'PAUSE',workflow:clone(active),currentStep:null,message:'Paused the workflow. I kept its completed steps and progress.'};}
    if(CONTROL.CONTINUE.test(value)){if(!activeWorkflow(active))return {activated:true,operation:'NO_ACTIVE',workflow:null,currentStep:null,requiresClarification:true,message:'There isn’t an active workflow to continue. What would you like to work on?'};resumeWorkflow(active);const current=getNextStep(active);return {activated:true,operation:'CONTINUE',workflow:clone(active),currentStep:clone(current),message:current?`Next: ${current.description}`:summary(active)};}
    if(CONTROL.RETRY.test(value)){if(!activeWorkflow(active))return {activated:true,operation:'NO_ACTIVE',workflow:null,currentStep:null,requiresClarification:true,message:'There isn’t a failed workflow step to retry.'};const current=retryFailedStep(active);return {activated:true,operation:'RETRY',workflow:clone(active),currentStep:current,requiresClarification:!current,message:current?`Retrying: ${current.description}`:'There isn’t a retryable failed step.'};}
    if(activeWorkflow(active)&&/^(?:actually|also|don['’]?t|do not|remove|skip|make it|export it)/i.test(value)){const correction=updateWorkflowFromCorrection(active,value,{intentContext,responsePlan,editorContext});if(correction.changed)return {activated:true,operation:'UPDATE',workflow:clone(active),currentStep:clone(getNextStep(active)),correction,message:'Updated the active workflow without restarting completed steps.'};}
    const steps=parseWorkflowSteps(value,{intentContext,responsePlan,editorContext});
    if(steps.length<2)return {activated:false,operation:'SINGLE_ACTION',workflow:activeWorkflow(active)?clone(active):null,currentStep:null,steps};
    const workflow=createWorkflow({message:value,goal:inferGoal(value,intentContext),steps,constraints:intentContext.constraints,target:responsePlan.target||targetFrom(value,editorContext),reference:responsePlan.resolvedReference,userId});resolveWorkflowReference(workflow,{attachments,responsePlan,intentContext});const current=getNextStep(workflow);return {activated:true,operation:'CREATE',workflow:clone(workflow),currentStep:clone(current),message:`I planned ${workflow.steps.length} controlled steps. ${current?`First: ${current.description}`:'The requested steps need clarification or unsupported capabilities.'}`};
  }

  class WorkflowPlanner{
    constructor({userId='guest',maxSteps=LIMITS.steps}={}){this.userId=clean(userId,100)||'guest';this.maxSteps=Math.max(2,Math.min(LIMITS.steps,Number(maxSteps)||LIMITS.steps));this.active=null;this.recent=[];}
    createWorkflow(options={}){this.active=createWorkflow({...options,userId:this.userId,steps:(options.steps||[]).slice(0,this.maxSteps)});return this.inspectWorkflow();}
    planWorkflow(message,options={}){const result=planWorkflow(message,{...options,active:this.active,userId:this.userId});if(result.workflow&&result.workflow.userId===this.userId)this.active=clone(result.workflow);if(this.active&&[WORKFLOW_STATUS.COMPLETED,WORKFLOW_STATUS.CANCELLED].includes(this.active.status)){this.recent=[...this.recent,this.active].slice(-3);}return {...result,workflow:this.inspectWorkflow(),currentStep:result.currentStep?clone(result.currentStep):null};}
    parseWorkflowSteps(message,options={}){return parseWorkflowSteps(message,{...options,maxSteps:this.maxSteps});}
    identifyDependencies(steps=this.active?.steps||[]){return identifyDependencies(steps);}
    identifyParallelSteps(steps=this.active?.steps||[]){return identifyParallelSteps(steps);}
    getNextStep(options={}){const step=getNextStep(this.active,options);return clone(step);}
    markStepRunning(stepId){const step=stepById(this.active,stepId);if(!step||step.status!==STEP_STATUS.READY)return null;step.status=STEP_STATUS.RUNNING;this.active.currentStepId=step.id;this.active.updatedAt=now();return clone(step);}
    markStepComplete(stepId,result){const step=markStepComplete(this.active,stepId,result);return {step,workflow:this.inspectWorkflow()};}
    markStepFailed(stepId,error,options={}){const step=markStepFailed(this.active,stepId,error,options);return {step,workflow:this.inspectWorkflow()};}
    pauseWorkflow(){pauseWorkflow(this.active);return this.inspectWorkflow();}
    resumeWorkflow(){resumeWorkflow(this.active);return this.inspectWorkflow();}
    cancelWorkflow(){cancelWorkflow(this.active);return this.inspectWorkflow();}
    updateWorkflowFromCorrection(message,options={}){const result=updateWorkflowFromCorrection(this.active,message,options);this.active=result.workflow;return result;}
    resolveWorkflowReference(options={}){const result=resolveWorkflowReference(this.active,options);return clone(result);}
    buildWorkflowContext(){return buildWorkflowContext(this.active);}
    inspectWorkflow(){return inspectWorkflow(this.active);}
    clear(){this.active=null;this.recent=[];}
  }

  return {STEP_STATUS,WORKFLOW_STATUS,RELATION,LIMITS,WorkflowPlanner,createWorkflow,planWorkflow,parseWorkflowSteps,identifyDependencies,identifyParallelSteps,getNextStep,markStepComplete,markStepFailed,pauseWorkflow,resumeWorkflow,cancelWorkflow,retryFailedStep,updateWorkflowFromCorrection,resolveWorkflowReference,buildWorkflowContext,inspectWorkflow,summary};
});
