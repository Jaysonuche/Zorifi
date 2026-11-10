const test=require('node:test'),assert=require('node:assert/strict');
const Tools=require('../zorifi-vanessa-professional-tools.js'),Tracks=require('../zorifi-timeline-tracks.js'),SFX=require('../zorifi-sfx.js');
const fixture=()=>({projectId:'sound-design',duration:10,selected:'picture',trackStates:{},mediaAssets:[{id:'picture-source',type:'image',name:'Original photograph',duration:5,url:'blob:original'}],clips:[{id:'picture',type:'video',mediaId:'picture-source',name:'Original picture',start:0,duration:10,track:0,opacity:100}]});
const action=(parameters={})=>({command:'audio.sfx',target:null,parameters:{id:'sound-1',soundId:'soft-whoosh',start:2,...parameters}});

test('original SFX are one reviewed staged command with a fixed sound catalogue, not a paid workflow',()=>{
 const catalogue=Tools.catalogue(),staged=catalogue.filter(item=>item.execution==='editor'),workflow=catalogue.filter(item=>item.execution==='workflow'),tool=staged.find(item=>item.command==='audio.sfx');
 assert.equal(catalogue.length,104);assert.equal(staged.length,51);assert.equal(workflow.length,53);assert.equal(tool.creation,true);assert.equal(tool.requiresCostApproval,false);assert.equal(tool.confirmation,'review-plan');assert.equal(tool.undo,'project-checkpoint');assert.deepEqual(tool.parameters.soundId.enum,SFX.CATALOG.map(cue=>cue.id));
 const schema=Tools.actionSchema().anyOf.find(item=>item.properties.command.enum[0]==='audio.sfx');assert.equal(schema.properties.parameters.additionalProperties,false);assert.deepEqual(schema.properties.parameters.required,['id','soundId','start']);
});

test('creation stages only canonical source metadata and an editable audio clip without touching original media',()=>{
 const project=fixture(),before=structuredClone(project),input=action(),originalInput=structuredClone(input),nativeURL=URL.createObjectURL,nativeBlob=SFX.blob;let materializations=0;
 try{URL.createObjectURL=()=>{materializations++;throw Error('A detached stage must not create URLs');};SFX.blob=()=>{materializations++;throw Error('A detached stage must not synthesize PCM');};const validated=Tools.validateAction(input,project);assert.equal(validated.parameters.duration,.72);assert.equal(validated.parameters.track,1);assert.equal(validated.parameters.volume,20);assert.deepEqual(input,originalInput);assert.deepEqual(project,before);const result=Tools.applyCreation(project,validated);assert.equal(result.mediaId,'zorifi-sfx-soft-whoosh');assert(Tools.verifyAction(validated,before,project));assert.equal(materializations,0);}finally{URL.createObjectURL=nativeURL;SFX.blob=nativeBlob;}
 assert.deepEqual(project.mediaAssets[0],before.mediaAssets[0]);assert.deepEqual(project.clips[0],before.clips[0]);assert.deepEqual(project.mediaAssets[1],Tools.soundEffectAsset('soft-whoosh'));assert(!('url'in project.mediaAssets[1]));assert(!('file'in project.mediaAssets[1]));const clip=project.clips[1];assert.equal(clip.type,'audio');assert.equal(clip.sfxId,'soft-whoosh');assert.equal(clip.soundEffect,true);assert.equal(clip.audioEffects.role,'sfx');assert.equal(clip.sourceStart,0);assert.equal(clip.playbackRate,1);assert.equal(clip.audioFadeIn,.01);assert.equal(clip.audioFadeOut,.12);
});

