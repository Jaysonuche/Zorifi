(function(global){
  'use strict';

  const CURRENT_SCHEMA_VERSION=4;
  const HISTORY_KEYS=[
    'clips','hasCaptions','scenePlan','duration','markers','proSettings','smartSettings',
    'captionSettings','trackStates','ratio','frameWidth','frameHeight','frameSourceVideoId',
    'selected','favorite','folder','category','status','lastOpenedAt','creatorSettings'
  ];

  function clone(value){
    if(value===undefined)return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function finite(value,fallback){
    const number=Number(value);
    return Number.isFinite(number)?number:fallback;
  }

  function normalizeClip(clip,index){
    const normalized={...(clip||{})};
    normalized.id=String(normalized.id||`clip-${Date.now()}-${index}`);
    normalized.type=['video','audio','text','effect'].includes(normalized.type)?normalized.type:'video';
    normalized.name=String(normalized.name||'Untitled clip');
    normalized.start=Math.max(0,finite(normalized.start,0));
    normalized.duration=Math.max(.05,finite(normalized.duration,1));
    normalized.track=finite(normalized.track,normalized.type==='audio'?1:0);
    normalized.opacity=Math.max(0,Math.min(100,finite(normalized.opacity,100)));
    normalized.volume=Math.max(0,Math.min(200,finite(normalized.volume,100)));
    normalized.audioPan=Math.max(-100,Math.min(100,finite(normalized.audioPan,0)));
    normalized.audioFadeIn=Math.max(0,Math.min(normalized.duration,finite(normalized.audioFadeIn,0)));
    normalized.audioFadeOut=Math.max(0,Math.min(normalized.duration,finite(normalized.audioFadeOut,0)));
    if((normalized.type==='audio'||normalized.type==='video')&&global.ZorifiAudioEngine)normalized.audioEffects=global.ZorifiAudioEngine.normalize(normalized.audioEffects);
    if(!Number.isFinite(Number(normalized.playbackRate))){
      const legacySpeed=parseFloat(String(normalized.speed||'1').replace('×','').replace('x',''));
      normalized.playbackRate=Number.isFinite(legacySpeed)?legacySpeed:1;
    }else normalized.playbackRate=Math.max(.05,Number(normalized.playbackRate));
    return normalized;
  }

  function migrateProject(project){
    if(!project||typeof project!=='object'||!project.id)return null;
    const migrated=clone(project),sourceVersion=finite(migrated.schemaVersion,1);
    migrated.clips=Array.isArray(migrated.clips)?migrated.clips.map(normalizeClip):[];
    migrated.mediaAssets=Array.isArray(migrated.mediaAssets)?migrated.mediaAssets:[];
    migrated.markers=Array.isArray(migrated.markers)?migrated.markers:[];
    migrated.trackStates=migrated.trackStates&&typeof migrated.trackStates==='object'?migrated.trackStates:{};
    Object.values(migrated.trackStates).forEach(track=>{track.volume=Math.max(0,Math.min(200,finite(track.volume,100)));track.pan=Math.max(-100,Math.min(100,finite(track.pan,0)));track.name=typeof track.name==='string'?track.name:'';track.role=typeof track.role==='string'?track.role:'';});
    migrated.proSettings=migrated.proSettings&&typeof migrated.proSettings==='object'?migrated.proSettings:{};
    migrated.smartSettings=migrated.smartSettings&&typeof migrated.smartSettings==='object'?migrated.smartSettings:{};
    migrated.captionSettings=migrated.captionSettings&&typeof migrated.captionSettings==='object'?migrated.captionSettings:{};
    migrated.duration=Math.max(1,finite(migrated.duration,30));
    migrated.currentTime=Math.max(0,Math.min(migrated.duration,finite(migrated.currentTime,0)));
    migrated.ratio=typeof migrated.ratio==='string'?migrated.ratio:'16 / 9';
    migrated.name=String(migrated.name||'Untitled project');
    migrated.favorite=Boolean(migrated.favorite);
    migrated.folder=String(migrated.folder||'Unfiled').slice(0,48);
    migrated.category=String(migrated.category||'Draft').slice(0,48);
    migrated.status=['draft','ready','exported'].includes(migrated.status)?migrated.status:'draft';
    migrated.lastOpenedAt=migrated.lastOpenedAt||migrated.updatedAt||new Date(0).toISOString();
    migrated.creatorSettings=migrated.creatorSettings&&typeof migrated.creatorSettings==='object'?migrated.creatorSettings:{};
    migrated.schemaVersion=CURRENT_SCHEMA_VERSION;
    if(sourceVersion<CURRENT_SCHEMA_VERSION)migrated.migratedFrom=sourceVersion;
    return migrated;
  }

  function serializeProject(state,thumbnail){
    return {
      schemaVersion:CURRENT_SCHEMA_VERSION,
      id:state.projectId,name:state.currentProject,updatedAt:new Date().toISOString(),duration:state.duration,
      currentTime:state.currentTime,ratio:state.ratio,frameWidth:state.frameWidth,frameHeight:state.frameHeight,previewMuted:state.previewMuted,
      frameSourceVideoId:state.frameSourceVideoId,hasCaptions:state.hasCaptions,zoom:state.zoom,
      activePanel:state.activePanel,textSection:state.textSection,effectSection:state.effectSection,audioSection:state.audioSection,soundCategory:state.soundCategory,
      panelWidth:state.panelWidth,panelCollapsed:state.panelCollapsed,inspectorWidth:state.inspectorWidth,inspectorCollapsed:state.inspectorCollapsed,
      timelineHeight:state.timelineHeight,timelineCollapsed:state.timelineCollapsed,clips:clone(state.clips),mediaType:state.mediaType,
      trackStates:clone(state.trackStates),thumbnail:thumbnail||'',
      mediaAssets:(state.mediaAssets||[]).map(({url,...asset})=>asset.generated?{...clone(asset),url}:clone(asset)),
      proSettings:clone(state.proSettings),smartSettings:clone(state.smartSettings),captionSettings:clone(state.captionSettings),
      scenePlan:clone(state.scenePlan),markers:clone(state.markers),favorite:Boolean(state.favorite),folder:state.folder||'Unfiled',category:state.category||'Draft',status:state.status||'draft',lastOpenedAt:state.lastOpenedAt||new Date().toISOString(),creatorSettings:clone(state.creatorSettings||{}),
      hasMissingLocalMedia:(state.mediaAssets||[]).some(asset=>asset.localFile&&!asset.persisted)
    };
  }

  function captureHistory(state,overrides={}){
    const snapshot={};
    HISTORY_KEYS.forEach(key=>{snapshot[key]=clone(Object.prototype.hasOwnProperty.call(overrides,key)?overrides[key]:state[key]);});
    return snapshot;
  }

  function restoreHistory(state,snapshot){
    if(!snapshot||typeof snapshot!=='object')return state;
    HISTORY_KEYS.forEach(key=>{if(Object.prototype.hasOwnProperty.call(snapshot,key))state[key]=clone(snapshot[key]);});
    if(state.selected&&!state.clips.some(clip=>clip.id===state.selected))state.selected=null;
    return state;
  }

  global.ZorifiProjectModel={CURRENT_SCHEMA_VERSION,HISTORY_KEYS,migrateProject,serializeProject,captureHistory,restoreHistory};
})(typeof window!=='undefined'?window:globalThis);
