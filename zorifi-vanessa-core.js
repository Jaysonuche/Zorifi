(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiVanessaCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const STATUS=Object.freeze({SUCCESS:'success',FALLBACK:'fallback',FAILED:'failed'});

  function text(value,max=4000){return String(value||'').trim().slice(0,max);}
  function cleanResult(value,fallback='I’m listening.'){
    if(typeof value==='string')return {text:text(value)||fallback};
    if(value&&typeof value==='object')return {...value,text:text(value.text)||fallback};
    return {text:fallback};
  }

  function words(value){
    return new Set(text(value,4000).toLowerCase().match(/[\p{L}\p{N}']{3,}/gu)||[]);
  }
  function topicReset(value){return /^(?:new topic|change (?:the )?subject|forget (?:that|this)|let(?:'s| us) talk about something else)\b/i.test(text(value));}

  class ConversationContext{
    constructor({router,maxTurns=14,recentTurns=6,maxChars=9000}={}){
      if(!router?.classify||!router?.needsEditorContext)throw new TypeError('ConversationContext requires VanessaRouter.');
      this.router=router;
      this.maxTurns=Math.max(4,Math.min(30,Number(maxTurns)||14));
      this.recentTurns=Math.max(2,Math.min(this.maxTurns,Number(recentTurns)||6));
      this.maxChars=Math.max(1000,Math.min(30000,Number(maxChars)||9000));
      this.turns=[];
    }
    eligible(item){
      if(!item||(item.role!=='user'&&item.role!=='assistant')||!text(item.text))return false;
      if(item.editorContext===true||item.pipeline==='editor'||item.actionStatus)return false;
      return item.role!=='user'||!this.router.route(item.text).commandPipeline;
    }
    normalize(history){
      if(!Array.isArray(history))return [];
      const normalized=history.filter(item=>this.eligible(item)).map(item=>({role:item.role,text:text(item.text,2400)}));
      let boundary=-1;normalized.forEach((item,index)=>{if(item.role==='user'&&topicReset(item.text))boundary=index;});
      return boundary<0?normalized:normalized.slice(boundary);
    }
    hydrate(history){
      const external=this.normalize(history);
      if(external.length)this.turns=external.slice(-this.maxTurns*2);
      return this;
    }
    select(message){
      const current=text(message),lower=current.toLowerCase();
      if(topicReset(lower))return [];
      const source=this.turns.filter((item,index,array)=>!(index===array.length-1&&item.role==='user'&&item.text===current));
      const recentStart=Math.max(0,source.length-this.recentTurns),selected=new Set(source.slice(recentStart));
      const currentWords=words(current),topicWords=new Set([...currentWords]);
      source.slice(recentStart).forEach(item=>words(item.text).forEach(word=>topicWords.add(word)));
      for(let index=recentStart-1;index>=0;index--){
        const item=source[index],overlap=[...words(item.text)].some(word=>topicWords.has(word));
        if(overlap){selected.add(item);if(index>0&&source[index-1].role!==item.role)selected.add(source[index-1]);}
      }
      const ordered=source.filter(item=>selected.has(item)).slice(-this.maxTurns),bounded=[];let size=0;
      for(let index=ordered.length-1;index>=0;index--){const item=ordered[index],next=size+item.text.length;if(next>this.maxChars)break;bounded.unshift(item);size=next;}
      return bounded.map(item=>({...item}));
    }
    prepare(message,history){this.hydrate(history);if(topicReset(message)){this.clear();return [];}return this.select(message);}
    commit(userText,assistantText){
      const user={role:'user',text:text(userText,2400)},assistant={role:'assistant',text:text(assistantText,2400)};
      if(user.text)this.turns.push(user);if(assistant.text)this.turns.push(assistant);
      this.turns=this.turns.slice(-this.maxTurns*2);return this.snapshot();
    }
    snapshot(){return this.turns.map(item=>({...item}));}
    clear(){this.turns=[];}
  }

  class ConversationEngine{
    constructor({router,transport,fallback,isOnline=()=>true,onInternalError=()=>{},context}={}){
      if(!router?.conversationPayload)throw new TypeError('ConversationEngine requires VanessaRouter.');
      if(typeof fallback!=='function')throw new TypeError('ConversationEngine requires an offline fallback.');
      this.router=router;this.transport=transport;this.fallback=fallback;this.isOnline=isOnline;this.onInternalError=onInternalError;this.context=context||new ConversationContext({router});
    }
    async respond(request={}){
      const message=text(request.message);if(!message)return {status:STATUS.FAILED,text:'Tell me what you would like to talk about.',provider:'local'};
      const contextHistory=this.context.prepare(message,request.history),contextRequest={...request,history:contextHistory,contextHistory};
      const payload=this.router.conversationPayload(message,contextRequest);
      if(this.isOnline()&&typeof this.transport==='function'){
        try{
          const remote=await this.transport(payload,request);
          if(remote?.ok&&text(remote.data?.text)){const result=cleanResult(remote.data);this.context.commit(message,result.text);return {...result,status:STATUS.SUCCESS,provider:remote.data?.metadata?.provider||'configured',contextTurns:contextHistory.length};}
        }catch(error){this.onInternalError(error);}
      }
      const local=cleanResult(await this.fallback(message,contextRequest));this.context.commit(message,local.text);
      return {...local,status:STATUS.FALLBACK,provider:'offline',contextTurns:contextHistory.length};
    }
  }

  class EditorBridge{
    constructor({contextProvider}={}){if(typeof contextProvider!=='function')throw new TypeError('EditorBridge requires a context provider.');this.contextProvider=contextProvider;}
    async context(route){
      if(!route?.editorContext)return {available:false,context:null,error:null};
      try{const context=await this.contextProvider(route);return {available:Boolean(context),context:context||null,error:null};}
      catch(error){return {available:false,context:null,error};}
    }
  }

  class Core{
    constructor({router,conversation,editor}={}){
      if(!router?.route)throw new TypeError('VanessaCore requires VanessaRouter.');
      if(!(conversation instanceof ConversationEngine))throw new TypeError('VanessaCore requires ConversationEngine.');
      if(!(editor instanceof EditorBridge))throw new TypeError('VanessaCore requires EditorBridge.');
      this.router=router;this.conversation=conversation;this.editor=editor;
    }
    route(message,options){return this.router.route(text(message),options);}
    async converse(message,options={}){
      const route=this.route(message,{hasAttachments:Boolean(options.attachments?.length),intentContext:options.intentContext,responsePlan:options.responsePlan,workflowContext:options.workflowContext});
      if(route.commandPipeline)throw new Error('Editor and Zorifi commands must not enter the conversation pipeline.');
      return this.conversation.respond({...options,message,route});
    }
    editorContext(route){return this.editor.context(route);}
    conversationContext(){return this.conversation.context.snapshot();}
    clearConversationContext(){this.conversation.context.clear();}
  }

  return {STATUS,ConversationContext,ConversationEngine,EditorBridge,Core};
});
