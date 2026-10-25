(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiTimelineTracks=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KINDS=Object.freeze(['video','audio','text','effect']);
  // Keep existing project IDs unchanged. Extra layers use positive, interleaved
  // IDs above the legacy range, so one kind can never spill into another kind.
  const EXTENDED_BASE=2**32;
  function kind(track){
    if(Number.isSafeInteger(track)&&track>=EXTENDED_BASE)return KINDS[(track-EXTENDED_BASE)%4];
    if(track===0||(track>=4&&track<100))return 'video';
    if(track===1||(track>=100&&track<200))return 'audio';
    if(track===2||(track>=200&&track<300))return 'text';
    return track===3||track>=300?'effect':'video';
  }
  function number(track){
    if(Number.isSafeInteger(track)&&track>=EXTENDED_BASE)return Math.floor((track-EXTENDED_BASE)/4)+1;
    if(track<4)return 1;
    return track-({video:2,audio:98,text:198,effect:298}[kind(track)]);
  }
  function id(type,ordinal){
    const index=KINDS.indexOf(type);
    if(index<0||!Number.isSafeInteger(ordinal)||ordinal<1)throw new TypeError('Choose a valid track kind and layer number.');
    if(ordinal===1)return index;
    const legacy=ordinal+({video:2,audio:98,text:198,effect:298}[type]);
    if(legacy<({video:100,audio:200,text:300,effect:EXTENDED_BASE}[type]))return legacy;
    const extended=EXTENDED_BASE+(ordinal-1)*4+index;
    if(!Number.isSafeInteger(extended))throw new RangeError('This project has reached the numeric layer limit.');
    return extended;
  }
  function next(clips,type){
    let highest=0;
    for(const clip of clips||[])if(kind(clip.track)===type)highest=Math.max(highest,number(clip.track));
    return id(type,highest+1);
  }
  return Object.freeze({KINDS,kind,number,id,next});
});
