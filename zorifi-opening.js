/* Zorifi's startup gate and one-time new-account tour. */
(function(global){
  'use strict';
  const TOUR='assets/tutorial/zorifi-tour.mp4';
  const POSTER='assets/tutorial/zorifi-tour-poster.svg';
  const CAPTIONS='assets/tutorial/zorifi-tour.vtt';
  const TOUR_PENDING='zorifi-tour-pending-v1:';
  const TOUR_SEEN='zorifi-tour-seen-v1:';
  const CHAPTERS=[
    {at:0,title:'Find your space',copy:'Start on Home, switch between Edit and Music projects, or open Social from the Studio switcher.'},
    {at:4,title:'Build an edit',copy:'Create a project, import your own media, and drag clips from Media to the timeline.'},
    {at:8,title:'Shape the cut',copy:'Move or trim timeline clips, add text and effects, then preview and export your finished edit.'},
    {at:12,title:'Make music',copy:'Open Music studio to arrange audio, inspect waveforms, detect beats, mix, and export a soundtrack.'},
    {at:16,title:'Ask Vanessa',copy:'Open Vanessa to brainstorm, ask a question, or request a supported creative action. Online AI requires your privacy choice and connection.'},
    {at:20,title:'Keep creating',copy:'Your Studio projects and original media remain on this device. Social sharing is a separate, explicit action where available.'}
  ];
  const reduced=()=>global.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  const store=(type,key,value)=>{try{if(value!==undefined)global[type].setItem(key,value);return global[type].getItem(key);}catch{return null;}};
  function startOpening(){
    const layer=document.querySelector('.zorifi-opening');
    if(!layer)return {ready(){}};
    const status=layer.querySelector('[data-opening-status]');
    const retry=layer.querySelector('.zorifi-opening-retry');
    let appReady=false,loaded=document.readyState==='complete',failed=layer.dataset.bootFailed==='true',finished=false;
    const slowTimer=global.setTimeout(()=>{
      if(finished||failed)return;
      status.textContent='Still preparing your workspace. You can wait or reload.';
      retry.hidden=false;
    },20000);
    const fail=()=>{
      if(finished||failed)return;
      failed=true;global.clearTimeout(slowTimer);
      status.textContent='A required Zorifi file could not load. Check your connection and reload.';
      layer.setAttribute('aria-label','Zorifi could not open');
      layer.setAttribute('aria-busy','false');
      retry.hidden=false;
    };
    const finish=()=>{
      if(finished||failed||!loaded||!appReady||!document.querySelector('#app > *'))return;
      finished=true;global.clearTimeout(slowTimer);
      layer.setAttribute('aria-busy','false');
      layer.classList.add('is-closing');
      global.setTimeout(()=>layer.remove(),180);
    };
    const check=()=>{
      if(finished||failed||!loaded||!appReady)return;
      if(document.visibilityState==='hidden')finish();
      else global.requestAnimationFrame(finish);
    };
    global.addEventListener('error',event=>{
      const target=event.target;
      if(target instanceof HTMLScriptElement||(target instanceof HTMLLinkElement&&target.rel==='stylesheet'))fail();
    },true);
    if(!loaded)global.addEventListener('load',()=>{loaded=true;check();},{once:true});
    return {ready(){appReady=true;check();},fail};
  }
  function playerMarkup(){
    return `<video controls playsinline preload="metadata" poster="${POSTER}" aria-label="An illustrated tour of the Zorifi Studio, editor, Music studio, Vanessa and Social"><source src="${TOUR}" type="video/mp4"><track kind="captions" src="${CAPTIONS}" srclang="en" label="English" default></video>`;
  }
  function markNewAccount(accountId){if(typeof accountId==='string'&&accountId&&store('localStorage',TOUR_SEEN+accountId)!=='seen')store('localStorage',TOUR_PENDING+accountId,'yes');}
  let waitingForTour=null;
  function showPending(accountId,isReady=()=>true){
    if(typeof accountId!=='string'||!accountId||store('localStorage',TOUR_PENDING+accountId)!=='yes'||store('localStorage',TOUR_SEEN+accountId)==='seen')return;
    if(waitingForTour?.accountId===accountId)return;
    waitingForTour?.observer.disconnect();
    const pending={accountId,observer:null};waitingForTour=pending;
    const attempt=()=>{
      if(waitingForTour!==pending)return;
      if(!isReady()||document.querySelector('.beta-welcome-backdrop,.modal-backdrop,.zorifi-opening'))return;
      if(!document.querySelector('main.home-screen'))return;
      pending.observer.disconnect();waitingForTour=null;
      store('localStorage',TOUR_SEEN+accountId,'seen');
      try{global.localStorage.removeItem(TOUR_PENDING+accountId);}catch{}
      openTour();
    };
    pending.observer=new MutationObserver(attempt);
    pending.observer.observe(document.body,{childList:true,subtree:false});
    const app=document.getElementById('app');if(app)pending.observer.observe(app,{childList:true,subtree:false});
    setTimeout(attempt,0);
  }
  let active=null;
  function openTour(){
    if(active){active.querySelector('video')?.play().catch(()=>{});return active;}
    const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
    const layer=document.createElement('div');layer.className='zorifi-tour-backdrop';layer.innerHTML=`<section class="zorifi-tour-dialog" role="dialog" aria-modal="true" aria-labelledby="zorifi-tour-title"><header class="zorifi-tour-head"><span class="zorifi-tour-head-mark" aria-hidden="true"><img src="icons/favicon-64.png?v=231" alt=""></span><div><small class="zorifi-tour-kicker">The Zorifi flight path</small><h2 id="zorifi-tour-title">A tour of your creative workspace</h2></div><button class="zorifi-tour-close" type="button" data-tour-close aria-label="Close tutorial">×</button></header><div class="zorifi-tour-player">${playerMarkup()}<div class="zorifi-tour-fallback" hidden><div><strong>Explore Zorifi at your pace</strong><p>The video cannot play in this browser. Choose a chapter below for the same steps.</p></div></div></div><div class="zorifi-tour-details"><p data-tour-copy role="status">${CHAPTERS[0].copy}</p><nav class="zorifi-tour-chapters" aria-label="Tutorial chapters">${CHAPTERS.map((part,index)=>`<button type="button" data-tour-chapter="${index}" aria-current="${index===0}"><span>${String(index+1).padStart(2,'0')}</span>${part.title}</button>`).join('')}</nav><small>Illustrated interface guide · silent playback · projects stay on this device</small></div></section>`;
    document.body.append(layer);document.body.style.overflow='hidden';active=layer;
    const video=layer.querySelector('video'),copy=layer.querySelector('[data-tour-copy]'),chapterButtons=[...layer.querySelectorAll('[data-tour-chapter]')];
    let lastChapter=-1;
    function chapter(index){if(index===lastChapter)return;lastChapter=index;copy.textContent=CHAPTERS[index].copy;chapterButtons.forEach((button,i)=>button.setAttribute('aria-current',String(i===index)));}
    function close(){if(active!==layer)return;video.pause();active=null;layer.remove();document.body.style.overflow=previousOverflow;if(previousFocus?.isConnected)previousFocus.focus();}
    layer.querySelector('[data-tour-close]').addEventListener('click',close);
    layer.addEventListener('click',event=>{if(event.target===layer)close();});
    layer.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Tab'){const focusable=[...layer.querySelectorAll('button,video[controls]')];const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    video.addEventListener('timeupdate',()=>{const t=video.currentTime;let index=CHAPTERS.length-1;while(index>0&&t<CHAPTERS[index].at)index--;chapter(index);});
    video.addEventListener('error',()=>{video.hidden=true;layer.querySelector('.zorifi-tour-fallback').hidden=false;});
    chapterButtons.forEach((button,index)=>button.addEventListener('click',()=>{chapter(index);if(video.error)return;try{video.currentTime=CHAPTERS[index].at;}catch{}void video.play().catch(()=>{});}));
    layer.querySelector('[data-tour-close]').focus();
    if(!reduced())void video.play().catch(()=>{});
    return layer;
  }
  global.ZorifiOpening=startOpening();
  global.ZorifiTour={open:openTour,markNewAccount,showPending,chapters:CHAPTERS.map(({at,title,copy})=>({at,title,copy}))};
})(window);
