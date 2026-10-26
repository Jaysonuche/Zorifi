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
      this.activeObjectURLs=new Set();this.disposed=false;this.cleanupErrors=[];
    }
    createManagedUrl(blob){
      if(this.disposed)throw new Error('Resource manager has been disposed.');
      const url=this.urlApi.createObjectURL(blob);this.activeObjectURLs.add(url);return url;
    }
    revokeUrl(url){
      if(!this.activeObjectURLs.has(url))return false;
      this.urlApi.revokeObjectURL(url);this.activeObjectURLs.delete(url);return true;
    }
    dispose(){
      if(this.disposed)return;this.disposed=true;
      const attempt=task=>{try{task();}catch(error){this.cleanupErrors.push(error);}};
      for(const url of this.activeObjectURLs)attempt(()=>this.revokeUrl(url));
      this.activeObjectURLs.clear();
      if(this.ownsCanvas){
        attempt(()=>this.gl?.getExtension('WEBGL_lose_context')?.loseContext());
        if(this.canvas){attempt(()=>{this.canvas.width=0;});attempt(()=>{this.canvas.height=0;});}
      }
      this.gl=null;this.canvas=null;
    }
  }

  class AudioWorkerPipeline{
    constructor({workerUrl='./zorifi-audio-worker.js?v=238',workerFactory=url=>new Worker(url),timeoutMs=30000,maxTransferBytes=2*1024*1024}={}){
      this.worker=workerFactory(workerUrl);this.timeoutMs=timeoutMs;
      this.maxTransferBytes=Math.max(4096,Math.min(16*1024*1024,Number(maxTransferBytes)||2*1024*1024));
      this.pending=new Map();this.nextId=1;this.closed=false;
      this.worker.onmessage=event=>{
        const {id,offset,peaks,error}=event.data||{},request=this.pending.get(id);
        if(!request)return;
        if(error)return this.finish(id,new Error('Audio analysis failed.'));
        if(offset!==request.offset||!(peaks instanceof ArrayBuffer)||peaks.byteLength!==request.count*4)return this.finish(id,new Error('Invalid audio analysis result.'));
        const values=new Float32Array(peaks);
        for(let index=0;index<values.length;index++){const value=values[index];if(!Number.isFinite(value)||value<0||value>1)return this.finish(id,new Error('Invalid audio analysis result.'));request.peaks[index]=Math.max(request.peaks[index],value);}
        request.offset=request.nextOffset;
        if(request.offset>=request.length)this.finish(id,null,Array.from(request.peaks,value=>Math.round(value*1000)/1000));
        else this.sendChunk(id);
      };
      this.worker.onerror=()=>this.terminate(new Error('Audio worker failed.'));
      this.worker.onmessageerror=()=>this.terminate(new Error('Audio worker message could not be decoded.'));
    }
    analyzeAudio(arrayBuffer,{sampleCount=200,signal}={}){
      if(!(arrayBuffer instanceof ArrayBuffer)||arrayBuffer.byteLength%4)return Promise.reject(new TypeError('Expected Float32 PCM audio.'));
      try{return this.analyzeChannels([new Float32Array(arrayBuffer)],sampleCount,{signal});}catch(error){return Promise.reject(error);}
    }
    analyzeChannels(channels,sampleCount=480,{signal}={}){
      if(this.closed)return Promise.reject(new Error('Audio worker has been terminated.'));
      if(signal?.aborted)return Promise.reject(signal.reason||Object.assign(new Error('Audio analysis was cancelled.'),{name:'AbortError'}));
      if(!Array.isArray(channels)||!channels.length||channels.length>64||channels.some(channel=>!(channel instanceof Float32Array)||channel.length!==channels[0].length))return Promise.reject(new TypeError('Expected equally sized Float32 audio channels.'));
      if(!Number.isFinite(sampleCount)||sampleCount<1)return Promise.reject(new TypeError('Invalid waveform sample count.'));
      if(!channels[0].length)return Promise.resolve([]);
      const id=this.nextId++,length=channels[0].length,count=Math.min(length,Math.max(1,Math.min(2048,Math.round(sampleCount))));
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>this.finish(id,new Error('Audio analysis timed out.')),this.timeoutMs),abort=()=>this.finish(id,signal.reason||Object.assign(new Error('Audio analysis was cancelled.'),{name:'AbortError'}));
        this.pending.set(id,{resolve,reject,timer,signal,abort,channels,length,count,offset:0,nextOffset:0,peaks:new Float32Array(count)});
        signal?.addEventListener('abort',abort,{once:true});this.sendChunk(id);
      });
    }
    sendChunk(id){
      const request=this.pending.get(id);if(!request)return;
      try{
        const end=Math.min(request.length,request.offset+Math.max(1,Math.floor(this.maxTransferBytes/(4*request.channels.length))));
        // Only one small copied tile per job is in flight. AudioBuffer/caller
        // storage is never detached and long files need no second full PCM copy.
        const buffers=request.channels.map(channel=>new Float32Array(channel.subarray(request.offset,end)).buffer);request.nextOffset=end;
        this.worker.postMessage({id,operation:'waveform-chunk',offset:request.offset,totalFrames:request.length,buffers,sampleCount:request.count},buffers);
      }catch(error){this.finish(id,error);}
    }
    finish(id,error,value){
      const request=this.pending.get(id);if(!request)return;
      this.pending.delete(id);clearTimeout(request.timer);request.signal?.removeEventListener('abort',request.abort);
      if(error)request.reject(error);else request.resolve(value);
    }
    terminate(error=new Error('Audio analysis was cancelled.')){
      if(this.closed)return;this.closed=true;
      try{this.worker.terminate();}catch{/* Settle callers even if a broken worker cannot be terminated. */}
      this.worker.onmessage=null;this.worker.onerror=null;this.worker.onmessageerror=null;
      for(const id of this.pending.keys())this.finish(id,error);
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
    static makeRequest(...args){return this.generateAIResponse(...args);}
    makeRequest(...args){return this.generateAIResponse(...args);}
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