test('all catalogue cues use their actual deterministic PCM durations and default placement stops at the visual end',()=>{
 for(const cue of SFX.CATALOG){const project=fixture(),input=action({soundId:cue.id,start:9.8}),validated=Tools.validateAction(input,project);assert(Math.abs(validated.parameters.duration-Math.min(cue.duration,.2))<1e-10);const before=structuredClone(project);Tools.applyCreation(project,validated);assert(Tools.verifyAction(input,before,project));const bytes=SFX.wavBytes(cue.id),view=new DataView(bytes.buffer);assert.equal(view.getUint32(40,true)/view.getUint32(28,true),cue.duration);}
 assert.throws(()=>Tools.validateAction(action({start:9.98}),fixture()),/duration/);assert.throws(()=>Tools.validateAction(action({start:9.8,duration:.3}),fixture()),/duration/);assert.throws(()=>Tools.validateAction(action({duration:.8}),fixture()),/source/);
 const project=fixture();project.duration=100;assert.throws(()=>Tools.validateAction(action({start:12}),project),/visible project footage/);
});

test('identity, parameters, typed tracks, locks and visual coverage are validated before creating anything',()=>{
 for(const parameters of [{soundId:'remote-song'},{soundId:'https://example.invalid/audio'},{id:'picture'},{start:-1},{start:10},{volume:4},{volume:46},{volume:Infinity},{duration:0},{duration:.04},{track:0},{track:2},{track:.5},{playbackRate:2},{url:'https://example.invalid/audio'}]){const project=fixture(),before=structuredClone(project);assert.throws(()=>Tools.applyCreation(project,action(parameters)));assert.deepEqual(project,before);}
 const locked=fixture();locked.trackStates[1]={locked:true};assert.equal(Tools.validateAction(action(),locked).parameters.track,100);assert.throws(()=>Tools.validateAction(action({track:1}),locked),/locked/);
 const hidden=fixture();hidden.trackStates[0]={hidden:true};assert.throws(()=>Tools.validateAction(action(),hidden),/visible/);
 const extended=fixture(),track=Tracks.id('audio',150);Tools.applyCreation(extended,action({track,volume:12,duration:.3}));assert.equal(extended.clips[1].track,track);assert.equal(extended.clips[1].volume,12);
 const gap=fixture();gap.clips[0].duration=2;gap.clips.push({...gap.clips[0],id:'later',start:5,duration:5});assert.throws(()=>Tools.validateAction(action({start:3}),gap),/visible/);
});

test('canonical source conflicts are refused while renamed existing original SFX sources are preserved and reused',()=>{
 const expected=Tools.soundEffectAsset('soft-whoosh');for(const change of [{type:'video'},{duration:99},{builtin:false},{audioTrackId:'other'},{sfxId:'other'}]){const project=fixture();project.mediaAssets.push({...expected,...change});const before=structuredClone(project);assert.throws(()=>Tools.applyCreation(project,action()),/conflicting source/);assert.deepEqual(project,before);}
 const duplicate=fixture();duplicate.mediaAssets.push(expected,{...expected});assert.throws(()=>Tools.validateAction(action(),duplicate),/conflicting source/);
 const project=fixture(),renamed={...expected,name:'My quiet accent',available:false,url:'blob:existing-native',waveform:{peaks:[.1,.2]}};project.mediaAssets.push(renamed);const before=structuredClone(project);Tools.applyCreation(project,action());assert.equal(project.mediaAssets.length,2);assert.equal(project.mediaAssets[1],renamed);assert.equal(project.clips[1].name,'My quiet accent');assert(Tools.verifyAction(action(),before,project));
});

test('longer edits can reuse many independent cues without duplicating the eight allowlisted sources',()=>{
 const project=fixture();for(let i=0;i<16;i++)Tools.applyCreation(project,action({id:'accent-'+i,start:i*.5}));assert.equal(project.clips.length,17);assert.equal(project.mediaAssets.length,2);assert.throws(()=>Tools.validatePlan(Array.from({length:121},(_,i)=>action({id:'excess-'+i})),project),/120/);
});

