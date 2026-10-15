(function(){
  'use strict';
  function waveformPeaks(buffers,sampleCount=480){
    if(!Array.isArray(buffers)||!buffers.length||buffers.some(buffer=>!(buffer instanceof ArrayBuffer)||buffer.byteLength%4))throw new TypeError('Invalid channels');
    const channels=buffers.map(buffer=>new Float32Array(buffer)),length=channels[0].length;
    if(channels.some(channel=>channel.length!==length)||!Number.isFinite(sampleCount)||sampleCount<1)throw new TypeError('Invalid waveform input');
    if(!length)return new Float32Array();
    const count=Math.min(length,Math.max(1,Math.min(2048,Math.round(sampleCount)))),block=Math.max(1,Math.floor(length/count)),peaks=new Float32Array(count);
    for(let index=0;index<count;index++){
      const from=index*block,to=index===count-1?length:Math.min(length,from+block);let peak=0;
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
    const {id,buffers,sampleCount}=event.data||{};
    try{const peaks=waveformPeaks(buffers,sampleCount);self.postMessage({id,peaks:peaks.buffer},[peaks.buffer]);}
    catch{self.postMessage({id,error:true});}
  };
})();
