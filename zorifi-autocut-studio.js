(function(root){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const abortError=()=>new DOMException('AutoCut cancelled','AbortError');
  const check=signal=>{if(signal.aborted)throw abortError();};

  // This workspace owns its temporary media. Nothing is added to the editor until Edit further.
  function open({existingAssets=[],validateFile,onEdit,onClose,requestPlan,getAIConsent=()=>false,setAIConsent,initialPrompt=''}={}){
    const previousFocus=document.activeElement,wrap=document.createElement('div'),urls=new Set();
    let controller=null,assets=[],result=null,plan=null,closed=false,saving=false;
    let settings={duration:30,style:'balanced',ratio:'source',soundtrack:'',method:'gemini',prompt:String(initialPrompt).slice(0,4000),consent:getAIConsent()};
    const makeUrl=blob=>{const url=URL.createObjectURL(blob);urls.add(url);return url;};
    const release=url=>{if(urls.delete(url))URL.revokeObjectURL(url);};
    const underlying=[...document.body.children].filter(element=>!['SCRIPT','STYLE','LINK'].includes(element.tagName)).map(element=>({element,inert:element.inert}));
    wrap.className='autocut-studio-backdrop';
    wrap.innerHTML='<main class="autocut-studio" role="dialog" aria-modal="true" aria-label="AutoCut" data-autocut-phase="select"><header class="autocut-studio-header"><div><p>ZORIFI · VANESSA</p><h1>AutoCut</h1></div><button class="secondary-btn" type="button" data-autocut-close aria-label="Close AutoCut">×</button></header><div class="autocut-studio-body"></div></main>';
    document.body.appendChild(wrap);underlying.forEach(({element})=>{element.inert=true;});
    const studio=wrap.querySelector('main'),body=wrap.querySelector('.autocut-studio-body');
    const pausePreview=()=>{const video=body.querySelector('video');if(video){video.pause();video.removeAttribute('src');video.load();}};
    const close=()=>{if(closed||saving)return;closed=true;controller?.abort();pausePreview();urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();wrap.remove();underlying.forEach(({element,inert})=>{element.inert=inert;});if(previousFocus?.isConnected)previousFocus.focus();onClose?.();};
    wrap.querySelector('[data-autocut-close]').onclick=close;
    wrap.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        const controls=[...wrap.querySelectorAll('button,a[href],input,select,video[controls]')].filter(element=>!element.disabled&&!element.hidden&&element.getClientRects().length),first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    });
    function phase(value){studio.dataset.autocutPhase=value;delete studio.dataset.autocutStage;}
    function setup(){
      pausePreview();phase('select');
      const visuals=existingAssets.filter(asset=>['video','image'].includes(asset.type)&&asset.url&&!asset.zorifiEnding).slice(0,16),audio=existingAssets.filter(asset=>asset.type==='audio'&&asset.url);
      body.innerHTML=`<section class="autocut-setup"><div class="autocut-intro"><span class="autocut-eyebrow">YOUR MEDIA. A FINISHED EDIT.</span><h2>A few moments in.<br>A video out.</h2><p>Choose your photos and videos. Vanessa will find cuts, arrange the sequence and render a video you can play and save here.</p></div><div class="autocut-setup-options"><label>Style<select data-autocut-style><option value="balanced">Everyday highlights</option><option value="energetic">Fast & energetic</option><option value="cinematic">Slow & cinematic</option></select></label><label>Up to (seconds)<input data-autocut-duration type="number" min="1" max="180" step="1" value="${settings.duration}"></label><label>Frame<select data-autocut-ratio><option value="source">Match first media</option><option value="9:16">Portrait · 9:16</option><option value="16:9">Landscape · 16:9</option><option value="1:1">Square · 1:1</option></select></label><label>Sound<select data-autocut-soundtrack><option value="">Original audio</option>${audio.map(asset=>`<option value="${escape(asset.id)}">${escape(asset.name)}</option>`).join('')}</select></label></div><input type="file" accept="image/*,video/*" multiple hidden data-autocut-files><button type="button" class="autocut-upload-zone" data-autocut-select><span>＋</span><b>Select photos & videos</b><small>Choose up to 16 files · generation starts after selection</small></button>${assets.length?'<div class="autocut-studio-actions"><button class="primary-btn" data-autocut-regenerate>Generate again with these media</button></div>':''}${visuals.length?`<details><summary>Or use media from your current project</summary><div class="autocut-existing-media">${visuals.map(asset=>`<label><input type="checkbox" data-autocut-existing value="${escape(asset.id)}">${asset.thumbnail?`<img src="${escape(asset.thumbnail)}" alt="">`:''}<span>${escape(asset.name)}</span></label>`).join('')}</div><button class="primary-btn" data-autocut-existing-generate>Generate selected media</button></details>`:''}<p class="autocut-notice" data-autocut-notice role="status">Local processing · your media stays on this device. Save the finished video before closing.</p></section>`;
      body.querySelector('[data-autocut-style]').value=settings.style;body.querySelector('[data-autocut-ratio]').value=settings.ratio;body.querySelector('[data-autocut-soundtrack]').value=settings.soundtrack;
      body.querySelector('[data-autocut-style]').insertAdjacentHTML('beforeend','<option value="anime-impact">Anime impact · reference inspired</option><option value="motivational">Motivational story · reference inspired</option>');
      body.querySelector('[data-autocut-style]').value=settings.style;
      body.querySelector('.autocut-setup-options').insertAdjacentHTML('beforebegin',`<div class="autocut-direction"><label>Direction<textarea data-autocut-brief rows="2" maxlength="4000" placeholder="Tell Vanessa the story, mood and moments you want to keep…">${escape(settings.prompt)}</textarea></label><label>Editing brain<select data-autocut-method><option value="gemini">Vanessa · Gemini story planning</option><option value="local">Basic local montage · offline</option></select></label><label class="autocut-consent"><input type="checkbox" data-autocut-consent ${settings.consent?'checked':''}> Allow optional AI processing: send sampled frames and short audio excerpts to Gemini to plan this edit.</label></div>`);
      body.querySelector('[data-autocut-method]').value=settings.method;
      const notice=body.querySelector('[data-autocut-notice]'),privacyLabel=body.querySelector('.autocut-consent');
      const explainMethod=()=>{const online=body.querySelector('[data-autocut-method]').value==='gemini';privacyLabel.hidden=!online;notice.textContent=online?'Gemini reviews up to 8 frames and the first 12 seconds of audio per video (48 seconds of audio total). Rendering stays on this device. Save your finished video before closing.':'Basic local montage uses visual measurements. It works offline and does not understand the story or dialogue.';};
      body.querySelector('[data-autocut-method]').onchange=explainMethod;explainMethod();
      const readSettings=()=>{const duration=body.querySelector('[data-autocut-duration]');if(!duration.value||!duration.reportValidity())return false;settings={duration:Number(duration.value),style:body.querySelector('[data-autocut-style]').value,ratio:body.querySelector('[data-autocut-ratio]').value,soundtrack:body.querySelector('[data-autocut-soundtrack]').value,method:body.querySelector('[data-autocut-method]').value,prompt:body.querySelector('[data-autocut-brief]').value.trim(),consent:body.querySelector('[data-autocut-consent]').checked};if(settings.method==='gemini'&&!settings.consent){notice.textContent='Choose Allow optional AI processing to let Gemini review your media, or choose Basic local montage.';body.querySelector('[data-autocut-consent]').focus();return false;}return true;};
      const picker=body.querySelector('[data-autocut-files]');
      body.querySelector('[data-autocut-select]').onclick=()=>{if(readSettings()){picker.value='';picker.click();}};
      picker.onchange=()=>{const files=[...picker.files];if(files.length&&readSettings())generate({files});};
      body.querySelector('[data-autocut-regenerate]')?.addEventListener('click',()=>{if(readSettings())generate({selected:assets});});
      body.querySelector('[data-autocut-existing-generate]')?.addEventListener('click',()=>{if(!readSettings())return;const ids=new Set([...body.querySelectorAll('[data-autocut-existing]:checked')].map(input=>input.value));if(!ids.size){body.querySelector('[data-autocut-notice]').textContent='Choose at least one photo or video.';return;}generate({selected:visuals.filter(asset=>ids.has(asset.id))});});
      body.querySelector('[data-autocut-select]').focus();
    }
    function loading(){
      pausePreview();phase('loading');studio.dataset.autocutStage='analyzing';
      body.innerHTML='<section class="autocut-generating"><div class="autocut-orbit" aria-hidden="true">✦</div><span class="autocut-eyebrow">VANESSA IS PUTTING IT TOGETHER</span><h2>Creating your edit</h2><p role="status" data-autocut-stage>Reading your media…</p><progress data-autocut-progress max="100" value="0" aria-label="Video generation progress"></progress><ol class="autocut-stages"><li class="current">Review media</li><li>Build the cut</li><li>Render video</li></ol><small>Keep Zorifi open. The video renders on your device and takes about its playback length, plus time to review your media.</small><div class="autocut-studio-actions"><button class="secondary-btn" data-autocut-cancel>Cancel</button></div></section>';
      body.querySelector('[data-autocut-cancel]').onclick=close;body.querySelector('[data-autocut-cancel]').focus();
    }
    function progress(value,message,stage='analyzing'){
      if(closed)return;studio.dataset.autocutStage=stage;
      const meter=body.querySelector('[data-autocut-progress]'),label=body.querySelector('[data-autocut-stage]');if(meter)meter.value=Math.min(99,value);if(label)label.textContent=message;
      body.querySelectorAll('.autocut-stages li').forEach((item,index)=>{const active=stage==='rendering'?2:value>=30?1:0;item.className=index<active?'done':index===active?'current':'';});
    }
    async function decodeFile(file,signal,index){
      check(signal);const type=/^image\//.test(file.type)||/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)?'image':/^video\//.test(file.type)||/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)?'video':null;
      if(!type)throw new Error(`${file.name} is not a photo or video.`);validateFile?.(file,'visual');
      const url=makeUrl(file),element=type==='image'?new Image():document.createElement('video');
      if(type==='video'){element.preload='auto';element.muted=true;element.playsInline=true;}
      try{
        await new Promise((resolve,reject)=>{
          const event=type==='image'?'load':'loadeddata',done=(error)=>{clearTimeout(timer);element.removeEventListener(event,ready);element.removeEventListener('error',failed);signal.removeEventListener('abort',aborted);error?reject(error):resolve();},ready=()=>done(),failed=()=>done(new Error(`${file.name} could not be decoded. Choose another file.`)),aborted=()=>done(abortError()),timer=setTimeout(()=>done(new Error(`${file.name} took too long to open. Try a shorter or smaller file.`)),15000);
          element.addEventListener(event,ready,{once:true});element.addEventListener('error',failed,{once:true});signal.addEventListener('abort',aborted,{once:true});element.src=url;
        });check(signal);
        const width=element.naturalWidth||element.videoWidth,height=element.naturalHeight||element.videoHeight,duration=type==='image'?5:element.duration;
        if(!width||!height||!Number.isFinite(duration)||duration<=0)throw new Error(`${file.name} has no readable duration or image dimensions. Re-save it as MP4, PNG or JPG.`);
        const thumbnail=document.createElement('canvas'),scale=Math.min(1,240/Math.max(width,height));thumbnail.width=Math.round(width*scale);thumbnail.height=Math.round(height*scale);thumbnail.getContext('2d').drawImage(element,0,0,thumbnail.width,thumbnail.height);
        return {id:`autocut-media-${Date.now()}-${index}`,name:file.name,type,kind:type,url,file,thumbnail:thumbnail.toDataURL('image/jpeg',.7),duration,width,height,size:file.size,mimeType:file.type,localFile:true};
      }catch(error){release(url);throw error;}finally{if(type==='video'){element.pause();element.removeAttribute('src');element.load();}else element.src='';}
    }
    async function generate({files,selected}){
      controller?.abort();const request=new AbortController();controller=request;const {signal}=request;
      if(result?.url){release(result.url);result=null;}plan=null;loading();
      try{
        if(settings.method==='gemini')setAIConsent?.(settings.consent);
        if(files){
          if(files.length>16)throw new Error('Choose up to 16 photos and videos for one AutoCut.');
          assets.forEach(asset=>release(asset.url));assets=[];
          for(const [index,file] of files.entries()){progress(index/files.length*10,`Opening ${file.name} · ${index+1}/${files.length}`);assets.push(await decodeFile(file,signal,index));}
        }else assets=[...selected];
        check(signal);if(!assets.length)throw new Error('Select at least one photo or video.');
        const soundtrack=existingAssets.find(asset=>asset.id===settings.soundtrack);
        const sourceRatio=assets[0].width/assets[0].height,planningRatio=settings.ratio==='source'?(sourceRatio<.9?'9:16':sourceRatio>1.1?'16:9':'1:1'):settings.ratio;
        if(settings.method==='gemini')plan=await root.ZorifiAutoCutDirector.createPlan(assets,{requestPlan,targetDuration:settings.duration,prompt:settings.prompt,style:settings.style,ratio:planningRatio,soundtrack,signal,onProgress:update=>{if(update.phase==='planning')progress(30,'Vanessa is studying the media and planning your story…');else progress(10+18*((update.assetIndex-1+update.frame/Math.max(1,update.frames))/update.assetCount),`Sampling ${update.name} · ${update.assetIndex}/${update.assetCount}`);}});
        else plan=await root.ZorifiAutoCut.createAutoCutPlan(assets,{targetDuration:settings.duration,prompt:settings.style+' '+settings.prompt,soundtrack,signal,onProgress:update=>progress(10+20*((update.assetIndex-1+(update.sample||0)/Math.max(1,update.totalSamples||1))/update.assetCount),`Reviewing ${update.name} · ${update.assetIndex}/${update.assetCount}`)});
        check(signal);if(!plan.clips.some(clip=>clip.type==='video'))throw new Error('No usable shots were found. Try different media.');
        progress(32,'Arranging the selected moments…');
        const ratio=settings.ratio==='source'?assets[0].width/assets[0].height:settings.ratio.split(':').reduce((a,b)=>a/Number(b));
        const width=ratio>=1?1280:Math.max(2,Math.round(720*ratio/2)*2),height=ratio>=1?Math.max(2,Math.round(1280/ratio/2)*2):720;
        const renderAssets=soundtrack?[...assets,soundtrack]:assets;
        const rendered=await root.ZorifiAutoCutRenderer.render({plan,assets:renderAssets,width,height,signal,onProgress:update=>progress(35+64*update.progress,update.phase==='preparing'?'Preparing the video…':update.phase==='finalizing'?'Finishing your video file…':`Rendering your edit · ${Math.round(update.progress*100)}%`,'rendering')});
        check(signal);if(closed)return;
        result={...rendered,url:makeUrl(rendered.blob),assets:renderAssets,plan};finished();
      }catch(error){if(signal.aborted||closed)return;phase('error');body.innerHTML=`<section class="autocut-failure"><span class="autocut-eyebrow">LET’S TRY THAT AGAIN</span><h2>Your edit couldn’t finish</h2><p role="alert">${escape(error.message||'The selected media could not be rendered.')}</p><div class="autocut-studio-actions"><button class="primary-btn" data-autocut-retry>Back to media</button><button class="secondary-btn" data-autocut-cancel>Close</button></div></section>`;body.querySelector('[data-autocut-retry]').onclick=setup;body.querySelector('[data-autocut-cancel]').onclick=close;body.querySelector('[data-autocut-retry]').focus();}
    }
    function finished(){
      phase('complete');const extension=result.mimeType.includes('mp4')?'mp4':'webm',filename=`Zorifi-AutoCut-${new Date().toISOString().slice(0,10)}.${extension}`,shots=plan.clips.filter(clip=>clip.type==='video').length;
      body.innerHTML=`<section class="autocut-finished"><div class="autocut-intro"><span class="autocut-eyebrow">READY TO PLAY</span><h2>Your edit is ready</h2></div><video class="autocut-result-video" data-autocut-result controls playsinline preload="auto" src="${result.url}"></video><div class="autocut-result-meta"><span>${result.duration.toFixed(1)} seconds</span><span>${shots} shot${shots===1?'':'s'}</span><span>${result.width} × ${result.height}</span><span>${extension.toUpperCase()}</span></div><div class="autocut-studio-actions"><a class="primary-btn" data-autocut-download href="${result.url}" download="${filename}">Save video</a><button class="secondary-btn" data-autocut-edit>Edit further</button><button class="secondary-btn" data-autocut-new>Try another style</button></div><p class="autocut-notice" data-autocut-result-status role="status">Play your finished video, then save a copy to your device.</p><details><summary>About this edit</summary><p>${plan.evidence.sampledFrames} frames reviewed · ${escape(plan.pacing)} pacing. AutoCut uses local visual measurements; review the result for story and dialogue.</p>${plan.warnings.length?`<p>${escape(plan.warnings.join(' '))}</p>`:''}</details></section>`;
      const about=body.querySelector('.autocut-finished details'),evidence=plan.evidence||{};
      body.querySelector('.autocut-result-meta span:nth-child(2)').textContent=`${evidence.shotCount||plan.clips.filter(clip=>clip.type==='video'&&clip.track===0).length} shots`;
      const label=evidence.method==='gemini-multimodal'?`Planned by ${escape(evidence.provider)} · ${escape(evidence.model)} · ${evidence.sampledFrames} sampled frames · ${evidence.audioSamples} audio excerpts`:'Basic local montage · visual measurements only';
      about.innerHTML=`<summary>Vanessa’s direction & shot choices</summary><p>${label}</p>${plan.story?`<h3>${escape(plan.title)}</h3><p>${escape(plan.story)}</p>`:''}${plan.warnings?.length?`<p>${escape(plan.warnings.join(' '))}</p>`:''}<ol>${plan.clips.filter(clip=>clip.type==='video'&&clip.track===0).map(clip=>`<li>${escape(clip.name)} · ${clip.duration.toFixed(1)}s${clip.autoCutEvidence?.reason?` — ${escape(clip.autoCutEvidence.reason)}`:''}</li>`).join('')}</ol>`;
      body.querySelector('[data-autocut-new]').onclick=setup;
      body.querySelector('[data-autocut-edit]').onclick=async()=>{
        if(saving)return;saving=true;const button=body.querySelector('[data-autocut-edit]');button.disabled=true;button.textContent='Saving editable project…';wrap.querySelector('[data-autocut-close]').disabled=true;body.querySelector('[data-autocut-new]').disabled=true;
        try{await onEdit?.(result);saving=false;close();}catch(error){saving=false;button.disabled=false;button.textContent='Edit further';wrap.querySelector('[data-autocut-close]').disabled=false;body.querySelector('[data-autocut-new]').disabled=false;body.querySelector('[data-autocut-result-status]').textContent=error.message||'The project could not be saved. You can still save the video.';}
      };
      body.querySelector('[data-autocut-download]').focus();
    }
    setup();return {close};
  }
  root.ZorifiAutoCutStudio={open};
})(typeof window!=='undefined'?window:globalThis);
