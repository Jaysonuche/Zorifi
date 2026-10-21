/* Zorifi's silent launch and illustrated product tour. Never gates auth or routes. */
(function(global){
  'use strict';
  const TOUR='assets/tutorial/zorifi-tour.mp4';
  const POSTER='assets/tutorial/zorifi-tour-poster.svg';
  const CAPTIONS='assets/tutorial/zorifi-tour.vtt';
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
    const params=new URLSearchParams(global.location.search);
    if(reduced()||['code','state','error','error_description'].some(key=>params.has(key))||store('sessionStorage','zorifi-opening-226')==='seen')return;
    store('sessionStorage','zorifi-opening-226','seen');
    const layer=document.createElement('div');layer.className='zorifi-opening';layer.setAttribute('role','status');layer.setAttribute('aria-label','Zorifi is opening');
    layer.innerHTML='<div class="zorifi-opening-grid" aria-hidden="true"></div><div class="zorifi-opening-core" aria-hidden="true"><div class="zorifi-opening-iris"></div><div class="zorifi-opening-mark"><span>Z</span></div><div class="zorifi-opening-scan"></div></div><div class="zorifi-opening-copy"><strong>ZORIFI</strong><small>Create in motion</small></div><button class="zorifi-opening-skip" type="button">Skip intro</button>';
    document.body.append(layer);requestAnimationFrame(()=>layer.classList.add('is-live'));
    let gone=false;
    const dismiss=()=>{if(gone)return;gone=true;clearTimeout(timer);layer.classList.remove('is-live');setTimeout(()=>layer.remove(),200);};
    const timer=setTimeout(dismiss,1550);
    layer.querySelector('button').addEventListener('click',dismiss);
    global.addEventListener('pagehide',dismiss,{once:true});
  }
  function playerMarkup({preview=false}={}){
    const attrs=preview&&!reduced()?'autoplay muted loop':'controls';
    return `<video ${attrs} playsinline preload="metadata" poster="${POSTER}" aria-label="An illustrated tour of the Zorifi Studio, editor, Music studio, Vanessa and Social"><source src="${TOUR}" type="video/mp4"><track kind="captions" src="${CAPTIONS}" srclang="en" label="English"${preview?'':' default'}></video>`;
  }
  function tourButton(){const button=document.createElement('button');button.type='button';button.className='zorifi-tour-launch';button.setAttribute('data-zorifi-tour','');button.setAttribute('aria-label','Watch the Zorifi tutorial video');button.innerHTML='<span aria-hidden="true">▷</span> Watch tour';return button;}
  let motionObserver=null;
  function watchPreview(video){
    if(!video||reduced())return;
    if(!('IntersectionObserver' in global)){void video.play().catch(()=>{});return;}
    motionObserver??=new IntersectionObserver(entries=>{for(const entry of entries){const target=entry.target;if(!target.isConnected){motionObserver.unobserve(target);continue;}if(entry.isIntersecting)void target.play().catch(()=>{});else target.pause();}},{threshold:.15});
    motionObserver.observe(video);
  }
  function decorate(){
    const home=document.querySelector('main.home-screen');
    if(home){
      const header=home.querySelector('.home-topbar'),avatar=header?.querySelector('[data-account-settings]');
      if(header&&avatar&&!header.querySelector('[data-zorifi-tour]'))header.insertBefore(tourButton(),avatar);
      const sidebar=home.querySelector('.launch-sidebar .launch-sidebar-spacer');
      if(sidebar&&!home.querySelector('.launch-sidebar [data-zorifi-tour]'))sidebar.after(tourButton());
      const content=home.querySelector('.home-content'),anchor=content?.querySelector('.touch-studio-actions');
      if(content&&anchor&&!content.querySelector('.zorifi-tour-card')){
        const card=document.createElement('section');card.className='zorifi-tour-card';card.setAttribute('aria-label','Getting started video');
        card.innerHTML=`<div class="zorifi-tour-card-copy"><small>First flight · 24 seconds</small><h2>Meet your creative cockpit.</h2><p>Watch a moving guide to editing, Music studio, Vanessa, and your projects. Made for every screen.</p><button type="button" data-zorifi-tour>Watch guided tour ↗</button></div><div class="zorifi-tour-card-video">${playerMarkup({preview:true})}</div>`;
        anchor.after(card);watchPreview(card.querySelector('video'));
      }
    }
    const auth=document.querySelector('.auth-screen .auth-card');
    if(auth&&!auth.querySelector('[data-zorifi-tour]'))auth.querySelector('.auth-subtitle')?.after(tourButton());
    for(const selector of ['main[data-view="editor"] .topbar','main[data-view="music-editor"] .music-topbar']){
      const bar=document.querySelector(selector),target=bar?.querySelector('.avatar-button');
      if(bar&&target&&!bar.querySelector('[data-zorifi-tour]'))bar.insertBefore(tourButton(),target);
    }
    const account=document.querySelector('.account-modal [data-account-form]');
    if(account&&!account.querySelector('[data-zorifi-tour]'))account.append(tourButton());
  }
  let queued=false;
  function scheduleDecorate(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate();});}
  let active=null;
  function openTour(){
    if(active){active.querySelector('video')?.play().catch(()=>{});return active;}
    const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
    const layer=document.createElement('div');layer.className='zorifi-tour-backdrop';layer.innerHTML=`<section class="zorifi-tour-dialog" role="dialog" aria-modal="true" aria-labelledby="zorifi-tour-title"><header class="zorifi-tour-head"><span class="zorifi-tour-head-mark" aria-hidden="true">Z</span><div><small class="zorifi-tour-kicker">The Zorifi flight path</small><h2 id="zorifi-tour-title">A tour of your creative workspace</h2></div><button class="zorifi-tour-close" type="button" data-tour-close aria-label="Close tutorial">×</button></header><div class="zorifi-tour-player">${playerMarkup()}<div class="zorifi-tour-fallback" hidden><div><strong>Explore Zorifi at your pace</strong><p>The video cannot play in this browser. Choose a chapter below for the same steps.</p></div></div></div><div class="zorifi-tour-details"><p data-tour-copy role="status">${CHAPTERS[0].copy}</p><nav class="zorifi-tour-chapters" aria-label="Tutorial chapters">${CHAPTERS.map((part,index)=>`<button type="button" data-tour-chapter="${index}" aria-current="${index===0}"><span>${String(index+1).padStart(2,'0')}</span>${part.title}</button>`).join('')}</nav><small>Illustrated interface guide · silent playback · projects stay on this device</small></div></section>`;
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
  document.addEventListener('click',event=>{const button=event.target.closest?.('[data-zorifi-tour]');if(button){event.preventDefault();event.stopPropagation();openTour();}},true);
  startOpening();scheduleDecorate();new MutationObserver(scheduleDecorate).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  global.ZorifiTour={open:openTour,chapters:CHAPTERS.map(({at,title,copy})=>({at,title,copy}))};
})(window);
