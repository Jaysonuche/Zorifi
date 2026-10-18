const test=require('node:test');
const assert=require('node:assert/strict');
const Director=require('../zorifi-autocut-director.js');
const Creative=require('../zorifi-autocut-creative.js');
global.ZorifiPhase11=require('../zorifi-phase11.js');
const Renderer=require('../zorifi-autocut-renderer.js');
const assets=[{id:'a',name:'Action',type:'video',duration:8,url:'blob:a'},{id:'b',name:'Detail',type:'image',duration:5,url:'blob:b'}];
const shot=extra=>({mediaId:'a',sourceStart:1,duration:2,speed:1,reason:'The source shows the opening action.',fit:'contain',motion:'push-in',transition:'cut',grade:'natural',caption:'Begin',captionPosition:'center',layout:'single',secondaryMediaIds:[],focalPoint:{x:.2,y:.4},...extra});
const response=shots=>({plan:{title:'An intentional opening',story:'Action, then a contrasting detail.',shots,warnings:[]},metadata:{provider:'Gemini',model:'configured-model',analyzedFrames:8,audioSamples:1}});
test('Gemini direction compiles to valid separate editable layers, source timing and quiet soundtrack',()=>{
  const input=response([shot({layout:'split',secondaryMediaIds:['b']}),shot({mediaId:'b',sourceStart:0,duration:1,caption:''})]);
  const before=JSON.stringify(input),result=Director.compile(input,assets,{targetDuration:3,soundtrack:{id:'music',duration:2,name:'Music'}});
  assert.deepEqual(result.clips.map(c=>c.track),[0,4,0,1]);assert.equal(result.clips[1].volume,0);assert.equal(result.clips[0].volume,100);assert.equal(result.clips.at(-1).duration,2);assert.equal(result.clips.at(-1).volume,25);
  assert.equal(result.clips[0].sourceStart,1);assert.equal(result.clips[0].autoCutStyle.caption,'Begin');assert.equal(result.evidence.provider,'Gemini');assert.equal(result.evidence.shotCount,2);assert.equal(JSON.stringify(input),before);
  assert.equal(Renderer.preparePlan(result,[...assets,{id:'music',type:'audio',url:'blob:music',duration:2}]).scenes.length,2);
});
test('invalid model timing or unknown collage sources never becomes a rendered edit',()=>{
  assert.throws(()=>Director.compile(response([shot({sourceStart:7})]),assets),/beyond/);
  assert.throws(()=>Director.compile(response([shot({speed:NaN})]),assets),/invalid/);
  assert.throws(()=>Director.compile(response([shot({layout:'split',secondaryMediaIds:['unknown']})]),assets),/beyond/);
  assert.throws(()=>Director.compile(response([shot({layout:'split',secondaryMediaIds:['a']})]),assets),/invalid/);
  assert.throws(()=>Director.compile(response([shot()]),assets,{targetDuration:1}),/exceeds/);
});
test('audio samples are compact mono 16k PCM with a truthful duration and bounded source window',()=>{
  const signal=Float32Array.from({length:48000},(_,i)=>Math.sin(i*.08)*.25),buffer={duration:1,sampleRate:48000,numberOfChannels:2,getChannelData:()=>signal};
  const result=Director.wavExcerpt(buffer,.25,.5),view=new DataView(result.bytes.buffer);
  assert.equal(result.duration,.5);assert.equal(result.start,.25);assert.equal(result.bytes.length,16044);assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint16(34,true),16);
  assert.ok(Math.abs(view.getInt16(100,true))>50);
});
test('creative framing uses eased movement and keeps contained reading material still when requested',()=>{
  const clip={start:1,duration:2,autoCutStyle:{motion:'push-in',grade:'monochrome',caption:'Useful title'}};
  assert.equal(Creative.motionAt(clip,1).scale,1);assert.equal(Creative.motionAt(clip,3).scale,1.12);assert.equal(Creative.style(clip).grade,'monochrome');
  assert.equal(Creative.motionAt({...clip,autoCutStyle:{motion:'none'}},2).scale,1);
  assert.deepEqual(Creative.cell({collage:{cell:{left:50,top:0,width:50,height:100}}},640,360),{x:320,y:0,width:320,height:360});
});
test('cancelled Gemini planning stops before collecting or sending source data',async()=>{
  const controller=new AbortController();controller.abort();let calls=0;
  await assert.rejects(Director.createPlan(assets,{signal:controller.signal,requestPlan:()=>{calls++;}}),{name:'AbortError'});assert.equal(calls,0);
});

test('a long accepted title wraps and scales without silently losing its ending',()=>{
  const caption='The beginning of a beautiful story grows through every careful choice and every surprising moment until we reach the final scene together',drawn=[];
  const context={save(){},restore(){},translate(){},scale(){},strokeText(){},fillText(text){drawn.push(text);},measureText(text){return {width:text.length*Number(this.font?.match(/[\d.]+/)[0]||20)*.6};}};
  Creative.drawCaption(context,{start:0,duration:5,opacity:100,autoCutStyle:{caption,captionPosition:'center',kinetic:false}},3,405,720);
  assert.equal(drawn.join(' '),caption);assert.match(drawn.at(-1),/together$/);
});

test('saved tools compile into actual editable renderer settings and preserve collage captions on one layer',()=>{
  const recipe={id:'recipe:camera-drift',name:'Camera drift',operations:[{id:'spatial',params:{rotateY:-25,endRotateY:15}},{id:'caption',params:{text:'Forward'}}]};
  const result=Director.compile(response([shot({layout:'split',secondaryMediaIds:['b'],tools:[{id:recipe.id,params:{}}]})]),assets,{recipes:[recipe]});
  assert.equal(result.clips[0].spatial3D.rotateY,-25);assert.equal(result.clips[1].spatial3D.endRotateY,15);assert.equal(result.clips[0].autoCutStyle.caption,'Forward');assert.equal(result.clips[1].autoCutStyle.caption,'');
  assert(result.clips.every(clip=>clip.autoCutToolsApplied));assert.equal(result.clips[0].autoCutTools[0].id,'spatial');
  assert.throws(()=>Director.compile(response([shot({tools:[{id:'execute-javascript',params:{}}]})]),assets),/Unsupported/);
});

test('hero overlays keep the background intact and put a real person mask on the editable foreground only',()=>{
  const result=Director.compile(response([shot({layout:'hero-overlay',secondaryMediaIds:['b'],tools:[{id:'person-cutout',params:{}}]})]),assets);
  assert.equal(result.clips[0].subjectCutout,undefined);assert.equal(result.clips[1].subjectCutout.enabled,true);
  assert.deepEqual(result.clips[0].collage.cell,{left:0,top:0,width:100,height:100});assert.deepEqual(result.clips[1].collage.cell,{left:20,top:2,width:60,height:96});
  assert.equal(Renderer.preparePlan(result,assets).scenes[0].items.length,2);
});
