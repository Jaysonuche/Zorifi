(function(root,factory){
  const commonJs=typeof module==='object'&&module.exports&&typeof require==='function';
  const api=factory(commonJs?require('./zorifi-vanessa-memory.js'):root.ZorifiVanessaMemory);
  if(commonJs)module.exports=api;else root.ZorifiVanessaCreativeLearning=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Memory){
  'use strict';

  const SCHEMA='zorifi.creative-learning/1';
  const KEY='zorifi-vanessa-creative-learning-v1';
  const STRATEGIES=Object.freeze(['baseline-v1','cinematic-v1','fashion-v1','social-v1','documentary-v1','interview-v1','corporate-v1','music-video-v1']);
  const STYLES=Object.freeze(['general','cinematic','fashion','social','documentary','interview','corporate','music-video']);
  const DIMENSIONS=Object.freeze(['pacing','transition','typography','colour','music','effect','brand','export','style']);
  const OUTCOMES=Object.freeze(['succeeded','failed','accepted','rejected','corrected','undone']);
  const ISSUES=Object.freeze(['none','pacing','transition','effect','colour','audio-sync','audio-level','text','caption','media','gap','duration','aspect','story','other']);
  const CHECKS=Object.freeze(['pass','fail','partial','unknown']);
  const LIMITS=Object.freeze({queue:100,recent:40,preferences:100,sharedCohort:10,evaluationSamples:20});
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const clean=(value,max=160)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
  const bounded=(value,min,max,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new TypeError(`Invalid ${label}.`);return value;};
  const choice=(value,values,label)=>{if(!values.includes(value))throw new TypeError(`Invalid ${label}.`);return value;};
  function exact(value,keys,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new TypeError(`Invalid ${label} fields.`);}
  function uid(value){if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>128||/[\u0000-\u0020/\\]/.test(value)||['guest','anonymous'].includes(value.toLowerCase()))throw new Error('An authenticated Firebase UID is required for creative learning.');return value;}
  function id(){const cryptoApi=typeof globalThis!=='undefined'?globalThis.crypto:null;if(cryptoApi?.randomUUID)return cryptoApi.randomUUID();return `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,14)}`;}
  function safeText(value,max=160){if(typeof value!=='string'||!value.trim()||value.length>max||Memory.isSensitive(value)||/(?:<script\b|javascript:|\beval\s*\(|\bFunction\s*\(|=>)/i.test(value))throw new TypeError('Creative preferences require bounded non-sensitive text.');return clean(value,max);}
  function preferenceValue(dimension,value){
    choice(dimension,DIMENSIONS,'creative preference');
    if(dimension==='export'){
      exact(value,['aspectRatio','width','height','fps','format'],'export preference');const result={};
      if(own(value,'aspectRatio'))result.aspectRatio=choice(value.aspectRatio,['16:9','9:16','1:1','4:5','4:3','21:9'],'aspect ratio');
      for(const key of ['width','height'])if(own(value,key))result[key]=bounded(value[key],16,8192,key);
      if(own(value,'fps'))result.fps=choice(value.fps,[24,25,30,50,60],'frame rate');
      if(own(value,'format'))result.format=choice(value.format,['mp4','webm'],'export format');
      if(!Object.keys(result).length)throw new TypeError('Export preferences need a setting.');return result;
    }
    if(dimension==='style')return validateStyle(value);
    return safeText(value);
  }
  function validateStyle(value){
    exact(value,['pacing','transitions','effects','colours','typography','music','aspectRatio','durationSeconds'],'style');const result={};
    if(own(value,'pacing'))result.pacing=choice(value.pacing,['slow','balanced','fast'],'pacing');
    for(const key of ['transitions','effects','colours','typography','music'])if(own(value,key)){
      if(!Array.isArray(value[key])||value[key].length>8)throw new TypeError(`Invalid style ${key}.`);
      result[key]=[...new Set(value[key].map(item=>safeText(item,80)))];
    }
    if(own(value,'aspectRatio'))result.aspectRatio=choice(value.aspectRatio,['16:9','9:16','1:1','4:5','4:3','21:9'],'aspect ratio');
    if(own(value,'durationSeconds'))result.durationSeconds=bounded(value.durationSeconds,.1,86400,'style duration');
    if(!Object.keys(result).length)throw new TypeError('The verified style has no supported settings.');return result;
  }
  function durationBucket(seconds){if(seconds==null)return 'unknown';bounded(seconds,0,86400,'duration');return seconds<15?'0-15s':seconds<30?'15-30s':seconds<60?'30-60s':seconds<180?'1-3m':'3m+';}
  function elapsedBucket(seconds){if(seconds==null)return 'unknown';bounded(seconds,0,604800,'approval time');return seconds<30?'0-30s':seconds<120?'30-120s':seconds<600?'2-10m':'10m+';}
  function turnBucket(turns){if(turns==null)return 'unknown';if(!Number.isInteger(turns)||turns<0||turns>1000)throw new TypeError('Invalid correction count.');return turns<2?'0-1':turns<5?'2-4':'5+';}
  function sharedEvent(input){
    exact(input,['id','schema','strategy','style','outcome','issue','quality','duration','turns','elapsed'],'shared event');
    if(input.schema!==SCHEMA||typeof input.id!=='string'||!/^(?:[a-f0-9-]{36}|event-[a-z0-9-]{6,80})$/i.test(input.id))throw new TypeError('Invalid shared event identifier.');
    return {id:input.id,schema:SCHEMA,strategy:choice(input.strategy,STRATEGIES,'shared strategy'),style:choice(input.style,STYLES,'shared style'),outcome:choice(input.outcome,OUTCOMES,'outcome'),issue:choice(input.issue,ISSUES,'issue'),quality:choice(input.quality,CHECKS,'quality'),duration:choice(input.duration,['unknown','0-15s','15-30s','30-60s','1-3m','3m+'],'duration bucket'),turns:choice(input.turns,['unknown','0-1','2-4','5+'],'turn bucket'),elapsed:choice(input.elapsed,['unknown','0-30s','30-120s','2-10m','10m+'],'approval bucket')};
  }
  function feedbackIssue(text){
    if(/\b(?:out of sync|not synchronized|sync|lip sync)\b/i.test(text))return 'audio-sync';
    if(/\b(?:too loud|too quiet|volume|clipp(?:ed|ing)|louder|quieter)\b/i.test(text))return 'audio-level';
    if(/\b(?:missing|broken|offline|unavailable)\s+(?:clip|media|video|footage)\b/i.test(text))return 'media';
    if(/\b(?:subtitle|caption)\b/i.test(text))return 'caption';
    if(/\b(?:font|title|text|typography)\b/i.test(text))return 'text';
    if(/\b(?:transitions?)\b/i.test(text))return 'transition';
    if(/\b(?:effects?|glow|blur|shake)\b/i.test(text))return 'effect';
    if(/\b(?:colou?r|grading|grade|saturation|cinematic)\b/i.test(text))return 'colour';
    if(/\b(?:pacing|slow|fast|rhythm|opening)\b/i.test(text))return 'pacing';
    if(/\b(?:gap|black frame)\b/i.test(text))return 'gap';
    if(/\b(?:duration|seconds?|length|minutes?)\b/i.test(text))return 'duration';
    if(/\b(?:aspect|ratio|vertical|widescreen)\b/i.test(text))return 'aspect';
    return 'other';
  }
  function classifyFeedback(message,context={}){
    const text=clean(message,1000),lower=text.toLowerCase();if(!text)return null;
    if(/^(?:vanessa[, ]+)?(?:stop(?:\s+here)?|cancel|pause)(?:\s+(?:now|editing|this))?[.!]?$/i.test(text))return {kind:'control',control:/^.*pause/i.test(text)?'pause':'stop',scope:'operation',persist:false};
    const negative=/\b(?:don['’]?t|do not|never|hate|dislike|cheap|wrong|mistake|bad|too much|not right)\b/i.test(lower),positive=/\b(?:perfect|love|great|excellent|keep this|this is good)\b/i.test(lower),lasting=/\b(?:remember|always|never|again|from now on|going forward|in future|every project)\b/i.test(lower),temporary=/\b(?:this project|this edit|this time|for now|just here|this section|keep everything else|first \w+ seconds?)\b/i.test(lower),objective=/\b(?:out of sync|missing (?:clip|media|footage)|broken (?:clip|media)|black frame|timeline gap|clipping|wrong (?:subtitle|caption|aspect|duration))\b/i.test(lower),time=text.match(/\b(?:at|around)\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/i),section=/\b(?:opening|first (?:five|5) seconds)\b/i.test(lower)?'opening':/\b(?:ending|outro)\b/i.test(lower)?'ending':'selection';
    const kind=objective||/\b(?:mistake|error)\b/i.test(lower)?'objective-error':positive?'accepted-style':negative?'creative-preference':'project-instruction',issue=feedbackIssue(lower),scope=lasting&&!temporary?'personal':'project';
    const targetIds=Array.isArray(context.targetIds)?context.targetIds.filter(item=>typeof item==='string'&&item.length<=120).slice(0,20):[];
    return {kind,scope,issue,polarity:negative?'avoid':positive?'prefer':'adjust',persist:scope==='personal'&&kind!=='objective-error',requiresApproval:scope==='personal',atSeconds:time?Number(time[1]):null,section,preserveOthers:/\bkeep everything else(?:\s+(?:unchanged|the same))?\b/i.test(lower),targetIds,needsClarification:kind==='creative-preference'&&issue==='other'&&!targetIds.length,verified:false};
  }
  function defaults(){return {schema:SCHEMA,settings:{memoryEnabled:true,sharingConsent:false},recent:[],queue:[],metrics:{succeeded:0,failed:0,accepted:0,rejected:0,corrected:0,undone:0,qualityPass:0,qualityFail:0,qualityUnknown:0,issues:{},approval:{}}};}
  function counters(input){const result=defaults().metrics;for(const key of ['succeeded','failed','accepted','rejected','corrected','undone','qualityPass','qualityFail','qualityUnknown'])result[key]=Number.isInteger(input?.[key])&&input[key]>=0?Math.min(1000000,input[key]):0;for(const key of ISSUES)if(Number.isInteger(input?.issues?.[key])&&input.issues[key]>=0)result.issues[key]=Math.min(1000000,input.issues[key]);for(const key of ['unknown','0-30s','30-120s','2-10m','10m+'])if(Number.isInteger(input?.approval?.[key])&&input.approval[key]>=0)result.approval[key]=Math.min(1000000,input.approval[key]);return result;}
  function metricsSummary(metrics){const m=counters(metrics),executions=m.succeeded+m.failed,reviews=m.accepted+m.rejected,quality=m.qualityPass+m.qualityFail;return {...m,executions,reviews,executionSuccessRate:executions?m.succeeded/executions:null,acceptanceRate:reviews?m.accepted/reviews:null,correctionsPerExecution:executions?m.corrected/executions:null,undosPerExecution:executions?m.undone/executions:null,qualityPassRate:quality?m.qualityPass/quality:null};}
  function styleFromTimeline(state){
    const clips=Array.isArray(state?.clips)?state.clips.filter(item=>item&&item.type!=='audio'&&item.type!=='text'):[],duration=Number(state?.duration)||clips.reduce((max,clip)=>Math.max(max,(Number(clip.start)||0)+(Number(clip.duration)||0)),0);if(!clips.length||!(duration>0))throw new Error('A verified populated timeline is required to remember a style.');
    const unique=(values,max=8)=>[...new Set(values.filter(value=>typeof value==='string'&&value.trim()).map(value=>safeText(value,80)))].slice(0,max),mean=clips.reduce((sum,clip)=>sum+(Number(clip.duration)||0),0)/clips.length;
    const style={pacing:mean<2?'fast':mean>5?'slow':'balanced',transitions:unique(clips.map(clip=>typeof clip.transition==='string'?clip.transition:clip.transition?.id||clip.transitionId||clip.autoCutStyle?.transition)),effects:unique(clips.flatMap(clip=>[...(Array.isArray(clip.effects)?clip.effects:[]).map(effect=>typeof effect==='string'?effect:effect.id),...(clip.effectStack||[]).filter(effect=>effect.enabled!==false).map(effect=>effect.effectId),...(clip.clipEffects||[])])),colours:unique(clips.map(clip=>clip.visualEffects?.filter?.id||clip.filter||clip.filterId||clip.autoCutColor?.mode)),typography:unique((state.clips||[]).filter(clip=>clip.type==='text').map(clip=>clip.fontFamily||clip.font)),durationSeconds:duration};
    const ratio=String(state.aspectRatio||state.ratio||'').replace(/\s/g,'').replace('/',':');if(['16:9','9:16','1:1','4:5','4:3','21:9'].includes(ratio))style.aspectRatio=ratio;return validateStyle(style);
  }
  class CreativeLearning{
    constructor({uid:accountUid,storage,personalMemoryStore=null}={}){
      this.uid=uid(accountUid);if(!storage?.getItem||!storage?.setItem)throw new Error('Device storage is required for persistent creative learning.');if(!Memory?.PersonalMemoryStore)throw new Error('The existing Vanessa personal memory module is required.');
      if(personalMemoryStore&&personalMemoryStore.userId!==this.uid)throw new Error('Personal memory must belong to the authenticated Firebase UID.');
      this.storage=storage;this.key=`${KEY}:${encodeURIComponent(this.uid)}`;this.store=personalMemoryStore||new Memory.PersonalMemoryStore({storage,userId:this.uid});this.state=this.read();
    }
    read(){const result=defaults();try{const saved=JSON.parse(this.storage.getItem(this.key)||'null');if(saved?.schema!==SCHEMA)return result;result.settings={memoryEnabled:saved.settings?.memoryEnabled!==false,sharingConsent:saved.settings?.sharingConsent===true};result.metrics=counters(saved.metrics);for(const key of ['recent','queue'])for(const event of (Array.isArray(saved[key])?saved[key]:[]).slice(-LIMITS[key])){try{result[key].push(sharedEvent(event));}catch{}}if(!result.settings.sharingConsent)result.queue=[];}catch{}return result;}
    refresh(){this.state=this.read();const saved=this.store.read();this.store.memories=saved.memories;this.store.candidates=saved.candidates;return this.state;}
    commit(change){const next=this.read();change(next);this.storage.setItem(this.key,JSON.stringify(next));this.state=next;return this.inspect();}
    setMemoryEnabled(enabled){if(typeof enabled!=='boolean')throw new TypeError('Memory setting must be a boolean.');return this.commit(state=>{state.settings.memoryEnabled=enabled;});}
    setSharingConsent(enabled){if(typeof enabled!=='boolean')throw new TypeError('Sharing consent must be a boolean.');return this.commit(state=>{state.settings.sharingConsent=enabled;if(!enabled)state.queue=[];});}
    preference(item){if(item?.category!=='creative_preferences'||item.metadata?.creativeStage!==2)return null;try{const dimension=item.metadata.dimension,value=preferenceValue(dimension,item.metadata.value),polarity=choice(item.metadata.polarity,['prefer','avoid'],'preference polarity');return {id:item.id,dimension,value,polarity,source:item.source,updatedAt:item.updatedAt};}catch{return null;}}
    preferences(){const saved=this.store.read();this.store.memories=saved.memories;this.store.candidates=saved.candidates;return this.store.inspect().memories.map(item=>this.preference(item)).filter(Boolean).slice(-LIMITS.preferences);}
    rememberPreference(input){
      this.refresh();if(!this.state.settings.memoryEnabled)throw new Error('Creative memory is disabled.');exact(input,['dimension','value','polarity','approved'],'creative preference');if(input.approved!==true)throw new Error('Explicit user approval is required to save a creative preference.');const dimension=input.dimension,value=preferenceValue(dimension,input.value),polarity=choice(input.polarity||'prefer',['prefer','avoid'],'preference polarity'),existing=this.preferences().find(item=>item.dimension===dimension&&item.polarity===polarity&&JSON.stringify(item.value)===JSON.stringify(value));if(existing)return existing;
      if(this.preferences().length>=LIMITS.preferences)throw new Error('Delete an old preference before saving another.');const snapshot=clone(this.store.memories);try{const item=this.store.add({category:'creative_preferences',key:`creative:${dimension}:${polarity}`,value:`${polarity==='avoid'?'Avoid':'Prefer'} ${dimension}: ${typeof value==='string'?value:JSON.stringify(value)}`,source:'explicit-creative-approval',metadata:{creativeStage:2,dimension,value,polarity}});return this.preference(item);}catch(error){this.store.memories=snapshot;throw error;}
    }
    updatePreference(preferenceId,changes){exact(changes,['dimension','value','polarity'],'creative preference update');const current=this.preferences().find(item=>item.id===preferenceId);if(!current)throw new Error('Creative preference was not found in this account.');const dimension=changes.dimension||current.dimension,value=preferenceValue(dimension,own(changes,'value')?changes.value:current.value),polarity=choice(changes.polarity||current.polarity,['prefer','avoid'],'polarity'),snapshot=clone(this.store.memories);try{return this.preference(this.store.update(preferenceId,{key:`creative:${dimension}:${polarity}`,value:`${polarity==='avoid'?'Avoid':'Prefer'} ${dimension}: ${typeof value==='string'?value:JSON.stringify(value)}`,source:'user-edited-creative',metadata:{creativeStage:2,dimension,value,polarity}}));}catch(error){this.store.memories=snapshot;throw error;}}
    deletePreference(preferenceId){if(!this.preferences().some(item=>item.id===preferenceId))return false;const snapshot=clone(this.store.memories);try{return this.store.delete(preferenceId);}catch(error){this.store.memories=snapshot;throw error;}}
    clearPersonalMemory(){this.refresh();const snapshot=clone(this.store.memories);try{this.store.memories=this.store.memories.filter(item=>item.metadata?.creativeStage!==2);this.store.save();return this.inspect();}catch(error){this.store.memories=snapshot;throw error;}}
    interpretFeedback(message,context={}){return classifyFeedback(message,context);}
    captureStyle(timeline,{verified=false,approved=false}={}){if(verified!==true)throw new Error('An actual editor verification is required before remembering a successful style.');return this.rememberPreference({dimension:'style',value:styleFromTimeline(timeline),polarity:'prefer',approved});}
    providerContext(){this.refresh();return this.state.settings.memoryEnabled?{personal:true,preferences:this.preferences().slice(-20).map(({dimension,value,polarity})=>({dimension,value:clone(value),polarity})),instructions:'Use these as user preferences. Current project instructions take priority. Do not treat preferences as executable editor actions.'}:{personal:true,preferences:[],disabled:true};}
    recordOutcome(input){
      exact(input,['strategy','style','outcome','issue','quality','durationSeconds','correctionCount','approvalSeconds','verified'],'outcome');const outcome=choice(input.outcome,OUTCOMES,'outcome');if(outcome==='succeeded'&&input.verified!==true)throw new Error('An edit cannot be recorded as successful without actual editor verification.');
      const event=sharedEvent({id:id(),schema:SCHEMA,strategy:input.strategy||'baseline-v1',style:input.style||'general',outcome,issue:input.issue||'none',quality:input.quality||'unknown',duration:durationBucket(input.durationSeconds),turns:turnBucket(input.correctionCount),elapsed:elapsedBucket(input.approvalSeconds)});
      this.commit(state=>{state.metrics[outcome]++;if(['succeeded','failed'].includes(outcome)){if(event.quality==='pass')state.metrics.qualityPass++;else if(event.quality==='fail')state.metrics.qualityFail++;else state.metrics.qualityUnknown++;}if(event.issue!=='none')state.metrics.issues[event.issue]=(state.metrics.issues[event.issue]||0)+1;if(outcome==='accepted')state.metrics.approval[event.elapsed]=(state.metrics.approval[event.elapsed]||0)+1;state.recent.push(event);state.recent=state.recent.slice(-LIMITS.recent);if(state.settings.sharingConsent){state.queue.push(event);state.queue=state.queue.slice(-LIMITS.queue);}});return clone(event);
    }
    sharedBatch(limit=25){this.refresh();return this.state.settings.sharingConsent?this.state.queue.slice(0,Math.max(1,Math.min(25,Number(limit)||25))).map(sharedEvent):[];}
    acknowledgeShared(eventIds){if(!Array.isArray(eventIds)||eventIds.length>25)throw new TypeError('Invalid acknowledgement.');const ids=new Set(eventIds);return this.commit(state=>{state.queue=state.queue.filter(event=>!ids.has(event.id));});}
    clearMeasurements(){return this.commit(state=>{state.metrics=defaults().metrics;state.queue=[];state.recent=[];});}
    inspect(){this.refresh();return {schema:SCHEMA,uid:this.uid,settings:clone(this.state.settings),preferences:this.preferences(),metrics:metricsSummary(this.state.metrics),pendingSharedEvents:this.state.queue.length,recentOutcomes:clone(this.state.recent),localDeviceOnly:true};}
  }
  function aggregateEvents(events,{distinctUsers=0,minimumCohort=LIMITS.sharedCohort}={}){
    if(!Array.isArray(events)||events.length>100000)throw new TypeError('Invalid learning events.');if(!Number.isInteger(distinctUsers)||distinctUsers<0||!Number.isInteger(minimumCohort)||minimumCohort<LIMITS.sharedCohort)throw new TypeError('Invalid privacy cohort.');
    if(distinctUsers<minimumCohort)return {suppressed:true,reason:'insufficient-independent-consenting-accounts',minimumCohort};
    const metrics=defaults().metrics,seen=new Set(),strategies={};for(const input of events){const event=sharedEvent(input);if(seen.has(event.id))continue;seen.add(event.id);metrics[event.outcome]++;if(['succeeded','failed'].includes(event.outcome)){if(event.quality==='pass')metrics.qualityPass++;else if(event.quality==='fail')metrics.qualityFail++;else metrics.qualityUnknown++;}if(event.issue!=='none')metrics.issues[event.issue]=(metrics.issues[event.issue]||0)+1;if(event.outcome==='accepted')metrics.approval[event.elapsed]=(metrics.approval[event.elapsed]||0)+1;strategies[event.strategy]=(strategies[event.strategy]||0)+1;}
    return {suppressed:false,distinctUsers,samples:seen.size,metrics:metricsSummary(metrics),strategies};
  }
  class StrategyCatalog{
    constructor({manifest,storage=null,key='zorifi-creative-strategy-catalog-v1'}={}){this.storage=storage;this.key=key;this.evaluations=new Map();this.manifest=this.validateManifest(manifest||{schema:'zorifi.creative-strategies/1',active:'baseline-v1',versions:[{version:'baseline-v1',strategy:'baseline-v1'}],history:[]});}
    validateManifest(value){exact(value,['schema','active','versions','history'],'strategy manifest');if(value.schema!=='zorifi.creative-strategies/1'||!Array.isArray(value.versions)||value.versions.length>30||!Array.isArray(value.history)||value.history.length>30)throw new TypeError('Invalid strategy manifest.');const versions=value.versions.map(item=>{exact(item,['version','strategy'],'strategy version');if(typeof item.version!=='string'||!/^[a-z][a-z0-9.-]{2,63}$/.test(item.version))throw new TypeError('Invalid strategy version.');return {version:item.version,strategy:choice(item.strategy,STRATEGIES,'strategy')};});if(new Set(versions.map(item=>item.version)).size!==versions.length||!versions.some(item=>item.version===value.active))throw new TypeError('Invalid active strategy.');return {schema:value.schema,active:value.active,versions,history:value.history.slice(-20).map(item=>{exact(item,['from','to','kind'],'strategy history');if(!versions.some(version=>version.version===item.from)||!versions.some(version=>version.version===item.to)||!['promote','rollback'].includes(item.kind))throw new TypeError('Invalid strategy history.');return clone(item);})};}
    evaluate(version,{candidate,baseline,regression}={}){
      if(!this.manifest.versions.some(item=>item.version===version))throw new Error('Register a reviewed strategy version in the manifest first.');const reasons=[];
      for(const [label,aggregate] of [['candidate',candidate],['baseline',baseline]]){if(aggregate?.suppressed||!aggregate||aggregate.distinctUsers<LIMITS.sharedCohort||aggregate.samples<LIMITS.evaluationSamples||aggregate.metrics?.executions<LIMITS.evaluationSamples||aggregate.metrics?.reviews<LIMITS.evaluationSamples)reasons.push(`${label}-insufficient-evidence`);}
      if(!regression||!Number.isInteger(regression.total)||regression.total<1||regression.passed!==regression.total||regression.criticalChecksPassed!==true)reasons.push('regression-checks-not-passed');
      if(!reasons.length){const a=candidate.metrics,b=baseline.metrics;for(const key of ['executionSuccessRate','acceptanceRate','qualityPassRate'])if(typeof a[key]!=='number'||!Number.isFinite(a[key])||a[key]<0||a[key]>1||typeof b[key]!=='number'||!Number.isFinite(b[key])||b[key]<0||b[key]>1||a[key]+.001<b[key])reasons.push(`${key}-regressed-or-unknown`);for(const key of ['correctionsPerExecution','undosPerExecution'])if(typeof a[key]!=='number'||!Number.isFinite(a[key])||a[key]<0||typeof b[key]!=='number'||!Number.isFinite(b[key])||b[key]<0||a[key]>b[key]+.001)reasons.push(`${key}-regressed-or-unknown`);if(!(a.acceptanceRate>=b.acceptanceRate+.03||a.executionSuccessRate>=b.executionSuccessRate+.03||a.correctionsPerExecution+.05<=b.correctionsPerExecution))reasons.push('no-measured-improvement');}
      const result={version,eligible:reasons.length===0,reasons,baselineVersion:this.manifest.active,requiresHumanReview:true};this.evaluations.set(version,result);return clone(result);
    }
    promote(version,{reviewed=false}={}){const evaluation=this.evaluations.get(version);if(reviewed!==true||!evaluation?.eligible||evaluation.baselineVersion!==this.manifest.active)throw new Error('Promotion requires passing evidence, regressions and an explicit human review of the current baseline.');return this.change(version,'promote');}
    rollback(version,{reviewed=false}={}){const previous=new Set(this.manifest.history.flatMap(item=>[item.from,item.to]));if(reviewed!==true||!previous.has(version)||!this.manifest.versions.some(item=>item.version===version))throw new Error('Rollback requires review and a previously active strategy.');return this.change(version,'rollback');}
    change(version,kind){if(version===this.manifest.active)throw new Error('That strategy is already active.');const before=clone(this.manifest),next=clone(before);next.history.push({from:next.active,to:version,kind});next.history=next.history.slice(-20);next.active=version;this.manifest=this.validateManifest(next);if(this.storage){try{this.storage.setItem(this.key,JSON.stringify(next));}catch(error){this.manifest=before;throw error;}}return this.inspect();}
    inspect(){return clone(this.manifest);}
  }
  return {SCHEMA,KEY,STRATEGIES,STYLES,DIMENSIONS,OUTCOMES,ISSUES,CHECKS,LIMITS,CreativeLearning,StrategyCatalog,classifyFeedback,validateStyle,styleFromTimeline,sharedEvent,aggregateEvents,metricsSummary};
});
