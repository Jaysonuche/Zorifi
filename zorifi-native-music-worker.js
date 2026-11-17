/* Dedicated synthesis worker: a completed WAV is transferred, not copied. */
importScripts('zorifi-native-music.js?v=252');
self.onmessage=event=>{
  const {id,pattern,sampleRate}=event.data||{};
  try{const result=self.ZorifiNativeMusic.renderWav(pattern,{sampleRate});self.postMessage({id,result},[result.bytes]);}
  catch(error){self.postMessage({id,error:String(error.message||'Native synthesis failed.')});}
};
