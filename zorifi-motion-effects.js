(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else global.ZorifiMotionEffects=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=1;
  const uid=prefix=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)));
  const parameter=(label,min,max,value,unit='',step=1,keyframeable=true)=>({label,min,max,value,unit,step,keyframeable});
  const definitions=[
    ['clean-pop','Clean Pop','Basic','CP',{brightness:parameter('Brightness',50,180,108,'%'),contrast:parameter('Contrast',50,180,108,'%'),saturation:parameter('Saturation',0,220,112,'%')}],
    ['soft-fade','Soft Fade','Basic','SF',{brightness:parameter('Brightness',50,160,106,'%'),contrast:parameter('Contrast',50,150,92,'%'),saturation:parameter('Saturation',0,200,88,'%')}],
    ['high-contrast','High Contrast','Basic','HC',{contrast:parameter('Contrast',50,220,145,'%'),saturation:parameter('Saturation',0,220,108,'%')}],
    ['gaussian-blur','Gaussian Blur','Blur & Focus','GB',{blur:parameter('Blur',0,40,5,'px',.25)}],
    ['soft-focus','Soft Focus','Blur & Focus','SO',{blur:parameter('Blur',0,24,1.2,'px',.1),brightness:parameter('Glow',50,180,112,'%')}],
    ['dream-glow','Dream Glow','Blur & Focus','DG',{brightness:parameter('Brightness',50,180,112,'%'),saturation:parameter('Saturation',0,220,120,'%'),glow:parameter('Glow',0,40,12,'px',1)}],
    ['focus-pull','Focus Pull','Blur & Focus','FP',{blur:parameter('Focus blur',0,40,12,'px',.25)}],
    ['rgb-split','RGB Split','Glitch','RG',{hue:parameter('Colour shift',-90,90,8,'°'),contrast:parameter('Contrast',50,220,118,'%'),saturation:parameter('Saturation',0,260,150,'%')}],
    ['signal-break','Signal Break','Glitch','SB',{contrast:parameter('Contrast',50,220,128,'%'),hue:parameter('Signal shift',-180,180,18,'°'),saturation:parameter('Saturation',0,260,170,'%')}],
    ['digital-noise','Digital Noise','Glitch','DN',{contrast:parameter('Contrast',50,220,132,'%'),grain:parameter('Noise',0,100,28,'%',1)}],
    ['vhs-tape','VHS Tape','Retro','VH',{sepia:parameter('Age',0,100,24,'%'),contrast:parameter('Contrast',50,180,112,'%'),saturation:parameter('Saturation',0,200,78,'%'),grain:parameter('Tape grain',0,100,34,'%')}],
    ['super-eight','Super 8','Retro','S8',{sepia:parameter('Warmth',0,100,30,'%'),contrast:parameter('Contrast',50,200,124,'%'),saturation:parameter('Saturation',0,200,72,'%'),vignette:parameter('Vignette',0,100,38,'%')}],
    ['washed-film','Washed Film','Retro','WF',{sepia:parameter('Fade colour',0,100,18,'%'),contrast:parameter('Contrast',50,150,88,'%'),brightness:parameter('Lift',50,180,110,'%')}],
    ['cinema-print','Cinema Print','Cinematic','CI',{contrast:parameter('Contrast',50,200,120,'%'),saturation:parameter('Saturation',0,200,82,'%'),sepia:parameter('Warmth',0,100,9,'%'),vignette:parameter('Vignette',0,100,22,'%')}],
    ['day-for-night','Day for Night','Cinematic','DN',{brightness:parameter('Exposure',30,150,72,'%'),contrast:parameter('Contrast',50,220,128,'%'),saturation:parameter('Saturation',0,200,68,'%'),hue:parameter('Blue shift',-90,90,14,'°')}],
    ['deep-noir','Deep Noir','Cinematic','NO',{grayscale:parameter('Monochrome',0,100,100,'%'),contrast:parameter('Contrast',50,240,148,'%'),brightness:parameter('Exposure',30,160,82,'%'),vignette:parameter('Vignette',0,100,42,'%')}],
    ['golden-hour','Golden Hour','Colour','GH',{sepia:parameter('Warmth',0,100,20,'%'),saturation:parameter('Saturation',0,220,122,'%'),brightness:parameter('Light',50,180,105,'%')}],
    ['teal-orange','Teal & Orange','Colour','TO',{hue:parameter('Hue balance',-90,90,7,'°'),contrast:parameter('Contrast',50,200,116,'%'),saturation:parameter('Saturation',0,240,126,'%'),sepia:parameter('Warmth',0,100,10,'%')}],
    ['pastel-air','Pastel Air','Colour','PA',{brightness:parameter('Brightness',50,180,114,'%'),contrast:parameter('Contrast',50,160,88,'%'),saturation:parameter('Saturation',0,200,82,'%')}],
    ['neon-night','Neon Night','Neon','NN',{contrast:parameter('Contrast',50,240,142,'%'),saturation:parameter('Saturation',0,300,185,'%'),glow:parameter('Glow',0,50,16,'px'),hue:parameter('Hue',-180,180,8,'°')}],
    ['electric-blue','Electric Blue','Neon','EB',{contrast:parameter('Contrast',50,220,134,'%'),saturation:parameter('Saturation',0,280,170,'%'),hue:parameter('Hue',-180,180,28,'°'),glow:parameter('Glow',0,50,12,'px')}],
    ['hot-pink','Hot Pink','Neon','HP',{contrast:parameter('Contrast',50,220,130,'%'),saturation:parameter('Saturation',0,280,180,'%'),hue:parameter('Hue',-180,180,-22,'°'),glow:parameter('Glow',0,50,14,'px')}],
    ['lens-light','Lens Light','Lighting','LL',{brightness:parameter('Brightness',50,200,116,'%'),glow:parameter('Glow',0,50,18,'px')}],
    ['dark-focus','Dark Focus','Lighting','DF',{brightness:parameter('Exposure',30,160,86,'%'),contrast:parameter('Contrast',50,220,124,'%'),vignette:parameter('Vignette',0,100,50,'%')}],
    ['white-flash','White Flash','Lighting','FL',{brightness:parameter('Flash',50,300,165,'%'),contrast:parameter('Contrast',50,180,108,'%')}],
    ['graphic-ink','Graphic Ink','Stylize','GI',{contrast:parameter('Ink',50,300,170,'%'),saturation:parameter('Colour',0,250,135,'%')}],
    ['negative','Negative','Stylize','NV',{invert:parameter('Invert',0,100,100,'%'),hue:parameter('Hue',-180,180,180,'°')}],
    ['duotone','Duotone','Stylize','DU',{grayscale:parameter('Base',0,100,70,'%'),contrast:parameter('Contrast',50,240,150,'%'),hue:parameter('Tint',-180,180,35,'°'),saturation:parameter('Colour',0,260,160,'%')}],
    ['bleach-bypass','Bleach Bypass','Stylize','BB',{contrast:parameter('Contrast',50,250,142,'%'),saturation:parameter('Colour',0,200,48,'%')}],
    ['zoom-energy','Zoom Energy','Motion','ZE',{contrast:parameter('Contrast',50,220,120,'%'),blur:parameter('Motion softness',0,20,.8,'px',.1),saturation:parameter('Colour',0,220,125,'%')}],
    ['ghost-trail','Ghost Trail','Motion','GT',{contrast:parameter('Contrast',50,220,112,'%'),saturation:parameter('Saturation',0,220,118,'%'),glow:parameter('Trail glow',0,40,9,'px')}],
    ['impact-hit','Impact Hit','Motion','IH',{contrast:parameter('Punch',50,260,145,'%'),saturation:parameter('Saturation',0,260,138,'%'),brightness:parameter('Brightness',50,220,112,'%')}],
    ['mirror-colour','Mirror Colour','Distortion','MC',{contrast:parameter('Contrast',50,220,116,'%'),hue:parameter('Refraction',-90,90,12,'°'),saturation:parameter('Colour',0,240,142,'%')}],
    ['heat-warp','Heat Warp','Distortion','HW',{blur:parameter('Warp softness',0,16,.7,'px',.1),hue:parameter('Colour bend',-60,60,5,'°'),contrast:parameter('Contrast',50,200,114,'%')}],
    ['crisp-detail','Crisp Detail','Basic','CD',{contrast:parameter('Definition',50,220,122,'%'),saturation:parameter('Colour',0,220,108,'%'),brightness:parameter('Light',50,180,102,'%')}],
    ['portrait-soft','Portrait Soft','Blur & Focus','PO',{blur:parameter('Skin softness',0,12,.45,'px',.05),brightness:parameter('Light',50,180,107,'%'),contrast:parameter('Contrast',50,180,96,'%')}],
    ['tilt-focus','Tilt Focus','Blur & Focus','TF',{blur:parameter('Focus falloff',0,24,2.2,'px',.1),vignette:parameter('Edge focus',0,100,24,'%')}],
    ['bloom','Soft Bloom','Blur & Focus','BL',{brightness:parameter('Bloom light',50,200,114,'%'),glow:parameter('Bloom radius',0,60,22,'px'),saturation:parameter('Colour',0,240,116,'%')}],
    ['film-matte','Film Matte','Retro','FM',{contrast:parameter('Matte contrast',50,180,91,'%'),brightness:parameter('Black lift',50,180,108,'%'),sepia:parameter('Warm stock',0,100,12,'%'),grain:parameter('Grain',0,100,18,'%')}],
    ['cross-process','Cross Process','Retro','XP',{contrast:parameter('Contrast',50,230,132,'%'),saturation:parameter('Colour',0,260,138,'%'),hue:parameter('Chemical shift',-90,90,17,'°'),sepia:parameter('Warmth',0,100,8,'%')}],
    ['desert-dust','Desert Dust','Colour','DD',{sepia:parameter('Sand warmth',0,100,28,'%'),saturation:parameter('Colour',0,220,88,'%'),brightness:parameter('Sunlight',50,180,106,'%'),grain:parameter('Dust',0,100,12,'%')}],
    ['icy-fade','Icy Fade','Colour','IF',{hue:parameter('Cool shift',-90,90,24,'°'),saturation:parameter('Colour',0,220,82,'%'),brightness:parameter('Exposure',50,180,110,'%'),contrast:parameter('Contrast',50,180,92,'%')}],
    ['midnight-blue','Midnight Blue','Cinematic','MB',{brightness:parameter('Exposure',30,160,76,'%'),contrast:parameter('Contrast',50,240,136,'%'),saturation:parameter('Colour',0,220,74,'%'),hue:parameter('Blue cast',-90,90,22,'°'),vignette:parameter('Vignette',0,100,45,'%')}],
    ['silver-screen','Silver Screen','Cinematic','SS',{grayscale:parameter('Monochrome',0,100,100,'%'),contrast:parameter('Print contrast',50,240,126,'%'),brightness:parameter('Projector light',50,180,104,'%'),grain:parameter('Film grain',0,100,22,'%')}],
    ['sunset-bloom','Sunset Bloom','Lighting','SU',{sepia:parameter('Golden warmth',0,100,22,'%'),brightness:parameter('Sun glow',50,210,116,'%'),saturation:parameter('Colour',0,260,132,'%'),glow:parameter('Bloom',0,60,18,'px')}],
    ['moon-glow','Moon Glow','Lighting','MG',{brightness:parameter('Moonlight',40,190,104,'%'),contrast:parameter('Contrast',50,220,118,'%'),hue:parameter('Blue tone',-90,90,31,'°'),glow:parameter('Halo',0,60,13,'px')}],
    ['cyber-violet','Cyber Violet','Neon','CV',{contrast:parameter('Contrast',50,260,148,'%'),saturation:parameter('Colour',0,320,205,'%'),hue:parameter('Violet shift',-180,180,-34,'°'),glow:parameter('Neon bloom',0,60,20,'px')}],
    ['acid-green','Acid Green','Neon','AG',{contrast:parameter('Contrast',50,260,138,'%'),saturation:parameter('Colour',0,320,190,'%'),hue:parameter('Acid shift',-180,180,68,'°'),glow:parameter('Glow',0,60,15,'px')}],
    ['infrared','Infrared Vision','Stylize','IR',{invert:parameter('Negative base',0,100,34,'%'),hue:parameter('Heat hue',-180,180,-52,'°'),saturation:parameter('Heat colour',0,320,220,'%'),contrast:parameter('Thermal contrast',50,260,146,'%')}],
    ['comic-punch','Comic Punch','Stylize','CO',{contrast:parameter('Ink contrast',50,300,188,'%'),saturation:parameter('Comic colour',0,300,158,'%'),grain:parameter('Print texture',0,100,10,'%')}],
    ['frost-glass','Frost Glass','Distortion','FR',{blur:parameter('Frost',0,30,3.5,'px',.1),brightness:parameter('Diffusion',50,190,112,'%'),contrast:parameter('Contrast',50,180,90,'%')}],
    ['colour-echo','Colour Echo','Motion','CE',{hue:parameter('Echo shift',-180,180,20,'°'),saturation:parameter('Colour',0,280,152,'%'),glow:parameter('Trail light',0,60,12,'px'),contrast:parameter('Contrast',50,220,118,'%')}]
  ];
  const EFFECTS=definitions.map(([id,name,category,icon,parameters])=>({id,name,category,icon,parameters,tags:[name.toLowerCase(),category.toLowerCase()],compatibility:['video','image','text','shape','solid'],performance:Object.values(parameters).some(p=>p.label.includes('Blur')||p.label.includes('Glow'))?'medium':'low',version:VERSION,engine:'browser-filter'}));
  const byId=new Map(EFFECTS.map(item=>[item.id,item]));
  const categories=()=>['All',...new Set(EFFECTS.map(item=>item.category))];
  function searchEffects({query='',category='All',page=1,pageSize=24,kind='video'}={}){
    const q=String(query).trim().toLowerCase(),filtered=EFFECTS.filter(item=>(category==='All'||item.category===category)&&item.compatibility.includes(kind)&&(q===''||`${item.name} ${item.category} ${item.tags.join(' ')}`.toLowerCase().includes(q))),size=clamp(pageSize,1,100),pages=Math.max(1,Math.ceil(filtered.length/size)),current=clamp(page,1,pages),start=(current-1)*size;
    return {items:filtered.slice(start,start+size).map(clone),total:filtered.length,page:current,pages,pageSize:size};
  }
  function ensureStack(clip){if(!Array.isArray(clip.effectStack))clip.effectStack=[];return clip.effectStack;}
  function addEffect(clip,effectId,options={}){const definition=byId.get(effectId);if(!definition)throw new Error(`Unknown effect: ${effectId}`);const kind=options.kind||clip.layerKind||clip.type||'video';if(!definition.compatibility.includes(kind))throw new Error(`${definition.name} is not compatible with ${kind}`);const instance={id:options.id||uid('fx'),effectId,enabled:options.enabled!==false,params:{},createdAt:options.createdAt||new Date().toISOString()};Object.entries(definition.parameters).forEach(([key,schema])=>instance.params[key]=options.params?.[key]===undefined?schema.value:clamp(options.params[key],schema.min,schema.max));ensureStack(clip).push(instance);return instance;}
  function findInstance(clip,id){return ensureStack(clip).find(item=>item.id===id);}
  function removeEffect(clip,id){const stack=ensureStack(clip),index=stack.findIndex(item=>item.id===id);if(index<0)return false;stack.splice(index,1);Object.keys(clip.keyframes||{}).filter(key=>key.startsWith(`fx:${id}:`)).forEach(key=>delete clip.keyframes[key]);return true;}
  function duplicateEffect(clip,id){const source=findInstance(clip,id);if(!source)return null;const copy=clone(source);copy.id=uid('fx');copy.createdAt=new Date().toISOString();const index=ensureStack(clip).indexOf(source);ensureStack(clip).splice(index+1,0,copy);return copy;}
  function toggleEffect(clip,id,enabled){const item=findInstance(clip,id);if(!item)return false;item.enabled=enabled===undefined?!item.enabled:Boolean(enabled);return item.enabled;}
  function reorderEffect(clip,id,toIndex){const stack=ensureStack(clip),from=stack.findIndex(item=>item.id===id);if(from<0)return false;const [item]=stack.splice(from,1);stack.splice(clamp(toIndex,0,stack.length),0,item);return true;}
  function setParameter(clip,id,name,value){const item=findInstance(clip,id),definition=item&&byId.get(item.effectId),schema=definition?.parameters?.[name];if(!schema)throw new Error('Unknown effect parameter');item.params[name]=clamp(value,schema.min,schema.max);return item.params[name];}
  const key=(id,name)=>`fx:${id}:${name}`;
  function valueAt(clip,instance,name,time,resolver){const fallback=instance.params[name];return typeof resolver==='function'?resolver(clip,key(instance.id,name),time,fallback):fallback;}
  function cssFilter(clip,time=0,resolver){const parts=[];ensureStack(clip).filter(item=>item.enabled!==false).forEach(item=>{const definition=byId.get(item.effectId);if(!definition)return;const v=name=>valueAt(clip,item,name,time,resolver);if(definition.parameters.brightness)parts.push(`brightness(${v('brightness')/100})`);if(definition.parameters.contrast)parts.push(`contrast(${v('contrast')/100})`);if(definition.parameters.saturation)parts.push(`saturate(${v('saturation')/100})`);if(definition.parameters.blur)parts.push(`blur(${Math.max(0,v('blur'))}px)`);if(definition.parameters.hue)parts.push(`hue-rotate(${v('hue')}deg)`);if(definition.parameters.sepia)parts.push(`sepia(${v('sepia')/100})`);if(definition.parameters.grayscale)parts.push(`grayscale(${v('grayscale')/100})`);if(definition.parameters.invert)parts.push(`invert(${v('invert')/100})`);if(definition.parameters.glow){const glow=Math.max(0,v('glow'));parts.push(`drop-shadow(0 0 ${glow}px rgba(132,95,255,.68))`);}});return parts.join(' ')||'none';}
  function vignette(clip,time=0,resolver){return ensureStack(clip).filter(item=>item.enabled!==false).reduce((max,item)=>Math.max(max,byId.get(item.effectId)?.parameters?.vignette?valueAt(clip,item,'vignette',time,resolver):0),0);}
  function grain(clip,time=0,resolver){return ensureStack(clip).filter(item=>item.enabled!==false).reduce((max,item)=>Math.max(max,byId.get(item.effectId)?.parameters?.grain?valueAt(clip,item,'grain',time,resolver):0),0);}
  const ANIMATIONS=[
    {id:'fade-in',name:'Fade In',category:'IN',tracks:{opacity:[[0,0],[1,100]]}}, {id:'slide-left',name:'Slide From Left',category:'IN',tracks:{positionX:[[0,-55],[1,0]],opacity:[[0,0],[.35,100]]}},
    {id:'slide-right',name:'Slide From Right',category:'IN',tracks:{positionX:[[0,55],[1,0]],opacity:[[0,0],[.35,100]]}}, {id:'rise-in',name:'Rise In',category:'IN',tracks:{positionY:[[0,35],[1,0]],opacity:[[0,0],[.4,100]]}},
    {id:'zoom-in',name:'Zoom In',category:'IN',tracks:{scale:[[0,72],[1,100]],opacity:[[0,0],[.3,100]]}}, {id:'pop-in',name:'Pop In',category:'IN',tracks:{scale:[[0,45],[.72,112],[1,100]],opacity:[[0,0],[.2,100]]}},
    {id:'rotate-in',name:'Rotate In',category:'IN',tracks:{rotation:[[0,-32],[1,0]],scale:[[0,82],[1,100]],opacity:[[0,0],[.3,100]]}},
    {id:'fade-out',name:'Fade Out',category:'OUT',tracks:{opacity:[[0,100],[1,0]]}}, {id:'slide-out-left',name:'Slide Out Left',category:'OUT',tracks:{positionX:[[0,0],[1,-55]],opacity:[[0,100],[.75,100],[1,0]]}},
    {id:'slide-out-right',name:'Slide Out Right',category:'OUT',tracks:{positionX:[[0,0],[1,55]],opacity:[[0,100],[.75,100],[1,0]]}}, {id:'drop-out',name:'Drop Out',category:'OUT',tracks:{positionY:[[0,0],[1,42]],opacity:[[0,100],[1,0]]}},
    {id:'zoom-out',name:'Zoom Out',category:'OUT',tracks:{scale:[[0,100],[1,48]],opacity:[[0,100],[1,0]]}}, {id:'spin-out',name:'Spin Out',category:'OUT',tracks:{rotation:[[0,0],[1,90]],scale:[[0,100],[1,55]],opacity:[[0,100],[1,0]]}},
    {id:'bounce-combo',name:'Bounce Combo',category:'COMBO',tracks:{positionY:[[0,0],[.22,-18],[.48,5],[.72,-7],[1,0]],scale:[[0,100],[.22,108],[.48,97],[1,100]]}},
    {id:'swing-combo',name:'Swing Combo',category:'COMBO',tracks:{rotation:[[0,0],[.2,-12],[.42,9],[.65,-5],[.82,3],[1,0]]}}, {id:'zoom-combo',name:'Zoom Combo',category:'COMBO',tracks:{scale:[[0,100],[.3,122],[.62,93],[1,100]]}},
    {id:'float-loop',name:'Float',category:'LOOP',loop:true,tracks:{positionY:[[0,0],[.5,-8],[1,0]]}}, {id:'pulse-loop',name:'Pulse',category:'LOOP',loop:true,tracks:{scale:[[0,100],[.5,108],[1,100]]}},
    {id:'wiggle-loop',name:'Wiggle',category:'LOOP',loop:true,tracks:{rotation:[[0,-2],[.25,2],[.5,-2],[.75,2],[1,-2]]}}, {id:'shake-loop',name:'Shake',category:'LOOP',loop:true,tracks:{positionX:[[0,-2],[.2,2],[.4,-1.5],[.6,1.5],[.8,-2],[1,0]],positionY:[[0,1],[.25,-1],[.5,1],[.75,-1],[1,0]]}},
    {id:'rotate-loop',name:'Rotate',category:'LOOP',loop:true,tracks:{rotation:[[0,0],[1,360]]}},
    {id:'focus-in',name:'Focus In',category:'IN',tracks:{blur:[[0,14],[.7,2],[1,0]],opacity:[[0,0],[.45,100]]}},
    {id:'elastic-in',name:'Elastic In',category:'IN',tracks:{scale:[[0,35],[.55,118],[.75,92],[.9,105],[1,100]],opacity:[[0,0],[.18,100]]}},
    {id:'drop-in',name:'Drop In',category:'IN',tracks:{positionY:[[0,-70],[.68,8],[.84,-3],[1,0]],opacity:[[0,0],[.25,100]]}},
    {id:'flip-in',name:'Flip In',category:'IN',tracks:{rotation:[[0,-92],[.72,8],[1,0]],scale:[[0,72],[1,100]],opacity:[[0,0],[.3,100]]}},
    {id:'drift-in',name:'Drift In',category:'IN',tracks:{positionX:[[0,-26],[1,0]],positionY:[[0,18],[1,0]],scale:[[0,108],[1,100]],opacity:[[0,0],[.55,100]]}},
    {id:'shrink-out',name:'Shrink Out',category:'OUT',tracks:{scale:[[0,100],[.55,88],[1,5]],opacity:[[0,100],[.72,100],[1,0]]}},
    {id:'rise-out',name:'Rise Out',category:'OUT',tracks:{positionY:[[0,0],[1,-58]],opacity:[[0,100],[.62,100],[1,0]]}},
    {id:'focus-out',name:'Focus Out',category:'OUT',tracks:{blur:[[0,0],[1,16]],scale:[[0,100],[1,106]],opacity:[[0,100],[.68,100],[1,0]]}},
    {id:'flip-out',name:'Flip Out',category:'OUT',tracks:{rotation:[[0,0],[1,92]],scale:[[0,100],[1,68]],opacity:[[0,100],[.72,100],[1,0]]}},
    {id:'overshoot-combo',name:'Overshoot',category:'COMBO',tracks:{positionX:[[0,0],[.32,16],[.56,-6],[.78,3],[1,0]],scale:[[0,100],[.32,106],[.65,98],[1,100]]}},
    {id:'heartbeat-combo',name:'Heartbeat',category:'COMBO',tracks:{scale:[[0,100],[.14,114],[.28,100],[.42,109],[.58,100],[1,100]]}},
    {id:'pendulum-combo',name:'Pendulum',category:'COMBO',tracks:{rotation:[[0,0],[.2,-16],[.4,12],[.62,-7],[.82,3],[1,0]],positionY:[[0,0],[.5,3],[1,0]]}},
    {id:'punch-combo',name:'Punch Hit',category:'COMBO',tracks:{scale:[[0,100],[.18,132],[.34,92],[.52,106],[1,100]],rotation:[[0,0],[.18,-3],[.34,2],[1,0]]}},
    {id:'breathe-loop',name:'Breathe',category:'LOOP',loop:true,tracks:{scale:[[0,100],[.5,104],[1,100]],opacity:[[0,92],[.5,100],[1,92]]}},
    {id:'side-drift-loop',name:'Side Drift',category:'LOOP',loop:true,tracks:{positionX:[[0,-6],[.5,6],[1,-6]],rotation:[[0,-1],[.5,1],[1,-1]]}},
    {id:'spin-pulse-loop',name:'Spin Pulse',category:'LOOP',loop:true,tracks:{rotation:[[0,0],[1,360]],scale:[[0,96],[.5,106],[1,96]]}}
  ];
  const animationById=new Map(ANIMATIONS.map(item=>[item.id,item]));
  function searchAnimations({query='',category='ALL'}={}){const q=String(query).toLowerCase().trim();return ANIMATIONS.filter(item=>(category==='ALL'||item.category===category)&&(!q||`${item.name} ${item.category}`.toLowerCase().includes(q))).map(clone);}
  function removeGeneratedFrames(clip,animationId){Object.keys(clip.keyframes||{}).forEach(property=>{clip.keyframes[property]=clip.keyframes[property].filter(frame=>frame.animationId!==animationId);if(!clip.keyframes[property].length)delete clip.keyframes[property];});}
  function applyAnimation(clip,animationId,options={}){const definition=animationById.get(animationId);if(!definition)throw new Error(`Unknown animation: ${animationId}`);clip.keyframes=clip.keyframes||{};clip.animations=Array.isArray(clip.animations)?clip.animations:[];const instance={id:options.id||uid('anim'),animationId,category:definition.category,enabled:options.enabled!==false,duration:clamp(options.duration||Math.min(definition.loop?2:1,clip.duration),.05,Math.max(.05,clip.duration)),easing:options.easing||'ease-in-out',loops:Math.max(1,Math.round(options.loops||1))};const start=definition.category==='OUT'?clip.start+clip.duration-instance.duration:clip.start,cycles=definition.loop?Math.min(30,Math.max(1,Math.ceil(clip.duration/instance.duration))):1;
    Object.entries(definition.tracks).forEach(([property,points])=>{const frames=clip.keyframes[property]||[];for(let cycle=0;cycle<cycles;cycle++)points.forEach(([progress,value],pointIndex)=>{const time=Math.min(clip.start+clip.duration,start+(cycle+progress)*instance.duration);if(time<clip.start-.001||time>clip.start+clip.duration+.001)return;const conflict=frames.some(frame=>Math.abs(frame.time-time)<.0001&&!frame.animationId);if(!conflict)frames.push({time:Number(time.toFixed(5)),value,easing:instance.easing,animationId:instance.id,animationPoint:pointIndex});});clip.keyframes[property]=frames.sort((a,b)=>a.time-b.time);});clip.animations.push(instance);return instance;}
  function removeAnimation(clip,id){const index=(clip.animations||[]).findIndex(item=>item.id===id);if(index<0)return false;clip.animations.splice(index,1);removeGeneratedFrames(clip,id);return true;}
  function updateAnimation(clip,id,changes={}){const index=(clip.animations||[]).findIndex(item=>item.id===id);if(index<0)return null;const existing=clip.animations[index],animationId=existing.animationId;removeGeneratedFrames(clip,id);clip.animations.splice(index,1);const updated=applyAnimation(clip,animationId,{...existing,...changes,id});const created=clip.animations.pop();clip.animations.splice(index,0,created);return updated;}
  function capabilities(environment=global){let webgl=false;try{const canvas=environment.document?.createElement?.('canvas');webgl=Boolean(canvas?.getContext?.('webgl2')||canvas?.getContext?.('webgl'));}catch{}return {webgl,webgpu:Boolean(environment.navigator?.gpu),filterRendering:true,recommendedPageSize:webgl?30:18};}
  return {VERSION,EFFECTS,ANIMATIONS,categories,searchEffects,searchAnimations,ensureStack,addEffect,removeEffect,duplicateEffect,toggleEffect,reorderEffect,setParameter,findInstance,keyframeKey:key,cssFilter,vignette,grain,applyAnimation,removeAnimation,updateAnimation,capabilities,clone};
});
