(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiEditorOverhaul=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function finite(value,fallback=0){value=Number(value);return Number.isFinite(value)?value:fallback;}
  function clamp(value,min,max){return Math.max(min,Math.min(max,finite(value,min)));}
  function projectDuration(clips,{minimum=1}={}){
    return Math.max(minimum,...(Array.isArray(clips)?clips:[]).map(clip=>Math.max(0,finite(clip.start))+Math.max(0,finite(clip.duration))));
  }
  function dropTime({clientX,left,width,duration,snap=true,fps=30}){
    const raw=clamp((finite(clientX)-finite(left))/Math.max(1,finite(width,1))*Math.max(0,finite(duration)),0,Math.max(0,finite(duration)));
    return snap?Math.round(raw*Math.max(1,finite(fps,30)))/Math.max(1,finite(fps,30)):raw;
  }
  function payloadKind(types=[]){
    const supported=['media','audio','overlay','sticker','text','text-template','caption-template','effect','animation','filter','transition','keyframe-preset'];
    const values=Array.from(types||[]);
    return supported.find(kind=>values.includes(`application/x-zorifi-${kind}`))||null;
  }
  function validDrop(kind,targetKind){
    if(kind==='media')return ['video','audio','text','effect','empty'].includes(targetKind);
    if(kind==='audio')return ['audio','empty'].includes(targetKind);
    if(kind==='overlay')return ['video','empty'].includes(targetKind);
    if(kind==='sticker')return ['video','empty'].includes(targetKind);
    if(['text','text-template','caption-template'].includes(kind))return ['text','empty'].includes(targetKind);
    if(kind==='transition')return targetKind==='video'||targetKind==='clip';
    if(['effect','animation','filter','keyframe-preset'].includes(kind))return targetKind==='video'||targetKind==='text'||targetKind==='clip';
    return false;
  }

  class PlaybackController{
    constructor(options={}){
      this.now=options.now||(()=>performance.now());
      this.schedule=options.schedule||((callback)=>{
        let settled=false,raf=null,timer=null;
        const run=timestamp=>{if(settled)return;settled=true;if(raf!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(raf);if(timer!==null)clearTimeout(timer);callback(Number.isFinite(timestamp)?timestamp:this.now());};
        if(typeof requestAnimationFrame==='function')raf=requestAnimationFrame(run);
        timer=setTimeout(()=>run(this.now()),80);
        return {raf,timer,cancel:()=>{settled=true;if(raf!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(raf);if(timer!==null)clearTimeout(timer);}};
      });
      this.cancel=options.cancel||(handle=>handle?.cancel?.());
      this.clock=typeof options.clock==='function'?options.clock:null;
      this.onTime=options.onTime||(()=>{});this.onStop=options.onStop||(()=>{});this.onLoop=options.onLoop||(()=>{});
      this.playing=false;this.frame=null;this.time=0;this.duration=1;this.rate=1;this.loop=false;this.loopStart=0;this.loopEnd=0;
      this._tick=this._tick.bind(this);
    }
    configure(options={}){
      this.duration=Math.max(0,finite(options.duration,this.duration));this.rate=Math.max(.01,finite(options.rate,this.rate));
      this.loop=Boolean(options.loop);this.loopStart=clamp(options.loopStart||0,0,this.duration);this.loopEnd=clamp(options.loopEnd||this.duration,this.loopStart,this.duration);
      return this;
    }
    play(time=this.time,options={}){
      this.pause('restart',false);this.configure(options);this.time=clamp(time,0,this.duration);
      if(this.time>=this.duration)this.time=0;
      this.originTime=this.time;this.startedAt=this.now();this.playing=true;this.onTime(this.time,{reason:'play'});this.frame=this.schedule(this._tick);return this.time;
    }
    _tick(timestamp){
      if(!this.playing)return;
      const now=Number.isFinite(timestamp)?timestamp:this.now(),sample=this.clock?.(),hasMediaClock=Number.isFinite(sample);let next=hasMediaClock?Number(sample):this.originTime+(now-this.startedAt)/1000*this.rate;
      if(hasMediaClock){this.originTime=next;this.startedAt=now;}
      const canLoop=this.loop&&this.loopEnd>this.loopStart+.0001;
      if(canLoop&&next>=this.loopEnd){const span=this.loopEnd-this.loopStart;next=this.loopStart+((next-this.loopStart)%span);this.originTime=next;this.startedAt=now;this.onLoop(next);}
      if(!canLoop&&next>=this.duration){this.time=this.duration;this.playing=false;this.frame=null;this.onTime(this.time,{reason:'ended'});this.onStop('ended',this.time);return;}
      this.time=clamp(next,0,this.duration);this.onTime(this.time,{reason:'tick'});this.frame=this.schedule(this._tick);
    }
    sample(reason='media'){
      if(!this.playing||!this.clock)return this.time;const value=this.clock();if(!Number.isFinite(value))return this.time;this.time=clamp(value,0,this.duration);this.originTime=this.time;this.startedAt=this.now();this.onTime(this.time,{reason});return this.time;
    }
    seek(time){this.time=clamp(time,0,this.duration);if(this.playing){this.originTime=this.time;this.startedAt=this.now();}this.onTime(this.time,{reason:'seek'});return this.time;}
    pause(reason='paused',notify=true){if(this.frame!==null)this.cancel(this.frame);this.frame=null;const wasPlaying=this.playing;this.playing=false;if(notify&&wasPlaying)this.onStop(reason,this.time);return this.time;}
    destroy(){this.pause('destroyed');}
  }

  return {PlaybackController,projectDuration,dropTime,payloadKind,validDrop};
});
