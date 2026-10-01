(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.ZorifiBilling=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LIMITS=Object.freeze({FREE:Object.freeze({musicGenerationSeconds:30,captionSeconds:60,exportHeight:1080,fullStems:false}),PRO:Object.freeze({musicGenerationSeconds:600,captionSeconds:21600,exportHeight:2160,fullStems:true})});
  const PLANS=Object.freeze({FREE:{id:'FREE',name:'Zorifi Free',entitlements:['editor','local-projects','webm-export','vanessa-offline','music-generation-30s','captions-60s','export-1080p']},PRO:{id:'PRO',name:'Zorifi Pro',entitlements:['editor','local-projects','webm-export','vanessa-offline','pro-assets','cloud-generation','premium-export','full-audio-generation','full-multitrack-stems','unlimited-captions','export-4k']}});
  const STATUSES=Object.freeze(['ACTIVE','TRIAL','PAST_DUE','CANCELLED','EXPIRED','UNCONFIGURED']);
  const clone=value=>JSON.parse(JSON.stringify(value));const now=()=>new Date().toISOString();
  class SubscriptionStore{
    constructor({storage=null,userId='guest',namespace='zorifi-subscription-v1'}={}){this.storage=storage;this.userId=String(userId||'guest').slice(0,100);this.key=`${namespace}:${encodeURIComponent(this.userId)}`;this.state=this.read();}
    read(){try{const value=JSON.parse(this.storage?.getItem(this.key)||'{}');if(PLANS[value.plan]&&STATUSES.includes(value.status))return value;}catch{}return {schema:'zorifi.subscription/1',userId:this.userId,plan:'FREE',status:'ACTIVE',provider:'local',providerCustomerId:null,providerSubscriptionId:null,currentPeriodEnd:null,cancelAtPeriodEnd:false,pendingChange:null,updatedAt:now()};}
    save(){this.state.updatedAt=now();this.storage?.setItem(this.key,JSON.stringify(this.state));return this.snapshot();}
    snapshot(){return clone({...this.state,planDefinition:PLANS[this.state.plan],entitlements:this.entitlements()});}
    entitlements(){if(!['ACTIVE','TRIAL'].includes(this.state.status))return [...PLANS.FREE.entitlements];return [...PLANS[this.state.plan].entitlements];}
    has(entitlement){return this.entitlements().includes(entitlement);}
    limits(){const plan=['ACTIVE','TRIAL'].includes(this.state.status)?this.state.plan:'FREE';return clone(LIMITS[plan]||LIMITS.FREE);}
    limit(name){return this.limits()[name];}
    requestChange(plan){if(!PLANS[plan])throw new Error('Unknown subscription plan.');this.state.pendingChange={plan,requestedAt:now()};return this.save();}
    cancelAtEnd(){if(this.state.plan==='FREE')return this.snapshot();this.state.cancelAtPeriodEnd=true;return this.save();}
    clearPending(){this.state.pendingChange=null;return this.save();}
    applyProviderEvent(event={}){if(event.verified!==true)throw new Error('Unverified billing events are rejected.');if(!PLANS[event.plan]||!STATUSES.includes(event.status))throw new Error('Invalid billing event.');this.state={...this.state,plan:event.plan,status:event.status,provider:String(event.provider||'configured-provider').slice(0,80),providerCustomerId:event.customerId?String(event.customerId).slice(0,200):null,providerSubscriptionId:event.subscriptionId?String(event.subscriptionId).slice(0,200):null,currentPeriodEnd:event.currentPeriodEnd||null,cancelAtPeriodEnd:Boolean(event.cancelAtPeriodEnd),pendingChange:null};return this.save();}
    resetToFree(){this.state={schema:'zorifi.subscription/1',userId:this.userId,plan:'FREE',status:'ACTIVE',provider:'local',providerCustomerId:null,providerSubscriptionId:null,currentPeriodEnd:null,cancelAtPeriodEnd:false,pendingChange:null,updatedAt:now()};return this.save();}
  }
  return {LIMITS,PLANS,STATUSES,SubscriptionStore};
});
