(function(){
  'use strict';
  const privacy=window.ZorifiPrivacy;
  function scope(){return typeof currentUser!=='undefined'?currentUser?.id||'guest':'guest';}
  function download(value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='zorifi-personal-data.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  window.showPrivacySettings=function(){
    document.querySelector('[data-privacy-dialog]')?.remove();
    const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.dataset.privacyDialog='';
    const modal=document.createElement('div');modal.className='modal privacy-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Privacy and data');
    modal.innerHTML=`<header><h2>Privacy &amp; data</h2><button type="button" data-close aria-label="Close privacy">×</button></header><div class="privacy-scroll">${privacy.SECTIONS.map(([title,body])=>`<section><h3>${title}</h3><p>${body}</p></section>`).join('')}<section><label class="privacy-choice"><input type="checkbox" data-ai-consent ${privacy.consent(localStorage,scope())?'checked':''}> Allow optional AI processing</label><p>You can withdraw this choice here. Local editing stays available.</p></section><section><button type="button" class="secondary-btn" data-export-privacy>Export my local metadata</button><p>Includes this profile, saved project metadata and account-scoped preferences. Does not include other accounts, authentication secrets, original media binaries, or cloud/provider records.</p></section><section><a href="mailto:${privacy.CONFIG.email}?subject=Zorifi%20privacy%20request">Request access, correction or deletion</a></section><section><button type="button" class="secondary-btn" data-erase-privacy>Erase local editor data</button><p>Erases all Zorifi accounts, projects, imported media copies, cases and memory in this browser/profile. Original source files, exported backups, cloud/provider records, billing and desktop provider credentials are separate.</p></section><p data-privacy-status role="status"></p></div><footer><small>Notice ${privacy.CONFIG.version} · ${privacy.CONFIG.controller}</small><button type="button" data-close class="primary-btn">Done</button></footer>`;
    wrap.appendChild(modal);document.body.appendChild(wrap);
    const status=modal.querySelector('[data-privacy-status]');
    const close=()=>wrap.remove();modal.querySelectorAll('[data-close]').forEach(button=>button.onclick=close);
    modal.querySelector('[data-ai-consent]').onchange=event=>{try{privacy.setConsent(localStorage,scope(),event.target.checked);status.textContent=event.target.checked?'Optional AI is enabled for this profile.':'Optional AI is disabled. Requests already sent cannot be recalled automatically.';}catch{event.target.checked=false;status.textContent='Your choice could not be saved. AI remains unavailable.';}};
    modal.querySelector('[data-export-privacy]').onclick=()=>download(privacy.exportMetadata(localStorage,typeof currentUser==='undefined'?null:currentUser,typeof getSavedProjects==='function'?getSavedProjects():[]));
    modal.querySelector('[data-erase-privacy]').onclick=async event=>{
      if(!confirm('Erase every Zorifi local account and project in this browser/profile, including imported media copies? Back up your work first. Cloud accounts, external backups, billing and desktop provider credentials will remain.'))return;
      event.target.disabled=true;status.textContent='Erasing local editor data…';
      try{
        if(typeof stopProjectPlayback==='function')stopProjectPlayback('privacy-erasure');
        if(typeof autosaveTimer!=='undefined')clearTimeout(autosaveTimer);
        if(typeof firebaseGateway!=='undefined')firebaseGateway.signOut();
        if(typeof openMediaDatabase==='function'){
          const db=await openMediaDatabase();
          await new Promise((resolve,reject)=>{const transaction=db.transaction([...db.objectStoreNames],'readwrite');for(const name of db.objectStoreNames)transaction.objectStore(name).clear();transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
          db.close();
        }
        for(const key of privacy.localKeys(localStorage))localStorage.removeItem(key);
        for(const key of privacy.localKeys(sessionStorage))sessionStorage.removeItem(key);
        if(typeof currentUser!=='undefined')currentUser=null;
        if(typeof state!=='undefined'){state.projectId=null;state.clips=[];state.mediaAssets=[];}
        location.reload();
      }catch{event.target.disabled=false;status.textContent='Erasure could not finish. Some data may already have been removed. Retry before closing this profile.';}
    };
    modal.querySelector('[data-close]').focus();
    modal.addEventListener('keydown',event=>{if(event.key==='Escape')close();if(event.key==='Tab'){const focusable=[...modal.querySelectorAll('button,input,a')].filter(node=>!node.disabled);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  };
  function install(){let button=document.getElementById('privacy-shortcut');if(!button){button=document.createElement('button');button.id='privacy-shortcut';button.className='privacy-shortcut';button.type='button';button.onclick=()=>{if(typeof currentUser!=='undefined'&&currentUser&&window.ZorifiAppSettings?.open)window.ZorifiAppSettings.open();else window.showPrivacySettings();};}const label=typeof currentUser!=='undefined'&&currentUser?'Settings':'Privacy & data';if(button.textContent!==label)button.textContent=label;button.setAttribute('aria-label',label==='Settings'?'Open settings':'Open privacy and data');button.title=label;const host=[...document.querySelectorAll('.topbar,.home-topbar,.terms-topbar,.music-topbar,.ai-create-topbar,.scenes-header')].find(node=>node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0),parent=host||document.body;if(host)delete button.dataset.floating;else button.dataset.floating='true';if(button.parentElement!==parent)parent.appendChild(button);}
  const style=document.createElement('style');style.textContent='.privacy-shortcut{flex:0 0 auto;border:1px solid #8260c4;border-radius:8px;padding:7px 10px;background:#191323;color:#e3d6ff;font-size:11px;cursor:pointer}.privacy-shortcut[data-floating]{position:fixed;left:12px;bottom:12px;z-index:80}.privacy-modal{width:min(680px,94vw);max-height:90dvh;display:flex;flex-direction:column;padding:20px}.privacy-modal>header,.privacy-modal>footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.privacy-modal>header button{min-width:36px;min-height:36px}.privacy-scroll{overflow:auto;margin:12px 0;min-height:0}.privacy-scroll section{margin:0 0 20px}.privacy-scroll h3{font-size:15px;margin-bottom:8px}.privacy-scroll p{font-size:13px;line-height:1.6}.privacy-scroll a{color:#bca0ff;text-decoration:underline}.privacy-choice{display:flex;align-items:center;gap:10px;font-weight:700}.privacy-choice input{width:20px;height:20px}.privacy-modal small{font-size:11px}@media(max-width:600px){.topbar>.privacy-shortcut{font-size:9px;padding:6px}.privacy-shortcut[data-floating]{left:auto;right:12px;bottom:104px}.privacy-modal{padding:16px}}';document.head.appendChild(style);
  install();window.addEventListener('resize',install);new MutationObserver(install).observe(document.getElementById('app'),{childList:true,subtree:true});
})();
