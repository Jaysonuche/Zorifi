(function(root,factory){
  const commonJs=typeof window==='undefined'&&typeof module==='object'&&module.exports&&typeof require==='function';
  const api=factory(commonJs?require('./zorifi-vanessa-visual-analysis.js'):root.ZorifiVanessaVisualAnalysis,commonJs?require('./zorifi-vanessa-workflow.js'):root.ZorifiVanessaWorkflow);
  if(commonJs)module.exports=api;else root.ZorifiVanessaReferenceExecution=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Visual,Workflow){
  'use strict';
  if(!Visual||!Workflow)throw new Error('Reference execution requires Step 10 visual analysis and Step 8 workflow.');

  const OP_STATUS=Object.freeze({READY:'READY',UNSUPPORTED:'UNSUPPORTED',UNKNOWN:'UNKNOWN',BLOCKED:'BLOCKED',REQUIRES_CONFIRMATION:'REQUIRES_CONFIRMATION',COMPLETED:'COMPLETED',FAILED:'FAILED'});
  const PLAN_STATUS=Object.freeze({DRAFT:'DRAFT',AWAITING_CONFIRMATION:'AWAITING_CONFIRMATION',READY:'READY',RUNNING:'RUNNING',PAUSED:'PAUSED',COMPLETED:'COMPLETED',PARTIAL:'PARTIAL',FAILED:'FAILED',REJECTED:'REJECTED',CANCELLED:'CANCELLED'});
  const LIMITS=Object.freeze({operations:12,targets:24,results:24,text:260,payload:2400,segmentsPerTarget:12,userId:100});
  const SENSITIVE=/(?:password|passcode|api[ _-]?key|access[ _-]?token|private[ _-]?key|seed phrase|recovery phrase|credit[ _-]?card|\bcvv\b)/i;
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const clean=(value,max=LIMITS.text)=>String(value||'').trim().replace(/\s+/g,' ').slice(0,max);
  const number=value=>Number.isFinite(Number(value))?Number(value):null;
  const round=value=>Math.round(Number(value)*1000)/1000;
  const bounded=(value,limit)=>Array.isArray(value)?value.slice(0,limit):[];
  const now=()=>new Date().toISOString();
  const unique=items=>[...new Set(items.filter(Boolean))];
  const safeText=(value,max=LIMITS.text)=>SENSITIVE.test(clean(value,max))?'':clean(value,max);
  const visualStatusToOperation=status=>status===Visual.STATUS.BLOCKED?OP_STATUS.BLOCKED:status===Visual.STATUS.UNKNOWN?OP_STATUS.UNKNOWN:OP_STATUS.UNSUPPORTED;

  function validateBlueprint(blueprint){
    if(!blueprint||typeof blueprint!=='object')return {valid:false,reason:'A verified Step 10 blueprint is required.'};
    if(!clean(blueprint.id,120)||!clean(blueprint.referenceId,120))return {valid:false,reason:'The reference blueprint is incomplete.'};
    if(blueprint.noFrameForFrameCopy!==true)return {valid:false,reason:'The blueprint must prohibit frame-for-frame copying.'};
    if(!Array.isArray(blueprint.characteristics))return {valid:false,reason:'The blueprint has no bounded characteristic list.'};
    if(blueprint.characteristics.length>Visual.LIMITS.characteristics)return {valid:false,reason:'The blueprint exceeds the characteristic limit.'};
    return {valid:true,referenceId:clean(blueprint.referenceId,120),blueprintId:clean(blueprint.id,120)};
  }
  function normaliseTarget(target,index=0){
    const id=clean(target?.id||target?.clipId,120),duration=number(target?.duration),start=Math.max(0,number(target?.start)??0),track=number(target?.track);
    if(!id||duration==null||duration<=0)return null;
    return {id,label:safeText(target.label||target.name||`target clip ${index+1}`,120)||`target clip ${index+1}`,duration:round(duration),start:round(start),track:track==null?null:track,type:clean(target.type||'video',30),locked:Boolean(target.locked),mediaId:clean(target.mediaId||target.assetId,120)||null};
  }
  function validateTargets(targets,{referenceId}={}){
    const input=bounded(targets,LIMITS.targets),valid=input.map(normaliseTarget).filter(Boolean),errors=[];
    if(!input.length)errors.push('Select at least one target clip.');
    if(input.length&&!valid.length)errors.push('The selected target media has no usable duration.');
    if(valid.some(item=>item.id===clean(referenceId,120)))errors.push('Reference media cannot also be target media.');
    const editable=valid.filter(item=>!item.locked&&['video','image'].includes(item.type));
    if(valid.length&&!editable.length)errors.push('The selected target media is locked or unsupported.');
    return {valid:errors.length===0,targets:editable,errors,availableDuration:round(editable.reduce((sum,item)=>sum+item.duration,0))};
  }
  function characteristicMap(blueprint){return new Map(bounded(blueprint?.characteristics,Visual.LIMITS.characteristics).map(item=>[item.id,item]));}
  function operation({characteristic,intent,description,commandText,target,status=OP_STATUS.REQUIRES_CONFIRMATION,reason='',parameters={}}){return {id:'',characteristic,description:safeText(description),commandText:safeText(commandText,400),intent:clean(intent,50),targetId:clean(target?.id,120),targetLabel:safeText(target?.label,120),status,reason:safeText(reason),parameters:clone(parameters),requiresConfirmation:status===OP_STATUS.REQUIRES_CONFIRMATION,result:null,error:null,attempts:0,createdAt:now(),updatedAt:now()};}
  function unsupportedOperation(item,characteristic){
    const status=item.support===Visual.SUPPORT.BLOCKED?OP_STATUS.BLOCKED:item.support===Visual.SUPPORT.UNKNOWN?OP_STATUS.UNKNOWN:OP_STATUS.UNSUPPORTED;
    return operation({characteristic,intent:'REFERENCE_CHARACTERISTIC',description:`${characteristic} cannot be executed`,commandText:'',target:{},status,reason:item.cannot||`Zorifi cannot reliably reproduce ${characteristic}.`});
  }
  function distributeCuts(times,targets){
    const operations=[];if(!targets.length)return operations;
    const pattern=bounded(times,Visual.LIMITS.segments).map(number).filter(value=>value!=null&&value>0).sort((a,b)=>a-b),referenceEnd=pattern.at(-1)||targets.reduce((sum,item)=>sum+item.duration,0),scale=referenceEnd>0?targets.reduce((sum,item)=>sum+item.duration,0)/referenceEnd:1;
    let offset=0;
    for(const target of targets){
      const local=pattern.map(value=>value*scale-offset).filter(value=>value>.08&&value<target.duration-.08).slice(0,LIMITS.segmentsPerTarget);
      for(const time of local)operations.push(operation({characteristic:'cutPattern',intent:'SPLIT',description:`Split ${target.label} at ${round(time)} seconds`,commandText:`Split selected clip at ${round(target.start+time)} seconds.`,target,parameters:{time:round(target.start+time),relativeTime:round(time)}}));
      offset+=target.duration;
    }
    return operations;
  }
  function concreteOperations(characteristic,value,targets,capability,context={}){
    const first=targets[0],ops=[];if(!first)return ops;
    if(characteristic==='cutPattern')return distributeCuts(value?.times,targets);
    if(characteristic==='pacingCurve'){
      const pace=value?.overall;if(!['very-fast','fast','slow'].includes(pace))return ops;
      for(const target of targets)ops.push(operation({characteristic,intent:'SPEED',description:`Adapt ${target.label} to the measured ${pace} pacing`,commandText:`Make selected clip ${pace==='slow'?'20% slower':'25% faster'}.`,target,parameters:{factor:pace==='slow'?.8:1.25}}));
    }else if(characteristic==='shotDurationPattern'&&number(value?.average)>0){
      for(const target of targets){const duration=Math.min(target.duration,number(value.average));if(duration<target.duration-.01)ops.push(operation({characteristic,intent:'TRIM',description:`Trim ${target.label} to ${round(duration)} seconds`,commandText:`Trim selected clip to ${round(duration)} seconds.`,target,parameters:{duration:round(duration)}}));}
    }else if(characteristic==='transitionPattern'){
      const events=Array.isArray(value)?value:value?.events||[],available=new Set(context.transitionIds||[]);
      for(const event of bounded(events,LIMITS.operations)){const id=clean(event?.id||event?.transitionId,80);if(!id||!available.has(id))continue;const target=targets[Math.min(targets.length-1,Math.max(0,Number(event.targetIndex)||0))];ops.push(operation({characteristic,intent:'TRANSITION',description:`Apply the verified ${id} transition to ${target.label}`,commandText:`Apply ${id} transition to selected clip.`,target,parameters:{id,duration:Math.max(.1,Math.min(3,number(event.duration)??.6))}}));}
    }else if(characteristic==='zoomPattern'){
      for(const [index,event] of bounded(Array.isArray(value)?value:[value],targets.length).entries()){if(event?.direction!=='in'&&event?.direction!=='out')continue;const target=targets[index%targets.length],duration=Math.max(.2,Math.min(target.duration,(number(event.end)??2)-(number(event.start)??0)||2)),from=event.direction==='in'?100:130,to=event.direction==='in'?130:100;ops.push(operation({characteristic,intent:'ZOOM',description:`Apply an editable zoom-${event.direction} to ${target.label}`,commandText:`Slowly zoom ${event.direction} from ${from}% to ${to}% over ${round(duration)} seconds.`,target,parameters:{preset:event.direction==='in'?'zoom_in':'zoom_out',from,to,duration:round(duration)}}));}
    }else if(characteristic==='movementPattern'){
      const verified=value?.cameraInterpretation&&value.cameraInterpretation!==Visual.STATUS.UNKNOWN;if(verified){for(const target of targets.slice(0,1))ops.push(operation({characteristic,intent:'KEYFRAME',description:`Apply verified movement keyframes to ${target.label}`,commandText:'Add left to right position keyframes to selected clip.',target,parameters:{preset:'left_to_right',duration:Math.min(3,target.duration)}}));}
    }else if(characteristic==='speedPattern'){
      for(const [index,event] of bounded(Array.isArray(value)?value:[value],targets.length).entries()){const rate=number(event?.rate);if(!rate||rate===1)continue;const target=targets[index%targets.length];ops.push(operation({characteristic,intent:'SPEED',description:`Apply the verified speed change to ${target.label}`,commandText:`Make selected clip ${round(Math.abs(rate-1)*100)}% ${rate>1?'faster':'slower'}.`,target,parameters:{rate}}));}
    }else if(characteristic==='captionPattern')ops.push(operation({characteristic,intent:'CAPTIONS_ADD',description:'Generate editable captions from the target media',commandText:'Generate auto captions.',target:first}));
    else if(characteristic==='colorTreatment'){
      const props=['brightness','contrast','saturation'];for(const property of props){const average=number(value?.[property]?.average);if(average==null)continue;const mapped=property==='brightness'?Math.max(-100,Math.min(100,round((average-128)/1.28))):property==='contrast'?Math.max(-100,Math.min(100,round((average-64)/.64))):Math.max(-100,Math.min(100,round((average-100))));for(const target of targets)ops.push(operation({characteristic,intent:'FILTER',description:`Apply measured ${property} adjustment to ${target.label}`,commandText:`Set ${property} on selected clip to ${mapped}.`,target,parameters:{property,value:mapped}}));}
    }else if(characteristic==='aspectRatio'&&typeof value==='string')ops.push(operation({characteristic,intent:'ASPECT_RATIO',description:`Set project aspect ratio to ${value}`,commandText:`Set project aspect ratio to ${value}.`,target:{id:'project',label:'project'},parameters:{value}}));
    return ops;
  }
  function createExecutionPlan({blueprint,reference={},targets=[],capabilities={},selectedCharacteristics,transitionIds=[],userId='guest'}={}){
    const verified=validateBlueprint(blueprint);if(!verified.valid)return {valid:false,status:PLAN_STATUS.FAILED,error:verified.reason,operations:[],dryRun:null};
    const referenceId=clean(reference.id||blueprint.referenceId,120),targetValidation=validateTargets(targets,{referenceId});if(!targetValidation.valid)return {valid:false,status:PLAN_STATUS.FAILED,error:targetValidation.errors.join(' '),operations:[],dryRun:null};
    const selected=new Set((selectedCharacteristics?.length?selectedCharacteristics:blueprint.characteristics.map(item=>item.id)).filter(item=>Visual.CHARACTERISTICS.includes(item))),comparison=Visual.compareBlueprintToCapabilities(blueprint,capabilities),byCharacteristic=characteristicMap(blueprint),operations=[],limitations=[];
    for(const item of comparison){
      if(!selected.has(item.characteristic))continue;
      const characteristic=byCharacteristic.get(item.characteristic);
      if(item.analysisStatus!==Visual.STATUS.DETECTED||![Visual.SUPPORT.SUPPORTED,Visual.SUPPORT.PARTIALLY_SUPPORTED].includes(item.support)){operations.push(unsupportedOperation(item,item.characteristic));limitations.push(item.cannot||`${item.characteristic} is ${item.support.toLowerCase()}.`);continue;}
      const concrete=concreteOperations(item.characteristic,characteristic?.value,targetValidation.targets,item,{transitionIds});
      if(concrete.length)operations.push(...concrete);else{const fallback={...item,support:item.support===Visual.SUPPORT.PARTIALLY_SUPPORTED?Visual.SUPPORT.UNSUPPORTED:Visual.SUPPORT.UNKNOWN,cannot:item.cannot||'No validated editor operation can reproduce this measured characteristic.'};operations.push(unsupportedOperation(fallback,item.characteristic));limitations.push(fallback.cannot);}
      if(operations.length>=LIMITS.operations)break;
    }
    operations.slice(0,LIMITS.operations).forEach((item,index)=>item.id=`reference-op-${String(index+1).padStart(2,'0')}`);
    const executable=operations.filter(item=>item.status===OP_STATUS.REQUIRES_CONFIRMATION),referenceSegments=Math.max(number(byCharacteristic.get('cutPattern')?.value?.count)||0,number(byCharacteristic.get('shotDurationPattern')?.value?.count)||0),mapping={referenceSegments,targetClips:targetValidation.targets.length,availableDuration:targetValidation.availableDuration,adapted:referenceSegments>targetValidation.targets.length,missingSegments:Math.max(0,referenceSegments-targetValidation.targets.length)};
    if(mapping.missingSegments)limitations.push(`The reference has ${referenceSegments} structural segments but only ${targetValidation.targets.length} target clips are available; timing is adapted without inventing media.`);
    const plan={id:`reference-execution-${Date.now().toString(36)}`,valid:true,userId:clean(userId,LIMITS.userId)||'guest',blueprintId:verified.blueprintId,reference:{id:referenceId,label:safeText(reference.label||reference.name||'reference video',120)||'reference video'},targets:clone(targetValidation.targets),selectedCharacteristics:[...selected].slice(0,Visual.LIMITS.characteristics),operations:operations.slice(0,LIMITS.operations),status:executable.length?PLAN_STATUS.AWAITING_CONFIRMATION:PLAN_STATUS.PARTIAL,requiresConfirmation:Boolean(executable.length),confirmedAt:null,rejectedAt:null,routeThrough:'Step11ExecutionPlan>Step8Workflow>Router>Permissions>EditorBridge>ValidatedTransaction',mapping,limitations:unique(limitations).slice(0,12),results:[],createdAt:now(),updatedAt:now()};
    plan.dryRun=buildDryRun(plan);return clone(plan);
  }
  function buildDryRun(plan){
    const ready=plan.operations.filter(item=>[OP_STATUS.READY,OP_STATUS.REQUIRES_CONFIRMATION].includes(item.status)),unavailable=plan.operations.filter(item=>![OP_STATUS.READY,OP_STATUS.REQUIRES_CONFIRMATION,OP_STATUS.COMPLETED].includes(item.status));
    return {reference:{label:plan.reference.label,characteristics:clone(plan.selectedCharacteristics)},target:{clips:plan.targets.length,duration:round(plan.mapping.availableDuration)},plan:ready.map(item=>({characteristic:item.characteristic,operation:item.description,target:item.targetLabel})).slice(0,LIMITS.operations),unavailable:unavailable.map(item=>({characteristic:item.characteristic,status:item.status,reason:item.reason})).slice(0,LIMITS.operations),mapping:clone(plan.mapping),modifiesProject:false};
  }
  function confirmPlan(plan){if(!plan||plan.status!==PLAN_STATUS.AWAITING_CONFIRMATION)return clone(plan);plan.operations.forEach(item=>{if(item.status===OP_STATUS.REQUIRES_CONFIRMATION){item.status=OP_STATUS.READY;item.requiresConfirmation=false;item.updatedAt=now();}});plan.status=PLAN_STATUS.READY;plan.confirmedAt=now();plan.updatedAt=now();return clone(plan);}
  function rejectPlan(plan){if(!plan)return null;plan.operations.forEach(item=>{if([OP_STATUS.READY,OP_STATUS.REQUIRES_CONFIRMATION].includes(item.status)){item.status=OP_STATUS.BLOCKED;item.reason='The user rejected this pending operation.';}});plan.status=PLAN_STATUS.REJECTED;plan.rejectedAt=now();plan.updatedAt=now();return clone(plan);}
  function characteristicChanges(message,selected){return Visual.characteristicChanges(message,selected);}
  function applyCorrection(plan,message){
    if(!plan||![PLAN_STATUS.AWAITING_CONFIRMATION,PLAN_STATUS.READY,PLAN_STATUS.RUNNING,PLAN_STATUS.PAUSED].includes(plan.status))return {changed:false,plan:clone(plan),reason:'Only pending operations can be corrected.'};
    const before=new Set(plan.selectedCharacteristics),after=new Set(characteristicChanges(message,[...before]));let changed=false;
    for(const item of plan.operations){if([OP_STATUS.COMPLETED,OP_STATUS.FAILED].includes(item.status))continue;if(before.has(item.characteristic)&&!after.has(item.characteristic)){item.status=OP_STATUS.BLOCKED;item.reason='Removed from the pending plan by the user.';changed=true;}else if(!before.has(item.characteristic)&&after.has(item.characteristic)&&item.status===OP_STATUS.BLOCKED&&/Removed from/.test(item.reason)){item.status=plan.confirmedAt?OP_STATUS.READY:OP_STATUS.REQUIRES_CONFIRMATION;item.reason='';changed=true;}}
    const slower=/\b(?:slightly slower|slower cuts?|slow(?:er)? pacing)\b/i.test(message);if(slower){for(const item of plan.operations){if(item.characteristic==='pacingCurve'&&![OP_STATUS.COMPLETED,OP_STATUS.FAILED].includes(item.status)){item.commandText='Make selected clip 10% slower.';item.description=`Apply slightly slower pacing to ${item.targetLabel}`;item.parameters={factor:.9};changed=true;}}}
    plan.selectedCharacteristics=[...after];plan.updatedAt=now();plan.dryRun=buildDryRun(plan);return {changed,plan:clone(plan)};
  }
  function toWorkflow(plan){
    if(!plan||![PLAN_STATUS.READY,PLAN_STATUS.RUNNING,PLAN_STATUS.PAUSED].includes(plan.status))throw new Error('Confirm the reference execution plan before creating its workflow.');
    const ready=plan.operations.filter(item=>item.status===OP_STATUS.READY),steps=ready.map((item,index)=>({id:`execution-step-${String(index+1).padStart(2,'0')}`,description:item.description,commandText:item.commandText,intent:item.intent,action:item.intent,target:item.targetId,constraints:[],dependencies:index?[`execution-step-${String(index).padStart(2,'0')}`]:[],status:Workflow.STEP_STATUS.PENDING,requiresConfirmation:false,executable:true,capability:'existing-zorifi',result:null,error:null,relation:index?Workflow.RELATION.SEQUENTIAL:Workflow.RELATION.INDEPENDENT,executionOperationId:item.id,characteristic:item.characteristic}));
    return Workflow.createWorkflow({message:'Apply confirmed reference characteristics.',goal:`Apply ${unique(ready.map(item=>item.characteristic)).join(', ')} from the reference to the user’s target media`,steps,userId:plan.userId,target:plan.targets.map(item=>item.label).join(', '),reference:{kind:'video',name:plan.reference.label,characteristics:plan.selectedCharacteristics}});
  }
  function nextOperation(plan){return plan?.operations.find(item=>item.status===OP_STATUS.READY)||null;}
  function startOperation(plan,operationId){const item=plan?.operations.find(entry=>entry.id===operationId)||nextOperation(plan);if(!item||item.status!==OP_STATUS.READY)return null;item.status=OP_STATUS.READY;item.attempts+=1;item.updatedAt=now();plan.status=PLAN_STATUS.RUNNING;plan.updatedAt=now();return clone(item);}
  function recordResult(plan,operationId,result={}){
    const item=plan?.operations.find(entry=>entry.id===operationId);if(!item)return null;const ok=result.success===true||result.status==='SUCCESS'||result.status==='success';item.status=ok?OP_STATUS.COMPLETED:OP_STATUS.FAILED;item.result=ok?safeText(result.message||'Completed'):null;item.error=ok?null:safeText(result.message||result.error||'The validated editor operation failed.');item.updatedAt=now();plan.results.push({operationId:item.id,status:item.status,message:item.result||item.error,at:item.updatedAt});plan.results=plan.results.slice(-LIMITS.results);refreshPlan(plan);return clone(item);}
  function refreshPlan(plan){const executable=plan.operations.filter(item=>![OP_STATUS.UNSUPPORTED,OP_STATUS.UNKNOWN,OP_STATUS.BLOCKED].includes(item.status));if(executable.length&&executable.every(item=>item.status===OP_STATUS.COMPLETED))plan.status=plan.operations.some(item=>[OP_STATUS.UNSUPPORTED,OP_STATUS.UNKNOWN,OP_STATUS.BLOCKED,OP_STATUS.FAILED].includes(item.status))?PLAN_STATUS.PARTIAL:PLAN_STATUS.COMPLETED;else if(executable.some(item=>item.status===OP_STATUS.FAILED))plan.status=PLAN_STATUS.FAILED;else if(plan.status!==PLAN_STATUS.PAUSED&&plan.status!==PLAN_STATUS.CANCELLED)plan.status=executable.some(item=>item.status===OP_STATUS.READY)?PLAN_STATUS.RUNNING:plan.status;plan.updatedAt=now();return plan;}
  function retryOperation(plan,operationId){const item=plan?.operations.find(entry=>entry.id===operationId)||plan?.operations.find(entry=>entry.status===OP_STATUS.FAILED);if(!item||item.status!==OP_STATUS.FAILED)return null;item.status=OP_STATUS.READY;item.error=null;plan.status=PLAN_STATUS.READY;plan.updatedAt=now();return clone(item);}
  function pausePlan(plan){if(plan&&[PLAN_STATUS.READY,PLAN_STATUS.RUNNING].includes(plan.status)){plan.status=PLAN_STATUS.PAUSED;plan.updatedAt=now();}return clone(plan);}
  function resumePlan(plan){if(plan?.status===PLAN_STATUS.PAUSED){plan.status=PLAN_STATUS.READY;plan.updatedAt=now();}return clone(plan);}
  function cancelPlan(plan){if(!plan)return null;for(const item of plan.operations)if([OP_STATUS.READY,OP_STATUS.REQUIRES_CONFIRMATION].includes(item.status)){item.status=OP_STATUS.BLOCKED;item.reason='Cancelled by the user.';}plan.status=PLAN_STATUS.CANCELLED;plan.updatedAt=now();return clone(plan);}
  function progress(plan){const executable=plan?.operations.filter(item=>![OP_STATUS.UNSUPPORTED,OP_STATUS.UNKNOWN,OP_STATUS.BLOCKED].includes(item.status))||[],completed=executable.filter(item=>item.status===OP_STATUS.COMPLETED).length,failed=executable.filter(item=>item.status===OP_STATUS.FAILED).length;return {completed,total:executable.length,failed,status:plan?.status||PLAN_STATUS.FAILED,message:executable.length?`${completed} of ${executable.length} operations complete${failed?`; ${failed} failed`:''}.`:'No reproducible operations are ready.'};}
  function buildProviderPayload(plan){const payload={planId:clean(plan?.id,100),status:plan?.status,characteristics:bounded(plan?.selectedCharacteristics,Visual.LIMITS.characteristics),targetSummary:{count:bounded(plan?.targets,LIMITS.targets).length,totalDuration:round(plan?.mapping?.availableDuration||0)},operations:bounded(plan?.operations,LIMITS.operations).map(item=>({characteristic:item.characteristic,intent:item.intent,status:item.status,target:item.targetLabel})),limitations:bounded(plan?.limitations,8)};while(JSON.stringify(payload).length>LIMITS.payload&&payload.operations.length)payload.operations.pop();return clone(payload);}
  function inspectPlan(plan,{userId}={}){if(!plan)return null;if(userId&&clean(userId,LIMITS.userId)!==plan.userId)return null;return clone(plan);}
  class ReferenceExecutionManager{
    constructor({userId='guest'}={}){this.userId=clean(userId,LIMITS.userId)||'guest';this.plan=null;this.workflow=null;}
    prepare(options={}){this.plan=createExecutionPlan({...options,userId:this.userId});this.workflow=null;return this.inspect();}
    adopt(plan){if(!plan||plan.userId!==this.userId||plan.routeThrough!=='Step11ExecutionPlan>Step8Workflow>Router>Permissions>EditorBridge>ValidatedTransaction')throw new Error('A valid Step 11 plan for this user is required.');this.plan=clone(plan);this.workflow=null;return this.inspect();}
    confirm(){confirmPlan(this.plan);this.workflow=this.plan?.status===PLAN_STATUS.READY?toWorkflow(this.plan):null;return this.inspect();}
    reject(){rejectPlan(this.plan);this.workflow=null;return this.inspect();}
    correct(message){const result=applyCorrection(this.plan,message);if(result.changed&&this.workflow)this.workflow=toWorkflow(this.plan);return {...result,plan:this.inspect()?.plan,workflow:clone(this.workflow)};}
    start(operationId){return startOperation(this.plan,operationId);}
    complete(operationId,result){const value=recordResult(this.plan,operationId,{success:true,...result});return {operation:value,progress:progress(this.plan)};}
    fail(operationId,error){const value=recordResult(this.plan,operationId,{success:false,error});return {operation:value,progress:progress(this.plan)};}
    retry(operationId){return retryOperation(this.plan,operationId);}
    pause(){pausePlan(this.plan);if(this.workflow)Workflow.pauseWorkflow(this.workflow);return this.inspect();}
    resume(){resumePlan(this.plan);if(this.workflow)Workflow.resumeWorkflow(this.workflow);return this.inspect();}
    cancel(){cancelPlan(this.plan);if(this.workflow)Workflow.cancelWorkflow(this.workflow);return this.inspect();}
    inspect(){return {userId:this.userId,plan:inspectPlan(this.plan,{userId:this.userId}),workflow:clone(this.workflow),progress:progress(this.plan)};}
    clear(){this.plan=null;this.workflow=null;}
  }
  return {OP_STATUS,PLAN_STATUS,LIMITS,ReferenceExecutionManager,validateBlueprint,validateTargets,createExecutionPlan,buildDryRun,confirmPlan,rejectPlan,applyCorrection,toWorkflow,nextOperation,startOperation,recordResult,retryOperation,pausePlan,resumePlan,cancelPlan,progress,buildProviderPayload,inspectPlan};
});
