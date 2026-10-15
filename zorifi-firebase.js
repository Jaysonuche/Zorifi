(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.ZorifiFirebase=api;root.ZorifiCloudSyncEngine=api.ZorifiCloudSyncEngine;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clean=value=>String(value||'').trim();
  function normalizeConfig(value={}){
    return {apiKey:clean(value.apiKey).slice(0,300),authDomain:clean(value.authDomain).slice(0,300),projectId:clean(value.projectId).replace(/[^a-z0-9-]/gi,'').slice(0,100),appId:clean(value.appId).slice(0,300)};
  }
  function decodeField(value){
    if(!value||typeof value!=='object')return null;
    if('stringValue'in value)return value.stringValue;
    if('booleanValue'in value)return Boolean(value.booleanValue);
    if('integerValue'in value)return Number(value.integerValue);
    if('doubleValue'in value)return Number(value.doubleValue);
    if('timestampValue'in value)return value.timestampValue;
    if('nullValue'in value)return null;
    if('arrayValue'in value)return (value.arrayValue.values||[]).map(decodeField);
    if('mapValue'in value)return decodeDocument(value.mapValue.fields||{});
    return null;
  }
  function decodeDocument(fields={}){return Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,decodeField(value)]));}
  function encodeField(value){
    if(value===null||value===undefined)return {nullValue:null};
    if(typeof value==='boolean')return {booleanValue:value};
    if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
    if(Array.isArray(value))return {arrayValue:{values:value.map(encodeField)}};
    if(typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encodeField(item)]))}};
    return {stringValue:String(value).slice(0,10000)};
  }
  class FirebaseGateway{
    constructor(config={},transport=globalThis.fetch.bind(globalThis)){this.config=normalizeConfig(config);this.transport=transport;this.session=null;this.refreshPromise=null;this.refreshTimer=null;this.authEpoch=0;this.manager=null;}
    configured(){return Boolean(this.config.apiKey&&this.config.projectId);}
    requireConfig(){if(!this.configured())throw new Error('Firebase is not configured for this Zorifi build.');}
    async auth(action,email,password){this.requireConfig();const epoch=++this.authEpoch;this.clearRefreshTimer();this.session=null;this.refreshPromise=null;this.persistSession();if(!['signUp','signInWithPassword'].includes(action))throw new Error('Unsupported authentication operation.');const response=await this.transport(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(this.config.apiKey)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:clean(email),password:String(password||''),returnSecureToken:true})}),data=await response.json().catch(()=>({}));if(!response.ok||!data.idToken||!data.localId){const code=String(data.error?.message||'').split(' : ')[0];const message=({EMAIL_EXISTS:'An online account with this email already exists. Log in instead.',INVALID_PASSWORD:'The email or password is incorrect.',EMAIL_NOT_FOUND:'The email or password is incorrect.',INVALID_LOGIN_CREDENTIALS:'The email or password is incorrect.',OPERATION_NOT_ALLOWED:'Online email sign-in is not enabled for Zorifi. Contact support.',TOO_MANY_ATTEMPTS_TRY_LATER:'Too many attempts. Please try again later.',API_KEY_SERVICE_BLOCKED:'Online sign-in is blocked by the Firebase configuration. Contact support.'})[code]||'The account service could not authenticate these details.';throw new Error(message);}if(epoch!==this.authEpoch)throw new Error('Account session changed.');this.session={uid:data.localId,email:data.email||clean(email),idToken:data.idToken,refreshToken:data.refreshToken||'',expiresAt:Date.now()+(Number(data.expiresIn)||3600)*1000};this.persistSession();this.scheduleRefresh();return {...this.session,idToken:'[protected]',refreshToken:'[protected]'};}
    signUp(email,password){return this.auth('signUp',email,password);}
    signIn(email,password){return this.auth('signInWithPassword',email,password);}
    async getAccountRole(){
      const session=this.session;if(!session?.idToken)return 'member';
      const response=await this.authenticatedFetch('/api/vanessa-provider?service=account-permissions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+session.idToken},body:'{}'});
      if(!response.ok)throw new Error('Account permissions could not be checked.');
      const data=await response.json();
      if(this.session!==session||data.uid!==session.uid)throw new Error('Account session changed.');
      return data.role==='admin'?'admin':'member';
    }
    clearRefreshTimer(){if(this.refreshTimer!==null){clearTimeout(this.refreshTimer);this.refreshTimer=null;}}
    persistSession(){if(!this.manager?.storage)return;try{if(this.session)this.manager.storage.setItem(this.manager.key,JSON.stringify(this.session));else this.manager.storage.removeItem(this.manager.key);}catch{/* Storage may be unavailable; memory-only auth still works. */}}
    scheduleRefresh(delay){
      this.clearRefreshTimer();if(!this.manager||!this.session?.refreshToken)return;
      this.refreshTimer=setTimeout(()=>{this.refreshTimer=null;this.getIdToken().catch(()=>{if(this.manager&&this.session)this.scheduleRefresh(30000);});},delay??Math.max(1000,this.session.expiresAt-Date.now()-60000));
      this.refreshTimer?.unref?.();
    }
    initAuthTokenManager({storage,eventTarget=globalThis,documentTarget=globalThis.document,onRefresh=()=>{},onError=()=>{},onSessionChange=()=>{}}={}){
      this.stopAuthTokenManager();
      const key='zorifi-firebase-session:'+this.config.projectId;
      this.manager={storage,key,onRefresh,onError,onSessionChange};
      if(!this.session&&this.configured()&&storage){try{const saved=JSON.parse(storage.getItem(key)||'null');if(saved&&typeof saved.uid==='string'&&typeof saved.idToken==='string'&&typeof saved.refreshToken==='string'&&saved.refreshToken&&Number.isFinite(saved.expiresAt))this.session=saved;}catch{}}
      const wake=()=>{if(this.session&&documentTarget?.visibilityState!=='hidden')void this.getIdToken().catch(()=>{});};
      const sync=event=>{
        if(event.key!==key||event.storageArea!==storage)return;
        if(!event.newValue){if(this.session)this.signOut();return;}
        try{
          const saved=JSON.parse(event.newValue);
          if(!saved?.uid||!saved.idToken||!saved.refreshToken||!Number.isFinite(saved.expiresAt))return;
          if(this.session?.uid===saved.uid&&this.session?.idToken===saved.idToken)return;
          this.authEpoch++;this.clearRefreshTimer();this.refreshPromise=null;this.session=saved;this.scheduleRefresh();this.manager?.onSessionChange(saved);
        }catch{}
      };
      eventTarget?.addEventListener?.('online',wake);documentTarget?.addEventListener?.('visibilitychange',wake);
      eventTarget?.addEventListener?.('storage',sync);
      this.manager.cleanup=()=>{eventTarget?.removeEventListener?.('online',wake);documentTarget?.removeEventListener?.('visibilitychange',wake);eventTarget?.removeEventListener?.('storage',sync);};
      if(this.session)void this.getIdToken(true).catch(()=>{if(this.session)this.scheduleRefresh(30000);});
      return ()=>this.stopAuthTokenManager();
    }
    stopAuthTokenManager(){this.clearRefreshTimer();this.manager?.cleanup?.();this.manager=null;}
    async getIdToken(force=false){
      const session=this.session;if(!session?.idToken)throw new Error('Sign in to use cloud services.');
      if(!force&&session.expiresAt>Date.now()+60000)return session.idToken;
      if(this.refreshPromise?.session===session)return this.refreshPromise.promise;
      if(!session.refreshToken)throw new Error('Your cloud session expired. Sign in again.');
      const epoch=this.authEpoch;
      const promise=(async()=>{
        try{
          const response=await this.transport('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(this.config.apiKey),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(session.refreshToken),signal:AbortSignal.timeout(15000)});
          const data=await response.json().catch(()=>({}));
          if(this.session!==session||epoch!==this.authEpoch)throw new Error('Account session changed.');
          if(!response.ok){if(['INVALID_REFRESH_TOKEN','TOKEN_EXPIRED','USER_DISABLED','USER_NOT_FOUND','INVALID_GRANT'].includes(data.error?.message))this.signOut();throw new Error('Your cloud session could not be refreshed. Reconnect or sign in again.');}
          const expires=Number(data.expires_in);
          if(!data.id_token||!data.refresh_token||data.user_id!==session.uid||!Number.isFinite(expires)||expires<=0)throw new Error('Firebase returned an invalid token refresh response.');
          Object.assign(session,{idToken:data.id_token,refreshToken:data.refresh_token,expiresAt:Date.now()+expires*1000});
          this.persistSession();this.scheduleRefresh();this.manager?.onRefresh();return session.idToken;
        }catch(error){this.manager?.onError();throw error;}
      })();
      this.refreshPromise={session,promise};
      try{return await promise;}finally{if(this.refreshPromise?.promise===promise)this.refreshPromise=null;}
    }
    async authenticatedFetch(url,options={}){
      const session=this.session,token=await this.getIdToken();
      const send=async value=>{if(this.session!==session)throw new Error('Account session changed.');if(options.signal?.aborted)throw options.signal.reason||new Error('Request cancelled.');const headers=new Headers(options.headers||{});headers.set('authorization','Bearer '+value);return this.transport(url,{...options,headers});};
      const response=await send(token);if(response.status!==401)return response;
      await response.body?.cancel?.();
      if(this.session!==session)throw new Error('Account session changed.');
      const next=await this.getIdToken(this.session.idToken===token);
      return send(next);
    }
    signOut(){this.authEpoch++;this.clearRefreshTimer();this.session=null;this.refreshPromise=null;this.persistSession();this.manager?.onSessionChange(null);}

    createTeamspaceSync(options={}){return new ZorifiCloudSyncEngine(options.apiEndpoint||'/api/teamspace',{...options,getSession:()=>this.session,transport:(url,init)=>this.authenticatedFetch(url,init)});}
    documentUrl(path){this.requireConfig();const safe=String(path||'').split('/').filter(Boolean);if(!safe.length||safe.length%2!==0||safe.some(part=>!/^[a-zA-Z0-9_.-]{1,160}$/.test(part)))throw new Error('Invalid Firestore document path.');return `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/${safe.map(encodeURIComponent).join('/')}`;}
    async document(path,{method='GET',data}={}){if(!this.session?.idToken)throw new Error('Sign in before accessing cloud project data.');const response=await this.authenticatedFetch(this.documentUrl(path),{method,headers:{authorization:`Bearer ${this.session.idToken}`,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify({fields:Object.fromEntries(Object.entries(data).map(([key,value])=>[key,encodeField(value)]))})}),result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(response.status===404?'Cloud data was not found.':'Cloud data could not be loaded.');return {name:result.name||'',...decodeDocument(result.fields||{})};}
    getSubscription(){if(!this.session?.uid)throw new Error('Sign in before checking a subscription.');return this.document(`users/${this.session.uid}/private/subscription`);}
    async syncSubscription(store){const record=await this.getSubscription();if(record.uid!==this.session.uid||record.verified!==true||!['FREE','PRO'].includes(record.plan))throw new Error('The subscription record is not verified.');return store.applyProviderEvent({verified:true,provider:'firebase',plan:record.plan,status:record.status||'ACTIVE',customerId:record.customerId||null,subscriptionId:record.subscriptionId||null,currentPeriodEnd:record.currentPeriodEnd||null,cancelAtPeriodEnd:Boolean(record.cancelAtPeriodEnd)});}
  }
  class ZorifiCloudSyncEngine{
    constructor(apiEndpoint='/api/teamspace',{getSession=()=>null,storage=globalThis.localStorage,transport=globalThis.fetch.bind(globalThis),enabled=false,timeoutMs=30000}={}){
      if(!/^\/[a-zA-Z0-9/_-]+$/.test(apiEndpoint)||apiEndpoint.startsWith('//')||apiEndpoint.includes('..'))throw new Error('Teamspace endpoint must be a same-origin path.');
      this.apiEndpoint=apiEndpoint.replace(/\/$/,'');this.getSession=getSession;this.storage=storage;this.transport=transport;this.enabled=enabled;this.timeoutMs=timeoutMs;this.activeProjectId=null;this.syncInterval=null;this.operations=Promise.resolve();
    }
    session(){const session=this.getSession();if(!session?.uid||!session?.idToken)throw new Error('Sign in to a cloud account first.');return session;}
    scope(session){return 'zorifi-cloud-outbox:'+encodeURIComponent(this.apiEndpoint)+':'+encodeURIComponent(session.uid);}
    readQueue(session){const raw=this.storage.getItem(this.scope(session));const queue=raw?JSON.parse(raw):[];if(!Array.isArray(queue))throw new Error('Cloud retry storage is invalid.');return queue;}
    writeQueue(session,queue){this.storage.setItem(this.scope(session),JSON.stringify(queue));}
    serial(work){const next=this.operations.then(work,work);this.operations=next.catch(()=>{});return next;}
    cleanSnapshot(value){
      if(Array.isArray(value))return value.map(v=>this.cleanSnapshot(v));
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key,v])=>!(/password|passcode|token|api.?key|authorization|secret|url|thumbnail|file|path/i.test(key))&&typeof v!=='function').map(([key,v])=>[key,this.cleanSnapshot(v)]));
      if(typeof value==='string'&&/^(blob:|data:|file:|[A-Z]:[\\/])/i.test(value))return null;
      return value;
    }
    async request(entry,session){
      if(this.session().uid!==session.uid)throw new Error('Cloud account changed. Retry from the original account.');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
      try{
        let response;try{response=await this.transport(this.apiEndpoint+'/'+entry.kind,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+this.session().idToken,'idempotency-key':entry.id},body:JSON.stringify(entry.payload),signal:controller.signal,redirect:'error'});}catch(error){error.retryable=error.name==='TypeError'||error.name==='AbortError';throw error;}
        if(!response.ok){const error=new Error(response.status===409?'Cloud version conflict. Load the latest version before retrying.':response.status===401||response.status===403?'Cloud access was denied.':response.status===404?'Teamspace service is not configured.':'Teamspace request failed ('+response.status+').');error.retryable=response.status===429||response.status>=500;error.status=response.status;throw error;}
        const result=await response.json();
        if(result?.projectId!==entry.payload.projectId||result?.requestId!==entry.id||!(entry.kind==='sync'?typeof result.revision==='string'&&result.revision.length:typeof result.commentId==='string'&&result.commentId.length))throw new Error('Teamspace returned an invalid acknowledgement.');
        return result;
      }finally{clearTimeout(timer);}
    }
    enqueue(kind,payload){return this.serial(async()=>{
      if(!this.enabled)throw new Error('Cloud sync is not configured or enabled.');const session=this.session();
      const id=globalThis.crypto.randomUUID(),entry={id,kind,payload:{...payload,requestId:id},createdAt:Date.now()},queue=this.readQueue(session);
      if(queue.length>=100)throw new Error('Cloud retry queue is full. Resolve pending items first.');
      if(new TextEncoder().encode(JSON.stringify(entry)).length>500000)throw new Error('Project metadata exceeds the 500 KB sync limit.');
      // Persist first; a queue acknowledgement is only returned after storage succeeds.
      this.writeQueue(session,[...queue,entry]);
      if(queue.some(item=>item.payload.projectId===payload.projectId))return {status:'pending',requestId:id};
      try{const result=await this.request(entry,session);this.writeQueue(session,this.readQueue(session).filter(item=>item.id!==id));return {...result,status:'synced'};}
      catch(error){if(error.retryable)return {status:'offline-queued',requestId:id};if(error.status&&error.status!==409)this.writeQueue(session,this.readQueue(session).filter(item=>item.id!==id));throw error;}
    });}
    pushProjectSnapshot(projectState){
      if(!projectState?.projectId) return Promise.reject(new Error('A project ID is required.'));
      if(!Array.isArray(projectState.clips)||!Array.isArray(projectState.mediaAssets))return Promise.reject(new Error('Project clips and media are required.'));
      if(projectState.cloudRevision!=null&&(typeof projectState.cloudRevision!=='string'||!projectState.cloudRevision.length||projectState.cloudRevision.length>160))return Promise.reject(new Error('Invalid cloud revision.'));
      const projectId=String(projectState.projectId);if(!/^[a-zA-Z0-9_.-]{1,160}$/.test(projectId))return Promise.reject(new Error('Invalid project ID.'));
      this.activeProjectId=projectId;
      return this.enqueue('sync',{projectId,baseRevision:projectState.cloudRevision||null,project:this.cleanSnapshot({projectId,currentProject:projectState.currentProject,clips:projectState.clips,mediaAssets:projectState.mediaAssets,markers:projectState.markers||[],trackStates:projectState.trackStates||{},duration:projectState.duration,ratio:projectState.ratio,frameWidth:projectState.frameWidth,frameHeight:projectState.frameHeight,captionSettings:projectState.captionSettings,scenePlan:projectState.scenePlan}),timestamp:Date.now()});
    }
    addReviewComment(projectId,timestampSeconds,author,commentText,{fps=30}={}){
      if(!/^[a-zA-Z0-9_.-]{1,160}$/.test(String(projectId)))return Promise.reject(new Error('Invalid project ID.'));
      if(!Number.isFinite(timestampSeconds)||timestampSeconds<0||!Number.isFinite(fps)||fps<1||fps>240)return Promise.reject(new Error('Invalid comment timestamp or frame rate.'));
      const text=String(commentText||'').trim();if(!text||text.length>4000)return Promise.reject(new Error('Comments must contain 1–4000 characters.'));
      const frame=Math.round(timestampSeconds*fps);if(!Number.isSafeInteger(frame))return Promise.reject(new Error('Comment timestamp is too large.'));
      // The authenticated server determines authorship; supplied display names are never trusted.
      return this.enqueue('comments',{projectId:String(projectId),frame,fps,timestamp:frame/fps,text,createdAt:Date.now()});
    }
    flushPending(){return this.serial(async()=>{
      if(!this.enabled)throw new Error('Cloud sync is not configured or enabled.');const session=this.session(),results=[],blocked=new Set();
      for(const entry of this.readQueue(session)){
        if(blocked.has(entry.payload.projectId))continue;
        try{const result=await this.request(entry,session);this.writeQueue(session,this.readQueue(session).filter(item=>item.id!==entry.id));results.push({...result,status:'synced'});}
        catch(error){results.push({requestId:entry.id,status:error.status===409?'conflict':error.retryable?'offline-queued':'failed',error:error.message});blocked.add(entry.payload.projectId);if(error.status===401||error.status===403)break;}
      }return results;
    });}
    clearPending(){return this.serial(async()=>{const session=this.session();this.storage.removeItem(this.scope(session));});}
  }
  return {ZorifiCloudSyncEngine,normalizeConfig,decodeDocument,encodeField,FirebaseGateway};
});
