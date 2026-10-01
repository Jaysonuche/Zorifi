(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiBetaReadiness=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='3.37.0';
  const STATUSES=Object.freeze(['GREEN','YELLOW','RED','GRAY']);
  const PLATFORMS=Object.freeze(['windows','macos','web','iphone','ipad','android','linux']);
  const CAPABILITIES=Object.freeze([
    'uiSupport','editorSupport','timelineSupport','mediaImport','mediaPersistence',
    'projectPersistence','sessionPersistence','projectReopenContinuity','previewPlayback',
    'effects','transitions','text','audio','undoRedo','export','vanessaConversation',
    'vanessaEditing','vanessaReferenceWorkflow','support','permissions','responsiveBehavior',
    'keyboard','touch','packagingInstallation','platformLimitations'
  ]);

  function clean(value){return String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').trim();}

  function validateCapabilityMatrix(matrix){
    const errors=[];
    if(matrix?.version!==VERSION)errors.push(`version must be ${VERSION}`);
    const records=Array.isArray(matrix?.platforms)?matrix.platforms:[];
    for(const platform of PLATFORMS){
      const record=records.find(item=>item?.id===platform);
      if(!record){errors.push(`missing platform: ${platform}`);continue;}
      if(!STATUSES.includes(record.overallStatus))errors.push(`${platform}: invalid overall status`);
      for(const capability of CAPABILITIES){
        const value=record.capabilities?.[capability];
        if(!STATUSES.includes(value))errors.push(`${platform}: invalid or missing ${capability}`);
      }
      if(!Array.isArray(record.evidence)||!record.evidence.length)errors.push(`${platform}: evidence is required`);
      if(!Array.isArray(record.knownLimitations))errors.push(`${platform}: knownLimitations must be an array`);
      if(record.overallStatus==='GREEN'&&!record.evidence.some(item=>clean(item).length>8))errors.push(`${platform}: GREEN requires concrete evidence`);
    }
    for(const record of records)if(!PLATFORMS.includes(record?.id))errors.push(`unexpected platform: ${record?.id||'unknown'}`);
    return {valid:errors.length===0,errors};
  }

  function gateResult(gate,evidence={}){
    const required=Array.isArray(gate?.requiredEvidence)?gate.requiredEvidence:[];
    const missing=required.filter(key=>evidence[key]!==true);
    return {id:clean(gate?.id),passed:missing.length===0,missing};
  }

  function normalizeBugReport(input={}){
    const severities=['BLOCKER','CRITICAL','MAJOR','MINOR','TRIVIAL'];
    const status=['NEW','CONFIRMED','IN_PROGRESS','FIXED','VERIFIED','CLOSED'];
    return {
      title:clean(input.title).slice(0,160),
      platform:PLATFORMS.includes(input.platform)?input.platform:'web',
      version:clean(input.version||VERSION).slice(0,30),
      severity:severities.includes(input.severity)?input.severity:'MAJOR',
      status:status.includes(input.status)?input.status:'NEW',
      environment:clean(input.environment).slice(0,1000),
      steps:Array.isArray(input.steps)?input.steps.map(clean).filter(Boolean).slice(0,30):[],
      expected:clean(input.expected).slice(0,2000),
      actual:clean(input.actual).slice(0,2000),
      reproducibility:clean(input.reproducibility).slice(0,120),
      diagnostics:clean(input.diagnostics).replace(/(api[_ -]?key|token|password|secret)\s*[:=]\s*\S+/gi,'$1=[REDACTED]').slice(0,4000)
    };
  }

  return {VERSION,STATUSES,PLATFORMS,CAPABILITIES,validateCapabilityMatrix,gateResult,normalizeBugReport};
});
