(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ZorifiOptimization=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  class ZorifiResourceManager{
    constructor(canvas=null,{gl=null,ownsCanvas=false,urlApi=URL}={}){
      // Never acquire WebGL on an existing 2D/shared canvas as a side effect.
      this.canvas=canvas;this.gl=gl;this.ownsCanvas=ownsCanvas;this.urlApi=urlApi;
      this.activeObjectURLs=new Set();this.disposed=false;
    }
    createManagedUrl(blob){
      if(this.disposed)throw new Error('Resource manager has been disposed.');
      const url=this.urlApi.createObjectURL(blob);this.activeObjectURLs.add(url);return url;
    }
    revokeUrl(url){
      if(!this.activeObjectURLs.delete(url))return false;
      this.urlApi.revokeObjectURL(url);return true;
    }
    dispose(){
      if(this.disposed)return;this.disposed=true;
      for(const url of [...this.activeObjectURLs])this.revokeUrl(url);
      if(this.ownsCanvas){
        try{this.gl?.getExtension('WEBGL_lose_context')?.loseContext();}
        finally{if(this.canvas){this.canvas.width=0;this.canvas.height=0;}}
      }
      this.gl=null;this.canvas=null;
    }
  }

  class AudioWorkerPipeline{
    constructor({workerUrl='./zorifi-audio-worker.js?v=1',workerFactory=url=>new Worker(url),timeoutMs=30000}={}){
      this.worker=workerFactory(workerUrl);this.timeoutMs=timeoutMs;
      this.pending=new Map();this.nextId=1;this.closed=false;
      this.worker.onmessage=event=>{
        const {id,peaks,error}=event.data||{},request=this.pending.get(id);
        if(!request)return;
        this.pending.delete(id);clearTimeout(request.timer);
        if(error)request.reject(new Error('Audio analysis failed.'));
        else if(!(peaks instanceof ArrayBuffer))request.reject(new Error('Invalid audio analysis result.'));
        else request.resolve(Array.from(new Float32Array(peaks),value=>Math.round(value*1000)/1000));
      };
      this.worker.onerror=()=>this.terminate(new Error('Audio worker failed.'));
      this.worker.onmessageerror=()=>this.terminate(new Error('Audio worker message could not be decoded.'));
    }
    analyzeAudio(arrayBuffer,{sampleCount=200}={}){
      if(!(arrayBuffer instanceof ArrayBuffer)||arrayBuffer.byteLength%4)return Promise.reject(new TypeError('Expected Float32 PCM audio.'));
      return this.analyzeChannels([new Float32Array(arrayBuffer)],sampleCount);
    }
    analyzeChannels(channels,sampleCount=480){
      if(this.closed)return Promise.reject(new Error('Audio worker has been terminated.'));
      if(!Array.isArray(channels)||!channels.length||channels.some(channel=>!(channel instanceof Float32Array)||channel.length!==channels[0].length))return Promise.reject(new TypeError('Expected equally sized Float32 audio channels.'));
      if(!Number.isFinite(sampleCount)||sampleCount<1)return Promise.reject(new TypeError('Invalid waveform sample count.'));
      // Transfer owned copies, never detach AudioBuffer channel storage or caller input.
      const buffers=channels.map(channel=>new Float32Array(channel).buffer),id=this.nextId++;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>this.terminate(new Error('Audio analysis timed out.')),this.timeoutMs);
        this.pending.set(id,{resolve,reject,timer});
        try{this.worker.postMessage({id,buffers,sampleCount},buffers);}
        catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
      });
    }
    terminate(error=new Error('Audio analysis was cancelled.')){
      if(this.closed)return;this.closed=true;this.worker.terminate();
      this.worker.onmessage=null;this.worker.onerror=null;this.worker.onmessageerror=null;
      for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error);}
      this.pending.clear();
    }
  }

  const SERVICES=['vanessa','vanessa-global','vanessa-language','vanessa-image','vanessa-scene-image','vanessa-scenes','vanessa-captions','vanessa-motion','vanessa-video','vanessa-music','vanessa-stems','vanessa-voice','vanessa-speech','vanessa-provider-test'];
  class SecureAIService{
    constructor({transport,resolveEndpoint,timeoutMs=60000}={}){
      if(typeof transport!=='function'||typeof resolveEndpoint!=='function')throw new TypeError('Use the authenticated, consent-gated application transport.');
      this.transport=transport;this.resolveEndpoint=resolveEndpoint;this.timeoutMs=timeoutMs;
    }
    static configure(options){this.client=new SecureAIService(options);return this.client;}
    static generateAIResponse(...args){
      if(!this.client)return Promise.reject(new Error('AI proxy transport is not configured.'));
      return this.client.generateAIResponse(...args);
    }
    async generateAIResponse(endpoint,payload,{signal}={}){
      if(!SERVICES.includes(endpoint))throw new Error('Unsupported AI service.');
      if(signal?.aborted)throw signal.reason||new Error('Request cancelled.');
      const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
      signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>controller.abort(new Error('AI request timed out.')),this.timeoutMs);
      try{
        const response=await this.transport(this.resolveEndpoint(endpoint),{
          method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),
          signal:controller.signal,redirect:'error',
        });
        if(!response.ok)throw new Error(`AI service request failed (${response.status}).`);
        try{return await response.json();}catch{throw new Error('AI service returned invalid JSON.');}
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    }
  }
  return {ZorifiResourceManager,AudioWorkerPipeline,SecureAIService};
});
