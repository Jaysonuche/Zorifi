import {createHmac,timingSafeEqual} from 'node:crypto';
import Learning from '../../../zorifi-vanessa-creative-learning.js';
import {handler,verifiedAccount,env,ServiceError} from './provider.mjs';
import {storeFor} from './chat-session-store.mjs';

const namespace=project=>`projects/${project}/databases/(default)/documents`;
const keyForServer=()=>env('VANESSA_SESSION_SIGNING_KEY')||env('GEMINI_API_KEY')||env('AI_PROVIDER_KEY')||env('OPENAI_LANGUAGE_API_KEY')||env('OPENAI_API_KEY');
const exact=(input,keys)=>{if(!input||Array.isArray(input)||Object.keys(input).some(key=>!keys.includes(key)))throw new ServiceError('Use only the supported creative feedback fields.',400,'INVALID_FEEDBACK');};
const decode=fields=>Object.fromEntries(Object.entries(fields||{}).map(([key,value])=>[key,value.stringValue??value.booleanValue??value.timestampValue]));
const signature=(project,uid,event,key)=>createHmac('sha256',key).update(JSON.stringify(['zorifi-creative-feedback-v1',namespace(project),uid,Learning.sharedEvent(event)])).digest('hex');

export function verifyFeedbackRecord(document,{project,signingKey}={}){
  if(!project||!signingKey)throw new Error('A project and server feedback-signing key are required to verify exported events.');
  const match=typeof document?.name==='string'&&document.name.match(/^projects\/([^/]+)\/databases\/\(default\)\/documents\/users\/([^/]+)\/creativeFeedback\/([^/]+)$/);
  if(!match||match[1]!==project)throw new Error('Feedback record has the wrong project or collection.');
  const data=decode(document.fields),{uid:owner,signature:actual,createdAt,...eventInput}=data,event=Learning.sharedEvent(eventInput);
  if(owner!==decodeURIComponent(match[2])||event.id!==match[3]||!/^\d{4}-\d{2}-\d{2}T/.test(createdAt||'')||!Number.isFinite(Date.parse(createdAt))||!/^[a-f0-9]{64}$/i.test(actual||''))throw new Error('Feedback record identity or timestamp is invalid.');
  const expected=signature(project,owner,event,signingKey);if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(actual,'hex')))throw new Error('Feedback signature is invalid.');
  return {uid:owner,event};
}

