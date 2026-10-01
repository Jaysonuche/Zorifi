(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiVanessaReferenceAnalysis=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const STATUS=Object.freeze({DETECTED:'DETECTED',NOT_DETECTED:'NOT_DETECTED',UNKNOWN:'UNKNOWN',UNSUPPORTED:'UNSUPPORTED',NOT_ANALYZABLE:'NOT_ANALYZABLE',BLOCKED:'BLOCKED'});
  const SUPPORT=Object.freeze({SUPPORTED:'SUPPORTED',PARTIAL:'PARTIAL',UNSUPPORTED:'UNSUPPORTED',BLOCKED:'BLOCKED'});
  const LIMITS=Object.freeze({durationSeconds:600,segments:120,cuts:119,techniques:24,placements:12,blueprintChars:8000,providerPayloadChars:1800,workflowSteps:12,nameChars:120,userIdChars:100});
  const SENSITIVE=/(?:password|passcode|api[ _-]?key|access[ _-]?token|private[ _-]?key|seed phrase|recovery phrase|credit[ _-]?card|debit[ _-]?card|bank[ _-]?(?:account|routing)|\bcvv\b|\bssn\b)/i;
  const CHARACTERISTICS=Object.freeze(['aspectRatio','cuts','segments','pacing','transitions','zoomPatterns','speedChanges','text','captions','overlays','effects','colorTreatment','audio','composition']);
  const CAPABILITY_MAP=Object.freeze({
    aspectRatio:{capability:'aspect-ratio',support:SUPPORT.SUPPORTED,command:'Set the project aspect ratio'},
    cuts:{capability:'split-trim',support:SUPPORT.SUPPORTED,command:'Match the supported cut timing'},
    segments:{capability:'multi-clip-timeline',support:SUPPORT.SUPPORTED,command:'Arrange media into the detected segment pattern'},
    pacing:{capability:'timing-and-speed',support:SUPPORT.SUPPORTED,command:'Match the supported pacing'},
    transitions:{capability:'transitions',support:SUPPORT.SUPPORTED,command:'Apply supported transition equivalents'},
    zoomPatterns:{capability:'keyframe-zoom',support:SUPPORT.SUPPORTED,command:'Apply supported zoom keyframes'},
    speedChanges:{capability:'speed-ramping',support:SUPPORT.SUPPORTED,command:'Apply supported speed changes'},
    text:{capability:'text',support:SUPPORT.SUPPORTED,command:'Add text using the detected placement when available'},
    captions:{capability:'captions',support:SUPPORT.SUPPORTED,command:'Generate and style captions'},
    overlays:{capability:'overlay-layers',support:SUPPORT.SUPPORTED,command:'Add supported overlay layers'},
    effects:{capability:'effects',support:SUPPORT.PARTIAL,command:'Apply the closest supported effect parameters'},
    colorTreatment:{capability:'colour-controls',support:SUPPORT.PARTIAL,command:'Apply the supported colour treatment'},
    audio:{capability:'audio-timeline',support:SUPPORT.SUPPORTED,command:'Preserve the supported audio timing pattern'},
    composition:{capability:'transform-crop',support:SUPPORT.PARTIAL,command:'Recreate the supported composition with crop and transform controls'}
  });
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const clean=(value,max=240)=>String(value==null?'':value).trim().replace(/\s+/g,' ').slice(0,max);
  const finite=value=>Number.isFinite(Number(value))?Number(value):null;
  const bounded=(items,limit)=>Array.isArray(items)?items.slice(0,limit):[];
  const result=(status,value=null,details={})=>({status,value,...details});
  const explicitBoolean=value=>value===true||value===false;
  const safeName=value=>SENSITIVE.test(clean(value,LIMITS.nameChars))?'reference media':clean(value,LIMITS.nameChars);
  function sanitiseObject(value,depth=0){
    if(depth>4)return null;
    if(Array.isArray(value))return value.slice(0,24).map(item=>sanitiseObject(item,depth+1));
    if(value&&typeof value==='object'){const output={};for(const [key,item] of Object.entries(value).slice(0,32)){if(SENSITIVE.test(key))continue;output[clean(key,60)]=sanitiseObject(item,depth+1);}return output;}
    if(typeof value==='string')return SENSITIVE.test(value)?'[redacted]':clean(value,300);
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    if(typeof value==='boolean'||value==null)return value;
    return null;
  }
  function isExplicitReferenceRequest(message=''){
    const text=clean(message,600);
    return /\b(?:use|take|treat)\s+(?:this|that|the attached|the uploaded|it)\s+(?:video\s+)?as\s+(?:the\s+|a\s+)?reference\b/i.test(text)||/\b(?:copy|match|recreate|follow)\s+(?:the|this|that|its)?\s*(?:editing\s+)?(?:style|pacing|transitions?|cuts?|look)\s+(?:of|from|in)\s+(?:this|that|the attached|the uploaded|it)\b/i.test(text)||/\bmake\s+(?:my|this|the)\s+video\s+(?:look\s+)?like\s+(?:this|that|it)\b/i.test(text);
  }
  function identifyReference(message='',attachments=[]){
    const explicit=isExplicitReferenceRequest(message),media=bounded(attachments,LIMITS.techniques).find(item=>['video','media'].includes(clean(item?.kind,20).toLowerCase())||/^video\//i.test(clean(item?.type,60)));
    return {identified:Boolean(explicit&&media),explicit,reference:explicit&&media?{id:clean(media.id,100),name:safeName(media.name),kind:'video'}:null,reason:!explicit?'not-explicit':!media?'missing-video':'explicit-reference'};
  }
  function detectDuration(metadata={}){
    const duration=finite(metadata.duration);
    if(duration==null||duration<=0)return result(metadata.malformed?STATUS.NOT_ANALYZABLE:STATUS.UNKNOWN);
    return result(STATUS.DETECTED,Math.min(duration,LIMITS.durationSeconds),{source:'media-metadata',truncated:duration>LIMITS.durationSeconds,originalDuration:duration});
  }
  function detectAspectRatio(metadata={}){
    const width=finite(metadata.width),height=finite(metadata.height);
    if(width==null||height==null||width<=0||height<=0)return result(metadata.malformed?STATUS.NOT_ANALYZABLE:STATUS.UNKNOWN);
    const ratio=width/height,candidates=[[16/9,'16:9'],[9/16,'9:16'],[1,'1:1'],[4/5,'4:5'],[5/4,'5:4'],[4/3,'4:3'],[3/4,'3:4']],nearest=candidates.sort((a,b)=>Math.abs(ratio-a[0])-Math.abs(ratio-b[0]))[0],label=Math.abs(ratio-nearest[0])<.035?nearest[1]:`${width}:${height}`;
    return result(STATUS.DETECTED,label,{width,height,ratio:Number(ratio.toFixed(4)),orientation:ratio>1.04?'landscape':ratio<.96?'portrait':'square',source:'media-metadata'});
  }
  function detectAudioPresence(metadata={},signals={}){
    const value=signals.hasAudio??metadata.hasAudio??metadata.audio;
    if(!explicitBoolean(value))return result(STATUS.UNKNOWN,null,{reason:'audio-track inspection unavailable'});
    const timing=Array.isArray(signals.audioTiming)?signals.audioTiming.map(finite).filter(item=>item!=null&&item>=0).slice(0,LIMITS.segments):[];
    return result(value?STATUS.DETECTED:STATUS.NOT_DETECTED,value,{source:'media-track-metadata',...(timing.length?{timing, timingSource:'explicit-analysis-signal'}:{})});
  }
  function detectCuts(signals={},durationResult=detectDuration({})){
    if(signals.cutDetectionSupported===false)return result(STATUS.UNSUPPORTED,[],{reason:'local cut sampling unavailable'});
    if(!Array.isArray(signals.cuts))return result(STATUS.UNKNOWN,[],{reason:'no measured cut samples'});
    const duration=durationResult.status===STATUS.DETECTED?durationResult.value:Infinity,values=[...new Set(signals.cuts.map(finite).filter(value=>value!=null&&value>0&&value<duration).map(value=>Number(value.toFixed(3))))].sort((a,b)=>a-b).slice(0,LIMITS.cuts);
    return result(values.length?STATUS.DETECTED:STATUS.NOT_DETECTED,values,{source:'local-frame-difference-sampling',sampled:true,truncated:signals.cuts.length>LIMITS.cuts});
  }
  function detectSegments(cutsResult=detectCuts(),durationResult=detectDuration({})){
    if(durationResult.status!==STATUS.DETECTED)return result(STATUS.UNKNOWN,[],{reason:'duration unavailable'});
    if(![STATUS.DETECTED,STATUS.NOT_DETECTED].includes(cutsResult.status))return result(cutsResult.status===STATUS.UNSUPPORTED?STATUS.UNSUPPORTED:STATUS.UNKNOWN,[]);
    const boundaries=[0,...bounded(cutsResult.value,LIMITS.cuts),durationResult.value],segments=[];
    for(let index=0;index<boundaries.length-1&&segments.length<LIMITS.segments;index++){const start=boundaries[index],end=boundaries[index+1];if(end>start)segments.push({index,start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),duration:Number((end-start).toFixed(3))});}
    return result(STATUS.DETECTED,segments,{count:segments.length,source:'measured-cuts-and-duration'});
  }
  function detectPacing(segmentsResult=detectSegments()){
    if(segmentsResult.status!==STATUS.DETECTED||!segmentsResult.value.length)return result(STATUS.UNKNOWN);
    const average=segmentsResult.value.reduce((sum,item)=>sum+item.duration,0)/segmentsResult.value.length,label=average<1.6?'very-fast':average<3.2?'fast':average<6?'moderate':'slow';
    return result(STATUS.DETECTED,label,{averageSegmentDuration:Number(average.toFixed(3)),segmentCount:segmentsResult.value.length,source:'measured-segment-duration'});
  }
  function detectFlag(signal,name,{unsupported=false,details={}}={}){
    if(unsupported||signal?.supported===false)return result(STATUS.UNSUPPORTED,null,{reason:`${name} analysis unavailable`});
    const explicit=typeof signal==='object'&&signal!==null&&'detected' in signal?signal.detected:signal;
    if(!explicitBoolean(explicit))return result(STATUS.UNKNOWN,null,{reason:`${name} was not reliably measured`});
    const value=typeof signal==='object'&&signal!==null?sanitiseObject(signal.value??signal.items??signal.pattern??explicit):explicit;
    return result(explicit?STATUS.DETECTED:STATUS.NOT_DETECTED,value,{source:'explicit-analysis-signal',...details});
  }
  const detectTextPresence=signals=>detectFlag(signals?.text,'text',{unsupported:signals?.textAnalysisSupported===false});
  const detectCaptionPresence=signals=>detectFlag(signals?.captions,'captions',{unsupported:signals?.captionAnalysisSupported===false});
  const detectTransitions=signals=>detectFlag(signals?.transitions,'transitions',{unsupported:signals?.transitionAnalysisSupported===false});
  const detectZoomPatterns=signals=>detectFlag(signals?.zoomPatterns,'zoom patterns',{unsupported:signals?.zoomAnalysisSupported===false});
  const detectSpeedChanges=signals=>detectFlag(signals?.speedChanges,'speed changes',{unsupported:signals?.speedAnalysisSupported===false});
  const detectVisualEffects=signals=>detectFlag(signals?.effects,'visual effects',{unsupported:signals?.effectAnalysisSupported===false});
  const detectOverlayPatterns=signals=>detectFlag(signals?.overlays,'overlays',{unsupported:signals?.overlayAnalysisSupported===false});
  const detectColorTreatment=signals=>detectFlag(signals?.colorTreatment,'colour treatment',{unsupported:signals?.colorAnalysisSupported===false});
  const detectCompositionPatterns=signals=>detectFlag(signals?.composition,'composition',{unsupported:signals?.compositionAnalysisSupported===false});
  function analyzeReferenceMetadata(metadata={}){
    if(!metadata||typeof metadata!=='object')metadata={malformed:true};
    const malformed=metadata.kind&&clean(metadata.kind,20).toLowerCase()!=='video'||metadata.error===true;
    const source={...metadata,malformed};
    return {name:safeName(source.name)||'reference video',kind:'video',duration:detectDuration(source),aspectRatio:detectAspectRatio(source),audio:detectAudioPresence(source,source.signals||{}),size:finite(source.size),malformed:Boolean(malformed)};
  }
  function providerState(provider={}){const status=finite(provider.status);if(provider.configured===false||status===502||provider.available===false)return {status:STATUS.BLOCKED,reason:status===502?'provider unavailable (502)':'provider not configured'};if(provider.configured===true&&provider.available===true)return {status:STATUS.DETECTED,reason:'provider available'};return {status:STATUS.UNKNOWN,reason:'provider state not checked'};}
  function createReferenceAnalysis({metadata={},signals={},provider={},referenceId='',userId='guest',explicit=false}={}){
    const owner=clean(userId,LIMITS.userIdChars)||'guest',meta=analyzeReferenceMetadata({...metadata,signals}),duration=meta.duration,cuts=detectCuts(signals,duration),segments=detectSegments(cuts,duration),analysis={id:clean(referenceId,100)||`reference-${Date.now().toString(36)}`,userId:owner,explicit:Boolean(explicit),metadata:meta,duration,aspectRatio:meta.aspectRatio,cuts,segments,pacing:detectPacing(segments),text:detectTextPresence(signals),captions:detectCaptionPresence(signals),audio:detectAudioPresence(metadata,signals),transitions:detectTransitions(signals),zoomPatterns:detectZoomPatterns(signals),speedChanges:detectSpeedChanges(signals),effects:detectVisualEffects(signals),overlays:detectOverlayPatterns(signals),colorTreatment:detectColorTreatment(signals),composition:detectCompositionPatterns(signals),provider:providerState(provider),createdAt:new Date().toISOString()};
    analysis.status=meta.malformed?STATUS.NOT_ANALYZABLE:[analysis.duration.status,analysis.aspectRatio.status,analysis.cuts.status].some(value=>value===STATUS.DETECTED)?STATUS.DETECTED:STATUS.NOT_ANALYZABLE;
    return clone(analysis);
  }
  function normaliseCapabilities(capabilities={}){const output={};for(const key of CHARACTERISTICS){const base=CAPABILITY_MAP[key],override=capabilities[key]??capabilities[base.capability];output[key]={...base,support:override===false?SUPPORT.UNSUPPORTED:typeof override==='string'&&Object.values(SUPPORT).includes(override)?override:base.support};}return output;}
  function buildEditingBlueprint(analysis,{selectedCharacteristics=[]}={}){
    const selected=new Set(bounded(selectedCharacteristics,LIMITS.techniques).filter(item=>CHARACTERISTICS.includes(item))),include=key=>!selected.size||selected.has(key),techniques=[];
    for(const key of CHARACTERISTICS){const item=analysis?.[key];if(!include(key)||!item||item.status!==STATUS.DETECTED)continue;techniques.push({id:key,status:item.status,value:clone(item.value),details:sanitiseObject(Object.fromEntries(Object.entries(item).filter(([name])=>!['status','value'].includes(name))))});if(techniques.length>=LIMITS.techniques)break;}
    const blueprint={id:`blueprint-${clean(analysis?.id,80)||Date.now().toString(36)}`,referenceId:clean(analysis?.id,100),userId:clean(analysis?.userId,LIMITS.userIdChars)||'guest',descriptiveOnly:true,duration:include('duration')?clone(analysis?.duration):undefined,aspectRatio:include('aspectRatio')?clone(analysis?.aspectRatio):undefined,segments:include('segments')?clone(analysis?.segments):undefined,techniques,unknown:CHARACTERISTICS.filter(key=>include(key)&&analysis?.[key]?.status===STATUS.UNKNOWN).slice(0,LIMITS.techniques),unsupported:CHARACTERISTICS.filter(key=>include(key)&&analysis?.[key]?.status===STATUS.UNSUPPORTED).slice(0,LIMITS.techniques),createdAt:new Date().toISOString()};
    let json=JSON.stringify(blueprint);if(json.length>LIMITS.blueprintChars){blueprint.techniques=blueprint.techniques.slice(0,8).map(item=>({...item,details:{truncated:true}}));blueprint.truncated=true;json=JSON.stringify(blueprint);if(json.length>LIMITS.blueprintChars)blueprint.techniques=[];}
    return clone(blueprint);
  }
  function compareBlueprintToZorifiCapabilities(blueprint,capabilities={}){
    const map=normaliseCapabilities(capabilities),comparison=[];
    for(const item of bounded(blueprint?.techniques,LIMITS.techniques)){const capability=map[item.id]||{capability:item.id,support:SUPPORT.UNSUPPORTED,command:''};comparison.push({technique:item.id,analysisStatus:item.status,support:capability.support,capability:capability.capability,equivalent:capability.support===SUPPORT.SUPPORTED?capability.command:capability.support===SUPPORT.PARTIAL?capability.command:'',identical:false});}
    for(const key of bounded(blueprint?.unsupported,LIMITS.techniques))if(!comparison.some(item=>item.technique===key))comparison.push({technique:key,analysisStatus:STATUS.UNSUPPORTED,support:SUPPORT.UNSUPPORTED,capability:map[key]?.capability||key,equivalent:'',identical:false});
    return comparison.slice(0,LIMITS.techniques);
  }
  const getSupportedTechniques=comparison=>bounded(comparison,LIMITS.techniques).filter(item=>[SUPPORT.SUPPORTED,SUPPORT.PARTIAL].includes(item.support)&&item.analysisStatus===STATUS.DETECTED);
  const getUnsupportedTechniques=comparison=>bounded(comparison,LIMITS.techniques).filter(item=>[SUPPORT.UNSUPPORTED,SUPPORT.BLOCKED].includes(item.support)||[STATUS.UNSUPPORTED,STATUS.NOT_ANALYZABLE].includes(item.analysisStatus));
  function buildReferenceWorkflowPlan(blueprint,{capabilities={},target='selected_clip'}={}){
    const comparison=compareBlueprintToZorifiCapabilities(blueprint,capabilities),steps=getSupportedTechniques(comparison).slice(0,LIMITS.workflowSteps).map((item,index)=>({id:`reference-step-${String(index+1).padStart(2,'0')}`,intent:item.technique==='aspectRatio'?'ASPECT_RATIO':item.technique==='captions'?'CAPTIONS_ADD':item.technique==='transitions'?'TRANSITION':item.technique==='zoomPatterns'?'ZOOM':item.technique==='speedChanges'||item.technique==='pacing'?'SPEED':item.technique==='audio'?'VOLUME':item.technique==='text'?'TEXT':item.technique==='effects'?'EFFECT':item.technique==='colorTreatment'?'FILTER':item.technique==='cuts'||item.technique==='segments'?'TRIM':'EDIT',description:item.equivalent,commandText:item.equivalent,target:clean(target,100)||'selected_clip',status:'PENDING',requiresConfirmation:true,executable:true,source:'reference-blueprint'}));
    return {blueprintId:clean(blueprint?.id,120),descriptiveOnly:true,requiresConfirmation:true,routeThrough:'Step8Workflow>Router>Permissions>EditorBridge>Transaction',steps,unsupported:getUnsupportedTechniques(comparison),comparison};
  }
  function buildProviderPayload(analysis){
    const payload={referenceId:clean(analysis?.id,100),metadata:{duration:analysis?.duration?.status===STATUS.DETECTED?analysis.duration.value:null,aspectRatio:analysis?.aspectRatio?.status===STATUS.DETECTED?analysis.aspectRatio.value:null,width:analysis?.aspectRatio?.width||null,height:analysis?.aspectRatio?.height||null,audio:analysis?.audio?.status},localSignals:{cuts:bounded(analysis?.cuts?.value,30),pacing:analysis?.pacing?.value||null},requested:['transitions','zoomPatterns','speedChanges','text','captions','effects','overlays','colorTreatment','composition']};
    let json=JSON.stringify(payload);if(json.length>LIMITS.providerPayloadChars){payload.localSignals.cuts=payload.localSignals.cuts.slice(0,8);json=JSON.stringify(payload);}return clone(payload);
  }
  function inspectReferenceAnalysis(analysis,{userId}={}){if(!analysis)return null;if(userId&&clean(userId,LIMITS.userIdChars)!==analysis.userId)return null;return clone(analysis);}
  function characteristicChanges(message='',current=[]){
    const text=clean(message,600).toLowerCase(),selected=new Set(current.filter(item=>CHARACTERISTICS.includes(item))),mentioned=[];
    const aliases={transitions:/\btransitions?\b/,pacing:/\bpacing|rhythm\b/,cuts:/\bcuts?|cut timing\b/,zoomPatterns:/\bzooms?\b/,speedChanges:/\bspeed(?: changes?| ramps?| ramping)?\b/,text:/\btext\b/,captions:/\bcaptions?|subtitles?\b/,overlays:/\boverlays?\b/,effects:/\beffects?\b/,colorTreatment:/\bcolou?rs?|grading|look\b/,audio:/\baudio|music|sound\b/,composition:/\bcomposition|framing\b/,aspectRatio:/\baspect ratio|9:16|16:9|square|vertical|landscape\b/};
    for(const [key,pattern] of Object.entries(aliases))if(pattern.test(text))mentioned.push(key);
    if(/\b(?:don['’]?t|do not|remove|exclude|without|skip|not)\b/.test(text))mentioned.forEach(key=>selected.delete(key));else if(/\b(?:copy|keep|include|use|match|apply|add)\b/.test(text))mentioned.forEach(key=>selected.add(key));
    return [...selected].slice(0,LIMITS.techniques);
  }
  class ReferenceAnalysisManager{
    constructor({userId='guest',capabilities={}}={}){this.userId=clean(userId,LIMITS.userIdChars)||'guest';this.capabilities=clone(capabilities);this.reference=null;this.analysis=null;this.selectedCharacteristics=[];}
    selectReference(reference,{explicit=false}={}){if(!explicit)throw new Error('Reference selection must be explicit.');this.reference={id:clean(reference?.id,100)||`reference-${Date.now().toString(36)}`,name:safeName(reference?.name)||'reference video',kind:'video'};this.analysis=null;this.selectedCharacteristics=[];return clone(this.reference);}
    analyze(input={}){if(!this.reference)throw new Error('Select a reference first.');this.analysis=createReferenceAnalysis({...input,referenceId:this.reference.id,userId:this.userId,explicit:true});return this.inspect();}
    updateSelection(message){if(!this.analysis)return [];if(/\bcopy everything\b/i.test(clean(message,600))){const blueprint=buildEditingBlueprint(this.analysis),comparison=compareBlueprintToZorifiCapabilities(blueprint,this.capabilities);this.selectedCharacteristics=getSupportedTechniques(comparison).map(item=>item.technique).slice(0,LIMITS.techniques);}else this.selectedCharacteristics=characteristicChanges(message,this.selectedCharacteristics);return clone(this.selectedCharacteristics);}
    selectCharacteristics(items=[]){this.selectedCharacteristics=[...new Set(items.filter(item=>CHARACTERISTICS.includes(item)))].slice(0,LIMITS.techniques);return clone(this.selectedCharacteristics);}
    removeCharacteristics(items=[]){const remove=new Set(items);this.selectedCharacteristics=this.selectedCharacteristics.filter(item=>!remove.has(item));return clone(this.selectedCharacteristics);}
    buildBlueprint(){if(!this.analysis)return null;return buildEditingBlueprint(this.analysis,{selectedCharacteristics:this.selectedCharacteristics});}
    buildWorkflowPlan(options={}){const blueprint=this.buildBlueprint();return blueprint?buildReferenceWorkflowPlan(blueprint,{...options,capabilities:this.capabilities}):null;}
    inspect(){return {userId:this.userId,reference:clone(this.reference),analysis:inspectReferenceAnalysis(this.analysis,{userId:this.userId}),selectedCharacteristics:clone(this.selectedCharacteristics),blueprint:this.buildBlueprint()};}
    clear(){this.reference=null;this.analysis=null;this.selectedCharacteristics=[];}
  }
  return {STATUS,SUPPORT,LIMITS,CHARACTERISTICS,ReferenceAnalysisManager,isExplicitReferenceRequest,identifyReference,createReferenceAnalysis,analyzeReferenceMetadata,detectCuts,detectSegments,detectPacing,detectAspectRatio,detectDuration,detectTextPresence,detectCaptionPresence,detectAudioPresence,detectTransitions,detectZoomPatterns,detectSpeedChanges,detectVisualEffects,detectOverlayPatterns,detectColorTreatment,detectCompositionPatterns,buildEditingBlueprint,compareBlueprintToZorifiCapabilities,getSupportedTechniques,getUnsupportedTechniques,buildReferenceWorkflowPlan,buildProviderPayload,inspectReferenceAnalysis,characteristicChanges};
});
