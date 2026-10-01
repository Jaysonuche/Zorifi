(function(root,factory){const c=typeof window==='undefined'&&typeof module==='object'&&module.exports;const api=factory(c?require('./zorifi-vanessa-goal-understanding.js'):root.ZorifiVanessaGoalUnderstanding);if(c)module.exports=api;else root.ZorifiVanessaCreativeIntent=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Goals){
  'use strict';
  const STATUS=Object.freeze({READY:'READY',NEEDS_CLARIFICATION:'NEEDS_CLARIFICATION',UNSUPPORTED:'UNSUPPORTED'}),clone=v=>v==null?v:JSON.parse(JSON.stringify(v)),clean=(v,n=500)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,n),unique=a=>[...new Set(a.filter(Boolean))];
  function fuse({goal,continuity={},reference=null,style=null,editorContext={},constraints=[],capabilities={}}={}){
    if(!goal||goal.status!==Goals.STATUS.UNDERSTOOD)return {status:STATUS.NEEDS_CLARIFICATION,mutates:false,reason:goal?.clarification||'The creative goal needs clarification before planning.'};
    const explicit=[...(goal.explicitRequirements||[]),...constraints].map(item=>typeof item==='string'?{id:'constraint',value:clean(item)}:clone(item));
    const inferred=[...(goal.inferredRequirements||[])];
    const referenceIntent=[];
    for(const item of reference?.characteristics||reference?.blueprint?.characteristics||[]){if(item?.status==='DETECTED')referenceIntent.push({id:clean(item.id,80),value:clone(item.value),evidence:clean(item.evidence,80)});}
    const available=[],unsupported=[];
    for(const strategy of goal.candidateStrategies||[]){const item={id:strategy.id,capability:strategy.capability,description:strategy.label};(capabilities[strategy.capability]===false?unsupported:available).push(item);}
    const ambiguities=[...(goal.ambiguities||[])];if(/\b(?:this|that|it)\b/i.test(goal.source||'')&&!goal.target?.id&&!continuity?.targetId)ambiguities.push('The target is not grounded to an editor object.');
    const result={id:`intent-${goal.id}`,status:ambiguities.length?STATUS.NEEDS_CLARIFICATION:available.length?STATUS.READY:STATUS.UNSUPPORTED,mutates:false,goalId:goal.id,revision:goal.revision||0,target:{...clone(goal.target),id:continuity.targetId||goal.target?.id||editorContext.selectedClipId||null},desiredOutcome:goal.desiredOutcome,explicitIntent:{source:clean(goal.source),categories:clone(goal.categories||[])},referenceIntent,styleIntent:clone(style?.adaptive||style||null),inferredIntent:inferred,editorState:{projectId:clean(editorContext.projectId||editorContext.currentProject,120),selectedClipId:editorContext.selectedClipId||null},constraints:explicit,capabilities:{available,unsupported},ambiguities:unique(ambiguities),precedence:['explicit user instructions','user constraints','resolved editor context','reference-derived intent','inferred creative intent']};
    result.explanation=result.status===STATUS.READY?'I combined your stated goal, current target and supported reference/style details without changing the project.':result.status===STATUS.UNSUPPORTED?'I understand the direction, but the required capabilities are unavailable. No edit was applied.':'I need one more detail before I can safely build the edit plan.';return result;
  }
  class CreativeIntentManager{constructor({userId='guest'}={}){this.userId=clean(userId,100);this.current=null;}prepare(input){this.current=fuse(input);return this.inspect().current;}inspect(){return {userId:this.userId,current:clone(this.current)};}clear(){this.current=null;}}
  return {STATUS,fuse,CreativeIntentManager};
});