export class CreativeFeedbackStore{
  constructor({store,project,uid,signingKey=keyForServer()}={}){if(!store||!project||!uid)throw new ServiceError('Creative feedback storage is unavailable.',503,'LEARNING_STORAGE_UNAVAILABLE');this.store=store;this.project=project;this.uid=uid;this.signingKey=signingKey;this.consentPath=`/users/${encodeURIComponent(uid)}/private/creativeLearning`;}
  async consent(enabled,signal){const previous=await this.store.read(this.consentPath,signal);await this.store.call(':commit',{method:'POST',signal,body:{writes:[this.store.write(this.consentPath,{uid:this.uid,sharedFeedback:enabled},previous)]}});return {consent:enabled};}
  async share(events,signal){
    if(!this.signingKey)throw new ServiceError('Server feedback signing is unavailable.',503,'LEARNING_STORAGE_UNAVAILABLE');
    if(!Array.isArray(events)||events.length<1||events.length>25)throw new ServiceError('Share between 1 and 25 categorical feedback events.',400,'INVALID_FEEDBACK');
    let normalized;try{normalized=events.map(Learning.sharedEvent);}catch{throw new ServiceError('Feedback may contain only supported categorical fields.',400,'INVALID_FEEDBACK');}
    if(new Set(normalized.map(event=>event.id)).size!==normalized.length)throw new ServiceError('Feedback batch identifiers must be unique.',400,'INVALID_FEEDBACK');
    const consent=await this.store.read(this.consentPath,signal);if(consent?.data.uid!==this.uid||consent.data.sharedFeedback!==true)throw new ServiceError('Enable shared editing feedback before sharing. Revoked consent cannot be restored by a queued request.',403,'LEARNING_CONSENT_REQUIRED');
    const previous=await Promise.all(normalized.map(event=>this.store.read(this.store.path('creativeFeedback',event.id),signal))),writes=[this.store.write(this.consentPath,{uid:this.uid,sharedFeedback:true},consent)];
    for(let index=0;index<normalized.length;index++){
      const event=normalized[index],old=previous[index],signed=signature(this.project,this.uid,event,this.signingKey);
      if(old){let same=false;try{const {uid:owner,signature:actual,createdAt,...storedEvent}=old.data;same=owner===this.uid&&actual===signed&&JSON.stringify(Learning.sharedEvent(storedEvent))===JSON.stringify(event);}catch{}if(!same)throw new ServiceError('A feedback ID cannot be reused for a different outcome.',409,'FEEDBACK_CONFLICT');continue;}
      writes.push(this.store.write(this.store.path('creativeFeedback',event.id),{...event,uid:this.uid,signature:signed},null,['createdAt']));
    }
    if(signal?.aborted)throw signal.reason;await this.store.call(':commit',{method:'POST',signal,body:{writes}});
    return {accepted:normalized.map(event=>event.id),consent:true,sharedFields:'categorical-only',alreadyCollected:previous.filter(Boolean).length};
  }
  async revoke(signal){
    await this.consent(false,signal);let removed=0;
    for(let page=0;page<10;page++){
      const rows=await this.store.call(`/users/${encodeURIComponent(this.uid)}:runQuery`,{method:'POST',signal,body:{structuredQuery:{from:[{collectionId:'creativeFeedback'}],limit:100}}}),documents=Array.isArray(rows)?rows.map(row=>row.document).filter(Boolean):[];
      if(!documents.length)return {consent:false,removed,complete:true};
      const prefix=`${namespace(this.project)}/users/${encodeURIComponent(this.uid)}/creativeFeedback/`;
      if(documents.some(document=>!document.name?.startsWith(prefix)))throw new ServiceError('Feedback deletion returned an unexpected owner path.',503,'LEARNING_STORAGE_UNAVAILABLE');
      await this.store.call(':commit',{method:'POST',signal,body:{writes:documents.map(document=>({delete:document.name,currentDocument:{updateTime:document.updateTime}}))}});removed+=documents.length;
      if(documents.length<100)return {consent:false,removed,complete:true};
    }
    return {consent:false,removed,complete:false,message:'Consent is revoked. Repeat Clear to remove the remaining older events.'};
  }
}

export const feedback=handler(async(input,originalRequest)=>{
  exact(input,['operation','consent','events']);const {uid}=await verifiedAccount(originalRequest),signal=AbortSignal.any([originalRequest.signal,AbortSignal.timeout(100000)]),base=storeFor(originalRequest,uid),store=new CreativeFeedbackStore({store:base,project:env('FIREBASE_PROJECT_ID'),uid});
  if(input.operation==='clear'||input.operation==='revoke'){if(input.consent!==false||input.events!==undefined)throw new ServiceError('Revocation must contain consent:false and no events.',400,'INVALID_FEEDBACK');return store.revoke(signal);}
  if(input.operation==='consent'){if(input.consent!==true||input.events!==undefined)throw new ServiceError('Enabling shared feedback requires explicit consent:true.',400,'INVALID_FEEDBACK');await base.limit(signal);return store.consent(true,signal);}
  if(input.operation!=='share'||input.consent!==true)throw new ServiceError('Sharing requires explicit consent:true.',400,'INVALID_FEEDBACK');
  if(JSON.stringify(input).length>16000)throw new ServiceError('The categorical feedback batch is too large.',413,'INVALID_FEEDBACK');
  await base.limit(signal);return store.share(input.events,signal);
});
