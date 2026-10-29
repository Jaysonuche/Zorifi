/* Bounded, inspectable plans. Drafts never become a second live editor store. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiProfessionalEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clone=value=>structuredClone(value);
 const abort=()=>Object.assign(new Error('Professional edit stopped. No pending draft was committed.'),{name:'AbortError'});
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
    this.pending=null;this.progress({phase:'review',completed:pending.actions.length,total:pending.actions.length});return {...result,quality:pending.quality,items:pending.items,proposal:pending.proposal};
   }finally{this.running=false;}
  }
  pause(){this.paused=true;this.progress({phase:'paused'});}
  resume(){this.paused=false;this.resumeWaiter?.();this.resumeWaiter=null;}
  stop(){this.generation++;this.pending=null;this.resume();}
  inspect(){return {running:this.running,paused:this.paused,pending:this.pending?{id:this.pending.id,actions:this.pending.actions.length,quality:clone(this.pending.quality)}:null};}
 }
 return {PlanRunner};
});
