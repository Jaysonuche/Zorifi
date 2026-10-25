/* Progressive touch tools and real compositor previews. Projects remain device-local. */
(function(){
  'use strict';
  if(typeof state==='undefined')return;
  let group='',workspace='';
  const groups={
    edit:{name:'Edit',icon:'▣',panel:'media',tools:[['media','Media','▣'],['speed','Speed','1×'],['pro','Transform','↗'],['keyframes','Keyframes','◆']]},
    audio:{name:'Audio',icon:'♪',panel:'audio',tools:[['audio','Sounds','♪','audioSection','music'],['audio','Sound effects','SFX','audioSection','sound-effects'],['beats','Beats','⌁'],['audio','Your audio','▣','audioSection','yours'],['audio','Mix & fades','☷','audioSection','workspace']]},
    text:{name:'Text',icon:'T',panel:'text',tools:[['text','Titles','T','textSection','templates'],['text','Add text','＋','textSection','yours'],['captions','Auto captions','CC'],['transcribe','Transcribe','TXT']]},
    effects:{name:'Effects',icon:'FX',panel:'effects',tools:[['effects','Element FX','FX','effectSection','element'],['effects','Timeline FX','▤','effectSection','effects'],['filters','Filters','◐'],['effects','Edit packs','✦','effectSection','packs']]},
    motion:{name:'Motion',icon:'◇',panel:'animation',tools:[['animation','Animation','◇'],['transitions','Transitions','⇄'],['keyframes','Keyframes','◆'],['speed','Speed','1×']]},
    adjust:{name:'Adjust',icon:'☼',panel:'color',tools:[['color','Colour','☼'],['pro','Transform','↗'],['mask','Mask','◒'],['background','Remove BG','✂'],['chroma','Chroma key','CK']]},
    overlay:{name:'Overlay',icon:'▱',panel:'overlay',tools:[['overlay','Add overlay','▱'],['mask','Mask','◒'],['pro','Blend & crop','▧'],['background','Remove BG','✂']]},
    captions:{name:'Captions',icon:'CC',panel:'captions',tools:[['captions','Auto captions','CC'],['transcribe','Transcribe','TXT'],['text','Text styles','T','textSection','templates']]}
  };
  function touchEditor(){return Boolean(runtimeMode.touch&&state.view==='editor'&&editorWorkspaceMode!=='music');}
  function button(panel,label,icon,key,value){return `<button type="button" data-pocket-tool="${panel}" ${key?`data-pocket-setting="${key}" data-pocket-value="${value}"`:''} class="${state.activePanel===panel&&(!key||state[key]===value)?'active':''}" aria-label="Open ${esc(label.toLowerCase())} tools"><b>${icon}</b><span>${label}</span></button>`;}
  const baseDock=mobileEditorDock;
  mobileEditorDock=function(){
    if(!touchEditor())return baseDock();
    if(workspace!==state.projectId){workspace=state.projectId;group='';}
    const current=groups[group];
    return `<nav class="mobile-editor-dock pocket-editor-dock ${current?'pocket-context-dock':''}" aria-label="${current?current.name+' tools':'Editor categories'}" data-horizontal-tool-rail>${current?`<button class="pocket-tools-back" data-pocket-back aria-label="Back to editing categories"><b>‹</b><span>Back</span></button>${current.tools.map(tool=>button(...tool)).join('')}${group==='edit'?'<button data-pocket-command="split"><b>✂</b><span>Split</span></button><button data-pocket-command="delete"><b>⌫</b><span>Delete</span></button>':''}`:Object.entries(groups).map(([id,item])=>`<button type="button" data-pocket-group="${id}" aria-label="Open ${item.name.toLowerCase()} category"><b>${item.icon}</b><span>${item.name}</span></button>`).join('')}</nav>`;
  };
  function closeTools(){group='';state.responsivePanel='';state.mobileInspectorOpen=false;state.mobileToolSheetOpen=false;render();}
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-pocket-group],[data-pocket-tool],[data-pocket-back],[data-pocket-close],[data-pocket-command]');if(!target)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(target.hasAttribute('data-pocket-back')||target.hasAttribute('data-pocket-close')){closeTools();return;}
    if(target.dataset.pocketCommand){if(!state.selected){toast('Select a timeline clip first.');return;}if(target.dataset.pocketCommand==='split')splitClip();else deleteClip();return;}
    if(target.dataset.pocketGroup){group=target.dataset.pocketGroup;state.activePanel=groups[group].panel;if(group==='effects')state.effectSection='element';}
    else{state.activePanel=target.dataset.pocketTool;if(target.dataset.pocketSetting)state[target.dataset.pocketSetting]=target.dataset.pocketValue;}
    state.responsivePanel='tools';state.mobileInspectorOpen=false;state.mobileToolSheetOpen=false;render();
  },true);
  function decorateEditor(){
    if(!touchEditor())return;
    const shell=document.querySelector('main.touch-editor[data-view="editor"]');if(!shell)return;
    shell.classList.add('pocket-editor');
    const open=state.responsivePanel==='tools'&&!state.mobileInspectorOpen;
    shell.classList.toggle('pocket-panel-open',open);shell.classList.toggle('pocket-inspector-open',Boolean(state.mobileInspectorOpen));
    const panel=shell.querySelector('.left-panel');
    if(panel&&!panel.querySelector('.pocket-sheet-head')){
      const header=document.createElement('header');header.className='pocket-sheet-head';header.innerHTML=`<button data-pocket-back aria-label="Back to editing categories">‹</button><span><i></i><b>${esc(groups[group]?.name||'Clip tools')}</b><small>Choose a tool. Keep your edit in view.</small></span><button data-pocket-close aria-label="Done with tools">Done</button>`;panel.prepend(header);
    }
    // The dedicated music workspace remains on Home, outside the video editor.
    shell.querySelectorAll('[data-action="mobile-music-editor"],[data-music-editor]').forEach(item=>item.remove());
  }
  function decorateLibrary(){
    if(state.view!=='home'||!runtimeMode.touch)return;
    const library=document.querySelector('.project-library');if(!library)return;
    library.classList.add('pocket-project-library');
    const grid=library.querySelector('.project-grid');grid?.classList.add('pocket-project-rows');
    library.querySelectorAll('.project-card').forEach(card=>{const sample=String(card.dataset.openProject).startsWith('demo-');if(sample&&!card.querySelector('.project-sample-badge')){const badge=document.createElement('span');badge.className='project-sample-badge';badge.textContent='Sample edit';card.querySelector('.project-info')?.append(badge);}});
  }
  const baseImport=importFiles;
  importFiles=async function(files){
    const project=state.projectId,owner=currentUser?.id,before=new Set(state.mediaAssets.map(asset=>asset.id));
    const result=await baseImport(files);
    if(project!==state.projectId||owner!==currentUser?.id)return result;
    const added=state.mediaAssets.filter(asset=>!before.has(asset.id)),next=Math.max(-1,...state.mediaAssets.filter(asset=>before.has(asset.id)).map(asset=>Number.isFinite(asset.importOrder)?asset.importOrder:-1))+1;
    added.forEach((asset,index)=>{asset.importOrder=next+index;});
    const pinned=state.mediaAssets.some(asset=>asset.id===state.creatorSettings.firstMediaId&&!asset.zorifiEnding);
    if(!pinned){const first=firstProjectVisual(state);if(first)state.creatorSettings.firstMediaId=first.id;}
    scheduleProjectSave(0);return result;
  };
  const baseHome=renderHome;renderHome=function(){const result=baseHome.apply(this,arguments);decorateLibrary();return result;};
  const baseRender=render;render=function(){stopPreviews();const result=baseRender.apply(this,arguments);decorateEditor();decorateLibrary();installPreviews();return result;};
  window.addEventListener('pagehide',()=>{if(state.view==='editor')saveProject();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&state.view==='editor')saveProject();});

  // Bundled human photographs stay independent of the user's project media.
  // Only visible cards animate, through the same compositor used by the editor.
  const photos=['city-walk','park-portrait','rooftop-portrait','plaza-portrait'].map(name=>({url:`assets/tool-previews/${name}.webp`,image:null,loading:false}));
  const records=new Map(),visible=new Set(),cachedRecords=new WeakMap(),LOOP_MS=3200;
  let observer=null,frameRequest=0,lastFrame=0,loopStart=0;
  function hash(value){let result=0;for(const char of value)result=(Math.imul(result,31)+char.charCodeAt(0))>>>0;return result;}
  function photoIndex(kind,id){const library=kind==='timeline'?effects:kind==='transition'?transitions:kind==='animation'?MotionEffects.ANIMATIONS:kind==='element'?MotionEffects.EFFECTS:Object.keys(VisualTools.FILTERS).map(id=>({id})),index=library.findIndex(item=>item.id===id);return ((index<0?hash(id):index)+hash(kind))%photos.length;}
  function loadPhoto(index){
    const photo=photos[index];if(photo.image||photo.loading)return;
    photo.loading=true;const image=new Image();image.decoding='async';
    image.onload=()=>{photo.image=image;photo.loading=false;wakePreviews();};
    image.onerror=()=>{photo.loading=false;};image.src=photo.url;
  }
  function previewClip(){return {id:'tool-preview-only',type:'video',start:0,duration:2,opacity:100,scale:100,scaleX:100,scaleY:100,positionX:0,positionY:0,rotation:0,fit:'cover',keyframes:{},visualEffects:VisualTools.normalize(),effectStack:[]};}
  function previewRecord(canvas,kind,id){
    let record=cachedRecords.get(canvas);if(record&&record.kind===kind&&record.id===id)return record;
    const seed=hash(`${kind}:${id}`),photo=photoIndex(kind,id),alternate=(photo+1+seed%(photos.length-1))%photos.length,clip=previewClip();
    if(kind==='element')MotionEffects.addEffect(clip,id,{kind:'video'});
    if(kind==='animation')MotionEffects.applyAnimation(clip,id,{duration:2});
    if(kind==='filter')clip.visualEffects.filter={id,intensity:100};
    record={canvas,kind,id,photo,alternate,clip,plain:previewClip(),effect:kind==='timeline'?effects.find(item=>item.id===id):null,fxClip:{type:'effect',start:0,duration:2,strength:80,opacity:100},phase:seed%400};
    cachedRecords.set(canvas,record);canvas.dataset.previewSource=photos[photo].url;
    loadPhoto(photo);if(kind==='transition')loadPhoto(alternate);return record;
  }
  function drawTransition(context,image,id,progress,role,width,height){
    const t=AdvancedEditing.transitionState(id,progress,role),factor=Math.max(width/image.naturalWidth,height/image.naturalHeight),w=image.naturalWidth*factor,h=image.naturalHeight*factor;
    context.save();context.globalAlpha=t.opacity;context.translate(width/2+t.x/100*width,height/2+t.y/100*height);context.rotate(t.rotation*Math.PI/180);context.scale(t.scale,t.scale);context.filter=`blur(${t.blur*.35}px) brightness(${t.brightness})`;
    if(t.clipPath){const reveal=role==='outgoing'?1-progress:progress;context.beginPath();if(id==='iris')context.arc(0,0,Math.min(w,h)*.75*Math.max(.001,reveal),0,Math.PI*2);else context.rect(-w/2,-h/2,w*Math.max(.001,reveal),h);context.clip();}
    context.drawImage(image,-w/2,-h/2,w,h);context.restore();
  }
  function drawPreview(canvas,kind,id,progress=.5,cycle=0){
    const record=previewRecord(canvas,kind,id),{clip,effect,fxClip}=record,context=canvas.getContext('2d'),width=canvas.width,height=canvas.height,source=photos[record.photo].image,time=Math.max(.01,Math.min(1.99,progress*2));
    context.clearRect(0,0,width,height);context.fillStyle='#19182a';context.fillRect(0,0,width,height);
    if(!source)return false;
    if(kind==='transition'){
      const alternate=photos[record.alternate].image;if(!alternate)return false;
      const outgoing=cycle%2?source:alternate,incoming=cycle%2?alternate:source,p=Math.max(0,Math.min(1,(progress-.1)/.72));
      drawTransition(context,outgoing,id,p,'outgoing',width,height);drawTransition(context,incoming,id,p,'incoming',width,height);
    }else{
      context.save();if(effect){context.filter=effect.filter||'none';applyExportEffectMotion(context,effect,fxClip,time,width,height);}
      drawContainedMedia(context,source,clip,width,height,time);context.restore();drawClipVisualOverlay(context,clip,width,height,time);if(effect)drawExportEffectOverlay(context,effect,fxClip,time,width,height);
      if(kind!=='animation'){
        // Static colour/blur tools demonstrate their real result with a moving
        // original-to-applied comparison; no invented camera motion is added.
        const reveal=progress<.12?0:progress<.62?(progress-.12)/.5:progress<.9?1:1-(progress-.9)/.1,beforeWidth=width*(1-Math.max(0,Math.min(1,reveal)));
        if(beforeWidth>0){context.save();context.beginPath();context.rect(0,0,beforeWidth,height);context.clip();drawContainedMedia(context,source,record.plain,width,height,time);context.restore();}
        if(beforeWidth>1&&beforeWidth<width-1){context.fillStyle='#e5caff';context.fillRect(Math.round(beforeWidth),0,1,height);}
      }
    }
    canvas.dataset.previewFrame=String((Number(canvas.dataset.previewFrame)||0)+1);return true;
  }
  function canAnimate(){return !document.hidden&&state.view==='editor'&&visible.size>0;}
  function wakePreviews(){if(canAnimate()&&!frameRequest)frameRequest=requestAnimationFrame(tickPreviews);}
  function tickPreviews(now){
    frameRequest=0;if(!canAnimate())return;
    if(now-lastFrame>=80){lastFrame=now;for(const canvas of visible){const record=records.get(canvas);if(!record||!canvas.isConnected){visible.delete(canvas);continue;}const elapsed=now-loopStart+record.phase;try{drawPreview(canvas,record.kind,record.id,(elapsed%LOOP_MS)/LOOP_MS,Math.floor(elapsed/LOOP_MS));}catch{visible.delete(canvas);}}}
    wakePreviews();
  }
  function stopPreviews(){if(frameRequest)cancelAnimationFrame(frameRequest);frameRequest=0;observer?.disconnect();observer=null;records.clear();visible.clear();lastFrame=0;}
  function previewStatus(){return {registered:records.size,visible:visible.size,running:Boolean(frameRequest)};}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(frameRequest)cancelAnimationFrame(frameRequest);frameRequest=0;}else wakePreviews();});
  window.addEventListener('pagehide',stopPreviews);
  window.addEventListener('pageshow',()=>installPreviews());
  function observePreviews(panel){
    if(observer)return;loopStart=performance.now();
    observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting&&entry.intersectionRect.width>1&&entry.intersectionRect.height>1)visible.add(entry.target);else visible.delete(entry.target);}if(!visible.size&&frameRequest){cancelAnimationFrame(frameRequest);frameRequest=0;}wakePreviews();},{root:panel,threshold:.02});
  }
  function installPreviews(){
    const panels=document.querySelectorAll('.app-shell[data-view="editor"] .media-panel');if(!panels.length){stopPreviews();return;}
    document.querySelectorAll('.pocket-preview-play').forEach(button=>button.remove());
    observePreviews(panels[0]);
    panels.forEach(panel=>panel.querySelectorAll('[data-element-effect],[data-animation-preset],[data-transition],.filter-card[data-filter],.effect-card[data-effect]').forEach(card=>{
      if(card.closest('.filter-recent'))return;
      const kind=card.hasAttribute('data-element-effect')?'element':card.hasAttribute('data-animation-preset')?'animation':card.hasAttribute('data-transition')?'transition':card.hasAttribute('data-filter')?'filter':'timeline',id=card.dataset.elementEffect||card.dataset.animationPreset||card.dataset.transition||card.dataset.filter||card.dataset.effect;
      let canvas=card.querySelector('.pocket-real-preview');if(!canvas){canvas=document.createElement('canvas');canvas.width=240;canvas.height=135;canvas.className='pocket-real-preview';canvas.dataset.previewKind=kind;canvas.dataset.previewId=id;canvas.setAttribute('aria-hidden','true');card.prepend(canvas);}
      if(records.has(canvas))return;
      try{const record=previewRecord(canvas,kind,id);records.set(canvas,record);card.dataset.pocketPreviewReady='true';card.classList.add('pocket-preview-card');observer.observe(canvas);}catch{canvas.remove();}
    }));
  }
  window.ZorifiPocketEditor={groups,closeTools,drawPreview,installPreviews,previewStatus};
  decorateEditor();decorateLibrary();installPreviews();
})();
