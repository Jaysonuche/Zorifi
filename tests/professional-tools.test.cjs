const test=require('node:test'),assert=require('node:assert/strict');
const Tools=require('../zorifi-vanessa-professional-tools.js');
const Tracks=require('../zorifi-timeline-tracks.js'),Motion=require('../zorifi-motion-effects.js'),Timeline=require('../zorifi-timeline-edit-api.js');
require('../zorifi-visual-tools.js');require('../zorifi-advanced-editing.js');require('../zorifi-audio-engine.js');
const Visual=globalThis.ZorifiVisualTools,Advanced=globalThis.ZorifiAdvancedEditing,Audio=globalThis.ZorifiAudioEngine;
const catalog={filters:Object.keys(Visual.FILTERS),effects:['cinema','glow'],elementEffects:Motion.EFFECTS.map(x=>x.id),effectLibrary:Motion.EFFECTS,animations:Motion.ANIMATIONS.map(x=>x.id),transitions:['dissolve','whip'],audioPresets:Object.keys(Audio.PRESETS),fonts:[{id:'modern',family:'Arial, sans-serif'},{id:'editorial',family:'Georgia, serif'}]};
const options={catalog};
const fixture=()=>({projectId:'real-project',selected:'first',clips:[{id:'first',type:'video',mediaId:'footage',name:'Fashion',start:0,duration:10,sourceStart:1,track:0,opacity:100,playbackRate:1,scale:100,volume:100}],mediaAssets:[{id:'footage',type:'video',duration:20,url:'blob:footage',name:'Footage'},{id:'sound',type:'audio',duration:45,url:'blob:sound',name:'Music'},{id:'logo',type:'image',duration:5,url:'blob:logo',name:'Logo'}],trackStates:{},ratio:'16 / 9',currentProject:'Fashion project'});
const action=(command,parameters={},target='first')=>({command,target,parameters});
const clone=structuredClone;
test('contextual scope preserves unrelated targets and bounds first-five-second edits',()=>{const state=fixture(),grade=action('visual.adjust',{property:'contrast',value:10});assert.throws(()=>Tools.validateScope([grade],state,{range:[0,5]}),/Split/);assert.equal(Tools.validateScope([action('clip.split',{time:5}),grade],state,{range:[0,5]}),true);assert.throws(()=>Tools.validateScope([action('project.rename',{name:'Elsewhere'},null)],state,{targetIds:['first']}),/outside/);assert.throws(()=>Tools.validateScope([action('clip.move',{start:6,track:0})],state,{range:[0,5]}),/Split/);});

test('catalogue distinguishes real staged operations from workflows with their actual implementation paths',()=>{
 const catalog=Tools.catalogue(options),staged=catalog.filter(x=>x.execution==='editor'),workflow=catalog.filter(x=>x.execution==='workflow');
 assert(staged.length>=40);assert(workflow.length>=50);assert.equal(new Set(catalog.map(x=>x.command)).size,catalog.length);
 for(const tool of catalog){assert(tool.permission);assert(tool.verification);assert(tool.undo);assert(tool.schema);}
 for(const command of ['clip.freeze','clip.duplicate','caption.generate','audio.stems','ai.video','export.render','history.undo'])assert.equal(catalog.find(x=>x.command===command).execution,'workflow');
 const schemas=Tools.actionSchema(options).anyOf;assert.equal(schemas.length,staged.length);assert(schemas.every(x=>x.additionalProperties===false&&x.required.includes('target')));
 const creation=schemas.find(x=>x.properties.command.enum[0]==='clip.add');assert(creation.properties.target.anyOf.some(x=>x.type==='null'));
 assert(!JSON.stringify(schemas).includes('"required":false'));assert(!JSON.stringify(schemas).includes('"required":true'));
});

