/* Vanessa speech is independent of media narration providers. Browser voices,
 * including their quality and timing events, vary by operating system. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiVanessaVoice=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const FEMALE=/\b(?:sonia|aria|zira|samantha|jenny|ava|serena|victoria|karen|moira|tessa|fiona|susan|hazel|female|woman|siri)\b/i;
 const MALE=/\b(?:david|mark|guy|ryan|george|james|male|man)\b/i;
 const voiceId=voice=>String(voice?.voiceURI||`${voice?.name||''}|${voice?.lang||''}`);
 function chooseVoice(voices,{selected='',language='en-GB'}={}){
  const exact=voices.find(voice=>voiceId(voice)===selected);if(exact)return exact;
  const primary=String(language).slice(0,2).toLowerCase();return voices.map((voice,index)=>{
   const name=voice.name||'',lang=(voice.lang||'').toLowerCase();let score=0;
   if(lang.startsWith(primary))score+=100;if(/^en-gb/i.test(lang))score+=15;
   if(FEMALE.test(name))score+=80;if(MALE.test(name))score-=80;
   if(/natural|neural|premium|enhanced/i.test(name))score+=25;
   if(voice.default)score+=5;return {voice,index,score};
  }).sort((a,b)=>b.score-a.score||a.index-b.index)[0]?.voice||null;
 }
 function speechChunks(text,max=280){
  const chunks=[];let start=0;while(start<text.length){let end=Math.min(text.length,start+max);
   if(end<text.length){const part=text.slice(start,end),punctuation=Math.max(part.lastIndexOf('. '),part.lastIndexOf('? '),part.lastIndexOf('! '),part.lastIndexOf('; '));const space=part.lastIndexOf(' ');end=start+(punctuation>=max*.35?punctuation+1:space>0?space:max);}
   const value=text.slice(start,end);if(value.trim())chunks.push({text:value,start});start=end;while(text[start]===' ')start++;
  }return chunks;
 }
 function createDeviceAdapter({synthesis=root.speechSynthesis,Utterance=root.SpeechSynthesisUtterance}={}){
  return {id:'device',label:'Device voice',supported:()=>Boolean(synthesis&&typeof Utterance==='function'),
   listVoices:()=>Array.from(synthesis?.getVoices?.()||[]),
   unlock(){if(!this.supported())return false;try{synthesis.resume?.();if(!synthesis.speaking&&!synthesis.pending){const primer=new Utterance(' ');primer.volume=0;synthesis.speak(primer);}return true;}catch{return false;}},
   stop(){synthesis?.cancel?.();},
   speak({text,voice,language,rate,pitch,signal,onStart,onBoundary,onEnd,onError}){
    const chunks=speechChunks(text);let index=0,current=null,disposed=false,elapsed=0;
    const detach=()=>{if(current)current.onstart=current.onboundary=current.onend=current.onerror=null;current=null;};
    const next=()=>{if(disposed||signal.aborted)return;const chunk=chunks[index];if(!chunk){onEnd();return;}
     const utterance=current=new Utterance(chunk.text);if(voice)utterance.voice=voice;utterance.lang=voice?.lang||language;utterance.rate=rate;utterance.pitch=pitch;utterance.volume=1;
     utterance.onstart=()=>{if(!disposed&&!signal.aborted)onStart();};
     utterance.onboundary=event=>{if(disposed||signal.aborted||!Number.isInteger(event.charIndex)||event.charIndex<0||event.charIndex>chunk.text.length)return;onBoundary({charIndex:chunk.start+event.charIndex,charLength:Number.isInteger(event.charLength)?event.charLength:0,elapsedTime:elapsed+(Number(event.elapsedTime)||0),boundaryType:event.name||'unknown',timingSource:'speech-boundary'});};
     utterance.onend=event=>{if(disposed||signal.aborted)return;elapsed+=Number(event.elapsedTime)||0;detach();index++;next();};
     utterance.onerror=event=>{if(!disposed&&!signal.aborted)onError({code:event.error||'synthesis-failed'});};
     try{synthesis.speak(utterance);}catch(error){onError({code:error?.name==='NotAllowedError'?'not-allowed':'synthesis-failed',message:error.message});}
    };next();return ()=>{disposed=true;detach();};
   }
  };
 }
 function createService(options={}){
  let adapter=options.adapter||createDeviceAdapter(options),active=null,disposed=false,sequence=0,dialog=null;
  const storage=options.storage||root.localStorage,getScope=options.getScope||(()=>''),getAccount=options.getAccount||getScope,onEvent=options.onEvent||(()=>{}),setTimer=options.setTimeout||setTimeout,clearTimer=options.clearTimeout||clearTimeout;
  const key=()=>`zorifi-vanessa-device-voice-v1:${getAccount()||'guest'}`;
  const preference=()=>{try{const saved=JSON.parse(storage?.getItem(key())||'{}');return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};}catch{return {};}};
  const listVoices=()=>adapter.listVoices?.()||[];
  const selectedVoice=language=>chooseVoice(listVoices(),{selected:preference().voiceId,language});
  function selectVoice(id){if(!listVoices().some(voice=>voiceId(voice)===id))throw Error('This voice is no longer available on this device.');try{storage?.setItem(key(),JSON.stringify({voiceId:id}));}catch{throw Error('The voice choice could not be saved on this device.');}return id;}
  function emit(job,status,extra={}){onEvent({status,text:job.text,...job.meta,serviceRequest:job.id,provider:adapter.id||'custom',...extra});}
  function release(job){clearTimer(job.timer);job.timer=null;job.cleanup?.();job.cleanup=null;job.controller.abort();if(active===job)active=null;}
  function finish(job,status,extra={}){if(active!==job)return;release(job);emit(job,status,extra);job.resolve({status,...extra});}
  function stop(reason='stopped'){const job=active;if(!job)return;release(job);try{adapter.stop?.();}catch{}emit(job,'stopped',{reason});job.resolve({status:'stopped',reason});}
  function speak(text,meta={}){
   stop('replaced');const spoken=String(text||'').replace(/\s+/g,' ').trim();if(!spoken||disposed)return {completion:Promise.resolve({status:'stopped'}),id:null};
   let resolve;const completion=new Promise(done=>resolve=done),job={id:++sequence,text:spoken,meta,scope:getScope(),controller:new AbortController(),resolve,started:false,cleanup:null,timer:null};active=job;
   const valid=()=>{if(active!==job)return false;if(job.scope!==getScope()){stop('scope-changed');return false;}return true;};
   emit(job,'preparing',{timingSource:'unavailable'});
   if(adapter.supported?.()===false){finish(job,'error',{code:'unsupported',message:'Speech output is unavailable in this browser. Vanessa’s written reply is still available.'});return {id:job.id,completion};}
   job.timer=setTimer(()=>{if(valid()&&!job.started){finish(job,'blocked',{code:'start-timeout',message:'Your device has not started speaking. Tap Hear reply or choose another available voice.'});try{adapter.stop?.();}catch{}}},12000);
   const parameters={text:spoken,voice:selectedVoice(meta.language||'en-GB'),language:meta.language||'en-GB',rate:.98,pitch:1.04,signal:job.controller.signal,
    onStart:()=>{if(!valid()||job.started)return;job.started=true;clearTimer(job.timer);job.timer=null;emit(job,'speaking',{timingSource:'unavailable'});},
    onBoundary:timing=>{if(valid()&&job.started)emit(job,'boundary',timing);},
    onEnd:()=>{if(valid())finish(job,'ended');},
    onError:error=>{if(!valid())return;const code=error.code||'synthesis-failed',blocked=['not-allowed','audio-busy'].includes(code);finish(job,blocked?'blocked':'error',{code,message:blocked?'Tap Hear reply to allow your device to speak.':error.message||'Your device could not play this voice. Choose another voice or read Vanessa’s reply.'});}
   };
   try{const cleanup=adapter.speak(parameters);if(active===job)job.cleanup=typeof cleanup==='function'?cleanup:null;else if(typeof cleanup==='function')cleanup();}catch(error){parameters.onError({code:'synthesis-failed',message:error.message});}
   return {id:job.id,completion};
  }
  function setAdapter(next){if(!next||typeof next.speak!=='function'||typeof next.stop!=='function')throw Error('A voice adapter must implement speak and stop.');stop('provider-changed');adapter=next;}
  function showSettings({document=root.document,language='en-GB',onPreview}={}){
   dialog?.close?.();if(!document)return null;const pane=document.createElement('dialog');dialog=pane;pane.className='vanessa-voice-settings';pane.dataset.vanessaVoiceSettings='';const owner=getAccount();
   const heading=document.createElement('h2');heading.textContent='Vanessa voice';pane.append(heading);
   const copy=document.createElement('p');copy.textContent='Choose a voice available on this device. Vanessa prefers a feminine English voice when one is available. Voice character and word timing vary by device; this is not a unique branded voice model. Some system voices may use your browser or operating system’s online speech service.';pane.append(copy);
   const label=document.createElement('label');label.textContent='Available voices';const select=document.createElement('select');select.setAttribute('aria-label','Vanessa device voice');label.append(select);pane.append(label);
   const status=document.createElement('p');status.setAttribute('role','status');pane.append(status);
   const refresh=()=>{const voices=listVoices(),chosen=selectedVoice(language);select.replaceChildren();for(const voice of voices){const item=document.createElement('option');item.value=voiceId(voice);item.textContent=`${voice.name} · ${voice.lang}${voice.localService?' · on device':''}`;item.selected=chosen===voice;select.append(item);}select.disabled=!voices.length;status.textContent=voices.length?'Your choice is saved for your account on this device.':'Your browser has not listed any voices yet. Default device speech may still be available.';};refresh();
   select.onchange=()=>{try{if(owner!==getAccount())throw Error('Your account changed. Reopen voice options.');selectVoice(select.value);status.textContent='Voice choice saved.';}catch(error){status.textContent=error.message;}};
   const actions=document.createElement('div');actions.className='vanessa-voice-settings-actions';
   const preview=document.createElement('button');preview.type='button';preview.textContent='Preview voice';preview.onclick=()=>{if(owner!==getAccount()){status.textContent='Your account changed. Reopen voice options.';return;}if(onPreview)onPreview('Hello, I’m Vanessa. Let’s bring your next idea to life.');else speak('Hello, I’m Vanessa. Let’s bring your next idea to life.',{language,preview:true});};
   const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>pane.close();actions.append(preview,close);pane.append(actions);document.body.append(pane);
   const refreshVoices=()=>refresh();options.synthesis?.addEventListener?.('voiceschanged',refreshVoices);(options.synthesis?null:root.speechSynthesis)?.addEventListener?.('voiceschanged',refreshVoices);
   pane.addEventListener('close',()=>{options.synthesis?.removeEventListener?.('voiceschanged',refreshVoices);(options.synthesis?null:root.speechSynthesis)?.removeEventListener?.('voiceschanged',refreshVoices);stop('preview-closed');pane.remove();if(dialog===pane)dialog=null;},{once:true});pane.showModal();return pane;
  }
  function dispose(){if(disposed)return;stop('disposed');disposed=true;dialog?.close?.();}
  return {speak,stop,unlock:()=>adapter.unlock?.()||false,listVoices,selectedVoice,selectVoice,showSettings,setAdapter,dispose,isSpeaking:()=>Boolean(active),snapshot:()=>({active:Boolean(active),provider:adapter.id||'custom',request:active?.id||null})};
 }
 return {createService,createDeviceAdapter,chooseVoice,speechChunks,voiceId};
});