test('default SFX placement finds reusable separate audio layers and respects empty locked layers',()=>{
 const project=fixture();project.clips.push({id:'music',type:'audio',start:0,duration:10,track:1});const before=structuredClone(project),first=Tools.validateAction(action(),project);assert.equal(first.parameters.track,100);Tools.applyCreation(project,first);assert(Tools.verifyAction(first,before,project));
 const later=Tools.validateAction(action({id:'later',start:4}),project);assert.equal(later.parameters.track,100);Tools.applyCreation(project,later);assert.equal(Tools.validateAction(action({id:'overlap',start:2.2}),project).parameters.track,101);assert.equal(Tools.validateAction(action({id:'explicit-overlap',start:2.2,track:100}),project).parameters.track,100);
 const empty=fixture();empty.clips.push({id:'music',type:'audio',start:0,duration:10,track:1});empty.trackStates[100]={locked:true};assert.equal(Tools.validateAction(action(),empty).parameters.track,101);empty.trackStates[101]={locked:false};assert.equal(Tools.validateAction(action(),empty).parameters.track,101);empty.trackStates[101].locked=true;empty.trackStates[103]={locked:true};assert.equal(Tools.validateAction(action(),empty).parameters.track,104);
});

test('SFX verification refuses false success, incorrect gain/source/track and collateral changes',()=>{
 const before=fixture(),after=structuredClone(before),input=action();Tools.applyCreation(after,input);assert(Tools.verifyAction(input,before,after));
 for(const mutate of [project=>project.clips[1].volume=100,project=>project.clips[1].track=3,project=>project.clips[1].sfxId='ui-tick',project=>project.clips[1].audioEffects.role='music',project=>project.clips[1].mediaId='picture-source',project=>project.clips[0].name='Unrelated edit',project=>project.mediaAssets[0].name='Changed original',project=>project.mediaAssets[1].audioTrackId='other',project=>project.clips.push({...project.clips[1],id:'extra'})]){const corrupted=structuredClone(after);mutate(corrupted);assert.throws(()=>Tools.verifyAction(input,before,corrupted),/did not verify/);}
 assert.throws(()=>Tools.verifyAction(input,before,before),/did not verify/);
});

test('advertised supported commands restrict schemas, discovery and execution without changing separate workflows',()=>{
 const supportedCommands=['clip.add','audio.sfx'],options={catalog:{supportedCommands}},catalogue=Tools.catalogue(options);assert.deepEqual(catalogue.filter(item=>item.execution==='editor').map(item=>item.command),supportedCommands);assert.equal(catalogue.filter(item=>item.execution==='workflow').length,53);assert.equal(Tools.actionSchema(options).anyOf.length,2);assert.doesNotThrow(()=>Tools.validateStructure(action(),options));assert.throws(()=>Tools.validateStructure({command:'project.rename',target:null,parameters:{name:'No'}},options),/not advertised/);
 const older=Tools.catalogue().filter(item=>item.execution==='editor'&&item.command!=='audio.sfx').map(item=>item.command);assert.equal(Tools.actionSchema({catalog:{supportedCommands:older}}).anyOf.length,50);assert.throws(()=>Tools.validateStructure(action(),{catalog:{supportedCommands:older}}),/not advertised/);assert.equal(Tools.actionSchema({catalog:{supportedCommands:[]}}).anyOf.length,0);for(const supportedCommands of ['audio.sfx',[1],Array(201).fill('clip.add')])assert.throws(()=>Tools.catalogue({catalog:{supportedCommands}}),/advertised/);
});

test('scoped sound additions respect the requested section with resolved default duration',()=>{
 const project=fixture();assert(Tools.validateScope([action({start:2})],project,{range:[0,5]}));assert.throws(()=>Tools.validateScope([action({start:4.8})],project,{range:[0,5]}),/outside/);assert(Tools.validateScope([action({start:9.8})],project,{range:[9,10]}));assert.throws(()=>Tools.validateScope([action()],project,{targetIds:['picture']}),/outside/);
});