test('all commands reject arbitrary fields, executable text, coercion and prototype-bearing parameter shapes',()=>{
 const state=fixture();
 for(const bad of [action('eval',{code:'fetch(secret)'}),action('clip.set',{property:'__proto__',value:2}),action('clip.set',{property:'opacity',value:'10'}),action('visual.adjust',{property:'brightness',value:Infinity}),{...action('clip.set',{property:'opacity',value:20}),confirmation:true},action('text.add',{id:'title',text:'x',start:0,duration:2,html:'<script>'}),action('clip.move',{start:0,track:.2})])assert.throws(()=>Tools.validateAction(bad,state,options));
 assert.throws(()=>Tools.validateAction(action('visual.chroma',JSON.parse('{"__proto__":{"pollute":true}}')),state,options),/Unknown/);
 assert.throws(()=>Tools.validateAction(action('visual.chroma',Object.create({enabled:true})),state,options),/Malformed/);
 assert.equal({}.pollute,undefined);
 assert.throws(()=>Tools.validateAction(action('caption.generate'),state,options),/separate verified workflow/);
});

test('clip source, locked tracks, element kinds and automatic endings are checked against actual project state',()=>{
 const state=fixture();state.trackStates[0]={locked:true};assert.throws(()=>Tools.validateAction(action('visual.filter',{id:'cinematic'}),state,options),/locked/);assert.doesNotThrow(()=>Tools.validateAction(action('clip.select'),state,options));state.trackStates={};
 state.clips[0].zorifiEnding=true;assert.throws(()=>Tools.validateAction(action('clip.delete'),state,options),/automatic ending/);delete state.clips[0].zorifiEnding;
 assert.throws(()=>Tools.validateAction(action('clip.move',{start:0,track:1}),state,options),/wrong kind/);
 assert.throws(()=>Tools.validateAction(action('text.edit',{text:'Not text'}),state,options),/text clip/);
 assert.throws(()=>Tools.validateAction(action('clip.set',{property:'playbackRate',value:4}),state,options),/exceed/);
 assert.throws(()=>Tools.validateAction(action('animation.apply',{id:'fake-animation'}),state,options),/unavailable/);
 assert.throws(()=>Tools.validateAction(action('transition.apply',{id:'dissolve',duration:11}),state,options));
});

test('creation uses local media and actual fonts, supports audio, preserves input assets and uses unique stable IDs',()=>{
 const state=fixture(),assets=clone(state.mediaAssets),audio=action('clip.add',{id:'soundtrack',mediaId:'sound',start:0,duration:40,track:1,volume:35},null);
 let before=clone(state);assert.equal(Tools.applyCreation(state,audio,options).clipId,'soundtrack');assert.equal(state.clips.at(-1).type,'audio');assert(Tools.verifyAction(audio,before,state,options));assert.deepEqual(assets,state.mediaAssets);
 const title=action('text.add',{id:'brand-title',text:'MAISON',start:3,duration:4,track:2,fontId:'editorial',fontSize:38,color:'#eeeeee'},null);before=clone(state);Tools.applyCreation(state,title,options);assert(Tools.verifyAction(title,before,state,options));assert.equal(state.clips.at(-1).fontFamily,'Georgia, serif');
 assert.throws(()=>Tools.applyCreation(state,title,options),/unique/);
 assert.throws(()=>Tools.applyCreation(state,action('clip.add',{id:'bad',mediaId:'sound',start:0,duration:46},null),options),/source media/);
 assert.throws(()=>Tools.applyCreation(state,action('clip.add',{id:'bad',mediaId:'missing',start:0,duration:1},null),options),/unavailable/);
 const image=action('clip.add',{id:'brand-logo',mediaId:'logo',start:38,duration:7,track:Tracks.id('video',2)},null);Tools.applyCreation(state,image,options);assert.equal(state.clips.at(-1).duration,7);
 const unavailable=clone(state);unavailable.mediaAssets[0].url=null;unavailable.mediaAssets[0].generated=true;assert.throws(()=>Tools.applyCreation(unavailable,action('clip.add',{id:'gone',mediaId:'footage',start:0,duration:1},null),options),/unavailable/);
});

