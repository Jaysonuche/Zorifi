(function(){
  'use strict';
  function waveformPeaks(buffers,sampleCount=480,{offset=0,totalFrames}={}){
    if(!Array.isArray(buffers)||!buffers.length||buffers.some(buffer=>!(buffer instanceof ArrayBuffer)||buffer.byteLength%4))throw new TypeError('Invalid channels');
    const channels=buffers.map(buffer=>new Float32Array(buffer)),length=channels[0].length;
    if(channels.some(channel=>channel.length!==length)||!Number.isFinite(sampleCount)||sampleCount<1)throw new TypeError('Invalid waveform input');
    totalFrames=totalFrames??length;
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(totalFrames)||offset<0||totalFrames<offset+length)throw new TypeError('Invalid waveform range');
    if(!totalFrames)return new Float32Array();
    const count=Math.min(totalFrames,Math.max(1,Math.min(2048,Math.round(sampleCount)))),peaks=new Float32Array(count);
    for(let index=0;index<count;index++){
      const from=Math.max(0,Math.floor(index*totalFrames/count)-offset),to=Math.min(length,Math.floor((index+1)*totalFrames/count)-offset);let peak=0;
      for(let sample=from;sample<to;sample++){
        let value=0;
        for(const channel of channels)value+=Number.isFinite(channel[sample])?Math.abs(channel[sample]):0;
        peak=Math.max(peak,value/channels.length);
      }
      peaks[index]=Math.round(Math.max(0,Math.min(1,peak))*1000)/1000;
    }
    return peaks;
  }
  if(typeof module==='object'&&module.exports)module.exports={waveformPeaks};
  if(typeof self!=='undefined'&&typeof document==='undefined')self.onmessage=event=>{
    const {id,buffers,sampleCount,operation,offset,totalFrames}=event.data||{};
    try{const peaks=waveformPeaks(buffers,sampleCount,operation==='waveform-chunk'?{offset,totalFrames}:{});self.postMessage({id,offset,peaks:peaks.buffer},[peaks.buffer]);}
    catch{self.postMessage({id,error:true});}
  };
})();
