/* Bounded, inspectable plans. Drafts never become a second live editor store. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiProfessionalEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clone=value=>structuredClone(value);
 const abort=()=>Object.assign(new Error('Professional edit stopped. No pending draft was committed.'),{name:'AbortError'});
 const instruction=message=>String(message||'').trim().replace(/^(?:hey\s+)?vanessa\b[,!\s]*/i,'').replace(/^please\s+/i,'');
 function delegatedRequest(message){
  const text=instruction(message).replace(/^(?:can|could|would) you\s+(?:please\s+)?/i,'');
  if(/\b(?:explain|teach|tutorial|how (?:do|can|to)|what (?:could|would)|only suggest|just suggest|do not (?:apply|change|edit)|don['’]?t (?:apply|change|edit)|ask (?:me )?(?:before|first))\b/i.test(text))return false;
  return /^(?:help(?: me)?(?: (?:to|with))?\s+(?:(?:improve|polish|finish|fix|edit|refine|make)\s+)?(?:this|my|the|our)\s+(?:video|edit|project|clip|timeline)\b|(?:improve|polish|refine|finish|fix|tighten|enhance)\s+(?:this|my|the|our)\s+(?:video|edit|project|clip|timeline)\b|make\s+(?:this|my|the|our)\s+(?:video|edit|project|clip|timeline)\s+(?:better|more professional)\b|take (?:the lead|creative control)\s+(?:on|of)\s+(?:this|my|the|our)\s+(?:video|edit|project)\b)/i.test(text);
 }
 function requestedDuration(message){
  const text=instruction(message);
  // Clip ranges and title timestamps are not an instruction to shorten the
  // entire composition. Only an explicit deliverable/total duration is used.
  const match=text.match(/\b(?:create|make|build|produce|edit|assemble)\s+(?:(?:me|us)\s+)?(?:a|an|the)?\s*(?:(?:premium|cinematic|professional|polished|short)\s+)*(\d{1,3})(?:[- ]?seconds?|\s*sec\b|\s*s\b)\s+(?:(?:long|cinematic|fashion|social|premium|professional|documentary|corporate|music|portrait|wedding|travel)\s+){0,4}(?:video|edit|montage|commercial|campaign|trailer|teaser|film|story|reel)\b/i)||text.match(/\b(?:total(?: duration)?|final duration|project duration|video length|edit length|target duration)\s*(?:of|to|is|:|=)?\s*(\d{1,3})\s*(?:seconds?|sec\b|s\b)/i)||text.match(/\b(?:video|edit|montage|commercial|campaign|trailer|teaser|film|story|reel)\s+(?:that is|of|lasting|to last)\s+(\d{1,3})\s*(?:seconds?|sec\b|s\b)/i);
  return match?Math.min(180,Math.max(1,Number(match[1]))):null;
 }
 function historySummary(project){
  const snapshots=(project.undo||[]).slice(-5),versions=[...snapshots,{clips:project.clips||[]}],changes=[];
  for(let index=0;index<versions.length-1;index++){const before=new Map((versions[index]?.clips||[]).map(clip=>[clip.id,clip])),after=new Map((versions[index+1]?.clips||[]).map(clip=>[clip.id,clip]));let added=0,removed=0,modified=0;for(const [id,clip]of after){if(!before.has(id))added++;else if(JSON.stringify(clip)!==JSON.stringify(before.get(id)))modified++;}for(const id of before.keys())if(!after.has(id))removed++;changes.push({added,removed,modified});}
  return {undoDepth:project.undo?.length||0,redoDepth:project.redo?.length||0,recentChanges:changes};
 }
 function delegationSafety(actions,project,{beforeReview,afterReview}={}){
  const reasons=[],within=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
  if(!Array.isArray(actions)||!actions.length||actions.length>24)return {automatic:false,reasons:['A delegated automatic pass is limited to 1–24 validated local adjustments.']};
  for(const action of actions){const clip=(project.clips||[]).find(item=>item.id===action.target),p=action.parameters||{};let safe=Boolean(clip)&&!clip.zorifiEnding&&!project.trackStates?.[clip.track]?.locked;
   if(safe)switch(action.command){
    case 'visual.adjust': safe=p.property==='saturation'?within(p.value,80,120):['brightness','contrast','exposure','temperature','tint','highlights','shadows'].includes(p.property)&&within(p.value,-15,15);break;
    case 'visual.filter': safe=within(p.intensity,0,50);break;
    case 'audio.fade': safe=Object.values(p).every(value=>within(value,0,Math.min(2,clip.duration/3)));break;
    case 'audio.limiter': safe=p.enabled===true&&within(p.ceiling,-3,-.1);break;
    case 'audio.noise_reduction': safe=p.enabled===true&&within(p.amount,0,35);break;
    case 'audio.set': safe=p.property==='volume'?within(p.value,5,100):p.property==='audioPan'&&within(p.value,-15,15);break;
    case 'transition.apply': safe=within(p.duration,.1,.5)&&!clip.transition&&!clip.transitionId;break;
    case 'keyframe.animation': safe=p.preset==='zoom_in'&&within(p.from,98,106)&&within(p.to,98,106)&&within(p.duration,.05,clip.duration)&&!clip.keyframes?.scale?.length;break;
    case 'text.style': case 'caption.style': safe=(!('size'in p)||within(p.size,22,90))&&(!('position'in p)||within(p.position,10,80));break;
    default:safe=false;
   }
   if(!safe)reasons.push(`${action.command} needs review before it changes the project.`);
  }
  const key=issue=>[issue.code,issue.clipId||'',JSON.stringify(issue.range||null)].join(':');
  const previous=new Set((beforeReview?.issues||[]).filter(issue=>['error','warning'].includes(issue.severity)).map(key));
  if((afterReview?.issues||[]).some(issue=>['error','warning'].includes(issue.severity)&&!previous.has(key(issue))))reasons.push('The proposed pass introduces a technical issue that needs review.');
  return {automatic:reasons.length===0,reasons:[...new Set(reasons)]};
 }
 class PlanRunner{
  constructor({tools,catalog,read,capture,assertScope,stage,apply,review,commit,progress=()=>{},yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}){Object.assign(this,{tools,catalog,read,capture,assertScope,stage,apply,review,commit,progress,yieldTask});this.pending=null;this.running=false;this.paused=false;this.generation=0;}
  check(generation,scope,signal){if(generation!==this.generation||signal?.aborted)throw abort();this.assertScope(scope);}
  async boundary(generation,scope,signal){this.check(generation,scope,signal);while(this.paused){await new Promise(resolve=>{this.resumeWaiter=resolve;const stop=()=>resolve();signal?.addEventListener('abort',stop,{once:true});this.removeWaiter=()=>signal?.removeEventListener('abort',stop);});this.removeWaiter?.();this.check(generation,scope,signal);}await this.yieldTask();this.check(generation,scope,signal);}
  async prepare(proposal,{scope=this.capture(),signal,evidence,brief}={}){
   if(this.running)throw Error('A professional draft is already running.');
   if(!proposal||!Array.isArray(proposal.actions)||!proposal.actions.length||proposal.actions.length>120)throw Error('A professional plan requires 1–120 registered actions.');
   this.running=true;this.pending=null;const generation=this.generation,draft=this.stage(this.read()),actions=clone(proposal.actions),items=[];
   try{for(let index=0;index<actions.length;index++){
    await this.boundary(generation,scope,signal);const action=this.tools.validateAction(actions[index],draft,{catalog:this.catalog()}),before=this.stage(draft);
    const result=await this.apply(draft,action);this.check(generation,scope,signal);
    const verified=this.tools.verifyAction(action,before,draft,{catalog:this.catalog(),result});if(verified===false||verified?.verified===false)throw Error(`The editor could not verify step ${index+1}: ${action.command}.`);
    actions[index]=action;items.push({command:action.command,target:action.target,status:'VERIFIED'});this.progress({phase:'validating',completed:index+1,total:actions.length});
   }
   const quality=this.review(draft,{evidence,brief});if(quality.blockers?.length)throw Error('Draft failed technical review: '+quality.blockers.map(item=>item.message||item).join('; '));
   this.check(generation,scope,signal);const id=typeof crypto!=='undefined'?crypto.randomUUID():String(Date.now())+'-'+Math.random();
   this.pending={id,scope,draft,actions,quality,items,proposal:clone({...proposal,actions}),evidence,brief,generation};
   return {id,proposal:clone(this.pending.proposal),quality:clone(quality),items:clone(items)};
   }finally{this.running=false;}
  }
  async execute(id,{signal}={}){
   const pending=this.pending;if(!pending||pending.id!==id)throw Error('That draft expired. Prepare a new plan.');if(this.running)throw Error('The draft is already being applied.');this.running=true;
   try{await this.boundary(pending.generation,pending.scope,signal);this.progress({phase:'saving',completed:pending.actions.length,total:pending.actions.length});
    // The injected commit performs authentication and repeats the scope check
    // immediately before one synchronous native history/state/persistence commit.
    const result=await this.commit({...pending,signal});if(result?.persisted!==true||result?.verified!==true)throw Error('The editor did not confirm a persisted professional edit.');
    this.pending=null;this.progress({phase:'review',completed:pending.actions.length,total:pending.actions.length});return {...result,quality:result.quality||pending.quality,items:pending.items,proposal:pending.proposal};
   }finally{this.running=false;}
  }
  pause(){this.paused=true;this.progress({phase:'paused'});}
  resume(){this.paused=false;this.resumeWaiter?.();this.resumeWaiter=null;}
  stop(){this.generation++;this.pending=null;this.resume();}
  inspect(){return {running:this.running,paused:this.paused,pending:this.pending?{id:this.pending.id,actions:this.pending.actions.length,quality:clone(this.pending.quality)}:null};}
 }
 return {PlanRunner,delegatedRequest,requestedDuration,historySummary,delegationSafety};
});
