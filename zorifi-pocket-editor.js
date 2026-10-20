/* Progressive touch tools and real compositor previews. Projects remain device-local. */
(function(){
  'use strict';
  if(typeof state==='undefined')return;
  let group='',workspace='',previewEpoch=0,previewTimer=0;
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
  const baseRender=render;render=function(){clearTimeout(previewTimer);previewEpoch++;const result=baseRender.apply(this,arguments);decorateEditor();decorateLibrary();installPreviews();return result;};
  window.addEventListener('pagehide',()=>{if(state.view==='editor')saveProject();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&state.view==='editor')saveProject();});

  // Every thumbnail uses the same image, colour, animation and transition engines as export.
  const sample=document.createElement('canvas');sample.width=320;sample.height=180;
  const sampleContext=sample.getContext('2d');
  const sky=sampleContext.createLinearGradient(0,0,0,180);sky.addColorStop(0,'#92dce5');sky.addColorStop(1,'#f9c898');sampleContext.fillStyle=sky;sampleContext.fillRect(0,0,320,180);
  [[18,60,60,95,'#7352aa'],[100,35,55,120,'#df7958'],[185,72,90,83,'#477b8d']].forEach(([x,y,w,h,c])=>{sampleContext.fillStyle=c;sampleContext.fillRect(x,y,w,h);sampleContext.fillStyle='#f7df9b';for(let row=y+12;row<y+h-5;row+=21)for(let col=x+9;col<x+w-7;col+=17)sampleContext.fillRect(col,row,7,10);});
  sampleContext.fillStyle='#507c60';sampleContext.fillRect(0,151,320,29);
  sampleContext.fillStyle='#252747';sampleContext.fillRect(149,127,21,45);sampleContext.fillStyle='#f4ad87';sampleContext.beginPath();sampleContext.arc(160,119,12,0,Math.PI*2);sampleContext.fill();
  sampleContext.fillStyle='#cf8c45';sampleContext.beginPath();sampleContext.ellipse(230,159,22,10,0,0,Math.PI*2);sampleContext.fill();sampleContext.beginPath();sampleContext.arc(251,150,10,0,Math.PI*2);sampleContext.fill();sampleContext.fillStyle='#4a2b27';sampleContext.fillRect(249,141,6,14);
  const sampleAlt=document.createElement('canvas');sampleAlt.width=320;sampleAlt.height=180;const alt=sampleAlt.getContext('2d');alt.filter='hue-rotate(92deg)';alt.drawImage(sample,0,0);
  let cachedSource='',sourceImage=sample;
  function getSource(){const selected=selectedVisualElement(),asset=selected&&state.mediaAssets.find(item=>item.id===selected.mediaId),url=asset?.thumbnail||'';if(url&&url!==cachedSource){cachedSource=url;const image=new Image();image.onload=()=>{if(cachedSource===url){sourceImage=image;document.querySelectorAll('.pocket-real-preview').forEach(canvas=>{try{drawPreview(canvas,canvas.dataset.previewKind,canvas.dataset.previewId,.55);}catch{}});installPreviews();}};image.onerror=()=>{if(cachedSource===url)sourceImage=sample;};image.src=url;}else if(!url){cachedSource='';sourceImage=sample;}return sourceImage;}
  function previewClip(){return {id:'tool-preview-only',type:'video',start:0,duration:2,opacity:100,scale:100,scaleX:100,scaleY:100,positionX:0,positionY:0,rotation:0,fit:'cover',keyframes:{},visualEffects:VisualTools.normalize(),effectStack:[]};}
  function drawPreview(canvas,kind,id,progress=.5){
    const context=canvas.getContext('2d'),width=canvas.width,height=canvas.height,clip=previewClip(),source=getSource(),time=Math.max(.01,Math.min(1.99,progress*2));
    context.clearRect(0,0,width,height);context.fillStyle='#19182a';context.fillRect(0,0,width,height);
    if(kind==='transition'){
      const transition=AdvancedEditing.transitionState(id,progress,'incoming'),draw=(image,t)=>{context.save();context.globalAlpha=t.opacity;context.translate(width/2+t.x/100*width,height/2+t.y/100*height);context.rotate(t.rotation*Math.PI/180);context.scale(t.scale,t.scale);context.filter=`blur(${t.blur*.35}px) brightness(${t.brightness})`;if(t.clipPath){context.beginPath();if(id==='iris')context.arc(0,0,Math.min(width,height)*.75*progress,0,Math.PI*2);else context.rect(-width/2,-height/2,width*progress,height);context.clip();}context.drawImage(image,-width/2,-height/2,width,height);context.restore();};draw(sampleAlt,AdvancedEditing.transitionState(id,progress,'outgoing'));draw(source,transition);return;
    }
    if(kind==='element')MotionEffects.addEffect(clip,id,{kind:'video'});
    if(kind==='animation')MotionEffects.applyAnimation(clip,id,{duration:2});
    if(kind==='filter')clip.visualEffects.filter={id,intensity:100};
    const effect=kind==='timeline'?effects.find(item=>item.id===id):null,fxClip={type:'effect',start:0,duration:2,strength:80,opacity:100};
    context.save();if(effect){context.filter=effect.filter||'none';applyExportEffectMotion(context,effect,fxClip,time,width,height);}
    drawContainedMedia(context,source,clip,width,height,time);context.restore();drawClipVisualOverlay(context,clip,width,height,time);if(effect)drawExportEffectOverlay(context,effect,fxClip,time,width,height);
    if(kind!=='animation'){
      context.save();context.beginPath();context.rect(0,0,width*.35,height);context.clip();drawContainedMedia(context,source,previewClip(),width,height,time);context.restore();context.fillStyle='#fff9';context.fillRect(Math.round(width*.35),0,1,height);
      context.fillStyle='#171325bf';context.fillRect(3,3,36,12);context.fillStyle='white';context.font='8px sans-serif';context.fillText('Before',6,12);
    }
  }
  function installPreviews(){
    const panels=document.querySelectorAll('.app-shell[data-view="editor"] .media-panel');if(!panels.length)return;
    const epoch=previewEpoch;
    panels.forEach(panel=>panel.querySelectorAll('[data-element-effect],[data-animation-preset],[data-transition],.filter-card[data-filter],.effect-card[data-effect]').forEach(card=>{
      if(card.closest('.creative-shelves,.filter-recent')||card.dataset.pocketPreviewReady)return;
      const kind=card.hasAttribute('data-element-effect')?'element':card.hasAttribute('data-animation-preset')?'animation':card.hasAttribute('data-transition')?'transition':card.hasAttribute('data-filter')?'filter':'timeline',id=card.dataset.elementEffect||card.dataset.animationPreset||card.dataset.transition||card.dataset.filter||card.dataset.effect;
      const canvas=document.createElement('canvas');canvas.width=192;canvas.height=108;canvas.className='pocket-real-preview';canvas.dataset.previewKind=kind;canvas.dataset.previewId=id;canvas.setAttribute('aria-hidden','true');card.prepend(canvas);card.dataset.pocketPreviewReady='true';card.classList.add('pocket-preview-card');
      try{drawPreview(canvas,kind,id,.55);}catch(error){canvas.remove();card.dataset.pocketPreviewReady='';return;}
      const play=document.createElement('button');play.type='button';play.className='pocket-preview-play';play.textContent='▶ Preview';play.setAttribute('aria-label',`Preview ${card.textContent.trim().replace(/\s+/g,' ').slice(0,70)}`);card.after(play);
      play.onclick=event=>{event.preventDefault();event.stopPropagation();clearTimeout(previewTimer);const started=performance.now();play.textContent='Playing…';const tick=()=>{if(epoch!==previewEpoch||!canvas.isConnected)return;const elapsed=performance.now()-started;if(elapsed>2200){play.textContent='▶ Preview';drawPreview(canvas,kind,id,.55);return;}drawPreview(canvas,kind,id,(elapsed%1800)/1800);previewTimer=setTimeout(tick,80);};tick();};
    }));
  }
  window.ZorifiPocketEditor={groups,closeTools,drawPreview,installPreviews};
  decorateEditor();decorateLibrary();installPreviews();
})();
