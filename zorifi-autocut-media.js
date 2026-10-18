(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiAutoCutMedia=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const MiB=1024*1024,presentedMedia=new WeakSet(),presentingMedia=new WeakMap();
  function abortError(){const error=new Error('AutoCut media preparation cancelled.');error.name='AbortError';return error;}
  function check(signal){if(signal?.aborted)throw abortError();}
  function outputSize(width,height,{maxDimension=1920,maxPixels=2073600}={}){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('This photo has no readable dimensions.');
    const factor=Math.min(1,Math.max(1,maxDimension)/width,Math.max(1,maxDimension)/height,Math.sqrt(Math.max(1,maxPixels)/(width*height)));
    return {width:Math.max(1,Math.floor(width*factor)),height:Math.max(1,Math.floor(height*factor))};
  }
  function timeoutFor(asset={},kind='open'){
    const bytes=Number(asset.file?.size??asset.size)||0,megapixels=(Number(asset.width)||0)*(Number(asset.height)||0)/1e6;
    return Math.min(kind==='seek'?90000:120000,(kind==='seek'?30000:45000)+Math.ceil(bytes/MiB)*(kind==='seek'?50:150)+Math.min(30000,megapixels*400));
  }
  function orientation(view,offset,length){
    try{if(length<14||view.getUint32(offset)!==0x45786966)return 1;const tiff=offset+6,little=view.getUint16(tiff)===0x4949;if(view.getUint16(tiff+2,little)!==42)return 1;const table=tiff+view.getUint32(tiff+4,little),count=Math.min(256,view.getUint16(table,little));for(let i=0;i<count;i++){const at=table+2+i*12;if(at+12>offset+length)break;if(view.getUint16(at,little)===0x112)return view.getUint16(at+8,little);}}catch{}return 1;
  }
  // Read small headers and skip JPEG metadata segments by offset. Never copy a
  // complete high-resolution original into a JavaScript ArrayBuffer.
  async function imageInfo(blob,{signal}={}){
    check(signal);const head=new DataView(await blob.slice(0,64).arrayBuffer());check(signal);
    const u32=(at,little=false)=>at+4<=head.byteLength?head.getUint32(at,little):0;
    const finish=(width,height,rotate=1)=>({width:rotate>=5&&rotate<=8?height:width,height:rotate>=5&&rotate<=8?width:height,orientation:rotate});
    if(head.byteLength>=24&&u32(0)===0x89504e47&&u32(4)===0x0d0a1a0a)return finish(u32(16),u32(20));
    if(head.byteLength>=10&&(u32(0)===0x47494638))return finish(head.getUint16(6,true),head.getUint16(8,true));
    if(head.byteLength>=30&&u32(0)===0x52494646&&u32(8)===0x57454250){
      const kind=u32(12);if(kind===0x56503858)return finish(1+head.getUint8(24)+(head.getUint8(25)<<8)+(head.getUint8(26)<<16),1+head.getUint8(27)+(head.getUint8(28)<<8)+(head.getUint8(29)<<16));
      if(kind===0x56503820&&head.byteLength>=30)return finish(head.getUint16(26,true)&0x3fff,head.getUint16(28,true)&0x3fff);
      if(kind===0x5650384c&&head.getUint8(20)===0x2f){const bits=u32(21,true);return finish((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);}
    }
    if(head.byteLength>=26&&head.getUint16(0)===0x424d)return finish(Math.abs(head.getInt32(18,true)),Math.abs(head.getInt32(22,true)));
    if(head.byteLength>=2&&head.getUint16(0)===0xffd8){
      let offset=2,rotate=1;
      for(let i=0;i<512&&offset+4<=blob.size&&offset<8*MiB;i++){
        check(signal);const segment=new DataView(await blob.slice(offset,offset+12).arrayBuffer());if(segment.byteLength<4||segment.getUint8(0)!==255)break;
        let marker=segment.getUint8(1);if(marker===255){offset++;continue;}if(marker===0xd9||marker===0xda)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7){offset+=2;continue;}
        const length=segment.getUint16(2);if(length<2||offset+2+length>blob.size)break;
        if(marker===0xe1){const bytes=new DataView(await blob.slice(offset+4,offset+2+length).arrayBuffer());rotate=orientation(bytes,0,bytes.byteLength);}
        if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker)&&segment.byteLength>=9)return finish(segment.getUint16(7),segment.getUint16(5),rotate);
        offset+=length+2;
      }
    }
    // AVIF/HEIF image properties carry dimensions in an ispe full box. The
    // bounded scan also covers files whose property table follows an ICC box.
    if(head.byteLength>=16&&u32(4)===0x66747970){
      const bytes=new DataView(await blob.slice(0,Math.min(blob.size,MiB)).arrayBuffer());let best=null;
      for(let at=4;at+16<=bytes.byteLength;at++)if(bytes.getUint32(at)===0x69737065){const width=bytes.getUint32(at+8),height=bytes.getUint32(at+12);if(width>0&&height>0&&width<=1000000&&height<=1000000&&(!best||width*height>best.width*best.height))best=finish(width,height);}
      if(best)return best;
    }
    return null;
  }
  function timed(promise,{signal,timeout=45000,label='The media took too long to prepare.',onLate}={}){
    check(signal);return new Promise((resolve,reject)=>{let ended=false;const finish=(fn,value)=>{if(ended)return;ended=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);fn(value);},cancel=()=>finish(reject,abortError()),timer=setTimeout(()=>finish(reject,new Error(label)),timeout);signal?.addEventListener('abort',cancel,{once:true});Promise.resolve(promise).then(value=>{if(ended)onLate?.(value);else finish(resolve,value);},error=>finish(reject,error));});
  }
  function waitFor(element,events,{signal,timeout=45000,ready,immediate=true,label='This media could not be decoded.'}={}){
    check(signal);if(immediate&&ready?.())return Promise.resolve();return new Promise((resolve,reject)=>{const names=Array.isArray(events)?events:[events];let ended=false;const cleanup=()=>{clearTimeout(timer);for(const name of names)element.removeEventListener(name,ok);element.removeEventListener('error',fail);signal?.removeEventListener('abort',cancel);},finish=(error)=>{if(ended)return;ended=true;cleanup();error?reject(error):resolve();},ok=()=>{if(!ready||ready())finish();},fail=()=>finish(new Error(label+' The file may use a codec this browser cannot play.')),cancel=()=>finish(abortError()),timer=setTimeout(()=>finish(new Error(label+' Media preparation timed out. You can retry or cancel.')),timeout);for(const name of names)element.addEventListener(name,ok);element.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',cancel,{once:true});});
  }
  async function waitPresented(media,{signal,timeout=45000,fresh=false}={}){
    check(signal);if(!media.videoWidth&&media.tagName!=='VIDEO')return;
    if(presentingMedia.has(media))return presentingMedia.get(media);
    if(fresh)presentedMedia.delete(media);if(presentedMedia.has(media))return;
    // HAVE_ENOUGH_DATA may precede the first drawable video surface. Waiting
    // for presentation while paused avoids blank thumbnails and opening frames,
    // without playing ahead or changing the requested source position.
    const pending=(async()=>{if(typeof media.requestVideoFrameCallback==='function')await new Promise((resolve,reject)=>{let id,ended=false;const finish=error=>{if(ended)return;ended=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);media.cancelVideoFrameCallback?.(id);error?reject(error):resolve();},cancel=()=>finish(abortError()),timer=setTimeout(()=>finish(new Error('A video frame took too long to prepare.')),timeout);signal?.addEventListener('abort',cancel,{once:true});id=media.requestVideoFrameCallback(()=>finish());});
      else await timed(new Promise(resolve=>{const raf=typeof root.requestAnimationFrame==='function'?root.requestAnimationFrame.bind(root):((callback)=>setTimeout(callback,16));raf(()=>raf(resolve));}),{signal,timeout});check(signal);presentedMedia.add(media);})();
    presentingMedia.set(media,pending);try{return await pending;}finally{if(presentingMedia.get(media)===pending)presentingMedia.delete(media);}
  }
  async function sourceBlob(asset,signal){
    check(signal);if(asset.file instanceof root.Blob)return asset.file;if(!asset.url)throw new Error('The original photo is unavailable. Select it again.');
    const response=await root.fetch(asset.url,{signal});if(!response.ok)throw new Error('The original photo could not be opened.');return response.blob();
  }
  function urlFor(asset){if(asset.url)return {url:asset.url,owned:false};if(asset.file instanceof root.Blob)return {url:root.URL.createObjectURL(asset.file),owned:true};throw new Error('The original media is unavailable. Select it again.');}
  async function fallbackImage(blob,asset,options,info){
    const url=root.URL.createObjectURL(blob),element=new root.Image();element.decoding='async';
    try{const ready=waitFor(element,'load',{signal:options.signal,timeout:timeoutFor(asset),label:`${asset.name||'This photo'} could not be opened.`});element.src=url;await ready;check(options.signal);const width=element.naturalWidth,height=element.naturalHeight,size=outputSize(width,height,options),canvas=root.document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image processing is unavailable.');ctx.drawImage(element,0,0,size.width,size.height);return {image:canvas,width:info?.width||width,height:info?.height||height,dispose(){canvas.width=1;canvas.height=1;}};}
    finally{element.src='';root.URL.revokeObjectURL(url);}
  }
  async function loadImage(asset,{signal,maxDimension=1920,maxPixels=2073600,onProgress}={}){
    check(signal);onProgress?.({phase:'opening',message:'Preparing a memory-sized photo preview…'});const blob=await sourceBlob(asset,signal),info=await imageInfo(blob,{signal});check(signal);const options={signal,maxDimension,maxPixels};
    if(root.createImageBitmap&&info?.width&&info?.height){
      const size=outputSize(info.width,info.height,options);let bitmap;
      try{bitmap=await timed(root.createImageBitmap(blob,{resizeWidth:size.width,resizeHeight:size.height,resizeQuality:'high',imageOrientation:'from-image'}),{signal,timeout:timeoutFor({...asset,...info}),label:`${asset.name||'This photo'} took too long to prepare.`,onLate:value=>value.close()});}
      catch(error){check(signal);if(/too long/.test(error.message))throw error;return fallbackImage(blob,asset,options,info);}
      try{check(signal);if(bitmap.width>size.width||bitmap.height>size.height){const canvas=root.document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;canvas.getContext('2d').drawImage(bitmap,0,0,size.width,size.height);bitmap.close();return {image:canvas,width:info.width,height:info.height,dispose(){canvas.width=1;canvas.height=1;}};}let disposed=false;return {image:bitmap,width:info.width,height:info.height,dispose(){if(!disposed){disposed=true;bitmap.close();}}};}
      catch(error){bitmap.close();throw error;}
    }
    return fallbackImage(blob,asset,options,info);
  }
  async function seek(media,time,{signal,timeout=45000}={}){
    check(signal);const target=Math.max(0,Math.min(time,Number.isFinite(media.duration)?Math.max(0,media.duration-.002):time));
    if(Math.abs(media.currentTime-target)<.015&&media.readyState>=2&&!media.seeking)return waitPresented(media,{signal,timeout});
    const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    const ready=waitFor(media,['seeked','loadeddata','canplay'],{signal:combined,timeout,immediate:false,ready:()=>media.readyState>=2&&!media.seeking&&Math.abs(media.currentTime-target)<.05,label:'A video frame could not be read.'});ready.catch(()=>{});
    const frame=waitPresented(media,{signal:combined,timeout,fresh:true});frame.catch(()=>{});
    try{media.currentTime=target;await ready;await frame;}finally{controller.abort();}
  }
  async function openVideo(asset,{signal,onProgress}={}){
    check(signal);const source=urlFor(asset),media=root.document.createElement('video');media.preload='metadata';media.muted=true;media.playsInline=true;if(/^https?:/i.test(source.url)&&!source.url.startsWith(root.location?.origin+'/'))media.crossOrigin='anonymous';
    const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    let disposed=false;const dispose=()=>{if(disposed)return;disposed=true;controller.abort();media.pause();media.removeAttribute('src');media.load();if(source.owned)root.URL.revokeObjectURL(source.url);};
    try{onProgress?.({phase:'opening',message:'Reading the video index without uploading the original…'});const first=typeof media.requestVideoFrameCallback==='function'?waitPresented(media,{signal:combined,timeout:timeoutFor(asset)}):null;first?.catch(()=>{});
      const ready=waitFor(media,'loadedmetadata',{signal,timeout:timeoutFor(asset),ready:()=>media.readyState>=1,label:`${asset.name||'This video'} could not be opened.`});media.src=source.url;await ready;check(signal);
      if(!Number.isFinite(media.duration)){const durationReady=waitFor(media,['durationchange','seeked'],{signal,timeout:timeoutFor(asset,'seek'),ready:()=>Number.isFinite(media.duration)&&media.duration>0,label:'The video duration could not be read.'});media.currentTime=1e101;await durationReady;}
      const width=media.videoWidth,height=media.videoHeight,duration=media.duration;if(!width||!height||!Number.isFinite(duration)||duration<=0)throw new Error('The video has no readable dimensions or duration.');
      await seek(media,Math.min(.001,duration/2),{signal,timeout:timeoutFor(asset,'seek')});await seek(media,0,{signal,timeout:timeoutFor(asset,'seek')});return {media,width,height,duration,dispose};
    }catch(error){dispose();throw error;}
  }
  return {outputSize,timeoutFor,imageInfo,loadImage,openVideo,seek,waitFor,waitPresented};
});
