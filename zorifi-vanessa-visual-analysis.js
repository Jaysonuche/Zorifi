(function(root,factory){
  const commonJs=typeof window==='undefined'&&typeof module==='object'&&module.exports&&typeof require==='function';
  const dependency=commonJs?require('./zorifi-vanessa-reference-analysis.js'):root.ZorifiVanessaReferenceAnalysis;
  const api=factory(dependency);
  if(commonJs)module.exports=api;
  else root.ZorifiVanessaVisualAnalysis=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(ReferenceAnalysis){
  'use strict';

  if(!ReferenceAnalysis)throw new Error('Step 9 reference analysis is required.');
  const STATUS=ReferenceAnalysis.STATUS;
  const SUPPORT=Object.freeze({SUPPORTED:'SUPPORTED',PARTIALLY_SUPPORTED:'PARTIALLY_SUPPORTED',UNSUPPORTED:'UNSUPPORTED',UNKNOWN:'UNKNOWN',BLOCKED:'BLOCKED'});
  const EVIDENCE=Object.freeze({MEASURED:'MEASURED',INFERRED:'INFERRED',UNAVAILABLE:'UNAVAILABLE'});
  const LIMITS=Object.freeze({durationSeconds:600,sampledFrames:160,analysisWidth:32,analysisHeight:18,segments:120,characteristics:24,blueprintChars:12000,providerPayloadChars:2200,workflowSteps:12,analysisTimeMs:18000,userIdChars:100,nameChars:120});
  const CHARACTERISTICS=Object.freeze(['aspectRatio','cutPattern','pacingCurve','shotDurationPattern','transitionPattern','zoomPattern','movementPattern','speedPattern','textPattern','captionPattern','overlayPattern','effectPattern','colorTreatment','composition','audioVisualTiming','editingRhythm']);
  const SENSITIVE=/(?:password|passcode|api[ _-]?key|access[ _-]?token|private[ _-]?key|seed phrase|recovery phrase|credit[ _-]?card|debit[ _-]?card|bank[ _-]?(?:account|routing)|\bcvv\b|\bssn\b)/i;
  const CAPABILITIES=Object.freeze({
    aspectRatio:{support:SUPPORT.SUPPORTED,capability:'project-aspect-ratio',can:'Set supported project aspect ratios.',cannot:''},
    cutPattern:{support:SUPPORT.SUPPORTED,capability:'timeline-split-trim',can:'Apply approximate measured cut timing to the user’s clips.',cannot:'Cannot copy source footage or guarantee frame-identical timing.'},
    pacingCurve:{support:SUPPORT.SUPPORTED,capability:'timeline-pacing',can:'Adjust supported clip durations and timing.',cannot:'Cannot invent missing target coverage.'},
    shotDurationPattern:{support:SUPPORT.SUPPORTED,capability:'clip-duration',can:'Apply supported shot-duration patterns.',cannot:'Cannot extend unavailable source footage.'},
    transitionPattern:{support:SUPPORT.PARTIALLY_SUPPORTED,capability:'transitions',can:'Apply matching Zorifi transitions when an equivalent exists.',cannot:'Cannot reproduce unidentified or unavailable transition algorithms.'},
    zoomPattern:{support:SUPPORT.SUPPORTED,capability:'scale-keyframes',can:'Create editable scale keyframes for measured zoom timing.',cannot:'Cannot infer a camera lens move from ordinary subject movement.'},
    movementPattern:{support:SUPPORT.PARTIALLY_SUPPORTED,capability:'position-keyframes',can:'Create supported position keyframes from verified movement patterns.',cannot:'Cannot separate camera motion from subject motion without verified tracking data.'},
    speedPattern:{support:SUPPORT.SUPPORTED,capability:'speed-ramping',can:'Apply supported speed changes and ramps.',cannot:'Cannot recover source frames missing from the target media.'},
    textPattern:{support:SUPPORT.PARTIALLY_SUPPORTED,capability:'text-studio',can:'Recreate supported timing, placement and broad styling.',cannot:'Cannot reproduce text content when OCR is unknown.'},
    captionPattern:{support:SUPPORT.PARTIALLY_SUPPORTED,capability:'captions',can:'Generate editable captions and apply supported placement/style.',cannot:'Cannot guarantee the reference transcript without reliable speech recognition.'},
    overlayPattern:{support:SUPPORT.SUPPORTED,capability:'overlay-layers',can:'Place user-provided overlays on supported tracks.',cannot:'Cannot copy overlay artwork from the reference.'},
    effectPattern:{support:SUPPORT.PARTIALLY_SUPPORTED,capability:'effects',can:'Apply an identified Zorifi equivalent when available.',cannot:'Cannot substitute an unidentified effect and call it identical.'},
    colorTreatment:{support:SUPPORT.PARTIALLY_SUPPORTED,capability:'colour-controls',can:'Match broad measured brightness, contrast and saturation trends.',cannot:'Cannot claim or reproduce an exact filter/LUT unless identified.'},
    composition:{support:SUPPORT.PARTIALLY_SUPPORTED,capability:'transform-crop',can:'Match supported framing with crop, scale and position.',cannot:'Cannot reliably identify subjects without verified vision data.'},
    audioVisualTiming:{support:SUPPORT.PARTIALLY_SUPPORTED,capability:'audio-timeline',can:'Align edits to verified audio timing markers.',cannot:'Cannot claim beat alignment when beats were not measured.'},
    editingRhythm:{support:SUPPORT.SUPPORTED,capability:'timeline-rhythm',can:'Apply measured pacing and cut-density patterns.',cannot:'Cannot duplicate copyrighted footage or guarantee an identical edit.'}
  });
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const clean=(value,max=240)=>String(value==null?'':value).trim().replace(/\s+/g,' ').slice(0,max);
  const finite=value=>Number.isFinite(Number(value))?Number(value):null;
  const bounded=(items,limit)=>Array.isArray(items)?items.slice(0,limit):[];
  const round=(value,digits=3)=>Number(Number(value).toFixed(digits));
  const measured=(status,value,details={})=>({status,value,evidence:EVIDENCE.MEASURED,confidenceBand:status===STATUS.DETECTED?'HIGH':'MEDIUM',...details});
  const unavailable=(status=STATUS.UNKNOWN,reason='not reliably measured',details={})=>({status,value:null,evidence:EVIDENCE.UNAVAILABLE,confidenceBand:'NONE',reason,...details});
  function sanitise(value,depth=0){
    if(depth>4)return null;
    if(Array.isArray(value))return value.slice(0,LIMITS.characteristics).map(item=>sanitise(item,depth+1));
    if(value&&typeof value==='object'){const output={};for(const [key,item] of Object.entries(value).slice(0,36)){if(SENSITIVE.test(key))continue;output[clean(key,60)]=sanitise(item,depth+1);}return output;}
    if(typeof value==='string')return SENSITIVE.test(value)?'[redacted]':clean(value,320);
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    if(typeof value==='boolean'||value==null)return value;
    return null;
  }
  function validateReference(reference={},target={}){
    const kind=clean(reference.kind||reference.type,30).toLowerCase(),id=clean(reference.id,100),targetId=clean(target.id||target.targetId,100);
    if(kind&&!['video','media'].includes(kind)&&!kind.startsWith('video/'))return {valid:false,status:STATUS.NOT_ANALYZABLE,reason:'reference must be a video'};
    if(!id&&!clean(reference.name,LIMITS.nameChars))return {valid:false,status:STATUS.NOT_ANALYZABLE,reason:'reference identity is missing'};
    if(id&&targetId&&id===targetId)return {valid:false,status:STATUS.BLOCKED,reason:'reference media cannot be the edit target'};
    return {valid:true,status:STATUS.DETECTED,referenceId:id||clean(reference.name,LIMITS.nameChars),targetId:targetId||null,separate:!targetId||id!==targetId};
  }
  function verifiedSignal(signal,label){
    if(signal?.status&&Object.values(STATUS).includes(signal.status))return {...clone(signal),evidence:signal.evidence||EVIDENCE.UNAVAILABLE,confidenceBand:signal.confidenceBand||'NONE'};
    if(signal?.supported===false)return unavailable(STATUS.UNSUPPORTED,`${label} analysis is unsupported`);
    if(signal?.blocked===true)return unavailable(STATUS.BLOCKED,`${label} analysis is blocked`);
    if(signal?.measured!==true)return unavailable(STATUS.UNKNOWN,`${label} was not reliably measured`,signal?.inference?{inference:sanitise(signal.inference),evidence:EVIDENCE.INFERRED}:{});
    const detected=signal.detected!==false,value=sanitise(signal.value??signal.items??signal.pattern??detected);
    return measured(detected?STATUS.DETECTED:STATUS.NOT_DETECTED,value,{source:clean(signal.source,100)||'verified-analysis-signal',confidenceBand:['HIGH','MEDIUM','LOW'].includes(signal.confidenceBand)?signal.confidenceBand:'MEDIUM'});
  }
  function analyzeCuts(step9={}){
    const cuts=step9.cuts||unavailable(),segments=step9.segments||unavailable();
    if(![STATUS.DETECTED,STATUS.NOT_DETECTED].includes(cuts.status))return unavailable(cuts.status===STATUS.UNSUPPORTED?STATUS.UNSUPPORTED:STATUS.UNKNOWN,'measured cuts are unavailable');
    const values=bounded(cuts.value,LIMITS.segments-1).map(finite).filter(value=>value!=null);
    return measured(values.length?STATUS.DETECTED:STATUS.NOT_DETECTED,{times:values,count:values.length,segments:bounded(segments.value,LIMITS.segments)},{source:cuts.source||'step9-local-cut-analysis'});
  }
  function analyzeShotDurations(step9={}){
    const segments=bounded(step9.segments?.value,LIMITS.segments).filter(item=>finite(item?.duration)>0);
    if(step9.segments?.status!==STATUS.DETECTED||!segments.length)return unavailable(STATUS.UNKNOWN,'shot durations require measured cuts and duration');
    const durations=segments.map(item=>round(item.duration)),average=durations.reduce((sum,value)=>sum+value,0)/durations.length;
    return measured(STATUS.DETECTED,{durations,average:round(average),minimum:round(Math.min(...durations)),maximum:round(Math.max(...durations)),count:durations.length},{source:'step9-measured-segments'});
  }
  function analyzePacing(step9={},shotDurations=analyzeShotDurations(step9)){
    if(shotDurations.status!==STATUS.DETECTED)return unavailable(STATUS.UNKNOWN,'pacing requires measured shot durations');
    const durations=shotDurations.value.durations,window=Math.max(1,Math.ceil(durations.length/4)),curve=[];
    for(let index=0;index<durations.length;index+=window){const slice=durations.slice(index,index+window),average=slice.reduce((sum,value)=>sum+value,0)/slice.length;curve.push({segment:index/window,averageShotDuration:round(average),pace:average<1.6?'very-fast':average<3.2?'fast':average<6?'moderate':'slow'});}
    const changes=curve.slice(1).filter((item,index)=>item.pace!==curve[index].pace).length;
    return measured(STATUS.DETECTED,{overall:step9.pacing?.value||curve[0].pace,curve,changes},{source:'measured-shot-duration-windows'});
  }
  function analyzeColor(frameSamples=[]){
    const samples=bounded(frameSamples,LIMITS.sampledFrames).filter(item=>finite(item?.brightness)!=null&&finite(item?.contrast)!=null&&finite(item?.saturation)!=null);
    if(samples.length<2)return unavailable(STATUS.UNKNOWN,'colour trends require at least two measured frame samples');
    const average=key=>round(samples.reduce((sum,item)=>sum+Number(item[key]),0)/samples.length),trend=key=>{const third=Math.max(1,Math.floor(samples.length/3)),first=samples.slice(0,third).reduce((sum,item)=>sum+Number(item[key]),0)/third,last=samples.slice(-third).reduce((sum,item)=>sum+Number(item[key]),0)/third,delta=last-first;return Math.abs(delta)<3?'stable':delta>0?'increasing':'decreasing';};
    const brightness=average('brightness'),contrast=average('contrast'),saturation=average('saturation');
    return measured(STATUS.DETECTED,{brightness:{average:brightness,trend:trend('brightness')},contrast:{average:contrast,trend:trend('contrast')},saturation:{average:saturation,trend:trend('saturation')},category:brightness<70?'dark':brightness>180?'bright':saturation<45?'muted':saturation>140?'vivid':'balanced',exactFilter:STATUS.UNKNOWN},{source:'bounded-local-frame-statistics',sampleCount:samples.length});
  }
  function analyzeMovement(frameSamples=[]){
    const samples=bounded(frameSamples,LIMITS.sampledFrames).filter(item=>finite(item?.motionX)!=null&&finite(item?.motionY)!=null);
    if(samples.length<2)return unavailable(STATUS.UNKNOWN,'movement was not measured');
    const x=samples.reduce((sum,item)=>sum+Number(item.motionX),0)/samples.length,y=samples.reduce((sum,item)=>sum+Number(item.motionY),0)/samples.length,magnitude=samples.reduce((sum,item)=>sum+Math.hypot(Number(item.motionX),Number(item.motionY)),0)/samples.length;
    if(magnitude<.12)return measured(STATUS.NOT_DETECTED,{pattern:'stable-frame',averageMotion:round(magnitude)},{source:'bounded-frame-translation'});
    return measured(STATUS.DETECTED,{pattern:Math.abs(x)>Math.abs(y)?(x>0?'rightward-frame-translation':'leftward-frame-translation'):(y>0?'downward-frame-translation':'upward-frame-translation'),averageMotion:round(magnitude),cameraInterpretation:STATUS.UNKNOWN},{source:'bounded-frame-translation',note:'Frame translation does not prove camera movement.'});
  }
  function analyzeAudioVisualTiming(signal,cutPattern){
    if(signal?.measured!==true)return unavailable(signal?.blocked?STATUS.BLOCKED:STATUS.UNKNOWN,'audio timing or beats were not measured');
    const beats=bounded(signal.beats||signal.value,LIMITS.segments).map(finite).filter(value=>value!=null&&value>=0),cuts=bounded(cutPattern?.value?.times,LIMITS.segments),tolerance=Math.max(.03,Math.min(.25,finite(signal.tolerance)??.12));
    if(!beats.length)return measured(STATUS.NOT_DETECTED,{beats:[],alignedCuts:0},{source:clean(signal.source,80)||'verified-audio-analysis'});
    const aligned=cuts.filter(cut=>beats.some(beat=>Math.abs(beat-cut)<=tolerance));
    return measured(STATUS.DETECTED,{beatCount:beats.length,cutCount:cuts.length,alignedCuts:aligned.length,alignmentRatio:cuts.length?round(aligned.length/cuts.length):0,tolerance},{source:clean(signal.source,80)||'verified-audio-analysis'});
  }
  function providerState(provider={}){const code=finite(provider.status);if(provider.configured===false||provider.available===false||code===502)return unavailable(STATUS.BLOCKED,code===502?'provider unavailable (502)':'provider not configured');if(provider.configured===true&&provider.available===true)return measured(STATUS.DETECTED,true,{source:'provider-connection-check'});return unavailable(STATUS.UNKNOWN,'provider state was not checked');}
  function createVisualAnalysis({referenceAnalysis,reference={},target={},signals={},provider={},userId}={}){
    const base=referenceAnalysis||ReferenceAnalysis.createReferenceAnalysis({metadata:{malformed:true}}),validation=validateReference({id:reference.id||base.id,name:reference.name||base.metadata?.name,kind:reference.kind||'video'},target),owner=clean(userId||base.userId,LIMITS.userIdChars)||'guest';
    if(!validation.valid)return {id:`visual-${clean(base.id,80)||'invalid'}`,userId:owner,status:validation.status,validation,provider:providerState(provider),createdAt:new Date().toISOString()};
    const cutPattern=analyzeCuts(base),shotDurationPattern=analyzeShotDurations(base),pacingCurve=analyzePacing(base,shotDurationPattern),transitionPattern=verifiedSignal(signals.transitions,'transitions'),zoomPattern=verifiedSignal(signals.zoom,'zoom'),speedPattern=verifiedSignal(signals.speed,'speed'),textPattern=verifiedSignal(signals.text,'text'),captionPattern=verifiedSignal(signals.captions,'captions'),overlayPattern=verifiedSignal(signals.overlays,'overlays'),effectPattern=verifiedSignal(signals.effects,'effects'),composition=verifiedSignal(signals.composition,'composition'),movementPattern=signals.movement?verifiedSignal(signals.movement,'movement'):analyzeMovement(signals.frameSamples),colorTreatment=signals.color?verifiedSignal(signals.color,'colour'):analyzeColor(signals.frameSamples),audioVisualTiming=analyzeAudioVisualTiming(signals.audioVisual,cutPattern),editingRhythm=pacingCurve.status===STATUS.DETECTED?measured(STATUS.DETECTED,{pace:pacingCurve.value.overall,changes:pacingCurve.value.changes,cutCount:cutPattern.value?.count||0,audioAlignment:audioVisualTiming.status===STATUS.DETECTED?audioVisualTiming.value.alignmentRatio:STATUS.UNKNOWN},{source:'measured-cut-and-pacing-analysis'}):unavailable();
    const analysis={id:`visual-${clean(base.id,80)||Date.now().toString(36)}`,referenceId:clean(base.id,100),targetId:validation.targetId,userId:owner,status:base.status===STATUS.NOT_ANALYZABLE?STATUS.NOT_ANALYZABLE:STATUS.DETECTED,validation,limits:{...LIMITS,durationTruncated:Boolean(base.duration?.truncated),sampledFrames:Math.min(bounded(signals.frameSamples,LIMITS.sampledFrames).length,LIMITS.sampledFrames)},aspectRatio:base.aspectRatio||unavailable(),cutPattern,pacingCurve,shotDurationPattern,transitionPattern,zoomPattern,movementPattern,speedPattern,textPattern,captionPattern,overlayPattern,effectPattern,colorTreatment,composition,audioVisualTiming,editingRhythm,provider:providerState(provider),createdAt:new Date().toISOString()};
    return clone(analysis);
  }
  function enrichEditingBlueprint(step9Blueprint={},visualAnalysis={},selectedCharacteristics=[]){
    const selected=new Set(bounded(selectedCharacteristics,LIMITS.characteristics).filter(item=>CHARACTERISTICS.includes(item))),include=key=>!selected.size||selected.has(key),characteristics=[];
    for(const key of CHARACTERISTICS){const item=visualAnalysis?.[key];if(!include(key)||!item)continue;if(item.status===STATUS.DETECTED||item.status===STATUS.NOT_DETECTED)characteristics.push({id:key,status:item.status,value:sanitise(item.value),evidence:item.evidence,source:clean(item.source,100)});}
    const blueprint={id:`visual-blueprint-${clean(visualAnalysis?.referenceId,70)||Date.now().toString(36)}`,referenceId:clean(visualAnalysis?.referenceId,100),targetId:clean(visualAnalysis?.targetId,100)||null,userId:clean(visualAnalysis?.userId,LIMITS.userIdChars)||'guest',descriptiveOnly:true,noFrameForFrameCopy:true,step9BlueprintId:clean(step9Blueprint?.id,120)||null,characteristics,unknown:CHARACTERISTICS.filter(key=>include(key)&&visualAnalysis?.[key]?.status===STATUS.UNKNOWN),unsupported:CHARACTERISTICS.filter(key=>include(key)&&visualAnalysis?.[key]?.status===STATUS.UNSUPPORTED),blocked:CHARACTERISTICS.filter(key=>include(key)&&visualAnalysis?.[key]?.status===STATUS.BLOCKED),createdAt:new Date().toISOString()};
    while(JSON.stringify(blueprint).length>LIMITS.blueprintChars&&blueprint.characteristics.length)blueprint.characteristics.pop();
    blueprint.truncated=JSON.stringify({step9Blueprint,visualAnalysis}).length>LIMITS.blueprintChars;
    return clone(blueprint);
  }
  function normaliseCapability(id,overrides={}){const base=CAPABILITIES[id]||{support:SUPPORT.UNSUPPORTED,capability:id,can:'',cannot:'No verified Zorifi capability is mapped.'},override=overrides[id]??overrides[base.capability];if(override===false)return {...base,support:SUPPORT.UNSUPPORTED};if(typeof override==='string'&&Object.values(SUPPORT).includes(override))return {...base,support:override};if(override&&typeof override==='object')return {...base,...sanitise(override)};return {...base};}
  function compareBlueprintToCapabilities(blueprint,capabilities={}){
    const byId=new Map(bounded(blueprint?.characteristics,LIMITS.characteristics).map(item=>[item.id,item])),output=[];
    for(const id of CHARACTERISTICS){const item=byId.get(id),analysisStatus=item?.status||blueprint?.blocked?.includes(id)&&STATUS.BLOCKED||blueprint?.unsupported?.includes(id)&&STATUS.UNSUPPORTED||blueprint?.unknown?.includes(id)&&STATUS.UNKNOWN;if(!analysisStatus)continue;const capability=normaliseCapability(id,capabilities);let support=capability.support;if(analysisStatus===STATUS.UNKNOWN)support=SUPPORT.UNKNOWN;else if(analysisStatus===STATUS.BLOCKED)support=SUPPORT.BLOCKED;else if([STATUS.UNSUPPORTED,STATUS.NOT_ANALYZABLE].includes(analysisStatus))support=SUPPORT.UNSUPPORTED;output.push({characteristic:id,analysisStatus,support,capability:capability.capability,can:support===SUPPORT.UNKNOWN?'':capability.can,cannot:capability.cannot,identical:false});}
    return output.slice(0,LIMITS.characteristics);
  }
  function characteristicChanges(message='',current=[]){
    const text=clean(message,700).toLowerCase(),selected=new Set(current.filter(item=>CHARACTERISTICS.includes(item))),mentioned=[],aliases={cutPattern:/\bcuts?|cut timing\b/,pacingCurve:/\bpacing|pace\b/,shotDurationPattern:/\bshot durations?\b/,transitionPattern:/\btransitions?\b/,zoomPattern:/\bzooms?\b/,movementPattern:/\bmovement|camera motion|pans?\b/,speedPattern:/\bspeed(?: changes?| ramps?| ramping)?|slow motion\b/,textPattern:/\btext\b/,captionPattern:/\bcaptions?|subtitles?\b/,overlayPattern:/\boverlays?\b/,effectPattern:/\beffects?\b/,colorTreatment:/\bcolou?rs?|grading|colour treatment\b/,composition:/\bcomposition|framing\b/,audioVisualTiming:/\baudio timing|beat alignment|music timing\b/,editingRhythm:/\bediting rhythm|rhythm\b/,aspectRatio:/\baspect ratio|9:16|16:9|square|vertical|landscape\b/};
    for(const [key,pattern] of Object.entries(aliases))if(pattern.test(text))mentioned.push(key);
    const remove=/\b(?:don['’]?t|do not|remove|exclude|without|skip|not)\b/.test(text),only=/\bonly\b/.test(text);
    if(only&&!remove)selected.clear();
    if(remove)mentioned.forEach(key=>selected.delete(key));else if(/\b(?:copy|keep|include|use|match|apply|add|and)\b/.test(text)||only)mentioned.forEach(key=>selected.add(key));
    return [...selected].slice(0,LIMITS.characteristics);
  }
  function buildVisualWorkflowPlan(blueprint,{capabilities={},target={id:'selected_clip',label:'selected clip'},reference={}}={}){
    const validation=validateReference({id:reference.id||blueprint?.referenceId,name:reference.name||'reference video',kind:'video'},{id:target.id||target.targetId});
    if(!validation.valid)throw new Error(validation.reason);
    const comparison=compareBlueprintToCapabilities(blueprint,capabilities),selected=new Set(blueprint?.characteristics?.map(item=>item.id)||[]),supported=comparison.filter(item=>selected.has(item.characteristic)&&[SUPPORT.SUPPORTED,SUPPORT.PARTIALLY_SUPPORTED].includes(item.support)&&item.analysisStatus===STATUS.DETECTED),byId=new Map(blueprint.characteristics.map(item=>[item.id,item]));
    const commandsFor=item=>{
      const value=byId.get(item.characteristic)?.value||{};
      if(item.characteristic==='cutPattern')return bounded(value.times,LIMITS.workflowSteps).map(time=>({intent:'SPLIT',description:`Split the target clip at ${round(time)} seconds`,commandText:`Split selected clip at ${round(time)} seconds.`}));
      if(item.characteristic==='pacingCurve'){const pace=value.overall;if(pace==='very-fast'||pace==='fast')return [{intent:'SPEED',description:'Increase the target clip speed to support the measured fast pacing',commandText:'Make selected clip 25% faster.'}];if(pace==='slow')return [{intent:'SPEED',description:'Reduce the target clip speed to support the measured slow pacing',commandText:'Make selected clip 20% slower.'}];return [];}
      if(item.characteristic==='shotDurationPattern'&&finite(value.average)>0)return [{intent:'TRIM',description:`Trim the target clip to the measured average shot duration (${round(value.average)} seconds)`,commandText:`Trim selected clip to ${round(value.average)} seconds.`}];
      if(item.characteristic==='zoomPattern'){const zoom=Array.isArray(value)?value[0]:value,seconds=Math.max(.2,finite(zoom?.end)-finite(zoom?.start)||2);if(zoom?.direction==='in')return [{intent:'ZOOM',description:'Apply an editable zoom-in matching the verified pattern',commandText:`Slowly zoom in from 100% to 130% over ${round(seconds)} seconds.`}];return [];}
      if(item.characteristic==='speedPattern'){const change=Array.isArray(value)?value[0]:value,rate=finite(change?.rate);if(rate&&rate!==1)return [{intent:'SPEED',description:'Apply the verified speed-change direction',commandText:`Make selected clip ${round(Math.abs(rate-1)*100)}% ${rate>1?'faster':'slower'}.`}];return [];}
      if(item.characteristic==='captionPattern')return [{intent:'CAPTIONS_ADD',description:'Generate editable captions, ready for supported styling review',commandText:'Generate auto captions.'}];
      if(item.characteristic==='aspectRatio'&&typeof value==='string')return [{intent:'ASPECT_RATIO',description:`Set the project aspect ratio to ${value}`,commandText:`Set project aspect ratio to ${value}.`}];
      return [];
    };
    const concrete=[];for(const item of supported){for(const command of commandsFor(item)){concrete.push({...command,characteristic:item.characteristic});if(concrete.length>=LIMITS.workflowSteps)break;}if(concrete.length>=LIMITS.workflowSteps)break;}
    const steps=concrete.map((item,index)=>({id:`visual-step-${String(index+1).padStart(2,'0')}`,intent:item.intent,description:item.description,commandText:item.commandText,target:clean(target.label||target.id,100)||'selected clip',status:'PENDING',requiresConfirmation:true,executable:true,source:'step10-visual-blueprint',characteristic:item.characteristic}));
    return {blueprintId:clean(blueprint?.id,120),descriptiveOnly:true,requiresConfirmation:true,noAutomaticExecution:true,referenceId:validation.referenceId,targetId:validation.targetId,routeThrough:'Step8Workflow>Router>Permissions>EditorBridge>ValidatedTransaction',stages:['Analyze the user’s target clips','Match supported pacing','Apply supported cuts','Apply supported zoom patterns','Generate/apply captions when selected','Review the result'],steps,comparison,unsupported:comparison.filter(item=>![SUPPORT.SUPPORTED,SUPPORT.PARTIALLY_SUPPORTED].includes(item.support))};
  }
  function buildProviderPayload(analysis){
    const payload={referenceId:clean(analysis?.referenceId,100),metadata:{aspectRatio:analysis?.aspectRatio?.value||null,durationTruncated:Boolean(analysis?.limits?.durationTruncated)},measured:{cuts:bounded(analysis?.cutPattern?.value?.times,30),shotDurations:bounded(analysis?.shotDurationPattern?.value?.durations,30),pacing:analysis?.pacingCurve?.value||null,color:analysis?.colorTreatment?.evidence===EVIDENCE.MEASURED?analysis.colorTreatment.value:null,movement:analysis?.movementPattern?.evidence===EVIDENCE.MEASURED?analysis.movementPattern.value:null},requested:['transitions','zoom','speed','text','captions','overlays','effects','composition']};
    while(JSON.stringify(payload).length>LIMITS.providerPayloadChars&&payload.measured.cuts.length)payload.measured.cuts.pop();
    while(JSON.stringify(payload).length>LIMITS.providerPayloadChars&&payload.measured.shotDurations.length)payload.measured.shotDurations.pop();
    if(JSON.stringify(payload).length>LIMITS.providerPayloadChars){payload.measured={};payload.truncated=true;}
    return clone(payload);
  }
  function inspectVisualAnalysis(analysis,{userId}={}){if(!analysis)return null;if(userId&&clean(userId,LIMITS.userIdChars)!==analysis.userId)return null;return clone(analysis);}
  class VisualAnalysisManager{
    constructor({userId='guest',capabilities={}}={}){this.userId=clean(userId,LIMITS.userIdChars)||'guest';this.capabilities=clone(capabilities);this.reference=null;this.target=null;this.step9Analysis=null;this.analysis=null;this.selectedCharacteristics=[];}
    selectReference(reference,{explicit=false,target=null}={}){if(!explicit)throw new Error('Reference selection must be explicit.');const validation=validateReference(reference,target||{});if(!validation.valid)throw new Error(validation.reason);this.reference={id:validation.referenceId,name:SENSITIVE.test(clean(reference.name,LIMITS.nameChars))?'reference media':clean(reference.name,LIMITS.nameChars)||'reference video',kind:'video'};this.target=target?{id:clean(target.id||target.targetId,100),label:clean(target.label||target.name,100)}:null;this.step9Analysis=null;this.analysis=null;this.selectedCharacteristics=[];return clone(this.reference);}
    setTarget(target){const validation=validateReference(this.reference||{},target||{});if(!validation.valid)throw new Error(validation.reason);this.target={id:clean(target.id||target.targetId,100),label:clean(target.label||target.name,100)||'selected clip'};return clone(this.target);}
    analyze({referenceAnalysis,signals={},provider={}}={}){if(!this.reference)throw new Error('Select a reference first.');this.step9Analysis=clone(referenceAnalysis);this.analysis=createVisualAnalysis({referenceAnalysis,reference:this.reference,target:this.target||{},signals,provider,userId:this.userId});return this.inspect();}
    updateSelection(message){if(!this.analysis)return [];if(/\bcopy everything(?: that)?(?: zorifi can reproduce)?\b/i.test(clean(message,700))){const blueprint=enrichEditingBlueprint(ReferenceAnalysis.buildEditingBlueprint(this.step9Analysis),this.analysis),comparison=compareBlueprintToCapabilities(blueprint,this.capabilities);this.selectedCharacteristics=comparison.filter(item=>item.support===SUPPORT.SUPPORTED&&item.analysisStatus===STATUS.DETECTED).map(item=>item.characteristic);}else this.selectedCharacteristics=characteristicChanges(message,this.selectedCharacteristics);return clone(this.selectedCharacteristics);}
    selectCharacteristics(items=[]){this.selectedCharacteristics=[...new Set(items.filter(item=>CHARACTERISTICS.includes(item)))].slice(0,LIMITS.characteristics);return clone(this.selectedCharacteristics);}
    removeCharacteristics(items=[]){const remove=new Set(items);this.selectedCharacteristics=this.selectedCharacteristics.filter(item=>!remove.has(item));return clone(this.selectedCharacteristics);}
    buildBlueprint(){if(!this.analysis)return null;return enrichEditingBlueprint(ReferenceAnalysis.buildEditingBlueprint(this.step9Analysis,{selectedCharacteristics:[]}),this.analysis,this.selectedCharacteristics);}
    buildWorkflowPlan(options={}){const blueprint=this.buildBlueprint();return blueprint?buildVisualWorkflowPlan(blueprint,{...options,capabilities:this.capabilities,reference:this.reference,target:options.target||this.target||{id:'selected_clip',label:'selected clip'}}):null;}
    inspect(){return {userId:this.userId,reference:clone(this.reference),target:clone(this.target),analysis:inspectVisualAnalysis(this.analysis,{userId:this.userId}),selectedCharacteristics:clone(this.selectedCharacteristics),blueprint:this.buildBlueprint()};}
    clear(){this.reference=null;this.target=null;this.step9Analysis=null;this.analysis=null;this.selectedCharacteristics=[];}
  }
  return {STATUS,SUPPORT,EVIDENCE,LIMITS,CHARACTERISTICS,CAPABILITIES,VisualAnalysisManager,validateReference,createVisualAnalysis,analyzeCuts,analyzeShotDurations,analyzePacing,analyzeColor,analyzeMovement,analyzeAudioVisualTiming,verifiedSignal,enrichEditingBlueprint,compareBlueprintToCapabilities,characteristicChanges,buildVisualWorkflowPlan,buildProviderPayload,inspectVisualAnalysis};
});