test('bounded plans allow later actions targeting explicitly created IDs, with per-step validation',()=>{
 const state=fixture(),create=action('text.add',{id:'new-title',text:'Next',start:0,duration:3,fontId:'modern'},null),style=action('text.style',{size:32},'new-title');
 assert.equal(Tools.validatePlan([create,style],state,options).length,2);assert.throws(()=>Tools.validateAction(style,state,options),/does not exist/);Tools.applyCreation(state,create,options);assert.doesNotThrow(()=>Tools.validateAction(style,state,options));
 assert.throws(()=>Tools.validatePlan([],state,options),/between/);assert.throws(()=>Tools.validatePlan(Array(121).fill(create),state,options),/120/);assert.throws(()=>Tools.validatePlan([action('export.render')],state,options),/verified workflow/);
});

test('actual native split and both trim directions satisfy verified timing/source postconditions',()=>{
 let state=fixture(),before=clone(state),split=action('clip.split',{time:4});Tools.validateAction(split,state,options);Timeline.splitClip(state,{clipId:'first',time:4,id:'second'});assert(Tools.verifyAction(split,before,state,options));
 for(const from of ['start','end']){state=fixture();before=clone(state);const trim=action('clip.trim',{duration:6,from});Tools.validateAction(trim,state,options);Timeline.trimClip(state,{clipId:'first',duration:6,from});assert(Tools.verifyAction(trim,before,state,options));}
 assert.throws(()=>Tools.verifyAction(action('clip.trim',{duration:6}),fixture(),fixture(),options),/did not verify/);
});

test('effect and animation validation uses real definitions and verifies actual renderer model mutations',()=>{
 const state=fixture(),before=clone(state),effect=action('effect.apply',{id:'cinema-print',params:{contrast:130}});Tools.validateAction(effect,state,options);Motion.addEffect(state.clips[0],'cinema-print',{params:{contrast:130}});assert(Tools.verifyAction(effect,before,state,options));
 for(const params of [{contrast:999},{arbitrary:1},{contrast:NaN}])assert.throws(()=>Tools.validateAction(action('effect.apply',{id:'cinema-print',params}),state,options),/Invalid/);
 const instance=state.clips[0].effectStack[0].id,parameter=action('effect.parameter',{instanceId:instance,property:'contrast',value:140});let old=clone(state);Tools.validateAction(parameter,state,options);Motion.setParameter(state.clips[0],instance,'contrast',140);assert(Tools.verifyAction(parameter,old,state,options));
 const animationId=Motion.ANIMATIONS[0].id,animation=action('animation.apply',{id:animationId,duration:.6});old=clone(state);Tools.validateAction(animation,state,options);Motion.applyAnimation(state.clips[0],animationId,{duration:.6});assert(Tools.verifyAction(animation,old,state,options));
 assert.throws(()=>Tools.verifyAction(effect,state,state,options),/did not verify/);
});

test('real colour, audio and keyframe modules confirm edits; unchanged arbitrary state is not success',()=>{
 const state=fixture(),visual=action('visual.adjust',{property:'saturation',value:84});let before=clone(state);Tools.validateAction(visual,state,options);state.clips[0].visualEffects=Visual.setValue(undefined,'adjustments.saturation',84);assert(Tools.verifyAction(visual,before,state,options));
 const preset=action('audio.preset',{id:'dialogue'});before=clone(state);Tools.validateAction(preset,state,options);Audio.applyPreset(state.clips[0],'dialogue');assert(Tools.verifyAction(preset,before,state,options));
 const key=action('keyframe.set',{property:'scale',time:3,value:114,easing:'ease-out'});before=clone(state);Tools.validateAction(key,state,options);Advanced.upsertKeyframe(state.clips[0],'scale',3,114,'ease-out');assert(Tools.verifyAction(key,before,state,options));
 assert.throws(()=>Tools.validateAction(action('keyframe.set',{property:'opacity',time:3,value:150}),state,options),/Invalid opacity/);
 assert.throws(()=>Tools.verifyAction(action('clip.set',{property:'rotation',value:20}),fixture(),fixture(),options),/did not verify/);
});
