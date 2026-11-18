/* Read-only, bounded delivery checks. Every nested timeline keeps its own clock. */
(function(root,factory){
  const common=typeof module==='object'&&module.exports;
  const api=factory(common?require('./zorifi-vanessa-media-review.js'):root.ZorifiVanessaMediaReview);
  if(common)module.exports=api;else root.ZorifiProductionPreflight=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Review){
  'use strict';
  const LIMITS=Object.freeze({layers:500,depth:8,frames:6,audioSeconds:12});
  function audit(project,{kind='video',rendered,error}={}){
    if(!project||!Array.isArray(project.clips))throw Error('Open a project before running production preflight.');
    if(!['video','audio'].includes(kind))throw Error('Choose video or audio preflight.');
    const issues=[],unassessed=[],checks=[],scopes=[],seen=new Set(),visited=new WeakSet();let count=0;
    const note=(severity,code,message,scope,details={})=>issues.push({severity,code,message,scope,...details});
    function walk(clips,context,path,depth){
      if(depth>LIMITS.depth||visited.has(clips)){note('error','review_limit','Nested timelines exceed the safe review depth or contain a cycle.',path);return;}
      visited.add(clips);
      const selected=[];
      for(const clip of clips){if(++count>LIMITS.layers){note('error','review_limit','The 500-layer preflight limit was reached. Remaining layers were not inspected.',path);break;}if(!clip||typeof clip!=='object'){note('error','invalid_layer','A timeline layer is invalid.',path);continue;}if(seen.has(clip.id))note('error','duplicate_layer_id','Layer identities must be unique across nested timelines.',path,{clipId:clip.id});seen.add(clip.id);selected.push(clip);}
      // A structural composition has no source file. Its children are audited
      // separately, with their own source dimensions, duration and track states.
      const local={...context,mediaAssets:project.mediaAssets||[],clips:selected.map(clip=>clip.composition?{...clip,generated:true}:clip)};
      const measured=Review.reviewProject(local,{renderedReview:depth===0?rendered:undefined});
      scopes.push({path,duration:measured.summary.duration,layers:selected.length});
      for(const item of measured.issues){if(kind==='audio'&&['no_visuals','timeline_gap','rendered_black_sample','rendered_white_sample'].includes(item.code))continue;issues.push({...item,scope:path});}
      for(const item of measured.unassessed){if(depth===0&&rendered?.audio&&item.id==='final_audio_mix')continue;unassessed.push({...item,scope:path});}
      for(const item of measured.checks)checks.push({...item,scope:path});
      for(const clip of selected){
        if(!clip.composition)continue;
        const comp=clip.composition,childPath=[...path,String(clip.id||'unknown')];
        if(!Array.isArray(comp.clips)||![comp.width,comp.height,comp.duration].every(value=>Number.isFinite(value)&&value>0)){note('error','invalid_composition','A nested timeline needs valid dimensions, duration and layers.',childPath,{clipId:clip.id});continue;}
        walk(comp.clips,{...context,duration:comp.duration,frameWidth:comp.width,frameHeight:comp.height,ratio:comp.width+' / '+comp.height,creatorSettings:{compositionDuration:comp.duration},proSettings:{exportResolution:comp.width+'x'+comp.height},trackStates:comp.trackStates||{}},childPath,depth+1);
        if(count>LIMITS.layers)break;
      }
    }
    walk(project.clips,project,[],0);
    if(kind==='audio'&&!hasAudio(project.clips,project.mediaAssets||[],project.trackStates||{}))note('warning','no_audio','No enabled audio source was found. A silent export may be intentional.',[]);
    if(error)unassessed.push({id:'rendered-samples',scope:[],reason:String(error).slice(0,240)});
    for(const item of rendered?.unassessed||[])unassessed.push({...item,scope:[]});
    if(scopes.length>1)unassessed.push({id:'nested-audio',scope:[],reason:'The bounded mix sample includes root audio sources only; listen to nested audio in the complete export.'});
    unassessed.push({id:'rights-and-plugins',scope:[],reason:'External plugin compatibility, rights/licensing, transcript accuracy and whether locked sections are creatively finished require separate review. Locks are preserved and are not treated as errors.'});
    unassessed.push({id:'delivery-review',scope:[],reason:'This report checks the complete timeline structure and at most six rendered frames plus the first twelve seconds of eligible root audio. It does not verify every frame, full-program loudness, artistic quality or the final encoded file.'});
    const summary={errors:issues.filter(i=>i.severity==='error').length,warnings:issues.filter(i=>i.severity==='warning').length,layers:Math.min(count,LIMITS.layers),compositions:scopes.length,frames:rendered?.frames?.length||0,audioSeconds:rendered?.audio?.duration||0};
    return {version:1,kind,status:summary.errors?'problems-found':'review-required',summary,issues,checks,unassessed,scopes,rendered:rendered||null,readOnly:true,providerCalls:0};
  }
  function hasAudio(clips,assets,tracks={},depth=0){
    if(depth>LIMITS.depth)return false;
    const solos=Object.entries(tracks).filter(([,value])=>value?.solo).map(([key])=>key);
    return clips.some(c=>c&&!c.muted&&!c.audioEffects?.muted&&!tracks[c.track]?.muted&&Number(c.volume??100)>0&&(!solos.length||solos.includes(String(c.track)))&&(c.type==='audio'||assets.find(a=>a.id===c.mediaId)?.type==='video'||c.composition&&Array.isArray(c.composition.clips)&&hasAudio(c.composition.clips,assets,c.composition.trackStates,depth+1)));
  }
  function intent(message){return /^(?:please\s+)?(?:run|open|show|do|check)\s+(?:the\s+|my\s+)?(?:production preflight|export readiness|pre-export check)(?:\s+(?:for|on)\s+(?:this|my|the)\s+(?:project|edit|mix))?[.!?]?$/i.test(String(message).trim());}
  return Object.freeze({LIMITS,audit,intent});
});
