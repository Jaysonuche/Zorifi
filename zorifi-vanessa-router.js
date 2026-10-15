(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiVanessaRouter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const TYPES=Object.freeze({CONVERSATION:'conversation',WRITING:'writing',EDITING:'editing',PROJECT_STATE:'project-state'});
  const INTENTS=Object.freeze({CASUAL_CONVERSATION:'CASUAL_CONVERSATION',KNOWLEDGE:'KNOWLEDGE',CREATIVE_HELP:'CREATIVE_HELP',DREAM_GOAL:'DREAM_GOAL',BUILD_PROJECT:'BUILD_PROJECT',EDITING_COMMAND:'EDITING_COMMAND',ZORIFI_COMMAND:'ZORIFI_COMMAND',RESEARCH:'RESEARCH',WRITING:'WRITING',DIAGNOSTICS:'DIAGNOSTICS',SETTINGS:'SETTINGS',OTHER:'OTHER'});
  const RAW_NETWORK=/failed to fetch|networkerror|network request failed|load failed|err_(?:connection|network|internet)|fetch failed/i;
  const EDITOR_NOUN=/\b(?:video|clip|timeline|track|project|caption|subtitle|title|text|layer|audio|music track|volume|effect|filter|transition|keyframe|overlay|sticker|frame|playhead|export|media|image|photo|background|thumbnail|speed|colour|color)\b/;
  const EDITOR_VERB=/\b(?:add|apply|change|create|cut|delete|duplicate|edit|export|extract|freeze|generate|hide|import|insert|make|move|mute|open|pause|play|remove|render|replace|resize|rotate|save|seek|select|show|split|start|trim|undo|unmute|upload)\b/;

  function classify(message){
    const text=String(message||'').trim().toLowerCase();
    if(/\b(?:what|which|how many|show|tell me)\b.*\b(?:current project|this project|project duration|project length|selected clip|clips?|tracks?|timeline|playhead|aspect ratio|frame size)\b/.test(text)||/\b(?:current project|project info|project status|what is selected)\b/.test(text))return TYPES.PROJECT_STATE;
    if((EDITOR_VERB.test(text)&&EDITOR_NOUN.test(text))||/^(?:undo|redo|play|pause|save|export|split|ripple delete|add captions?)\b/.test(text))return TYPES.EDITING;
    if(/\b(?:write|rewrite|draft|summarize|summarise|explain|brainstorm|translate|proofread|outline|plan|ideas?|recommend)\b/.test(text))return TYPES.WRITING;
    return TYPES.CONVERSATION;
  }
  function needsEditorContext(type){return type===TYPES.EDITING||type===TYPES.PROJECT_STATE;}
  function classifyIntent(message){
    const value=String(message||'').trim(),text=value.toLowerCase();if(!text)return INTENTS.OTHER;
    const legacy=classify(value),directEditor=/^(?:please\s+)?(?:add|apply|change|create|cut|delete|duplicate|edit|export|extract|freeze|generate|hide|import|insert|make|move|mute|open|pause|play|remove|render|replace|resize|rotate|save|seek|select|show|split|start|trim|undo|unmute|upload)\b/.test(text)||/^(?:can|could|would|will) you (?:please )?(?:add|apply|change|create|cut|delete|duplicate|edit|export|extract|freeze|generate|hide|import|insert|make|move|mute|open|pause|play|remove|render|replace|resize|rotate|save|seek|select|show|split|start|trim|undo|unmute|upload)\b/.test(text);
    if(/\b(?:not working|doesn['’]?t work|won['’]?t work|keeps? (?:failing|crashing|freezing)|failed|failure|error|bug|broken|crash(?:es|ed|ing)?|freez(?:e|es|ing)|lag(?:s|ging)?|slow|stuck|troubleshoot|diagnos(?:e|tic)|why (?:can['’]?t|won['’]?t|isn['’]?t|doesn['’]?t))\b/.test(text))return INTENTS.DIAGNOSTICS;
    if(legacy===TYPES.PROJECT_STATE)return INTENTS.EDITING_COMMAND;
    if(/\b(?:new project|start (?:a )?(?:new )?project|create (?:a )?(?:new )?project|import media|install zorifi)\b/.test(text))return INTENTS.ZORIFI_COMMAND;
    if((directEditor&&EDITOR_NOUN.test(text))||/^(?:undo|redo|play|pause|save|export|split|ripple delete|add captions?)\b/.test(text)||/\b(?:make|move|rotate|resize|trim|split|delete) (?:it|this|that|the selected (?:clip|layer))\b/.test(text))return INTENTS.EDITING_COMMAND;
    if(/\b(?:settings?|preferences?|profile|account|privacy|notifications?|language setting|microphone permission|camera permission|provider configuration)\b/.test(text))return INTENTS.SETTINGS;
    if(/^(?:open|show|go to|return to|install|download)\b.*\b(?:zorifi|home|workspace|media library|ai video|command center|provider|projects?)\b/.test(text)||/\b(?:new zorifi project|import media|install zorifi)\b/.test(text))return INTENTS.ZORIFI_COMMAND;
    if(/\b(?:research|search (?:the )?(?:web|internet|online)|look up|find (?:the )?(?:latest|current)|latest (?:news|information|research)|current (?:news|information)|sources?|fact[- ]check)\b/.test(text))return INTENTS.RESEARCH;
    if(/\b(?:write|rewrite|draft|proofread|summari[sz]e|translate|outline|compose|rephrase|edit my writing)\b/.test(text))return INTENTS.WRITING;
    if(/\b(?:my dream|my goal|life goal|long[- ]term goal|i aspire|my ambition|someday i want|i want to become|help me reach|achieve my goal)\b/.test(text))return INTENTS.DREAM_GOAL;
    if(/\b(?:build|launch|develop|start|make|create)\b.*\b(?:app|website|business|brand|youtube channel|channel|portfolio|game|podcast|product|service|community)\b/.test(text)||/\bbuild (?:it|this) with me\b/.test(text))return INTENTS.BUILD_PROJECT;
    if(/\b(?:brainstorm|creative ideas?|content ideas?|story ideas?|concepts?|creative direction|inspiration|help me create|what should i create)\b/.test(text))return INTENTS.CREATIVE_HELP;
    if(quickConversation(value)||/\b(?:how['’]?s it going|nice to meet you|i feel|i['’]?m feeling|let['’]?s chat|talk with me|just want to talk|keep me company)\b/.test(text))return INTENTS.CASUAL_CONVERSATION;
    if(/^(?:what|why|how|who|when|where|which|can you explain|could you explain|explain|teach me|tell me about|define)\b/.test(text)||/\b(?:what does .* mean|difference between)\b/.test(text))return INTENTS.KNOWLEDGE;
    return INTENTS.OTHER;
  }
  function needsCommandPipeline(intent,message=''){
    if(intent===INTENTS.EDITING_COMMAND||intent===INTENTS.ZORIFI_COMMAND||intent===INTENTS.RESEARCH)return true;
    return intent===INTENTS.SETTINGS&&/^(?:please\s+)?(?:open|show|change|set|update|manage|configure)\b|^(?:can|could|would) you (?:please )?(?:open|show|change|set|update|manage|configure)\b/i.test(String(message).trim());
  }
  function quickConversation(message){return /^(?:hi|hey|hello|good morning|good afternoon|good evening)(?:\s+vanessa)?[!.?]*$/i.test(String(message).trim())||/\b(?:what(?:'s| is) your name|who are you|can i talk to you|may i talk to you|how are you|how do you feel|tell me a joke|make me laugh|thank you|thanks|i(?:'m| am) (?:fine|good|great|okay|well))\b/i.test(String(message));}
  function route(message,{hasAttachments=false,intentContext,responsePlan,workflowContext}={}){
    const workflowEditor=Boolean(workflowContext?.currentStep&&!workflowContext?.requiresClarification),intent=classifyIntent(message),legacy=classify(message),understoodEditor=Boolean(intentContext?.editorIntent&&!intentContext?.requiresClarification),plannedEditor=Boolean(responsePlan?.editorIntent&&!responsePlan?.requiresClarification),type=understoodEditor||plannedEditor||workflowEditor||intent===INTENTS.EDITING_COMMAND?(legacy===TYPES.PROJECT_STATE?TYPES.PROJECT_STATE:TYPES.EDITING):intent===INTENTS.WRITING?TYPES.WRITING:TYPES.CONVERSATION,editorContext=understoodEditor||plannedEditor||workflowEditor||intent===INTENTS.EDITING_COMMAND,commandPipeline=understoodEditor||plannedEditor||workflowEditor||needsCommandPipeline(intent,message);
    const pipeline=editorContext?'editor':commandPipeline?'zorifi-command':intent===INTENTS.WRITING?'conversation-writing':intent===INTENTS.DREAM_GOAL?'future-dream':intent===INTENTS.BUILD_PROJECT?'future-build':intent===INTENTS.DIAGNOSTICS?'future-diagnostics':'conversation';
    return Object.freeze({type,intent,editorContext,commandPipeline,pipeline,hasAttachments:Boolean(hasAttachments)});
  }
  function normalizeHistory(history,{limit=24,maxText=2400}={}){
    if(!Array.isArray(history))return [];
    return history.filter(item=>item&&(item.role==='user'||item.role==='assistant')&&String(item.text||'').trim()).slice(-Math.max(1,Math.min(40,Number(limit)||24))).map(item=>({role:item.role,text:String(item.text).trim().slice(0,Math.max(200,Math.min(6000,Number(maxText)||2400)))}));
  }
  function normalizeProfile(value={}){const displayName=String(value?.displayName||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,40);return displayName?{displayName}:undefined;}
  function normalizeMemories(memories,{limit=6,maxText=300,maxTotal=1200}={}){
    if(!Array.isArray(memories))return [];const output=[];let size=0;
    for(const item of memories){if(!item||typeof item!=='object')continue;const value=String(item.value||'').trim().slice(0,Math.max(80,Math.min(500,Number(maxText)||300)));if(!value)continue;const clean={id:String(item.id||'').slice(0,100),category:String(item.category||'preferences').slice(0,60),key:String(item.key||item.field||'').slice(0,80)||undefined,value,updatedAt:String(item.updatedAt||item.createdAt||'').slice(0,40)||undefined},next=value.length+(clean.key?.length||0);if(size+next>Math.max(200,Math.min(4000,Number(maxTotal)||1200)))break;output.push(clean);size+=next;if(output.length>=Math.max(1,Math.min(12,Number(limit)||6)))break;}return output;
  }
  function normalizeContinuity(value={}){if(!value||typeof value!=='object')return undefined;const list=(items,limit)=>Array.isArray(items)?items.map(item=>String(item||'').trim().slice(0,180)).filter(Boolean).slice(-limit):[],context={currentTopic:String(value.currentTopic||'').trim().slice(0,180),currentTask:String(value.currentTask||'').trim().slice(0,240),currentProject:String(value.currentProject||'').trim().slice(0,120),unresolved:list(value.unresolved,2),recentDecisions:list(value.recentDecisions,2),immediateNextStep:String(value.immediateNextStep||'').trim().slice(0,220),priority:'current_user_message > current_conversation > approved_long_term_memory'};return Object.values(context).some(item=>Array.isArray(item)?item.length:Boolean(item))?context:undefined;}
  function normalizePersonalization(value={}){if(!value||typeof value!=='object')return undefined;const allow=(items,allowed,limit)=>Array.isArray(items)?[...new Set(items.map(item=>String(item||'').trim()).filter(item=>allowed.includes(item)))].slice(0,limit):[],depth=['concise','standard','detailed'].includes(value.responseDepth)?value.responseDepth:'standard',communication=allow(value.communication,['direct','step-by-step','examples','simple-language'],5),workingStyle=allow(value.workingStyle,['structured','test-after-changes','phased','implementation-first','verification'],4),creative=Array.isArray(value.relevantCreativePreferences)?value.relevantCreativePreferences.map(item=>String(item||'').trim().slice(0,120)).filter(Boolean).slice(0,3):[],result={responseDepth:depth,communication,workingStyle,relevantCreativePreferences:creative,priority:'current_instruction > current_conversation > session_continuity > approved_preferences > vanessa_default',...(value.clarificationRequired?{clarificationRequired:true}:{})};while(JSON.stringify(result).length>800&&result.relevantCreativePreferences.length)result.relevantCreativePreferences.pop();return result;}
  function normalizeIntentContext(value={}){if(!value||typeof value!=='object')return undefined;const allowed=['QUESTION','ACTION_REQUEST','CREATIVE_GOAL','INFORMATION_GOAL','DEVELOPMENT_GOAL','CONTINUATION','CLARIFICATION','CORRECTION','MEMORY_REQUEST','REFERENCE_BASED_EDITING','GENERAL_CONVERSATION'],primaryIntent=allowed.includes(value.primaryIntent)?value.primaryIntent:'GENERAL_CONVERSATION',secondaryIntents=Array.isArray(value.secondaryIntents)?[...new Set(value.secondaryIntents.filter(item=>allowed.includes(item)&&item!==primaryIntent))].slice(0,4):[],constraints=Array.isArray(value.constraints)?value.constraints.slice(0,8).map(item=>({type:String(item?.type||'').slice(0,40),value:typeof item?.value==='number'||typeof item?.value==='boolean'?item.value:String(item?.value||'').slice(0,80)})).filter(item=>item.type):[],result={primaryIntent,secondaryIntents,goal:String(value.goal||'').slice(0,300),requestedAction:String(value.requestedAction||'').slice(0,240),constraints,entities:Array.isArray(value.entities)?value.entities.map(item=>String(item||'').slice(0,50)).filter(Boolean).slice(0,12):[],requiresClarification:Boolean(value.requiresClarification),editorIntent:Boolean(value.editorIntent),developmentType:String(value.developmentType||'').slice(0,50)||undefined,reference:value.reference&&typeof value.reference==='object'?{exists:Boolean(value.reference.exists),kind:['video','image','media'].includes(value.reference.kind)?value.reference.kind:'media',transferCharacteristics:Array.isArray(value.reference.transferCharacteristics)?value.reference.transferCharacteristics.map(item=>String(item||'').slice(0,50)).slice(0,14):[]}:undefined};while(JSON.stringify(result).length>1400&&result.reference?.transferCharacteristics.length)result.reference.transferCharacteristics.pop();return result;}
  function normalizeResponsePlan(value={}){if(!value||typeof value!=='object')return undefined;const types=['ANSWER','ASK_CLARIFICATION','CONFIRM_ACTION','ACKNOWLEDGE','EXECUTE_SUPPORTED_ACTION','EXPLAIN','CONTINUE_TASK','HANDLE_CORRECTION','HANDLE_TOPIC_SHIFT','MEMORY_FLOW','DEVELOPMENT_FLOW','GENERAL_CONVERSATION'],modes=['GENERAL','INFORMATION','EDITOR_TASK','REFERENCE_TASK','DEVELOPMENT_TASK','MEMORY_FLOW'],result={responseType:types.includes(value.responseType)?value.responseType:'GENERAL_CONVERSATION',conversationMode:modes.includes(value.conversationMode)?value.conversationMode:'GENERAL',resolvedReference:value.resolvedReference&&typeof value.resolvedReference==='object'?{kind:['video','image','media'].includes(value.resolvedReference.kind)?value.resolvedReference.kind:'media',name:String(value.resolvedReference.name||'').slice(0,120),characteristics:Array.isArray(value.resolvedReference.characteristics)?value.resolvedReference.characteristics.map(item=>String(item||'').slice(0,50)).filter(Boolean).slice(0,12):[]}:undefined,pendingQuestion:String(value.pendingQuestion||'').slice(0,240)||undefined,pendingAction:String(value.pendingAction||'').slice(0,240)||undefined,resolvedTarget:String(value.target||'').slice(0,80),relevantContext:String(value.relevantContext||'').slice(0,220),responseShape:String(value.responseShape||'').slice(0,40),requiresClarification:Boolean(value.requiresClarification)};while(JSON.stringify(result).length>1200&&result.resolvedReference?.characteristics.length)result.resolvedReference.characteristics.pop();return result;}
  function normalizeWorkflowContext(value={}){if(!value||typeof value!=='object')return undefined;const statuses=['ACTIVE','PAUSED','COMPLETED','FAILED','CANCELLED','BLOCKED'],step=item=>item&&typeof item==='object'?{id:String(item.id||'').slice(0,40),description:String(item.description||'').slice(0,160),intent:String(item.intent||'').slice(0,40),target:String(item.target||'').slice(0,80),status:String(item.status||'').slice(0,20)}:null,result={goal:String(value.goal||'').slice(0,300),status:statuses.includes(value.status)?value.status:'ACTIVE',currentStep:step(value.currentStep),remainingSteps:Array.isArray(value.remainingSteps)?value.remainingSteps.map(step).filter(Boolean).slice(0,12):[],constraints:Array.isArray(value.constraints)?value.constraints.slice(0,8).map(item=>({type:String(item?.type||'').slice(0,40),value:typeof item?.value==='number'||typeof item?.value==='boolean'?item.value:String(item?.value||'').slice(0,80)})).filter(item=>item.type):[],target:String(value.target||'').slice(0,80),reference:value.reference&&typeof value.reference==='object'?{kind:String(value.reference.kind||'media').slice(0,20),name:String(value.reference.name||'').slice(0,100),characteristics:Array.isArray(value.reference.characteristics)?value.reference.characteristics.map(item=>String(item||'').slice(0,50)).slice(0,8):[]}:undefined,responseType:String(value.responseType||'WORKFLOW_STATUS').slice(0,40)};while(JSON.stringify(result).length>1600&&result.remainingSteps.length>1)result.remainingSteps.pop();return result;}
  function conversationPayload(message,{history=[],preferredLanguage='en-GB',memories=[],continuity,personalization,intentContext,responsePlan,workflowContext,attachments=[],profile,safetyIdentifier='zorifi-user',route:resolvedRoute}={}){
    const context={},sessionContinuity=normalizeContinuity(continuity),adaptive=normalizePersonalization(personalization),understoodIntent=normalizeIntentContext(intentContext),plannedResponse=normalizeResponsePlan(responsePlan),workflow=normalizeWorkflowContext(workflowContext);if(attachments.length)context.attachments=attachments.slice(0,12);if(sessionContinuity)context.sessionContinuity=sessionContinuity;if(understoodIntent)context.intentContext=understoodIntent;if(plannedResponse)context.responsePlan=plannedResponse;if(workflow)context.workflow=workflow;if(adaptive)context.personalization=adaptive;return {action:'chat',input:{message:String(message||'').trim().slice(0,4000),intent:resolvedRoute?.intent||classifyIntent(message),history:normalizeHistory(history),preferredLanguage:String(preferredLanguage||'en-GB').slice(0,35),memories:normalizeMemories(memories),context:Object.keys(context).length?context:undefined,profile:normalizeProfile(profile),safetyIdentifier:String(safetyIdentifier||'zorifi-user').slice(0,64)}};
  }
  // Browser connectivity hints can be false while the app's gateway is
  // reachable (particularly through a loopback desktop server). Only a real
  // request can establish whether the provider is available.
  function remoteAvailable(environment={}){const protocol=String(environment.protocol||'').toLowerCase();return protocol==='https:'||protocol==='http:';}
  function safeMessage(error,{type=TYPES.CONVERSATION,projectAvailable=true}={}){
    if(type===TYPES.PROJECT_STATE&&!projectAvailable)return 'I can’t read project details because no project is open.';
    if(type===TYPES.EDITING)return 'I couldn’t connect to the editor service, so no changes were made. The open project is safe.';
    if(type===TYPES.WRITING)return 'I can still help offline, but the online language service is unavailable right now.';
    return 'I’m still here and can keep talking with you offline.';
  }
  function conversationErrorMessage(error={},status=0){
    if(error.code==='PRIVACY_CONSENT_REQUIRED')return 'Enable optional AI processing in Privacy & data to let Vanessa answer with Gemini.';
    if(status===401||error.code==='AUTH_REQUIRED'||/sign in|cloud session/i.test(error.message||''))return 'Sign in again to connect Vanessa to the online AI service.';
    if(status===429)return 'Vanessa’s AI provider has reached its usage limit. Please try again later.';
    if(error.code==='PROVIDER_BUSY')return 'Gemini is temporarily busy. Please try again shortly.';
    if(error.code==='PROVIDER_RATE_LIMIT')return 'Gemini has reached its current usage limit. Please try again later.';
    if(error.code==='PROVIDER_TIMEOUT')return 'Gemini took too long to respond. Please try again.';
    if(error.code==='NOT_CONFIGURED')return 'Vanessa’s language provider is not configured. Check the server’s Gemini settings.';
    if(error.kind==='network')return 'Vanessa could not reach the online AI service. Check the connection and try again.';
    if(error.code==='PROVIDER_REJECTED')return 'Gemini rejected the request. Check the server API key, selected model and account access.';
    if(error.code==='STREAM_FAILED')return 'Vanessa’s online response could not finish. Please retry.';
    return 'Vanessa’s online AI service could not answer this request. Please retry or check the provider settings.';
  }
  function internalError(error){const message=String(error?.message||error||'').trim();return {kind:error?.name==='AbortError'?'cancelled':RAW_NETWORK.test(message)?'network':'service',message,code:error?.code};}
  async function requestJson(fetchImpl,url,options={}){
    try{
      const response=await fetchImpl(url,options),data=await response.json().catch(()=>({}));
      if(!response.ok)return {ok:false,status:Number(response.status)||0,data:null,error:{kind:'service',message:String(data.error||'Request failed'),code:data.code}};
      return {ok:true,status:Number(response.status)||200,data,error:null};
    }catch(error){return {ok:false,status:0,data:null,error:internalError(error)};}
  }
  async function requestStream(fetchImpl,url,options={},onText=()=>{}){
    let reader;
    try{
      const response=await fetchImpl(url,options);
      if(!response.ok){const data=await response.json().catch(()=>({}));return {ok:false,status:response.status,data:null,error:{kind:'service',message:String(data.error||'Request failed'),code:data.code}};}
      if(!response.headers.get('content-type')?.includes('text/event-stream')){const data=await response.json();return {ok:true,status:response.status,data,error:null};}
      if(!response.body)throw Error('Missing response stream');
      reader=response.body.getReader();const decoder=new TextDecoder();let buffer='',text='',done=false;
      const frame=value=>{
        const payload=value.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if(!payload)return;
        if(payload==='[DONE]'){done=true;return;}
        const data=JSON.parse(payload);if(data.error)throw Object.assign(Error('The response was interrupted. Please retry.'),{code:data.code});
        if(typeof data.text==='string'){text+=data.text;if(text.length>100000)throw Error('Response too large');onText(text);}
      };
      while(!done){
        if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
        const next=await reader.read();buffer+=decoder.decode(next.value,{stream:!next.done});
        let boundary;while((boundary=/\r?\n\r?\n/.exec(buffer))&&!done){frame(buffer.slice(0,boundary.index).replace(/\r\n/g,'\n'));buffer=buffer.slice(boundary.index+boundary[0].length);}
        if(buffer.length>100000)throw Error('Response too large');
        if(next.done)break;
      }
      if(!done||!text)throw Error('The response ended before completion. Please retry.');
      return {ok:true,status:response.status,data:{text,reply:text},error:null};
    }catch(error){return {ok:false,status:0,data:null,error:internalError(error)};}
    finally{await reader?.cancel().catch(()=>{});reader?.releaseLock();}
  }
  function containsRawNetworkError(text){return RAW_NETWORK.test(String(text||''));}
  return {TYPES,INTENTS,classify,classifyIntent,needsEditorContext,needsCommandPipeline,quickConversation,route,normalizeHistory,normalizeMemories,normalizeContinuity,normalizePersonalization,normalizeIntentContext,normalizeResponsePlan,normalizeWorkflowContext,conversationPayload,remoteAvailable,safeMessage,conversationErrorMessage,internalError,requestJson,requestStream,containsRawNetworkError};
});
