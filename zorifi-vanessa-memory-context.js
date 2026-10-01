(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiVanessaMemoryContext=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const SOURCE='approved_long_term_memory';
  const STOP=new Set(['about','after','again','also','because','before','being','can','could','from','have','into','just','like','more','most','only','other','should','some','that','their','them','then','there','these','they','this','those','through','very','want','what','when','where','which','with','would','your','user','need','help']);
  const CONCEPTS=Object.freeze({
    project:['app','application','build','building','builder','develop','development','editor','feature','launch','product','project','roadmap','software','startup','zorifi'],
    video:['animation','caption','cinematic','clip','colour','color','edit','editing','effect','film','footage','media','transition','video'],
    audio:['audio','beat','music','podcast','sound','voice','voiceover'],
    work:['approach','process','session','style','workflow','working'],
    communication:['answer','brief','communication','concise','detail','explain','response','step'],
    goal:['aim','goal','milestone','plan','progress','target']
  });
  const CATEGORY_HINTS=Object.freeze({projects:['project'],ongoing_context:['project','work'],progress:['project','goal'],goals:['goal','project'],creative_preferences:['video','audio'],working_style:['work'],communication_preferences:['communication'],preferences:['work','video','audio'],interests:[]});
  const CONTRASTS=Object.freeze([['short','long'],['fast','slow'],['dark','bright'],['warm','cool'],['casual','formal'],['brief','detailed'],['concise','detailed'],['portrait','landscape'],['mobile','desktop']]);
  const CONTRADICTION=/\b(?:no longer|not anymore|stopped|quit|gave up|don['’]?t|do not|doesn['’]?t|changed|switched|instead|used to)\b/i;
  const FORGET=/^(?:please\s+)?(?:forget|delete|remove)(?:\s+(?:the\s+)?memory)?(?:\s+(?:that|about))?\s*(.*)$/i;
  const DONT_REMEMBER=/^(?:i\s+)?don['’]?t\s+want\s+you\s+(?:to\s+)?remember(?:ing)?\s*(.*)$/i;
  const CORRECTION=/^(?:that['’]?s\s+not\s+true\s+anymore|i\s+don['’]?t\s+do\s+that\s+anymore|i(?:['’]ve|\s+have)\s+changed\s+my\s+goal|update\s+that)[.!]?$/i;

  function clean(value,max=1000){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max);}
  function stem(word){return word.replace(/(?:ations?|ments?|ness|ingly|edly|ing|ers?|ed|es|s)$/,'');}
  function tokens(value){return [...new Set((clean(value,5000).toLowerCase().replace(/[-–—]/g,' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’]{2,}/gu)||[]).map(stem).filter(word=>word.length>2&&!STOP.has(word)))];}
  function conceptsFor(words){const set=new Set(words),found=[];for(const [name,terms] of Object.entries(CONCEPTS)){if(terms.some(term=>set.has(stem(term))))found.push(name);}return found;}
  function overlap(left,right){const rightSet=new Set(right);return left.filter(word=>rightSet.has(word));}
  function timeValue(value){const time=Date.parse(value||'');return Number.isFinite(time)?time:0;}
  function safeMemory(store,item){try{store.validate(item);return true;}catch{return false;}}
  function recentConversationText(conversation=[]){return conversation.filter(item=>item&&(item.role==='user'||item.role==='assistant')&&!item.editorContext&&!item.actionStatus).slice(-6).map(item=>clean(item.text,700)).filter(Boolean).join(' ');}
  function similarity(a,b){const left=tokens(`${a.category} ${a.key||''} ${a.value}`),right=tokens(`${b.category} ${b.key||''} ${b.value}`),union=new Set([...left,...right]),shared=overlap(left,right);if(!union.size)return 0;let score=shared.length/union.size;const conceptsA=conceptsFor(left),conceptsB=conceptsFor(right);if(overlap(conceptsA,conceptsB).length&&shared.some(word=>word.length>5))score+=.4;return Math.min(1,score);}

  class ContextualMemory{
    constructor({store,threshold=5,limit=6,maxChars=1200,maxMemoryChars=300,onDiagnostics}={}){
      if(!store||typeof store.inspect!=='function'||typeof store.validate!=='function')throw new Error('ContextualMemory requires PersonalMemoryStore.');
      this.store=store;this.threshold=Math.max(1,Math.min(30,Number(threshold)||5));this.limit=Math.max(1,Math.min(6,Number(limit)||6));this.maxChars=Math.max(200,Math.min(1200,Number(maxChars)||1200));this.maxMemoryChars=Math.max(80,Math.min(300,Number(maxMemoryChars)||300));this.onDiagnostics=typeof onDiagnostics==='function'?onDiagnostics:null;this.lastDiagnostics=null;
    }
    score(item,message,{conversation=[]}={}){
      const current=tokens(message),recent=tokens(recentConversationText(conversation)),memory=tokens(`${item.category} ${item.key||''} ${item.value}`),direct=overlap(memory,current),contextual=overlap(memory,recent).filter(word=>!direct.includes(word)),memoryConcepts=conceptsFor(memory),queryConcepts=conceptsFor([...current,...recent]),conceptMatches=overlap(memoryConcepts,queryConcepts),categoryMatches=overlap(CATEGORY_HINTS[item.category]||[],queryConcepts);
      const proper=tokens(item.value).filter(word=>word.length>5&&current.includes(word)).length;
      return {score:(direct.length*4)+(contextual.length*1.25)+(conceptMatches.length*3.5)+(categoryMatches.length*2)+(proper*1.5),direct:direct.length,contextual:contextual.length,concepts:conceptMatches.length,category:categoryMatches.length};
    }
    detectConflicts(message,{conversation=[]}={}){
      const text=clean(message,1000),messageTokens=tokens(text),messageConcepts=conceptsFor(messageTokens),hasNegation=CONTRADICTION.test(text),state=this.store.inspect(),conflicts=[];
      for(const item of state.memories){if(!safeMemory(this.store,item))continue;const memoryTokens=tokens(item.value),shared=overlap(memoryTokens,messageTokens),sharedConcepts=overlap(conceptsFor(memoryTokens),messageConcepts),contrast=CONTRASTS.some(([a,b])=>{const left=stem(a),right=stem(b);return (memoryTokens.includes(left)&&messageTokens.includes(right))||(memoryTokens.includes(right)&&messageTokens.includes(left));});const subjectMatch=shared.some(word=>word.length>4)||sharedConcepts.length>0;if(subjectMatch&&(contrast||hasNegation)){const relevance=this.score(item,text,{conversation}).score;if(relevance>=this.threshold-1)conflicts.push({type:'memory_conflict',existingMemory:item,newStatement:text,requiresConfirmation:true,score:relevance,reason:contrast?'contrasting_preference':'contradictory_statement'});}}
      return conflicts.sort((a,b)=>b.score-a.score||timeValue(b.existingMemory.updatedAt)-timeValue(a.existingMemory.updatedAt));
    }
    retrieve(message,{conversation=[],excludeIds=[]}={}){
      const state=this.store.inspect(),excluded=new Set(excludeIds),ranked=[];let unsafe=0,low=0;
      state.memories.forEach((item,index)=>{if(excluded.has(item.id))return;if(!safeMemory(this.store,item)){unsafe++;return;}const detail=this.score(item,message,{conversation});if(detail.score<this.threshold){low++;return;}ranked.push({item,detail,index});});
      ranked.sort((a,b)=>b.detail.score-a.detail.score||timeValue(b.item.updatedAt)-timeValue(a.item.updatedAt)||b.index-a.index);
      const unique=[];let duplicates=0,size=0;
      for(const entry of ranked){const duplicateIndex=unique.findIndex(existing=>similarity(existing.item,entry.item)>=.58);if(duplicateIndex>=0){duplicates++;const existing=unique[duplicateIndex],newer=timeValue(entry.item.updatedAt)>timeValue(existing.item.updatedAt)||(timeValue(entry.item.updatedAt)===timeValue(existing.item.updatedAt)&&entry.index>existing.index);if(newer){size-=clean(existing.item.value,this.maxMemoryChars).length+clean(existing.item.key,80).length;unique[duplicateIndex]=entry;size+=clean(entry.item.value,this.maxMemoryChars).length+clean(entry.item.key,80).length;}continue;}const value=clean(entry.item.value,this.maxMemoryChars),next=value.length+clean(entry.item.key,80).length;if(size+next>this.maxChars)break;unique.push(entry);size+=next;if(unique.length>=this.limit)break;}
      const memories=unique.map(({item,detail})=>({id:item.id,category:item.category,key:item.key||undefined,value:clean(item.value,this.maxMemoryChars),updatedAt:item.updatedAt,source:SOURCE,relevanceScore:Number(detail.score.toFixed(2))}));
      this.lastDiagnostics={attempted:true,userId:state.userId,considered:state.memories.length,accepted:memories.length,rejectedLowRelevance:low,rejectedSensitive:unsafe,rejectedDuplicate:duplicates,scores:unique.map(entry=>Number(entry.detail.score.toFixed(2))),threshold:this.threshold,limit:this.limit,characterLimit:this.maxChars};this.onDiagnostics?.({...this.lastDiagnostics});return memories;
    }
    analyze(message,{conversation=[]}={}){const conflicts=this.detectConflicts(message,{conversation}),memories=this.retrieve(message,{conversation,excludeIds:conflicts.map(item=>item.existingMemory.id)});return {memories,conflicts,diagnostics:this.diagnostics()};}
    createConflictCandidate(conflict){if(!conflict?.existingMemory?.id||!conflict.newStatement)throw new Error('A valid memory conflict is required.');const existing=this.store.inspect().candidates.find(item=>item.metadata?.replacesMemoryId===conflict.existingMemory.id&&item.value.toLowerCase()===clean(conflict.newStatement,500).toLowerCase());if(existing)return existing;return this.store.createCandidate({category:conflict.existingMemory.category,key:conflict.existingMemory.key||'memory-update',value:conflict.newStatement,source:'memory-conflict-candidate',metadata:{kind:'memory_update',replacesMemoryId:conflict.existingMemory.id,requiresConfirmation:true,reason:conflict.reason}});}
    command(message,{conversation=[]}={}){
      const text=clean(message,1000);if(CORRECTION.test(text))return {type:'memory_clarification',message:'Tell me what the approved memory should say now. I’ll create an update candidate for you to review instead of changing it automatically.'};
      const match=text.match(FORGET)||text.match(DONT_REMEMBER);if(!match)return null;let query=clean(match[1],500).replace(/^(?:about\s+|that\s+)/i,'');if(!query||/^(?:that|it|this)$/i.test(query))query=recentConversationText(conversation);
      const matches=query?this.retrieve(query,{conversation:[],excludeIds:[]}):[];
      if(matches.length===1)return {type:'forget_memory',memory:matches[0],requiresConfirmation:true};
      if(matches.length>1&&matches[0].relevanceScore>matches[1].relevanceScore+2)return {type:'forget_memory',memory:matches[0],requiresConfirmation:true};
      return {type:'memory_clarification',message:matches.length?'I found more than one matching memory. Open Vanessa Memory and choose the exact one to delete.':'Which saved memory would you like me to forget? You can name it or open Vanessa Memory to review your approved memories.'};
    }
    diagnostics(){return this.lastDiagnostics?{...this.lastDiagnostics,scores:[...this.lastDiagnostics.scores]}:null;}
  }

  return {SOURCE,DEFAULT_THRESHOLD:5,ContextualMemory,tokens,similarity};
});
