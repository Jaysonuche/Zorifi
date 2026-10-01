(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(global)global.ZorifiMusicStudio=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STEMS=Object.freeze(['vocals','drums','bass','lead','fx']);
  const LEADS=Object.freeze(['acoustic-guitar','electric-guitar','piano','synth-lead','saxophone','strings']);
  const RHYTHMS=Object.freeze(['808-hip-hop','acoustic-drums','lo-fi-percussion','house-beat','trap-hi-hats','ambient-none']);
  const BASSLINES=Object.freeze(['sub-bass','bass-guitar','synth-wave','none']);
  const FX=Object.freeze(['lofiCrackle','reverb','bassBoost808','sidechain']);
  const PRESETS=Object.freeze({
    'viral-reel':Object.freeze({label:'Viral Reel',genre:'pop',bpm:145,key:'F#',scaleMode:'minor',timeSignature:'4/4',groove:'half-time',selectedInstruments:['synth-lead'],rhythm:'trap-hi-hats',bassline:'sub-bass',productionFx:{lofiCrackle:false,reverb:false,bassBoost808:true,sidechain:true}}),
    'cinematic-vlog':Object.freeze({label:'Cinematic Vlog',genre:'cinematic',bpm:110,key:'D',scaleMode:'major',timeSignature:'4/4',groove:'straight',selectedInstruments:['piano','strings'],rhythm:'acoustic-drums',bassline:'bass-guitar',productionFx:{lofiCrackle:false,reverb:true,bassBoost808:false,sidechain:false}}),
    'lofi-study':Object.freeze({label:'Lo-Fi Study',genre:'lo-fi',bpm:75,key:'C',scaleMode:'minor',timeSignature:'4/4',groove:'swing',selectedInstruments:['piano','electric-guitar'],rhythm:'lo-fi-percussion',bassline:'sub-bass',productionFx:{lofiCrackle:true,reverb:true,bassBoost808:false,sidechain:false}})
  });
  const DEFAULTS=Object.freeze({mode:'studio',prompt:'',vocals:'instrumental',requestedStems:[...STEMS],genre:'cinematic',duration:30,selectedInstruments:['piano'],leadInstrument:'piano',rhythm:'acoustic-drums',bassline:'sub-bass',bpm:120,key:'C',scaleMode:'minor',timeSignature:'4/4',groove:'straight',productionFx:{lofiCrackle:false,reverb:false,bassBoost808:false,sidechain:false},masterProfile:'balanced',bottomTab:'mixer',generation:null,separation:null});
  const clamp=(value,min,max,fallback)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):fallback));
  const clean=value=>String(value||'').trim();
  function normalize(value={}){
    const requested=Array.isArray(value.requestedStems)?value.requestedStems.map(item=>item==='melody'?'lead':item).filter(item=>STEMS.includes(item)):STEMS;
    const legacyLead=LEADS.includes(value.leadInstrument)?value.leadInstrument:'piano';
    const selected=Array.isArray(value.selectedInstruments)?value.selectedInstruments.filter(item=>LEADS.includes(item)):[];
    const selectedInstruments=[...new Set(selected.length?selected:[legacyLead])].slice(0,LEADS.length);
    const productionFx=Object.fromEntries(FX.map(id=>[id,Boolean(value.productionFx?.[id])]));
    const rawKey=clean(value.key||'C'),legacyMinor=/^[A-G](?:#|b)?m$/.test(rawKey),key=legacyMinor?rawKey.slice(0,-1):/^[A-G](?:#|b)?$/.test(rawKey)?rawKey:'C',scaleMode=['major','minor','pentatonic'].includes(value.scaleMode)?value.scaleMode:legacyMinor?'minor':'minor';
    return {...DEFAULTS,...value,mode:value.mode==='casual'?'casual':'studio',prompt:clean(value.prompt).slice(0,1500),vocals:['instrumental','vocal','either'].includes(value.vocals)?value.vocals:'instrumental',requestedStems:[...new Set(requested)],genre:clean(value.genre||'cinematic').slice(0,50),duration:clamp(value.duration,15,600,30),selectedInstruments,leadInstrument:selectedInstruments[0],rhythm:RHYTHMS.includes(value.rhythm)?value.rhythm:'acoustic-drums',bassline:BASSLINES.includes(value.bassline)?value.bassline:'sub-bass',bpm:clamp(value.bpm,40,200,120),key,scaleMode,timeSignature:['4/4','3/4','6/8'].includes(value.timeSignature)?value.timeSignature:'4/4',groove:['straight','swing','half-time'].includes(value.groove)?value.groove:'straight',productionFx,masterProfile:['balanced','radio','club','warm','lofi'].includes(value.masterProfile)?value.masterProfile:'balanced',bottomTab:['mixer','midi','versions'].includes(value.bottomTab)?value.bottomTab:'mixer'};
  }
  function roleFor(clip={},asset={}){
    const rawRole=clean(clip.stemRole||clip.audioEffects?.role||asset.stemRole).toLowerCase();
    const role=rawRole==='melody'?'lead':rawRole;
    if(STEMS.includes(role))return role;
    const text=`${clip.name||''} ${asset.name||''}`.toLowerCase();
    if(/vocal|voice|speech|choir/.test(text))return 'vocals';
    if(/drum|beat|percussion|kick|snare/.test(text))return 'drums';
    if(/bass|808/.test(text))return 'bass';
    if(/fx|effect|riser|impact|atmos/.test(text))return 'fx';
    return 'lead';
  }
  function stemSummary(clips=[],assets=[]){
    const byId=new Map(assets.map(item=>[item.id,item]));
    return STEMS.map(role=>{const items=clips.filter(clip=>(clip.type==='audio'||clip.type==='video')&&roleFor(clip,byId.get(clip.mediaId))===role);return {role,count:items.length,clipIds:items.map(item=>item.id),volume:items.length?Math.round(items.reduce((sum,item)=>sum+(Number(item.volume)||0),0)/items.length):100,muted:items.length>0&&items.every(item=>Boolean(item.muted)),solo:items.some(item=>Boolean(item.solo))};});
  }
  function tapTempo(timestamps=[]){const values=timestamps.map(Number).filter(Number.isFinite).slice(-8);if(values.length<2)return null;const gaps=values.slice(1).map((value,index)=>value-values[index]).filter(value=>value>=250&&value<=1500);if(!gaps.length)return null;return Math.round(clamp(60000/(gaps.reduce((sum,value)=>sum+value,0)/gaps.length),40,200,120));}
  function applyPreset(value={},presetId=''){const preset=PRESETS[presetId];if(!preset)throw new Error('Unknown Vanessa music preset.');return normalize({...value,...preset,productionFx:{...preset.productionFx},directorPreset:presetId});}
  function directorStatus(generation={}){const status=clean(generation.status).toLowerCase();if(status==='queued')return {tone:'working',label:'Vanessa is preparing the music brief…'};if(status==='running')return {tone:'working',label:generation.stage?clean(generation.stage).slice(0,120):generation.progress==null?'The music provider is processing…':`The music provider is processing · ${Math.round(clamp(generation.progress,0,100,0))}%`};if(status==='complete')return {tone:'complete',label:'Music generated and added to the timeline.'};if(status==='failed')return {tone:'failed',label:clean(generation.error)||'Music generation could not be completed.'};if(status==='cancelled')return {tone:'muted',label:'Music generation was cancelled.'};return {tone:'ready',label:'Vanessa Music Director is ready.'};}
  function providerPayload(value={}){const state=normalize(value);if(state.prompt.length<3)throw new Error('Describe the music in at least 3 characters.');const instruments=[...state.selectedInstruments,state.rhythm,state.bassline].map(item=>item.replaceAll('-',' '));const activeFx=FX.filter(id=>state.productionFx[id]);return {prompt:state.prompt,mode:'text',duration:state.duration,tempo:state.bpm,bpm:state.bpm,key:state.key,scaleMode:state.scaleMode,timeSignature:state.timeSignature,genre:state.genre,mood:clean(value.mood||'creative').slice(0,50),groove:state.groove,styleTags:[state.genre,state.key,state.scaleMode,state.rhythm,state.groove],instrumentation:clean(value.instrumentation||instruments.join(', ')).slice(0,200),instruments:{leads:state.selectedInstruments,lead:state.leadInstrument,rhythm:state.rhythm,bassline:state.bassline},productionFx:state.productionFx,fxModifiers:activeFx,vocals:state.vocals,requestedStems:state.requestedStems,outputFormat:value.outputFormat==='wav'?'wav':'mp3',audioBitrateKbps:clamp(value.audioBitrateKbps,128,320,192)};}
  class CollaborationChannel{
    constructor({projectId,userId,onEvent=()=>{},url=''}={}){this.projectId=clean(projectId);this.userId=clean(userId);this.onEvent=onEvent;this.url=/^wss:\/\//.test(url)?url:'';this.peers=new Map();this.channel=null;this.socket=null;this.connected=false;}
    connect(){if(!this.projectId||!this.userId)return false;if(typeof BroadcastChannel!=='undefined'){this.channel=new BroadcastChannel(`zorifi-music-${this.projectId}`);this.channel.onmessage=event=>this.receive(event.data);this.connected=true;this.publish('presence',{online:true});}if(this.url&&typeof WebSocket!=='undefined'){this.socket=new WebSocket(this.url);this.socket.addEventListener('open',()=>{this.connected=true;this.sendSocket('join',{projectId:this.projectId});});this.socket.addEventListener('message',event=>{try{this.receive(JSON.parse(event.data));}catch{}});this.socket.addEventListener('close',()=>{this.socket=null;});}return this.connected||Boolean(this.socket);}
    envelope(type,payload={}){return {version:1,projectId:this.projectId,userId:this.userId,type,at:Date.now(),payload};}
    publish(type,payload={}){const message=this.envelope(type,payload);this.channel?.postMessage(message);this.sendSocket(type,payload);return message;}
    sendSocket(type,payload){if(this.socket?.readyState===1)this.socket.send(JSON.stringify(this.envelope(type,payload)));}
    receive(message){if(!message||message.projectId!==this.projectId||message.userId===this.userId||typeof message.type!=='string')return;if(message.type==='presence')this.peers.set(message.userId,{id:message.userId,...message.payload,lastSeen:message.at});this.onEvent(message);}
    disconnect(){try{this.publish('presence',{online:false});}catch{}this.channel?.close();this.socket?.close();this.channel=null;this.socket=null;this.connected=false;}
  }
  return {STEMS,LEADS,RHYTHMS,BASSLINES,FX,PRESETS,DEFAULTS,normalize,applyPreset,directorStatus,roleFor,stemSummary,tapTempo,providerPayload,CollaborationChannel};
});
