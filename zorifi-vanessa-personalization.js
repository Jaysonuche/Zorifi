(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiVanessaPersonalization=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const LIMITS=Object.freeze({memories:8,payloadChars:800,creative:3,communication:5,workingStyle:4});
  const SENSITIVE=/(?:password|passcode|api[ _-]?key|access[ _-]?token|private[ _-]?key|seed phrase|recovery phrase|credit[ _-]?card|debit[ _-]?card|bank[ _-]?(?:account|routing)|\bcvv\b|\bssn\b)/i;
  const TECHNICAL=/(?:zorifi|code|coding|develop|implementation|architecture|test|debug|bug|build|deploy|project|software|app|website|workflow|phase|verify)/i;
  const CREATIVE=/(?:video|edit|editing|clip|timeline|content|cinematic|visual|audio|music|caption|effect|transition|animation|thumbnail|film|creative)/i;
  const COMPLEX=/(?:implement|architecture|diagnos|debug|compare|analyse|analyze|explain|design|plan|workflow|multiple|complete|comprehensive|technical)/i;
  const TEMPORARY=/(?:today|for now|this time|in this conversation|for this conversation|currently|at the moment|this week|temporarily)/i;
  const LASTING=/(?:from now on|going forward|always|in future|remember|keep .+ in mind)/i;

  function clean(value,max=500){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max);}
  function unique(values,limit){return [...new Set(values.filter(Boolean))].slice(0,limit);}
  function approved(items=[]){return items.filter(item=>item&&typeof item==='object'&&item.approved!==false&&item.status!=='candidate'&&item.status!=='rejected'&&!SENSITIVE.test(`${item.key||''} ${item.value||''}`)&&clean(item.value));}
  function directive(text){
    const value=clean(text,1200).toLowerCase();
    const concise=/(?:be concise|keep it (?:short|brief)|short answer|answer briefly|briefly|just (?:give|tell|show) me|final answer only|no explanation|don['’]?t explain)/i.test(value);
    const detailed=/(?:in detail|detailed|deeply|in[- ]depth|thorough|comprehensive|explain everything|full explanation)/i.test(value);
    const noSteps=/(?:no steps|without steps|don['’]?t use steps|just (?:the )?final answer)/i.test(value);
    const stepByStep=!noSteps&&/(?:step[- ]by[- ]step|in steps|walk me through)/i.test(value);
    const noExamples=/(?:no examples|without examples)/i.test(value);
    const examples=!noExamples&&/(?:with examples?|give (?:me )?examples?|include examples?)/i.test(value);
    const simple=/(?:simple language|plain language|explain simply|easy to understand)/i.test(value);
    return {depth:detailed?'detailed':concise?'concise':null,stepByStep:stepByStep?true:noSteps?false:null,examples:examples?true:noExamples?false:null,simpleLanguage:simple||null,direct:concise||null,temporary:TEMPORARY.test(value),lasting:LASTING.test(value)};
  }
  function memoryFlags(value){
    const text=clean(value).toLowerCase();
    return {concise:/(?:prefer|like|want).{0,30}(?:concise|brief|short|direct answer)|(?:concise|brief) (?:answers?|responses?)/i.test(text),detailed:/(?:prefer|like|want).{0,35}(?:detailed|technical|in[- ]depth|deep) (?:answers?|responses?|explanations?)|detailed technical explanations?/i.test(text),stepByStep:/(?:step[- ]by[- ]step|clear steps|instructions? in steps)/i.test(text),examples:/\bexamples?\b/i.test(text),simpleLanguage:/(?:simple|plain) language/i.test(text),direct:/(?:direct answers?|straight to the point|no fluff)/i.test(text)};
  }
  function workingFlags(value){const text=clean(value).toLowerCase();return {structured:/(?:structured|clear workflow|organised|organized)/i.test(text),testAfterChanges:/(?:test|testing).{0,30}(?:after|each|change|implementation)|after.{0,20}test/i.test(text),phased:/(?:phase[- ]based|in phases|one phase|stepwise development)/i.test(text),implementationFirst:/(?:implementation[- ]first|implement first|complete implementation|implementation prompts?)/i.test(text),verification:/(?:verification|verify|explicit report|test report)/i.test(text)};}
  function contextKind(message,{route={},sessionContinuity={}}={}){const joined=`${clean(message,2000)} ${clean(sessionContinuity.currentTopic,180)} ${clean(sessionContinuity.currentTask,240)} ${clean(sessionContinuity.currentProject,120)}`,intent=clean(route.intent,60);return {technical:TECHNICAL.test(joined)||/(?:BUILD_PROJECT|DIAGNOSTICS|ZORIFI_COMMAND)/.test(intent),creative:CREATIVE.test(joined)||/(?:CREATIVE_HELP|EDITING_COMMAND)/.test(intent),complex:COMPLEX.test(joined)||joined.split(/\s+/).length>40,simple:/^(?:what|who|when|where|define)\b/i.test(clean(message))&&clean(message).split(/\s+/).length<14};}

  class PersonalizationEngine{
    constructor({memoryStore,limits={}}={}){
      if(!memoryStore?.inspect)throw new Error('PersonalizationEngine requires the existing PersonalMemoryStore.');
      this.memoryStore=memoryStore;this.limits={...LIMITS,...limits,memories:Math.min(10,Math.max(1,Number(limits.memories)||LIMITS.memories)),payloadChars:Math.min(1200,Math.max(300,Number(limits.payloadChars)||LIMITS.payloadChars))};this.last=null;
    }
    memories(extra=[]){const state=this.memoryStore.inspect(),combined=[...state.memories,...extra],seen=new Set(),result=[];for(const item of approved(combined)){const key=item.id||`${item.category}:${clean(item.value).toLowerCase()}`;if(seen.has(key))continue;seen.add(key);result.push(item);if(result.length>=this.limits.memories)break;}return result;}
    getCommunicationPreferences(memories=[]){const flags={};for(const item of approved(memories).filter(item=>['communication_preferences','preferences'].includes(item.category))){const parsed=memoryFlags(item.value);for(const [key,value] of Object.entries(parsed))if(value)flags[key]=true;}return flags;}
    getWorkingStyle(memories=[],relevant=true){if(!relevant)return {};const flags={};for(const item of approved(memories).filter(item=>['working_style','preferences','projects','ongoing_context'].includes(item.category))){const parsed=workingFlags(item.value);for(const [key,value] of Object.entries(parsed))if(value)flags[key]=true;}return flags;}
    getCreativePreferences(memories=[],relevant=true){if(!relevant)return [];return unique(approved(memories).filter(item=>item.category==='creative_preferences').map(item=>clean(item.value,120)),this.limits.creative);}
    getRelevantInteractionPreferences(message,options={}){const memories=this.memories(options.approvedMemories),kind=contextKind(message,options);return {memories,kind,communication:this.getCommunicationPreferences(memories),workingStyle:this.getWorkingStyle(memories,kind.technical),creativePreferences:this.getCreativePreferences(memories,kind.creative)};}
    resolvePersonalizationPriority(message,{conversation=[],sessionContinuity={},communication={},kind=contextKind(message,{sessionContinuity})}={}){
      const current=directive(message),recent=[...conversation].reverse().filter(item=>item?.role==='user').map(item=>directive(item.text)).find(item=>item.depth||item.stepByStep!==null||item.examples!==null),session=directive(`${sessionContinuity.currentTopic||''} ${sessionContinuity.currentTask||''}`),memoryDepth=communication.concise&&communication.detailed?(kind.technical&&kind.complex?'detailed':kind.simple?'concise':null):communication.detailed?'detailed':communication.concise?'concise':null;
      const responseDepth=current.depth||recent?.depth||session.depth||memoryDepth||(kind.technical&&kind.complex?'detailed':'standard'),clarificationRequired=!current.depth&&!recent?.depth&&!session.depth&&communication.concise&&communication.detailed&&!kind.simple&&!(kind.technical&&kind.complex);
      return {responseDepth,stepByStep:current.stepByStep??recent?.stepByStep??session.stepByStep??Boolean(communication.stepByStep),examples:current.examples??recent?.examples??session.examples??Boolean(communication.examples),simpleLanguage:current.simpleLanguage??recent?.simpleLanguage??session.simpleLanguage??Boolean(communication.simpleLanguage),direct:current.direct??recent?.direct??session.direct??Boolean(communication.direct||responseDepth==='concise'),temporary:Boolean(current.temporary),clarificationRequired,priority:'current_instruction > current_conversation > session_continuity > approved_preferences > vanessa_default'};
    }
    buildPersonalizationContext(message,options={}){
      const relevant=this.getRelevantInteractionPreferences(message,options),resolved=this.resolvePersonalizationPriority(message,{...options,communication:relevant.communication,kind:relevant.kind}),communication=unique([resolved.direct&&'direct',resolved.stepByStep&&'step-by-step',resolved.examples&&'examples',resolved.simpleLanguage&&'simple-language'],this.limits.communication),workingStyle=unique(Object.entries(relevant.workingStyle).filter(([,value])=>value).map(([key])=>key.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)),this.limits.workingStyle);
      const payload={responseDepth:resolved.responseDepth,communication,workingStyle,relevantCreativePreferences:relevant.creativePreferences,priority:resolved.priority,...(resolved.clarificationRequired?{clarificationRequired:true}:{})};
      while(JSON.stringify(payload).length>this.limits.payloadChars&&payload.relevantCreativePreferences.length)payload.relevantCreativePreferences.pop();
      while(JSON.stringify(payload).length>this.limits.payloadChars&&payload.workingStyle.length)payload.workingStyle.pop();
      this.last={payload,temporary:resolved.temporary,relevantContext:{technical:relevant.kind.technical,creative:relevant.kind.creative},approvedPreferenceCount:relevant.memories.length,limits:{...this.limits}};return {...this.last,adaptiveInstructions:this.buildAdaptiveInstructions(payload)};
    }
    buildAdaptiveInstructions(value={}){const payload=value.payload||value,parts=[`Use ${['concise','standard','detailed'].includes(payload.responseDepth)?payload.responseDepth:'standard'} response depth.`];if(payload.communication?.includes('direct'))parts.push('Be direct.');if(payload.communication?.includes('step-by-step'))parts.push('Use clear steps when useful.');if(payload.communication?.includes('examples'))parts.push('Include a relevant example when useful.');if(payload.communication?.includes('simple-language'))parts.push('Prefer plain language.');if(payload.workingStyle?.includes('test-after-changes'))parts.push('For relevant technical work, include testing and verification.');if(payload.workingStyle?.includes('phased'))parts.push('For relevant project work, use phased structure.');if(payload.clarificationRequired)parts.push('If response depth materially affects the answer, ask whether concise or detailed is preferred.');return clean(parts.join(' '),700);}
    inspectPersonalization(){return this.last?JSON.parse(JSON.stringify(this.last)):null;}
  }

  return {LIMITS,PersonalizationEngine,directive,memoryFlags,workingFlags,contextKind};
});
