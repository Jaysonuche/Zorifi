(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiVanessaMemory=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const CATEGORIES=Object.freeze(['preferences','interests','goals','projects','creative_preferences','working_style','communication_preferences','ongoing_context','progress']);
  const SENSITIVE=/(?:password|passcode|pin\s*(?:code|number)?|api[ _-]?key|access[ _-]?token|auth(?:entication|orization)?[ _-]?token|bearer\s+[a-z0-9._~+\/-]+=*|private[ _-]?key|secret[ _-]?key|seed phrase|recovery phrase|credit[ _-]?card|debit[ _-]?card|card[ _-]?number|\bcvv\b|bank[ _-]?(?:account|routing)|social[ _-]?security|\bssn\b|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;
  const STOP=new Set(['about','after','again','also','because','before','being','could','from','have','into','just','like','more','most','only','other','should','some','that','their','them','then','there','these','they','this','those','through','very','want','what','when','where','which','with','would','your']);
  const LEGACY_CATEGORY=Object.freeze({videoStyle:'creative_preferences',editingStyle:'creative_preferences',fonts:'creative_preferences',effects:'creative_preferences',musicStyle:'creative_preferences',contentGoals:'goals',communicationStyle:'communication_preferences',language:'communication_preferences'});

  function clean(value,max=500){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max);}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function token(value){return clean(value,4000).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(word=>word.length>2&&!STOP.has(word)).map(word=>word.replace(/(?:ing|ed|es|s)$/,'')).filter(Boolean);}
  function now(){return new Date().toISOString();}
  function uid(prefix){return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;}
  function assertSafe(value,key=''){
    const combined=`${key} ${value}`;if(!clean(value))throw new Error('Memory value is required.');if(SENSITIVE.test(combined)||/(?:\d[ -]*?){13,19}/.test(combined))throw new Error('Sensitive credentials or financial information cannot be stored as personal memory.');
  }

  class PersonalMemoryStore{
    constructor({storage=null,userId='guest',namespace='zorifi-vanessa-personal-memory-v1',categories=[]}={}){
      this.storage=storage;this.userId=clean(userId,128)||'guest';this.namespace=clean(namespace,120)||'zorifi-vanessa-personal-memory-v1';this.categories=new Set([...CATEGORIES,...categories.map(item=>clean(item,60)).filter(item=>/^[a-z][a-z0-9_:-]*$/.test(item))]);this.key=`${this.namespace}:${encodeURIComponent(this.userId)}`;const state=this.read();this.memories=state.memories;this.candidates=state.candidates;
    }
    read(){try{const value=JSON.parse(this.storage?.getItem(this.key)||'{}');return {memories:Array.isArray(value.memories)?value.memories.slice(-250):[],candidates:Array.isArray(value.candidates)?value.candidates.slice(-100):[]};}catch{return {memories:[],candidates:[]};}}
    save(){this.storage?.setItem(this.key,JSON.stringify({schema:'zorifi.vanessa-memory/1',userId:this.userId,memories:this.memories.slice(-250),candidates:this.candidates.slice(-100)}));}
    validate(input={}){const category=clean(input.category,60),value=clean(input.value,500),key=clean(input.key||input.label,80);if(!this.categories.has(category))throw new Error('Unsupported personal-memory category.');assertSafe(value,key);return {category,key,value,source:clean(input.source||'explicit-user',40),metadata:input.metadata&&typeof input.metadata==='object'?clone(input.metadata):{}};}
    add(input){const value=this.validate(input),time=now(),item={id:uid('memory'),...value,approved:true,createdAt:time,updatedAt:time};this.memories.push(item);this.save();return clone(item);}
    get(id){const item=this.memories.find(entry=>entry.id===id);return item?clone(item):null;}
    createCandidate(input){const value=this.validate({...input,source:input.source||'candidate'}),existing=this.candidates.find(item=>item.category===value.category&&item.key===value.key&&item.value.toLowerCase()===value.value.toLowerCase());if(existing)return clone(existing);const candidate={id:uid('candidate'),...value,approved:false,status:'candidate',createdAt:now()};this.candidates.push(candidate);this.save();return clone(candidate);}
    approveCandidate(id){const candidate=this.candidates.find(item=>item.id===id);if(!candidate)throw new Error('Memory candidate was not found.');this.candidates=this.candidates.filter(item=>item.id!==id);const item=this.add({...candidate,source:'approved-candidate'});this.save();return item;}
    rejectCandidate(id){const before=this.candidates.length;this.candidates=this.candidates.filter(item=>item.id!==id);this.save();return this.candidates.length<before;}
    update(id,changes={}){const index=this.memories.findIndex(item=>item.id===id);if(index<0)throw new Error('Personal memory was not found.');const current=this.memories[index],value=this.validate({...current,...changes});this.memories[index]={...current,...value,id:current.id,approved:true,createdAt:current.createdAt,updatedAt:now()};this.save();return clone(this.memories[index]);}
    delete(id){const before=this.memories.length;this.memories=this.memories.filter(item=>item.id!==id);this.save();return this.memories.length<before;}
    clear(){this.memories=[];this.candidates=[];this.save();}
    retrieveRelevant(query,{limit=6,maxChars=1200,categories}={}){const queryTokens=new Set(token(query)),allowed=Array.isArray(categories)&&categories.length?new Set(categories):null,scored=this.memories.filter(item=>!allowed||allowed.has(item.category)).map(item=>{const itemTokens=token(`${item.category} ${item.key} ${item.value}`),matches=itemTokens.filter(word=>queryTokens.has(word)).length,categoryHint=queryTokens.has(item.category.replaceAll('_',''))||[...queryTokens].some(word=>item.category.includes(word)),score=(matches*4)+(categoryHint?2:0);return {item,score};}).filter(entry=>entry.score>0).sort((a,b)=>b.score-a.score||String(b.item.updatedAt).localeCompare(String(a.item.updatedAt)));const output=[];let size=0;for(const {item} of scored){if(output.length>=Math.max(1,Math.min(12,Number(limit)||6)))break;const next=item.value.length+(item.key?.length||0);if(size+next>Math.max(200,Math.min(4000,Number(maxChars)||1200)))break;output.push(clone(item));size+=next;}return output;}
    search(query,options={}){return this.retrieveRelevant(query,options);}
    forProvider(query,options={}){return this.retrieveRelevant(query,options).map(item=>({id:item.id,category:item.category,key:item.key||undefined,value:item.value,updatedAt:item.updatedAt}));}
    inspect(){return {schema:'zorifi.vanessa-memory/1',userId:this.userId,categories:[...this.categories],memories:this.memories.map(clone),candidates:this.candidates.map(clone),counts:{memories:this.memories.length,candidates:this.candidates.length}};}
    remember(field,value,{source='explicit-user'}={}){const category=LEGACY_CATEGORY[field]||'preferences',existing=this.memories.find(item=>item.key===field);return existing?this.update(existing.id,{category,key:field,value,source}):this.add({category,key:field,value,source});}
    remove(id){return this.delete(id);}
    public(){return this.memories.map(item=>({id:item.id,field:item.key||item.category,category:item.category,value:item.value,createdAt:item.createdAt,updatedAt:item.updatedAt}));}
    importLegacy(items=[]){let count=0;for(const legacy of items){const category=LEGACY_CATEGORY[legacy?.field];if(!category)continue;try{const duplicate=this.memories.some(item=>item.key===legacy.field&&item.value.toLowerCase()===clean(legacy.value,500).toLowerCase());if(!duplicate){this.add({category,key:legacy.field,value:legacy.value,source:'legacy-approved'});count++;}}catch{}}return count;}
  }

  return {CATEGORIES,PersonalMemoryStore,isSensitive:(value,key='')=>{try{assertSafe(value,key);return false;}catch{return true;}},LEGACY_CATEGORY};
});
