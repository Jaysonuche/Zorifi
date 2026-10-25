/* Layer source rows, inline animation channels, and real editing shortcuts. */
(function(){
  'use strict';
  if(typeof state==='undefined')return;
  const expanded=new Set(),properties=['positionX','positionY','scale','rotation','opacity'];
  const labels={positionX:'Position X',positionY:'Position Y',scale:'Scale',rotation:'Rotation',opacity:'Opacity'};
  function desktop(){return state.view==='editor'&&!runtimeMode.touch&&editorWorkspaceMode!=='music';}
  function target(id){return state.clips.find(c=>c.id===id);}
  function editable(c){if(!c)return false;if(trackState(c.track).locked){toast('Unlock this layer first');return false;}return true;}
  function pick(c){state.selected=c.id;inspectorTab='details';}
  function channels(c){return c.type==='audio'?['volume','audioPan']:c.type==='effect'?['strength']:properties;}
  function decorate(){
    if(state.view!=='editor'||editorWorkspaceMode==='music')return;
    const shell=document.querySelector('main.app-shell[data-view="editor"]');if(!shell)return;
    if(!desktop()){sizeTimeline(shell);return;}
    shell.classList.add('composition-workspace');
    const stage=shell.querySelector('.stage');
    if(stage&&!stage.querySelector('.composition-monitor-bar')){const bar=document.createElement('header');bar.className='composition-monitor-bar';bar.innerHTML=`<span><i></i> COMPOSITION <b>${esc(state.currentProject)}</b></span><small>${state.frameWidth||'Auto'} × ${state.frameHeight||'Auto'} · ${state.creatorSettings.customFrameRate||30} fps</small>`;stage.prepend(bar);}
    shell.querySelector('.timeline-vanessa-launch')?.remove();
    const title=shell.querySelector('.timeline-title small');if(title)title.textContent='COMPOSITION';
    const toolbar=shell.querySelector('.timeline-toolbar');
    if(toolbar&&!toolbar.querySelector('[data-composition-graph]')){const group=document.createElement('div');group.className='composition-view-buttons';group.innerHTML='<button data-composition-graph="timeline" title="Show animation channels">◆ Keyframes</button><button data-composition-graph="graph" title="Open the animation graph">⌁ Graph</button>';toolbar.querySelector('.spacer')?.before(group);}
    const heads=shell.querySelector('.track-heads');
    if(heads&&!heads.querySelector('.composition-column-head')){const top=document.createElement('div');top.className='composition-column-head';top.textContent='LAYERS / SOURCE NAME';heads.prepend(top);}
    shell.querySelectorAll('[data-track-head]').forEach(head=>{
      const track=Number(head.dataset.trackHead),lane=shell.querySelector(`[data-track-lane="${track}"]`);if(!lane)return;
      const clips=state.clips.filter(c=>c.track===track).sort((a,b)=>a.start-b.start),switches=head.querySelector('.track-switches');
      head.querySelectorAll(':scope > b,:scope > .composition-sources,:scope > .composition-track-label').forEach(n=>n.remove());
      lane.querySelectorAll('.composition-channel-lane').forEach(n=>n.remove());
      const heading=document.createElement('div');heading.className='composition-track-label';heading.innerHTML=`<b>${esc(trackState(track).name||trackLabel(track))}</b><small>${clips.length} ${clips.length===1?'source':'sources'}</small>`;if(switches)heading.append(switches);head.prepend(heading);
      const list=document.createElement('div');list.className='composition-sources';let top=27;
      for(const [index,c] of clips.entries()){
        const row=document.createElement('div');row.className=`composition-source ${c.id===state.selected?'selected':''}`;row.style.height='30px';
        row.innerHTML=`<button data-composition-expand="${esc(c.id)}" aria-label="${expanded.has(c.id)?'Hide':'Show'} animation properties for ${esc(c.name)}" aria-expanded="${expanded.has(c.id)}">${expanded.has(c.id)?'▾':'▸'}</button><small>${index+1}</small><button data-composition-select="${esc(c.id)}" title="${esc(c.name)}"><i>${c.type==='audio'?'♪':c.type==='text'?'T':c.type==='effect'?'FX':'▣'}</i><span>${esc(c.name)}</span></button><em>${c.duration.toFixed(2)}s</em>`;list.append(row);
        const clipNode=lane.querySelector(`[data-clip="${CSS.escape(c.id)}"]`);if(clipNode){clipNode.style.top=`${top+3}px`;clipNode.style.height='24px';clipNode.style.minHeight='24px';}
        top+=30;
        if(expanded.has(c.id))for(const property of channels(c)){
          const value=keyframedValue(c,property),active=AdvancedEditing.keyframeAt(c,property,state.currentTime),line=document.createElement('div');line.className='composition-property';line.innerHTML=`<button data-composition-key="${esc(c.id)}" data-property="${property}" aria-label="Toggle ${labels[property]||property} keyframe" class="${active?'active':''}">◆</button><span>${labels[property]||KEYFRAME_LABELS[property]||property}</span><input type="number" data-composition-value="${esc(c.id)}" data-property="${property}" aria-label="${labels[property]||property} for ${esc(c.name)}" value="${Number(value).toFixed(1)}" step=".1">`;list.append(line);
          const channel=document.createElement('div');channel.className='composition-channel-lane';channel.style.top=`${top}px`;channel.innerHTML=(c.keyframes?.[property]||[]).map(frame=>`<button data-composition-frame="${esc(c.id)}" data-property="${property}" data-time="${frame.time}" style="left:${frame.time/state.duration*100}%" title="${labels[property]||property}: ${frame.value} at ${frame.time.toFixed(2)}s" aria-label="Go to ${labels[property]||property} keyframe at ${frame.time.toFixed(2)} seconds">◆</button>`).join('');lane.append(channel);top+=24;
        }
      }
      head.append(list);const height=trackState(track).collapsed?27:Math.max(57,top);head.style.height=lane.style.height=`${height}px`;head.classList.toggle('composition-collapsed',Boolean(trackState(track).collapsed));
    });
    sizeTimeline(shell);
    const inspector=shell.querySelector('.inspector-tab-content'),c=target(state.selected);
    if(inspector&&c&&!inspector.querySelector('.composition-actions')){const actions=document.createElement('section');actions.className='composition-actions';actions.innerHTML=`<small>LAYER ACTIONS</small><div>${[['duplicate','Duplicate'],['freeze','Freeze frame'],['mirror','Mirror ↔'],['front','Bring to front'],['mask','Mask'],['black','Black silhouette'],['white','White silhouette'],['clear-silhouette','Original colour'],['flash','Flash layer']].map(([id,label])=>`<button data-composition-action="${id}" ${['mirror','black','white','clear-silhouette'].includes(id)&&c.type!=='video'?'disabled':''}>${label}</button>`).join('')}</div><small>Silhouettes preserve transparency. Use a cutout or mask to isolate the subject.</small>`;inspector.prepend(actions);}
  }
  function sizeTimeline(shell){const content=shell.querySelector('.timeline-content'),drop=shell.querySelector('.timeline-new-track-drop');if(!content||!drop)return;const lanes=[...content.querySelectorAll('[data-track-lane]')],height=25+lanes.reduce((sum,lane)=>sum+lane.getBoundingClientRect().height,0)+58;content.style.height=`${Math.ceil(height)}px`;content.style.overflow='visible';}
  function flash(){snapshot();const id=crypto.randomUUID(),start=state.currentTime,duration=.6,clip={id:`flash-${id}`,name:'White flash',type:'video',layerKind:'solid',start,duration,track:nextTrack('video'),opacity:100,volume:0,scale:100,positionX:0,positionY:0,rotation:0,fit:'cover',fillColor:'#ffffff',keyframes:{opacity:[{time:start,value:100,easing:'linear'},{time:start+duration,value:0,easing:'linear'}]}};const asset={id:`flash-source-${id}`,name:'White flash',type:'image',duration,generated:true,url:generatedLayerSvg(clip)};clip.mediaId=asset.id;state.mediaAssets.unshift(asset);state.clips.push(clip);state.selected=clip.id;recalculateDuration();render();scheduleProjectSave(0);}
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-composition-select],[data-composition-expand],[data-composition-key],[data-composition-frame],[data-composition-action],[data-composition-graph]');if(!button)return;event.preventDefault();event.stopPropagation();
    if(button.dataset.compositionGraph){if(!state.selected)return toast('Select a source layer first');state.activePanel=button.dataset.compositionGraph==='graph'?'graph':'keyframes';state.responsivePanel='tools';state.panelCollapsed=false;state.mobileInspectorOpen=false;render();return;}
    if(button.dataset.compositionAction){const action=button.dataset.compositionAction,c=target(state.selected);if(action==='flash')return flash();if(!editable(c))return;if(action==='duplicate')return duplicateSelectedClip();if(action==='freeze')return createFreezeFrame();if(action==='mask'){state.activePanel='mask';render();return;}snapshot();if(action==='front')c.track=nextTrack(trackKind(c.track));else if(action==='mirror'){c.scaleX=-(Number(c.scaleX)||100);for(const frame of c.keyframes?.scaleX||[])frame.value=-frame.value;}else c.silhouette=action==='clear-silhouette'?null:action;render();scheduleProjectSave(0);return;}
    const c=target(button.dataset.compositionSelect||button.dataset.compositionExpand||button.dataset.compositionKey||button.dataset.compositionFrame);if(!c)return;pick(c);
    if(button.dataset.compositionExpand){expanded.has(c.id)?expanded.delete(c.id):expanded.add(c.id);}
    if(button.dataset.compositionKey){if(!editable(c))return;setMotionKeyframe(button.dataset.property);return;}
    if(button.dataset.compositionFrame){activeKeyframeProperty=button.dataset.property;seekProject(Number(button.dataset.time));}
    render();
  });
  document.addEventListener('change',event=>{const input=event.target.closest('[data-composition-value]');if(!input)return;const c=target(input.dataset.compositionValue);if(!editable(c))return;const value=Number(input.value);if(!Number.isFinite(value))return;pick(c);const meta=KEYFRAME_META[input.dataset.property]||[-10000,10000];snapshot();setEditableClipValue(c,input.dataset.property,Math.max(meta[0],Math.min(meta[1],value)));render();scheduleProjectSave(0);});
  const baseRender=render;render=function(){const result=baseRender.apply(this,arguments);decorate();return result;};
  window.ZorifiCompositionWorkspace={decorate,flash,expanded};decorate();
})();
