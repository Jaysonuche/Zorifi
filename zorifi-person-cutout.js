(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiPersonCutout=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  // Loading this file makes no network requests. A visible opt-in action must
  // call prepare({allowDownload:true}) before any model/runtime is downloaded.
  const VERSION='0.10.21',RUNTIME=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`,WASM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`,MODEL='https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';
  const MODEL_BYTES=249537,MAX_MODEL_BYTES=1000000;
  let engine=null,loading=null,state='disabled';const frames=new WeakMap();
  function check(signal){if(signal?.aborted){const error=new Error('Person cutout preparation cancelled.');error.name='AbortError';throw error;}}
  async function readModel(signal,onProgress){
    const response=await root.fetch(MODEL,{signal});if(!response.ok)throw new Error('The person cutout model could not be downloaded. Try again with an internet connection.');
    const chunks=[];let size=0;const reader=response.body?.getReader();
    if(reader){try{while(true){check(signal);const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_MODEL_BYTES)throw new Error('The person cutout model exceeded its expected size.');chunks.push(part.value);onProgress?.({stage:'model',progress:Math.min(1,size/MODEL_BYTES)});}}finally{reader.releaseLock();}}
    else{const bytes=new Uint8Array(await response.arrayBuffer());size=bytes.length;chunks.push(bytes);}
    if(size!==MODEL_BYTES)throw new Error('The downloaded person cutout model has an unexpected size.');
    const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return data;
  }
  async function prepare({allowDownload=false,signal,onProgress}={}){
    check(signal);if(engine)return {ready:true,scope:'people',model:'MediaPipe SelfieSegmenter float16 v1'};
    if(!allowDownload)throw new Error('Enable person cutout to download the on-device runtime and model first.');
    if(loading)return loading;
    state='loading';loading=(async()=>{
      let candidate;
      try{
        onProgress?.({stage:'runtime',progress:0});const runtime=await import(RUNTIME);check(signal);
        const model=await readModel(signal,onProgress);check(signal);onProgress?.({stage:'wasm',progress:0});
        const files=await runtime.FilesetResolver.forVisionTasks(WASM);check(signal);
        candidate=await runtime.ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetBuffer:model,delegate:'CPU'},runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true});check(signal);
        engine=candidate;state='ready';onProgress?.({stage:'ready',progress:1});return {ready:true,scope:'people',model:'MediaPipe SelfieSegmenter float16 v1'};
      }catch(error){candidate?.close?.();state=signal?.aborted?'disabled':'error';throw error;}
      finally{loading=null;}
    })();return loading;
  }
  function alphaFromConfidence(confidence,{threshold=.45,softness=.12}={}){
    if(!(confidence instanceof Float32Array)&&!ArrayBuffer.isView(confidence))throw new Error('Person segmentation returned invalid confidence data.');
    threshold=Math.max(.05,Math.min(.95,Number(threshold)||.45));softness=Math.max(.01,Math.min(.4,Number(softness)||.12));
    const alpha=new Uint8ClampedArray(confidence.length);for(let i=0;i<confidence.length;i++){const p=Math.max(0,Math.min(1,(confidence[i]-(threshold-softness))/(softness*2)));alpha[i]=Math.round(p*p*(3-2*p)*255);}return alpha;
  }
  function cutout(source,{threshold=.45,softness=.12}={}){
    if(!engine)throw new Error('Person cutout is not ready. Download the on-device model before rendering this tool.');
    const width=source.videoWidth||source.naturalWidth||source.width,height=source.videoHeight||source.naturalHeight||source.height;if(!width||!height)throw new Error('The person cutout source is not ready.');
    const key=Number.isFinite(source.currentTime)?`video:${source.currentTime.toFixed(3)}`:`image:${source.currentSrc||source.src||'canvas'}`,previous=frames.get(source);
    if((Number.isFinite(source.currentTime)||source.src)&&previous?.key===key&&previous.threshold===threshold&&previous.softness===softness)return previous.canvas;
    const factor=Math.min(1,720/Math.max(width,height)),canvas=previous?.canvas||root.document.createElement('canvas');canvas.width=Math.max(2,Math.round(width*factor));canvas.height=Math.max(2,Math.round(height*factor));
    const context=canvas.getContext('2d'),mask=previous?.mask||root.document.createElement('canvas');let received=false,coverage=0;
    engine.segment(source,result=>{
      const labels=engine.getLabels?.()||[],index=Math.max(0,labels.findIndex(label=>/person|foreground/i.test(label))),confidence=result.confidenceMasks?.[index]||result.confidenceMasks?.at(-1);
      if(!confidence)throw new Error('The person model did not return a foreground mask.');
      mask.width=confidence.width;mask.height=confidence.height;const pixels=mask.getContext('2d').createImageData(mask.width,mask.height),alpha=alphaFromConfidence(confidence.getAsFloat32Array(),{threshold,softness});
      for(let i=0;i<alpha.length;i++){pixels.data[i*4]=255;pixels.data[i*4+1]=255;pixels.data[i*4+2]=255;pixels.data[i*4+3]=alpha[i];coverage+=alpha[i]/255;}
      mask.getContext('2d').putImageData(pixels,0,0);coverage/=alpha.length;received=true;
    });
    if(!received)throw new Error('The person model did not finish its foreground mask.');
    context.drawImage(source,0,0,canvas.width,canvas.height);context.globalCompositeOperation='destination-in';context.drawImage(mask,0,0,canvas.width,canvas.height);context.globalCompositeOperation='source-over';
    frames.set(source,{key,threshold,softness,canvas,mask,coverage});return canvas;
  }
  function status(){return {ready:!!engine,state,scope:'people',model:'MediaPipe SelfieSegmenter float16 v1',download:{modelBytes:MODEL_BYTES,runtimeVersion:VERSION},limitations:'Segments people, with imperfect hair/edge detail. It does not promise automatic masks for objects, animals or illustrated characters.'};}
  function dispose(){engine?.close?.();engine=null;state='disabled';}
  return {VERSION,RUNTIME,WASM,MODEL,MODEL_BYTES,prepare,ready:()=>!!engine,status,alphaFromConfidence,cutout,dispose};
});
