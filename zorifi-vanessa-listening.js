(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiVanessaListening=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  function joinDraft(base,next){const a=clean(base).split(' ').filter(Boolean),b=clean(next).split(' ').filter(Boolean);let overlap=0;for(let size=1;size<=Math.min(a.length,b.length,40);size++)if(a.slice(-size).join(' ').toLowerCase()===b.slice(0,size).join(' ').toLowerCase())overlap=size;return [...a,...b.slice(overlap)].join(' ').slice(0,4000);}
  function create(options={}){
    const schedule=options.setTimeout||root.setTimeout.bind(root),unschedule=options.clearTimeout||root.clearTimeout.bind(root);let recognition=null,restartTimer=null,sendTimer=null,scopeTimer=null,epoch=0,owner=null,desired='off',state='off',draft='',suspended=false,blocked=false,retries=0,pauseMs=0,sessionBase='',captureOffset=0,wakeInSession=false;
    const scope=(mode=desired)=>options.getScope?.(mode)||null,visible=()=>options.isVisible?.()!==false;
    const snapshot=()=>({state,desired,draft,capturing:desired==='capture',wake:desired==='wake',active:Boolean(recognition)&&!suspended&&!blocked,pauseMs});
    const notify=()=>options.onState?.(snapshot());
    const clearTimer=name=>{if(name==='restart'){unschedule(restartTimer);restartTimer=null;}if(name==='send'){unschedule(sendTimer);sendTimer=null;}if(name==='scope'){unschedule(scopeTimer);scopeTimer=null;}};
    function detach(){const previous=recognition;recognition=null;epoch++;if(previous){previous.onstart=null;previous.onresult=null;previous.onerror=null;previous.onend=null;try{previous.abort();}catch{}}}
    function valid(){if(owner&&owner===scope())return true;stop({clearDraft:true});return false;}
    function watchScope(){clearTimer('scope');if(desired==='off')return;scopeTimer=schedule(()=>{if(valid())watchScope();},500);}
    function setDraft(value){const next=clean(value).slice(0,4000);if(next===draft)return;draft=next;options.onDraft?.(draft);}
    function armSend(){clearTimer('send');if(!pauseMs||!draft||desired!=='capture'||suspended||blocked)return;sendTimer=schedule(()=>{sendTimer=null;if(valid()&&visible()&&desired==='capture'&&!suspended&&!blocked)submit();},pauseMs);}
    function stop({clearDraft=false}={}){desired='off';suspended=false;blocked=false;clearTimer('restart');clearTimer('send');clearTimer('scope');detach();state='off';if(clearDraft)setDraft('');notify();}
    function suspend(){if(desired==='off')return;clearTimer('restart');clearTimer('send');suspended=true;detach();state='paused';notify();}
    function resume(){if(desired==='off'||!valid()||!visible()||blocked)return;suspended=false;begin();armSend();}
    function restart(){if(desired==='off'||suspended||blocked||!visible()||!valid())return;clearTimer('restart');state='restarting';notify();restartTimer=schedule(()=>{restartTimer=null;begin();},Math.min(2000,300+retries*400));}
    function begin(){
      if(recognition||desired==='off'||suspended||blocked||!visible()||!valid())return;
      const Recognition=options.getRecognition?.();if(!Recognition){blocked=true;state='unsupported';notify();options.onError?.('Voice input is unavailable in this browser. Type your message, or use a browser with speech recognition.','unsupported');return;}
      clearTimer('restart');const token=++epoch,instance=new Recognition();recognition=instance;sessionBase=draft;wakeInSession=false;captureOffset=0;instance.lang=options.getLanguage?.()||'en-GB';instance.continuous=true;instance.interimResults=true;instance.maxAlternatives=1;state='starting';notify();
      const current=()=>recognition===instance&&token===epoch&&valid();
      instance.onstart=()=>{if(!current())return;state=desired==='capture'?'listening':'wake';notify();options.onStart?.();watchScope();};
      instance.onresult=event=>{
        if(!current()||suspended||!visible())return;const parts=[];let latestFinal='';for(let i=0;i<event.results.length;i++){const result=event.results[i],text=clean(result?.[0]?.transcript);if(text)parts.push(text);if(i>=event.resultIndex&&result.isFinal&&text)latestFinal=text;}
        const heard=clean(parts.join(' '));if(!heard)return;retries=0;
        if(desired==='wake'){
          const match=/\b(?:(?:hey|hi|okay|ok)\s+)?vanessa\b[\s,.:;-]*/i.exec(heard);if(!match)return;desired='capture';owner=scope('capture');state='listening';sessionBase='';captureOffset=match.index+match[0].length;wakeInSession=true;setDraft(heard.slice(captureOffset));notify();options.onWake?.();armSend();return;
        }
        if(desired!=='capture')return;const body=wakeInSession?heard.slice(captureOffset).replace(/^[\s,.:;-]+/,''):heard,control=clean(latestFinal).toLowerCase().replace(/[.!?]+$/,'');
        if(/^(?:cancel (?:message|dictation)|stop listening)$/.test(control)){setDraft('');stop({clearDraft:true});options.onControl?.('stop');return;}
        let next=joinDraft(sessionBase,body);const explicitSend=/^(?:send|send it|send message|send the message)$/.test(control)||/\bsend (?:the )?message[.!?]*$/i.test(body);
        if(explicitSend){next=next.replace(/\s*\b(?:send(?: the)? message|send it|send)[.!?]*\s*$/i,'').trim();setDraft(next);submit();return;}
        setDraft(next);armSend();
      };
      instance.onerror=event=>{if(!current())return;const code=event.error||'unknown';if(['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(code)){clearTimer('send');blocked=true;state='blocked';clearTimer('restart');detach();notify();options.onError?.(code==='audio-capture'?'No microphone is available. Connect one, then tap the microphone again.':code==='language-not-supported'?'This browser cannot recognise the selected language. Choose a supported language or type instead.':'Microphone access was blocked. Allow microphone access for this site, then tap Wake or the microphone again.',code);return;}if(code==='network'){clearTimer('send');if(++retries>=3){blocked=true;state='blocked';detach();notify();options.onError?.('Speech recognition could not reach its service. Check the connection, then tap the microphone to retry.',code);return;}}if(code!=='aborted'&&code!=='no-speech')options.onError?.('Voice input paused. Your words are kept while Vanessa reconnects.',code);};
      instance.onend=()=>{if(!current())return;recognition=null;restart();};
      try{instance.start();}catch(error){if(recognition!==instance)return;recognition=null;if(['NotAllowedError','SecurityError'].includes(error?.name)){blocked=true;state='blocked';notify();options.onError?.('Tap Wake or the microphone to enable voice. The browser requires microphone permission and an active page.','not-allowed');}else{retries++;if(retries>=3){blocked=true;state='blocked';notify();options.onError?.('Voice input could not start. Tap the microphone to try again.','start-failed');}else restart();}}
    }
    function start(mode,{text='',sendAfterMs=0}={}){detach();clearTimer('restart');clearTimer('send');desired=mode;owner=scope(mode);if(!owner){stop({clearDraft:true});return;}suspended=false;blocked=false;retries=0;pauseMs=[3500,6000].includes(Number(sendAfterMs))?Number(sendAfterMs):0;if(mode==='capture')setDraft(text);else setDraft('');watchScope();begin();}
    function submit(text=draft){if(!valid()||desired!=='capture')return false;const value=clean(text);if(!value)return false;if(options.canSubmit?.()===false){clearTimer('send');options.onError?.('Your words are kept. Let the current response finish, or stop it before sending this request.','busy');return false;}const submittedOwner=owner;clearTimer('send');clearTimer('restart');detach();desired='wake';owner=scope('wake');state='paused';suspended=true;setDraft('');notify();if(scope('capture')===submittedOwner)options.onSubmit?.(value);return true;}
    function finish(){if(desired!=='capture')return;clearTimer('send');clearTimer('restart');clearTimer('scope');detach();desired='off';state='off';suspended=false;notify();}
    function setPause(ms){pauseMs=[3500,6000].includes(Number(ms))?Number(ms):0;armSend();notify();}
    return {startWake:()=>start('wake'),startCapture:settings=>start('capture',settings),submit,finish,stop,suspend,resume,setPause,snapshot};
  }
  return {create,joinDraft};
});
