(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ZorifiFirebase=api;
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
    constructor(config={},transport=fetch){this.config=normalizeConfig(config);this.transport=transport;this.session=null;}
    configured(){return Boolean(this.config.apiKey&&this.config.projectId);}
    requireConfig(){if(!this.configured())throw new Error('Firebase is not configured for this Zorifi build.');}
    async auth(action,email,password){this.requireConfig();if(!['signUp','signInWithPassword'].includes(action))throw new Error('Unsupported authentication operation.');const response=await this.transport(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(this.config.apiKey)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:clean(email),password:String(password||''),returnSecureToken:true})}),data=await response.json().catch(()=>({}));if(!response.ok||!data.idToken||!data.localId)throw new Error('The account service could not authenticate these details.');this.session={uid:data.localId,email:data.email||clean(email),idToken:data.idToken,refreshToken:data.refreshToken||'',expiresAt:Date.now()+(Number(data.expiresIn)||3600)*1000};return {...this.session,idToken:'[protected]',refreshToken:'[protected]'};}
    signUp(email,password){return this.auth('signUp',email,password);}
    signIn(email,password){return this.auth('signInWithPassword',email,password);}
    signOut(){this.session=null;}
    documentUrl(path){this.requireConfig();const safe=String(path||'').split('/').filter(Boolean);if(!safe.length||safe.length%2!==0||safe.some(part=>!/^[a-zA-Z0-9_.-]{1,160}$/.test(part)))throw new Error('Invalid Firestore document path.');return `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/${safe.map(encodeURIComponent).join('/')}`;}
    async document(path,{method='GET',data}={}){if(!this.session?.idToken)throw new Error('Sign in before accessing cloud project data.');const response=await this.transport(this.documentUrl(path),{method,headers:{authorization:`Bearer ${this.session.idToken}`,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify({fields:Object.fromEntries(Object.entries(data).map(([key,value])=>[key,encodeField(value)]))})}),result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(response.status===404?'Cloud data was not found.':'Cloud data could not be loaded.');return {name:result.name||'',...decodeDocument(result.fields||{})};}
    getSubscription(){if(!this.session?.uid)throw new Error('Sign in before checking a subscription.');return this.document(`users/${this.session.uid}/private/subscription`);}
    async syncSubscription(store){const record=await this.getSubscription();if(record.uid!==this.session.uid||record.verified!==true||!['FREE','PRO'].includes(record.plan))throw new Error('The subscription record is not verified.');return store.applyProviderEvent({verified:true,provider:'firebase',plan:record.plan,status:record.status||'ACTIVE',customerId:record.customerId||null,subscriptionId:record.subscriptionId||null,currentPeriodEnd:record.currentPeriodEnd||null,cancelAtPeriodEnd:Boolean(record.cancelAtPeriodEnd)});}
  }
  return {normalizeConfig,decodeDocument,encodeField,FirebaseGateway};
});
