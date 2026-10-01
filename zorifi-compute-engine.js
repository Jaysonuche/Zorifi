(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else global.ZorifiComputeEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const OPERATIONS=Object.freeze({PREVIEW:'preview',EFFECT:'effect',THUMBNAIL:'thumbnail',EXPORT:'export',AI:'ai'});
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)));
  function detectSync(environment=globalThis){
    const navigator=environment.navigator||{},document=environment.document;let webgl=false,webgl2=false;
    try{const canvas=document?.createElement?.('canvas');webgl2=Boolean(canvas?.getContext?.('webgl2'));webgl=webgl2||Boolean(canvas?.getContext?.('webgl'));}catch{}
    return {webgpu:Boolean(navigator.gpu),webgl,webgl2,hardwareConcurrency:clamp(navigator.hardwareConcurrency||2,1,128),deviceMemory:Number.isFinite(Number(navigator.deviceMemory))?clamp(navigator.deviceMemory,1,128):null,videoFrame:typeof environment.VideoFrame==='function',offscreenCanvas:typeof environment.OffscreenCanvas==='function',webCodecs:typeof environment.VideoEncoder==='function'};
  }
  async function detect(environment=globalThis){
    const result=detectSync(environment);if(!result.webgpu)return {...result,gpuAdapter:false};
    try{const adapter=await environment.navigator.gpu.requestAdapter({powerPreference:'high-performance'});return {...result,gpuAdapter:Boolean(adapter),adapterInfo:adapter?.info?{vendor:String(adapter.info.vendor||''),architecture:String(adapter.info.architecture||''),device:String(adapter.info.device||'')}:null};}catch{return {...result,gpuAdapter:false};}
  }
  function chooseBackend(operation,capabilities=detectSync(),options={}){
    if(operation===OPERATIONS.AI)return options.localModel&&capabilities.gpuAdapter?'webgpu-local':options.cloudAvailable?'cloud':'unavailable';
    if(operation===OPERATIONS.EXPORT&&capabilities.webCodecs)return 'webcodecs';
    if(capabilities.webgpu&&capabilities.gpuAdapter!==false)return 'webgpu';
    if(capabilities.webgl)return 'webgl';
    return 'cpu';
  }
  function previewPolicy({clipCount=0,keyframeCount=0,duration=0,heavyEffects=0}={},capabilities=detectSync()){
    const pressure=clipCount/80+keyframeCount/1600+duration/1800+heavyEffects/12+(capabilities.deviceMemory&&capabilities.deviceMemory<=4?1:0),quality=pressure>=3?'quarter':pressure>=1.5?'half':'full';return {quality,scale:quality==='full'?1:quality==='half'?.5:.25,maxVisibleKeyframes:quality==='full'?200:quality==='half'?140:90,thumbnailConcurrency:Math.max(1,Math.min(4,Math.floor(capabilities.hardwareConcurrency/3))),reason:pressure>=3?'large-project':pressure>=1.5?'resource-balance':'full-quality'};
  }
  class Scheduler{
    constructor({maxConcurrent=2,cacheLimit=48}={}){this.maxConcurrent=clamp(maxConcurrent,1,8);this.cacheLimit=clamp(cacheLimit,1,500);this.queue=[];this.running=new Map();this.cache=new Map();}
    schedule({id,key,priority=0,run,signal,replaceKey}={}){
      if(typeof run!=='function')return Promise.reject(new Error('A compute job needs a run function.'));
      if(key&&this.cache.has(key)){const value=this.cache.get(key);this.cache.delete(key);this.cache.set(key,value);return Promise.resolve(value);}
      if(replaceKey)this.cancelByReplaceKey(replaceKey);
      const controller=new AbortController();if(signal){if(signal.aborted)controller.abort();else signal.addEventListener('abort',()=>controller.abort(),{once:true});}
      return new Promise((resolve,reject)=>{this.queue.push({id:id||`job-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,key,replaceKey,priority:Number(priority)||0,run,controller,resolve,reject});this.queue.sort((a,b)=>b.priority-a.priority);this.pump();});
    }
    cancel(id){const queued=this.queue.find(job=>job.id===id);if(queued){queued.controller.abort();this.queue=this.queue.filter(job=>job!==queued);queued.reject(new DOMException('Job cancelled','AbortError'));return true;}const running=this.running.get(id);if(running){running.controller.abort();return true;}return false;}
    cancelByReplaceKey(value){[...this.queue,...this.running.values()].filter(job=>job.replaceKey===value).forEach(job=>this.cancel(job.id));}
    clearCache(){this.cache.clear();}
    remember(key,value){if(!key)return;this.cache.set(key,value);while(this.cache.size>this.cacheLimit)this.cache.delete(this.cache.keys().next().value);}
    pump(){while(this.running.size<this.maxConcurrent&&this.queue.length){const job=this.queue.shift();if(job.controller.signal.aborted){job.reject(new DOMException('Job cancelled','AbortError'));continue;}this.running.set(job.id,job);Promise.resolve().then(()=>job.run({signal:job.controller.signal})).then(value=>{if(job.controller.signal.aborted)throw new DOMException('Job cancelled','AbortError');this.remember(job.key,value);job.resolve(value);}).catch(job.reject).finally(()=>{this.running.delete(job.id);this.pump();});}}
  }
  return {OPERATIONS,detectSync,detect,chooseBackend,previewPolicy,Scheduler};
});
