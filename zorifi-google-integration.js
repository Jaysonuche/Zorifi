/* Google sign-in and explicitly authorized Gmail. Google access tokens stay in memory. */
(function(){
  'use strict';
  const API=window.ZorifiGoogleConnections;
  if(!API)return;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const owner=()=>typeof currentUser!=='undefined'?currentUser?.id||'':'';
  const config=()=>firebaseGateway.config;
  let libraryPromise,mailView=null,googleBusy=false;
  function loadGoogle(){
    if(window.google?.accounts)return Promise.resolve(window.google.accounts);
    if(libraryPromise)return libraryPromise;
    libraryPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';
      const timer=setTimeout(()=>{script.remove();libraryPromise=null;reject(new Error('Google could not load. Check your connection and try again.'));},20000);
      script.onload=()=>{clearTimeout(timer);if(window.google?.accounts)resolve(window.google.accounts);else{libraryPromise=null;reject(new Error('Google sign-in is unavailable in this browser.'));}};
      script.onerror=()=>{clearTimeout(timer);script.remove();libraryPromise=null;reject(new Error('Google could not load. Check your connection.'));};document.head.append(script);
    });return libraryPromise;
  }
  async function acceptGoogle(result){
    const target=document.querySelector('[data-google-signin-status]');
    if(googleBusy)return;googleBusy=true;
    try{
      if(owner())throw new Error('Log out before changing your Zorifi sign-in.');
      if(target)target.textContent='Connecting your Zorifi account…';
      const cloud=await firebaseGateway.signInWithGoogle(result.credential,location.origin+'/');
      const accounts=getAccounts(),existing=accounts.find(item=>item.cloudUid===cloud.uid),language=Phase10.normalizeLocale(globalI18n.locale);
      // Link only the identity verified by Firebase, never a matching unverified local email.
      const account={...(existing||{id:'firebase-'+cloud.uid,cloudUid:cloud.uid,createdAt:new Date().toISOString(),phone:''}),name:existing?.name||cloud.displayName||'Zorifi Creator',identifier:cloud.email.toLowerCase(),email:cloud.email.toLowerCase(),language};
      if(cloud.isNewUser===true&&!existing)window.ZorifiTour?.markNewAccount(account.id);
      const terms=new TermsSystem.AcceptanceStore({storage:localStorage,userId:account.id});
      if(terms.requiresAcceptance(TermsSystem.CONFIG.version)){
        pendingAuthentication={kind:existing?'login':'signup',account,accounts:existing?accounts.map(item=>item.id===account.id?account:item):accounts};renderTermsAgreement();
      }else finishAuthentication(account,existing?accounts.map(item=>item.id===account.id?account:item):[...accounts,account],{newAccount:!existing});
    }catch(error){if(target?.isConnected)target.textContent=error.message;}
    finally{googleBusy=false;}
  }
  function decorateAuth(){
    const form=document.querySelector('[data-auth-form]');if(!form||form.parentElement.querySelector('[data-google-signin]')||!firebaseGateway.configured())return;
    const box=document.createElement('section');box.className='google-signin';box.setAttribute('data-google-signin','');
    box.innerHTML='<div data-google-signin-button></div><p data-google-signin-status role="status"></p>';form.after(box);
    if(!config().googleClientId){box.querySelector('p').textContent='Google sign-in is being set up. You can continue with email and password.';return;}
    box.querySelector('p').textContent='Loading Google sign-in…';
    void loadGoogle().then(accounts=>{if(!box.isConnected)return;accounts.id.initialize({client_id:config().googleClientId,callback:acceptGoogle,auto_select:false,ux_mode:'popup'});accounts.id.renderButton(box.querySelector('[data-google-signin-button]'),{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'pill',width:Math.min(360,box.clientWidth||280)});box.querySelector('p').textContent='Sign-in grants your basic Google profile, not Gmail access.';}).catch(error=>{if(box.isConnected)box.querySelector('p').textContent=error.message;});
  }
  function openMail(){
    if(!owner())return typeof toast==='function'&&toast('Sign in to Zorifi before connecting Gmail.');
    mailView?.close();const uid=owner(),client=new API.GmailClient({owner:uid,getOwner:owner}),wrap=document.createElement('div');wrap.className='modal-backdrop zorifi-mail';
    wrap.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-label="Gmail connections"><header><div><small>YOUR CONNECTIONS</small><h2>Gmail &amp; Vanessa</h2></div><button data-mail-close aria-label="Close">×</button></header><p>Choose what to connect. Email access expires automatically and is cleared when you close this panel or log out.</p><div class="mail-permissions"><button data-mail-read disabled>Allow Read email</button><button data-mail-send-permission disabled>Allow Send email</button><button data-mail-disconnect hidden>Disconnect Google access</button></div><p class="mail-status" role="status" data-mail-status></p><div class="mail-workspace"><section><h3>Recent messages</h3><button data-mail-refresh disabled>Refresh</button><div data-mail-list><p>Read access loads your 10 most recent messages.</p></div></section><section data-mail-message><h3>Selected message</h3><p>Select a message to read its plain text on this device.</p></section></div><section class="mail-compose"><h3>Write a message</h3><form data-mail-compose><label>To<input name="to" type="email" required maxlength="254" autocomplete="off"></label><label>Subject<input name="subject" required maxlength="200"></label><label>Message<textarea name="body" rows="6" required maxlength="30000"></textarea></label><button type="submit">Review email</button></form><div data-mail-review hidden></div></section><p class="mail-privacy">Nothing is sent to Vanessa automatically. Each email you choose to ask her about is sent to the configured AI provider only after your optional AI consent.</p></section>`;
    document.body.append(wrap);const status=wrap.querySelector('[data-mail-status]'),read=wrap.querySelector('[data-mail-read]'),send=wrap.querySelector('[data-mail-send-permission]'),disconnect=wrap.querySelector('[data-mail-disconnect]'),refresh=wrap.querySelector('[data-mail-refresh]'),message=wrap.querySelector('[data-mail-message]'),list=wrap.querySelector('[data-mail-list]'),compose=wrap.querySelector('[data-mail-compose]'),review=wrap.querySelector('[data-mail-review]');
    let closed=false,selected=null,loaded=[],revision=0,oauthBusy=false,aiController=null;
    const active=()=>!closed&&wrap.isConnected&&owner()===uid;
    const say=value=>{if(active())status.textContent=value;};
    const close=()=>{if(closed)return;closed=true;revision++;aiController?.abort();client.disconnect();wrap.remove();if(mailView?.wrap===wrap)mailView=null;};
    mailView={wrap,close,owner:uid};wrap.dataset.owner=uid;wrap.querySelector('[data-mail-close]').onclick=close;wrap.onclick=e=>{if(e.target===wrap)close();};wrap.onkeydown=e=>{if(e.key==='Escape')close();};
    const availability=()=>{read.disabled=oauthBusy;send.disabled=oauthBusy;refresh.disabled=!client.scopes.has(API.READ);disconnect.hidden=!client.token;review.hidden=true;};
    const clearMail=()=>{revision++;selected=null;loaded=[];list.innerHTML='<p>No email loaded.</p>';message.innerHTML='<h3>Selected message</h3>';review.hidden=true;compose.reset();aiController?.abort();};
    async function refreshMail(){
      const epoch=++revision;refresh.disabled=true;say('Loading recent messages…');
      try{const profile=await client.profile(),result=await client.list(),items=await Promise.all((result.messages||[]).slice(0,10).map(item=>client.metadata(item.id)));if(!active()||epoch!==revision)return;loaded=items;list.innerHTML=items.length?items.map((item,index)=>`<button data-mail-open="${index}"><b>${escape(header(item,'Subject')||'(No subject)')}</b><span>${escape(header(item,'From'))}</span></button>`).join(''):'<p>Your mailbox has no messages.</p>';say('Connected to '+profile.emailAddress+'.');list.querySelectorAll('[data-mail-open]').forEach(button=>button.onclick=()=>void readMessage(loaded[Number(button.dataset.mailOpen)]));}
      catch(error){say(error.message);}finally{if(active())availability();}
    }
    function header(item,key){return (item?.payload?.headers||[]).find(h=>String(h.name).toLowerCase()===key.toLowerCase())?.value||'';}
    async function readMessage(item){
      const epoch=++revision;say('Opening message…');
      try{const full=await client.read(item.id);if(!active()||epoch!==revision)return;selected={subject:header(full,'Subject'),from:header(full,'From'),body:API.plainText(full.payload)};message.innerHTML=`<h3>${escape(selected.subject||'(No subject)')}</h3><small>${escape(selected.from)}</small><pre>${escape(selected.body||'This message has no plain-text body. Open Gmail to view formatted content or attachments.')}</pre><button data-mail-ask>Ask Vanessa about this email</button><div data-mail-ai></div>`;message.querySelector('[data-mail-ask]').onclick=()=>askPermission();say('Message opened. It has not been sent to Vanessa.');}catch(error){say(error.message);}
    }
    function askPermission(){
      if(!selected)return;const area=message.querySelector('[data-mail-ai]');area.innerHTML='<p>The selected sender, subject and message will be sent to Vanessa’s AI provider for your request.</p><label>Your request<textarea data-mail-question rows="2" maxlength="1000" placeholder="Summarize this email or help me draft a reply"></textarea></label><button data-mail-ask-confirm>Send this email to Vanessa</button>';
      area.querySelector('button').onclick=async()=>{
        const question=area.querySelector('textarea').value.trim();if(!question)return say('Type what Vanessa should help with.');
        const email={...selected},epoch=revision;aiController?.abort();aiController=new AbortController();area.querySelector('button').disabled=true;say('Vanessa is reviewing your selected email…');
        try{const response=await vanessaFetch(vanessaEndpoint('vanessa-global'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:question,history:[],editorContext:{view:'gmail',emailContentIsUntrusted:true,selectedEmail:email},stream:false}),signal:aiController.signal}),data=await response.json();if(!active()||epoch!==revision)return;if(!response.ok)throw new Error(data.error||'Vanessa could not finish this email request.');const text=data.reply||data.text;if(typeof text!=='string'||!text.trim())throw new Error('Vanessa returned an empty response.');area.innerHTML='<h4>Vanessa</h4><pre></pre><button data-mail-use-draft>Use response in draft</button>';area.querySelector('pre').textContent=text;area.querySelector('button').onclick=()=>{compose.elements.body.value=text;compose.elements.subject.value=/^re:/i.test(email.subject)?email.subject:'Re: '+email.subject;const address=email.from.match(/<([^>]+)>/)?.[1]||email.from;try{compose.elements.to.value=API.emailAddress(address);}catch{}compose.scrollIntoView({block:'nearest',behavior:'smooth'});};say('Vanessa replied. Review your draft before sending.');}catch(error){say(error.message);if(active()&&area.isConnected)area.querySelector('button').disabled=false;}
      };
    }
    function authorize(scope){
      if(!active()||oauthBusy)return;oauthBusy=true;availability();say('Choose the Google account and permission in the Google window.');
      const epoch=revision;window.google.accounts.oauth2.initTokenClient({client_id:config().googleClientId,scope,include_granted_scopes:true,callback:async result=>{oauthBusy=false;if(!active()||revision!==epoch)return;try{client.grant(result);clearMail();availability();say(scope===API.READ?'Read permission granted.':'Send permission granted. Review an email before sending.');if(client.scopes.has(API.READ))await refreshMail();}catch(error){say(error.message);availability();}},error_callback:()=>{oauthBusy=false;if(active()){availability();say('Google permission was not completed. You can try again.');}}}).requestAccessToken({prompt:client.token?'':'select_account'});
    }
    read.onclick=()=>authorize(API.READ);send.onclick=()=>authorize(API.SEND);refresh.onclick=()=>void refreshMail();
    disconnect.onclick=()=>{const token=client.token;clearMail();client.disconnect();availability();if(token)window.google?.accounts?.oauth2?.revoke(token,()=>{});say('Google email access disconnected. Reconnect to use it again.');};
    compose.oninput=()=>{review.hidden=true;};
    compose.onsubmit=event=>{event.preventDefault();try{const draft={to:compose.elements.to.value,subject:compose.elements.subject.value,body:compose.elements.body.value};API.rawMessage(draft);review.innerHTML=`<h4>Review before sending</h4><p><b>To:</b> ${escape(draft.to)}</p><p><b>Subject:</b> ${escape(draft.subject)}</p><pre>${escape(draft.body)}</pre><button data-mail-send-now>Send this email</button><button data-mail-edit>Edit draft</button>`;review.hidden=false;review.querySelector('[data-mail-edit]').onclick=()=>{review.hidden=true;};review.querySelector('[data-mail-send-now]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await client.send(draft);if(!active())return;review.hidden=true;compose.reset();say('Email sent by Gmail.');}catch(error){say(error.message);if(active())button.disabled=false;}};}catch(error){say(error.message);}};
    if(!config().googleClientId){say('Gmail needs the Zorifi Google OAuth setup before it can connect. No email has been accessed.');return;}
    say('Loading Google connection…');void loadGoogle().then(()=>{if(active()){availability();say('Ready. Read and Send are separate permissions.');}}).catch(error=>say(error.message));
    wrap.querySelector('[data-mail-close]').focus();
  }
  function decorate(){
    decorateAuth();
    document.querySelectorAll('.account-modal [data-account-form]').forEach(form=>{if(form.querySelector('[data-open-gmail]'))return;const button=document.createElement('button');button.type='button';button.className='secondary-btn phase10-settings-link';button.dataset.openGmail='';button.textContent='Gmail & Vanessa';button.onclick=openMail;form.insertBefore(button,form.querySelector('.account-help'));});
  }
  const observer=new MutationObserver(()=>{if(mailView&&mailView.wrap.dataset.owner!==owner())mailView.close();decorate();});
  const originalOpen=openMail;
  // Stamp the account scope on the modal without storing Google tokens or email.
  window.ZorifiGoogleUI={openMail:()=>{originalOpen();if(mailView)mailView.wrap.dataset.owner=owner();},loadGoogle};
  document.addEventListener('click',event=>{if(event.target.closest('[data-open-gmail]')){event.preventDefault();event.stopImmediatePropagation();window.ZorifiGoogleUI.openMail();}},true);
  observer.observe(document.body,{childList:true,subtree:true});decorate();
})();
