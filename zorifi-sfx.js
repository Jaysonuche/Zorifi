(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiSFX=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Original synthesis, rather than remote samples. Deterministic stereo PCM is
  // generated only on demand, so the library has no network or decode cost.
  const CATALOG=Object.freeze([
    {id:'soft-whoosh',name:'Soft Whoosh',category:'Swooshes',duration:.72,mood:'Airy movement',color:'#a78bfa'},
    {id:'pulse-impact',name:'Pulse Impact',category:'Trending',duration:1.25,mood:'Restrained low hit',color:'#c084fc'},
    {id:'tension-rise',name:'Tension Rise',category:'Music Clip',duration:2.4,mood:'Building reveal',color:'#f472b6'},
    {id:'reverse-lift',name:'Reverse Lift',category:'Swooshes',duration:1.1,mood:'Lead into a reveal',color:'#38bdf8'},
    {id:'ui-tick',name:'Precision Tick',category:'ASMR',duration:.16,mood:'Quiet title accent',color:'#2dd4bf'},
    {id:'sub-drop',name:'Sub Drop',category:'Trending',duration:1.6,mood:'Deep final accent',color:'#818cf8'},
    {id:'airy-shimmer',name:'Airy Shimmer',category:'Music Clip',duration:1.8,mood:'Gentle closing detail',color:'#e879f9'},
    {id:'room-air',name:'Room Air',category:'ASMR',duration:4,mood:'Neutral synthetic ambience',color:'#94a3b8'}
  ].map(value=>Object.freeze({...value,artist:'Zorifi Sound Design',bpm:0,key:0,soundEffect:value.id,original:true})));
  const byId=id=>CATALOG.find(item=>item.id===id)||null;
  function synthesize(id,{sampleRate=32000}={}){
    const cue=byId(id);if(!cue)throw new Error('Unknown Zorifi sound effect.');
    if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000)throw new Error('Unsupported sound-effect sample rate.');
    const length=Math.round(cue.duration*sampleRate),left=new Float32Array(length),right=new Float32Array(length);let seed=2166136261;
    for(const char of id)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
    const noise=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;};
    let low=0,previous=0,phase=0;
    for(let i=0;i<length;i++){
      const t=i/sampleRate,p=i/Math.max(1,length-1),n=noise();low+=.045*(n-low);const high=n-previous;previous=n;
      const edge=Math.min(1,t/.008,(cue.duration-t)/.025);let v=0;
      if(id==='soft-whoosh')v=(low*.8+high*.075)*Math.pow(Math.sin(Math.PI*p),2)*.8;
      else if(id==='pulse-impact'){phase+=2*Math.PI*(44+80*Math.exp(-t*24))/sampleRate;v=Math.sin(phase)*Math.exp(-t*5)*.58+low*Math.exp(-t*13)*.65;}
      else if(id==='tension-rise'){phase+=2*Math.PI*(95+650*p*p)/sampleRate;v=(low*.65+Math.sin(phase)*.09)*p*p*Math.min(1,(1-p)*28);}
      else if(id==='reverse-lift')v=(low*.8+high*.05)*Math.pow(p,2.6)*Math.min(1,(1-p)*40);
      else if(id==='ui-tick')v=(Math.sin(2*Math.PI*1800*t)*.22+high*.12)*Math.exp(-t*65);
      else if(id==='sub-drop'){phase+=2*Math.PI*(30+65*Math.exp(-t*4))/sampleRate;v=Math.sin(phase)*Math.exp(-t*2.9)*.6+low*.12*Math.exp(-t*16);}
      else if(id==='airy-shimmer')v=(Math.sin(2*Math.PI*880*t)+Math.sin(2*Math.PI*1320*t)*.7+Math.sin(2*Math.PI*1761*t)*.35)*.11*Math.exp(-t*2.4)*Math.min(1,t/.035);
      else v=low*.12*(.65+.35*Math.sin(Math.PI*p));
      v=Math.max(-.85,Math.min(.85,v*edge));left[i]=v;right[i]=v*(.94+.06*Math.sin(p*Math.PI*2))+(id.includes('whoosh')||id==='room-air'?low*.018*edge:0);
    }
    return {sampleRate,channels:[left,right],duration:cue.duration};
  }
  function wavBytes(id,options){
    const {sampleRate,channels}=synthesize(id,options),length=channels[0].length,bytes=new Uint8Array(44+length*4),view=new DataView(bytes.buffer),write=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
    write(0,'RIFF');view.setUint32(4,bytes.length-8,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,length*4,true);
    for(let i=0;i<length;i++)for(let c=0;c<2;c++)view.setInt16(44+(i*2+c)*2,Math.round(Math.max(-1,Math.min(1,channels[c][i]))*32767),true);return bytes;
  }
  const blob=(id,options)=>new Blob([wavBytes(id,options)],{type:'audio/wav'});
  function validateCues(cues,duration){
    if(!Array.isArray(cues)||cues.length>4)throw new Error('AutoCut supports up to four purposeful sound-effect cues.');
    const result=cues.map(cue=>{const definition=byId(cue?.id);if(!definition||!Number.isFinite(cue.at)||cue.at<0||cue.at>=duration||!Number.isFinite(cue.volume)||cue.volume<5||cue.volume>45||typeof cue.reason!=='string'||!cue.reason.trim()||cue.reason.length>200)throw new Error('The AutoCut sound design contains an invalid cue.');return {id:definition.id,at:cue.at,volume:cue.volume,reason:cue.reason.trim()};}).sort((a,b)=>a.at-b.at);
    if(result.some((cue,index)=>index&&cue.at-result[index-1].at<1.5))throw new Error('AutoCut sound-effect accents must be at least 1.5 seconds apart.');return result;
  }
  function materialize(plan,{createUrl=blob=>URL.createObjectURL(blob)}={}){
    const cues=validateCues(plan.soundDesign||[],plan.duration),assets=[],clips=[];
    for(const [index,cue] of cues.entries()){
      const definition=byId(cue.id),id=`autocut-sfx-${index}-${cue.id}`,file=blob(cue.id),duration=Math.min(definition.duration,plan.duration-cue.at);
      assets.push({id,name:definition.name,type:'audio',duration:definition.duration,file,url:createUrl(file),builtin:true,audioTrackId:cue.id,sfxId:cue.id,mimeType:'audio/wav'});
      clips.push({id:id+'-clip',mediaId:id,name:definition.name,type:'audio',start:cue.at,duration,sourceStart:0,playbackRate:1,track:3,volume:cue.volume,audioFadeIn:Math.min(.01,duration/4),audioFadeOut:Math.min(.12,duration/4),soundEffect:true,sfxId:cue.id,audioEffects:{role:'sfx'},autoCutEvidence:{reason:cue.reason}});
    }
    return {plan:{...plan,clips:[...plan.clips,...clips]},assets};
  }
  return {CATALOG,byId,synthesize,wavBytes,blob,validateCues,materialize};
});
