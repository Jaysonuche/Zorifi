(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiVanessaMemoryManager=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const CATEGORY_LABELS=Object.freeze({
    preferences:'Preferences',interests:'Interests',goals:'Goals',projects:'Projects',
    creative_preferences:'Creative preferences',working_style:'Working style',
    communication_preferences:'Communication preferences',ongoing_context:'Important ongoing context',progress:'Progress'
  });
  const CREATIVE=/(?:edit|editing|video|transition|effect|caption|font|music|colour|color|cinematic|animation|audio|thumbnail)/i;

  function clean(value,max=500){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max);}
  function categoryLabel(category){return CATEGORY_LABELS[category]||clean(category,60).replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());}
  function candidateFromMessage(message){
    const text=clean(message,600);if(!text)return null;
    let value='',category='preferences',key='';
    let match=text.match(/^(?:please\s+)?remember(?:\s+that)?\s+(.{3,500})[.!]?$/i);
    if(match){value=match[1];key='user-requested';}
    else if((match=text.match(/^(?:i\s+)?(?:really\s+)?(?:prefer|like)\s+(.{3,420})[.!]?$/i))){value=`I prefer ${match[1]}`;key='preference';}
    else if((match=text.match(/^i\s+(?:am|['’]m)\s+interested\s+in\s+(.{3,420})[.!]?$/i))){value=`I am interested in ${match[1]}`;category='interests';key='interest';}
    else if((match=text.match(/^my\s+goal\s+is\s+(?:to\s+)?(.{3,420})[.!]?$/i))){value=`My goal is to ${match[1]}`;category='goals';key='goal';}
    else if((match=text.match(/^i(?:['’]ve|\s+have)\s+been\s+(?:using|making|creating)\s+(.{3,420})\s+lately[.!]?$/i))){value=`I have been using ${match[1]} lately`;key='recent-preference';}
    else return null;
    if(CREATIVE.test(value))category='creative_preferences';
    return {category,key,value,source:'conversation-candidate',metadata:{proposedFromConversation:true}};
  }

  class MemoryManager{
    constructor({store,onChange}={}){if(!store||typeof store.inspect!=='function')throw new Error('A PersonalMemoryStore is required.');this.store=store;this.listeners=new Set();if(typeof onChange==='function')this.listeners.add(onChange);}
    subscribe(listener){if(typeof listener!=='function')return()=>{};this.listeners.add(listener);return()=>this.listeners.delete(listener);}
    snapshot(){const state=this.store.inspect();return {...state,memories:state.memories.map(item=>({...item,status:'approved',categoryLabel:categoryLabel(item.category)})),candidates:state.candidates.map(item=>({...item,status:item.status||'candidate',categoryLabel:categoryLabel(item.category)})),groups:this.group(state.memories)};}
    group(memories=this.store.inspect().memories){const groups={};for(const item of memories){(groups[item.category]||(groups[item.category]=[])).push({...item,status:'approved',categoryLabel:categoryLabel(item.category)});}return groups;}
    changed(type,item){const snapshot=this.snapshot();for(const listener of this.listeners)listener({type,item,snapshot});return snapshot;}
    addApproved(input){const item=this.store.add({...input,source:input?.source||'explicit-user'});this.changed('add',item);return item;}
    createCandidate(input){const item=this.store.createCandidate(input);this.changed('candidate',item);return item;}
    proposeFromConversation(message){const input=candidateFromMessage(message);if(!input)return null;const state=this.store.inspect(),duplicate=[...state.memories,...state.candidates].find(item=>item.category===input.category&&item.value.toLowerCase()===input.value.toLowerCase());if(duplicate)return duplicate.approved?null:duplicate;return this.createCandidate(input);}
    approve(id){const candidate=this.store.inspect().candidates.find(item=>item.id===id);if(!candidate)throw new Error('Memory candidate was not found.');let item;if(candidate.metadata?.kind==='memory_update'&&candidate.metadata.replacesMemoryId){item=this.store.update(candidate.metadata.replacesMemoryId,{category:candidate.category,key:candidate.key,value:candidate.value,source:'approved-memory-update'});this.store.rejectCandidate(candidate.id);}else item=this.store.approveCandidate(id);this.changed('approve',item);return item;}
    reject(id){const removed=this.store.rejectCandidate(id);if(removed)this.changed('reject',{id});return removed;}
    update(id,changes){const item=this.store.update(id,changes);this.changed('update',item);return item;}
    delete(id){const removed=this.store.delete(id);if(removed)this.changed('delete',{id});return removed;}
    clear(){this.store.clear();return this.changed('clear',null);}
  }

  return {CATEGORY_LABELS,categoryLabel,candidateFromMessage,MemoryManager};
});
