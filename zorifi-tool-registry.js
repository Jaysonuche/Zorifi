(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiToolRegistry=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // A recipe is data, never JavaScript. Every operation below has a matching
  // implementation in the shared preview/export renderer. Unknown operations
  // fail validation rather than becoming a misleading "completed" tool call.
  const numeric=(min,max,value)=>({type:'number',min,max,default:value});
  const choice=(values,value)=>({type:'string',values,default:value});
  const color=value=>({type:'color',default:value});
  const DEFINITIONS=Object.freeze({
    transform:{label:'Transform and crop',params:{x:numeric(-80,80,0),y:numeric(-80,80,0),scale:numeric(30,220,100),rotation:numeric(-180,180,0),cropLeft:numeric(0,40,0),cropRight:numeric(0,40,0),cropTop:numeric(0,40,0),cropBottom:numeric(0,40,0)}},
    motion:{label:'Eased zoom and pan',params:{mode:choice(['none','push-in','pull-out','pan-left','pan-right'],'push-in')}},
    grade:{label:'Colour grade',params:{mode:choice(['natural','cinematic','monochrome','vivid'],'cinematic'),brightness:numeric(.5,1.5,1),contrast:numeric(.5,1.8,1),saturation:numeric(0,2,1),hue:numeric(-180,180,0)}},
    blur:{label:'Gaussian blur',params:{amount:numeric(0,24,3)}},
    glow:{label:'Edge glow',params:{amount:numeric(0,30,10),color:color('#af78ff')}},
    vignette:{label:'Vignette',params:{amount:numeric(0,1,.35)}},
    mask:{label:'Shape mask',params:{shape:choice(['circle','rectangle','triangle','rounded'],'rounded'),radius:numeric(0,50,12),scale:numeric(20,120,100),x:numeric(-50,50,0),y:numeric(-50,50,0)}},
    chroma:{label:'Colour key cutout',params:{color:color('#00ff00'),tolerance:numeric(1,100,38),softness:numeric(0,100,18),spill:numeric(0,100,45)}},
    'person-cutout':{label:'On-device person cutout',requires:'person-cutout-model',params:{threshold:numeric(.05,.95,.45),softness:numeric(.01,.4,.12)}},
    spatial:{label:'Projective 3D panel and camera',params:{rotateX:numeric(-65,65,0),rotateY:numeric(-65,65,-22),rotateZ:numeric(-40,40,0),endRotateX:numeric(-65,65,0),endRotateY:numeric(-65,65,12),endRotateZ:numeric(-40,40,0),depth:numeric(-.5,.8,.15),endDepth:numeric(-.5,.8,0),perspective:numeric(1.5,5,2.4),cameraX:numeric(-.4,.4,0),cameraY:numeric(-.4,.4,0),endCameraX:numeric(-.4,.4,0),endCameraY:numeric(-.4,.4,0),scale:numeric(.35,1,.85),shadow:numeric(0,1,.6)}},
    shake:{label:'Controlled camera shake',params:{amount:numeric(0,3,.5),frequency:numeric(1,16,6)}},
    transition:{label:'Cut, dissolve, flash or whip',params:{mode:choice(['cut','dissolve','flash','whip-left','whip-right'],'cut')}},
    caption:{label:'Kinetic editorial title',params:{text:{type:'text',maxLength:160,default:''},position:choice(['center','bottom'],'center'),kinetic:{type:'boolean',default:true}}}
  });
  const BASE_IDS=Object.keys(DEFINITIONS),STORAGE_KEY='zorifi.tool-recipes.v1';
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
  const clone=value=>JSON.parse(JSON.stringify(value));
  function validateParams(id,value={}){
    const definition=DEFINITIONS[id];if(!definition)throw new Error(`Unsupported editing tool: ${String(id).slice(0,80)}.`);
    if(!plain(value)||Object.keys(value).some(key=>!Object.hasOwn(definition.params,key)))throw new Error(`Invalid parameters for ${id}.`);
    const result={};for(const [key,schema] of Object.entries(definition.params)){
      const item=Object.hasOwn(value,key)?value[key]:schema.default;
      if(schema.type==='number'&&(typeof item!=='number'||!Number.isFinite(item)||item<schema.min||item>schema.max)||schema.type==='string'&&!schema.values.includes(item)||schema.type==='color'&&(typeof item!=='string'||!/^#[a-f\d]{6}$/i.test(item))||schema.type==='text'&&(typeof item!=='string'||item.length>schema.maxLength)||schema.type==='boolean'&&typeof item!=='boolean')throw new Error(`Invalid ${id}.${key}.`);
      result[key]=item;
    }return result;
  }
  function validateRecipe(value){
    if(!plain(value)||typeof value.id!=='string'||!/^recipe:[a-z0-9][a-z0-9-]{1,47}$/.test(value.id)||typeof value.name!=='string'||!value.name.trim()||value.name.length>80||!Array.isArray(value.operations)||!value.operations.length||value.operations.length>8)throw new Error('A saved tool needs a name, recipe ID and 1–8 supported operations.');
    if(value.description!=null&&(typeof value.description!=='string'||value.description.length>300))throw new Error('The recipe description is too long.');
    const operations=value.operations.map(operation=>{if(!plain(operation)||Object.keys(operation).some(key=>!['id','params'].includes(key))||!BASE_IDS.includes(operation.id))throw new Error('Recipes may combine built-in operations only.');return {id:operation.id,params:validateParams(operation.id,operation.params)};});
    return {id:value.id,name:value.name.trim(),description:value.description||'',operations,version:1};
  }
  function validateRecipes(values=[]){if(!Array.isArray(values)||values.length>24)throw new Error('Save at most 24 custom tools.');const recipes=values.map(validateRecipe);if(new Set(recipes.map(value=>value.id)).size!==recipes.length)throw new Error('Saved tool IDs must be unique.');return recipes;}
  function loadRecipes(storage){try{const raw=storage?.getItem(STORAGE_KEY);return raw?validateRecipes(JSON.parse(raw)):[];}catch{return [];}}
  function saveRecipe(value,storage){const recipe=validateRecipe(value),all=loadRecipes(storage).filter(item=>item.id!==recipe.id);all.push(recipe);validateRecipes(all);if(!storage?.setItem)throw new Error('Tool storage is unavailable.');storage.setItem(STORAGE_KEY,JSON.stringify(all));return recipe;}
  function removeRecipe(id,storage){const all=loadRecipes(storage).filter(item=>item.id!==id);if(!storage?.setItem)throw new Error('Tool storage is unavailable.');storage.setItem(STORAGE_KEY,JSON.stringify(all));return all;}
  function validateTools(values=[],recipes=[]){
    if(!Array.isArray(values)||values.length>12)throw new Error('An AutoCut shot supports up to 12 editing tools.');
    const saved=new Map(validateRecipes(recipes).map(recipe=>[recipe.id,recipe]));let count=0;
    const result=values.map(operation=>{
      if(!plain(operation)||typeof operation.id!=='string'||Object.keys(operation).some(key=>!['id','params'].includes(key)))throw new Error('Invalid editing-tool instruction.');
      if(saved.has(operation.id)){if(operation.params!=null&&(!plain(operation.params)||Object.keys(operation.params).length))throw new Error('Saved recipe parameters cannot be overridden.');count+=saved.get(operation.id).operations.length;return {id:operation.id,params:{}};}
      count++;return {id:operation.id,params:validateParams(operation.id,operation.params)};
    });if(count>24)throw new Error('The combined recipe is too complex for one shot.');return result;
  }
  function expandTools(values=[],recipes=[]){const saved=new Map(validateRecipes(recipes).map(recipe=>[recipe.id,recipe]));return validateTools(values,recipes).flatMap(operation=>saved.has(operation.id)?clone(saved.get(operation.id).operations):[operation]);}
  function applyTools(clip,values=clip.autoCutTools||[],recipes=[]){
    const result={...clip,autoCutStyle:{...(clip.autoCutStyle||{})}};
    for(const {id,params:p} of expandTools(values,recipes))switch(id){
      case 'transform':Object.assign(result,{positionX:p.x,positionY:p.y,scale:p.scale,rotation:p.rotation,cropLeft:p.cropLeft,cropRight:p.cropRight,cropTop:p.cropTop,cropBottom:p.cropBottom});break;
      case 'motion':result.autoCutStyle.motion=p.mode;break;
      case 'grade':result.autoCutStyle.grade=p.mode;result.autoCutColor={brightness:p.brightness,contrast:p.contrast,saturation:p.saturation,hue:p.hue};break;
      case 'blur':result.autoCutBlur=p.amount;break;
      case 'glow':result.autoCutGlow={amount:p.amount,color:p.color};break;
      case 'vignette':result.autoCutVignette=p.amount;break;
      case 'mask':Object.assign(result,{maskShape:p.shape,cornerRadius:p.radius,maskScale:p.scale,maskX:p.x,maskY:p.y});break;
      case 'chroma':Object.assign(result,{chromaKey:true,chromaColor:p.color,chromaTolerance:p.tolerance,chromaSoftness:p.softness,chromaSpill:p.spill});break;
      case 'person-cutout':result.subjectCutout={enabled:true,threshold:p.threshold,softness:p.softness};break;
      case 'spatial':result.spatial3D={...p};break;
      case 'shake':result.autoCutShake={...p};break;
      case 'transition':result.autoCutStyle.transition=p.mode;break;
      case 'caption':Object.assign(result.autoCutStyle,{caption:p.text,captionPosition:p.position,kinetic:p.kinetic});break;
    }return result;
  }
  function capabilities(recipes=[],{allowPersonCutout=false}={}){return [...Object.entries(DEFINITIONS).filter(([,definition])=>!definition.requires||allowPersonCutout).map(([id,definition])=>({id,label:definition.label,parameters:clone(definition.params),status:'implemented',...(definition.requires?{scope:'people-only',requires:definition.requires}:{})})),...validateRecipes(recipes).filter(recipe=>allowPersonCutout||!recipe.operations.some(operation=>operation.id==='person-cutout')).map(recipe=>({id:recipe.id,label:recipe.name,description:recipe.description,operations:clone(recipe.operations),parameters:{},status:'recipe'}))];}
  return {DEFINITIONS,BASE_IDS,STORAGE_KEY,validateParams,createRecipe:validateRecipe,validateRecipe,validateRecipes,loadRecipes,saveRecipe,removeRecipe,validateTools,expandTools,applyTools,capabilities};
});
