const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),M=require('../zorifi-native-music.js');
const fixture=(extra={})=>({schema:M.SCHEMA,instrument:'pad',duration:2,bpm:120,timeSignature:'4/4',key:'C',scaleMode:'major',seed:'adsr-proof',revision:3,notes:[{id:'source',start:.1,duration:1,pitch:60,velocity:.6}],...extra});
const setting={attack:.1,decay:.2,sustain:.25,release:.2};
const apply=(source=fixture(),envelope=setting)=>M.editPattern(source,{operation:'envelope',envelope});
function actual(render,index){return new DataView(render.bytes).getInt16(44+index*2,true);}
// Independent expected samples: three fixed linear segments, the unchanged pad
// carrier, Float32 mixer rounding, output saturation and global source-end fade.
function expectedPad(time,gain,velocity=.6){const phase=2*Math.PI*(440*2**((60-69)/12))*time,wave=(Math.sin(phase)+Math.sin(phase*1.003)*.3+Math.sin(phase*2)*.15)*.7;return Math.round(Math.tanh(Math.fround(wave*gain*velocity*.38))*32767);}
test('explicit per-pattern envelope survives round trips and edits without changing notes or source metadata',()=>{
 const source=fixture({midiSource:{track:2,program:89},extra:{keep:true},scaleLock:{enabled:true,key:'C',scaleMode:'major'}}),before=structuredClone(source),updated=apply(source);assert.deepEqual(source,before);assert.deepEqual(updated.notes,source.notes);assert.deepEqual(updated.midiSource,source.midiSource);assert.deepEqual(updated.extra,source.extra);assert.deepEqual(updated.scaleLock,source.scaleLock);assert.deepEqual(updated.envelope,setting);assert.equal(updated.revision,4);assert.deepEqual(M.validatePattern(JSON.parse(JSON.stringify(updated))),updated);
 const transposed=M.editPattern(updated,{operation:'transpose',semitones:1});assert.deepEqual(transposed.envelope,setting);assert.deepEqual(M.editPattern(updated,{operation:'instrument',instrument:'kick'}).envelope,setting);assert.deepEqual(M.blueprintFromProject({clips:[{id:'c',mediaId:'m',start:0,duration:2,track:1,musicPattern:updated}]}).tracks[0].pattern.envelope,setting);
});
test('actual PCM matches independently calculated attack, decay, sustain and reserved release at all sample rates',()=>{
 for(const sampleRate of [22050,44100,48000]){const render=M.renderWav(apply(),{sampleRate}),from=Math.round(.1*sampleRate),window=(Math.round(sampleRate)-1)/sampleRate,releaseStart=window-.2;
  for(const desired of [.025,.05,.075,.1,.15,.2,.25,.3,.4,.6,.79,.81,.85,.9,.95,.99]){const i=Math.round(desired*sampleRate),t=i/sampleRate,gain=t<.1?t/.1:t<.3?1-(t-.1)*3.75:t<releaseStart?.25:.25*(window-t)/.2;assert(Math.abs(actual(render,from+i)-expectedPad(t,gain))<=1,`rate ${sampleRate}, time ${t}`);}
  assert.equal(actual(render,from+sampleRate-1),0);assert.equal(actual(render,from+sampleRate),0);assert.equal(render.frames,2*sampleRate);assert(render.peak>.01);assert.deepEqual(render.bytes,M.renderWav(apply(),{sampleRate}).bytes);
 }
});
test('overlong stages compress proportionally, retain sustain level and never extend a source note',()=>{
 const sampleRate=22050,p=apply(fixture(),{attack:.5,decay:.2,sustain:.2,release:.8}),render=M.renderWav(p,{sampleRate}),from=Math.round(.1*sampleRate),window=(sampleRate-1)/sampleRate,attack=window/3,decay=window*2/15,release=window*8/15;
 for(const desired of [.05,.15,.25,.4,.5,.75,.95]){const i=Math.round(desired*sampleRate),t=i/sampleRate,gain=t<attack?t/attack:t<attack+decay?1-.8*(t-attack)/decay:.2*(window-t)/release;assert(Math.abs(actual(render,from+i)-expectedPad(t,gain))<=1);}
 for(let i=from+sampleRate;i<2*sampleRate;i++)assert.equal(actual(render,i),0);assert.equal(render.duration,2);assert.deepEqual(p.notes,fixture().notes);
});
test('compressed attack and decay finish continuously before release; zero stages and zero sustain have their stated meaning',()=>{
 const sampleRate=22050,from=Math.round(.1*sampleRate),window=(sampleRate-1)/sampleRate,attack=window/27,decay=window*10/27,release=window*16/27,render=M.renderWav(apply(fixture(),{attack:.05,decay:.5,sustain:.2,release:.8}),{sampleRate});
 for(const desired of [.01,.1,.15,.25,.4,.8,.99]){const i=Math.round(desired*sampleRate),t=i/sampleRate,gain=t<attack?t/attack:t<attack+decay?1-.8*(t-attack)/decay:.2*(window-t)/release;assert(Math.abs(actual(render,from+i)-expectedPad(t,gain))<=1);}
 const flat=M.renderWav(apply(fixture(),{attack:0,decay:0,sustain:1,release:0}),{sampleRate});for(const i of [1,500,5000,15000,22049])assert.equal(actual(flat,from+i),expectedPad(i/sampleRate,1));
 const silent=M.renderWav(apply(fixture(),{attack:0,decay:0,sustain:0,release:0}),{sampleRate});assert.equal(silent.peak,0);
});
test('default and extreme ADSR remain audible on shortest notes for all seven sounds and finish with no stuck PCM',()=>{
 const sampleRate=22050,source=fixture({duration:.05,notes:[{id:'short',start:0,duration:.005,pitch:60,velocity:1}]}),defaults={attack:.01,decay:.15,sustain:.7,release:.08};
 for(const instrument of M.INSTRUMENTS)for(const envelope of [defaults,{attack:10,decay:10,sustain:1,release:10},{attack:0,decay:0,sustain:1,release:10}]){const render=M.renderWav(apply({...source,instrument},envelope),{sampleRate});assert(render.peak>.0001,instrument);assert.equal(actual(render,Math.round(.005*sampleRate)-1),0);for(let i=Math.round(.005*sampleRate);i<render.frames;i++)assert.equal(actual(render,i),0);assert(Number.isFinite(render.rms));}
 const window=(Math.round(.005*sampleRate)-1)/sampleRate,attack=window/24,decay=window*15/24,release=window*8/24,render=M.renderWav(apply(source,defaults),{sampleRate});for(const i of [2,10,30,50,80,100]){const t=i/sampleRate,gain=t<attack?t/attack:t<attack+decay?1-.3*(t-attack)/decay:.7*(window-t)/release;assert(Math.abs(actual(render,i)-expectedPad(t,gain,1))<=1);}
});
test('sustain is an audible volume parameter; original instrument carrier and source/MIDI timing remain intact',()=>{
 const p=fixture(),low=apply(p,{attack:.01,decay:.02,sustain:.2,release:.05}),high=apply(p,{attack:.01,decay:.02,sustain:.8,release:.05});assert(M.renderWav(high,{sampleRate:22050}).rms>M.renderWav(low,{sampleRate:22050}).rms*2);assert.deepEqual(M.midiFile([low]),M.midiFile([p]));assert.deepEqual(M.midiFile([high]),M.midiFile([p]));
 for(const instrument of M.INSTRUMENTS){const source=fixture({instrument}),render=M.renderWav(apply(source),{sampleRate:22050});assert(render.peak>0);assert.notDeepEqual(render.bytes,M.renderWav(source,{sampleRate:22050}).bytes);assert.equal(render.frames,44100);}
});
test('malformed settings and no-ops reject atomically before source rendering',()=>{
 for(const envelope of [undefined,null,[],{},'adsr',{...setting,unknown:1},...['attack','decay','release'].flatMap(key=>[-1,10.001,NaN,Infinity,'1',null].map(value=>({...setting,[key]:value}))),...[-1,1.001,NaN,Infinity,'0.7',null].map(sustain=>({...setting,sustain}))]){const source=fixture({envelope}),before=structuredClone(source);if(envelope!==undefined)assert.throws(()=>M.validatePattern(source));assert.deepEqual(source,before);}
 for(const edit of [{operation:'envelope'},{operation:'envelope',envelope:setting,extra:true},{operation:'envelope',envelope:{...setting,attack:-1}}]){const source=fixture(),before=structuredClone(source);assert.throws(()=>M.editPattern(source,edit));assert.deepEqual(source,before);}
 assert.throws(()=>apply(apply()),/already/);assert.throws(()=>apply(fixture({locked:true})),/Unlock/);assert.throws(()=>apply(fixture(),null),/already/);
});
test('all original voice, synthesis work and duration budgets still apply with ADSR and release adds no voices',()=>{
 const notes=Array.from({length:33},(_,i)=>({id:String(i),start:0,duration:.1,pitch:60,velocity:.2}));assert.throws(()=>apply(fixture({notes})),/simultaneous/);assert.throws(()=>apply(fixture({duration:1,notes:Array.from({length:17},(_,i)=>({id:String(i),start:0,duration:1,pitch:60,velocity:.2}))})),/budget/);assert.throws(()=>apply(fixture({duration:601})),/duration/);
 const sequential=fixture({notes:Array.from({length:40},(_,i)=>({id:String(i),start:i*.025,duration:.025,pitch:60,velocity:.2}))});assert.equal(apply(sequential,{attack:0,decay:0,sustain:1,release:10}).notes.length,40);
});
test('all unconfigured native instruments retain pre-ADSR exact WAV bytes and reset restores the original sound',()=>{
 const hashes={kick:'53ee1f37d8f91cca4653088c1b25bccbaba15025e212c41c43a89d85002e4b4e',snare:'f4147559e3b121239ad198c696dcafd0818dfd167f138750e5984e844cd1d3c9',hat:'aa0f6414e04816560e0cd8cd1112b7a01318d09652276f0024346ea699caecb5',bass:'0e29752adb825c0a388586458ccf4240d46887c8b87f111e8278a8576c601f03',piano:'495567987387a00963cde6301610be9f2e50113a3be9bd6c02713742a48e285c',pluck:'fcebf12fb41fb5d7524f0326d47e7181571eda558a6b6bc511d5b73695875783',pad:'e574ac19377120e10c756962a8cb64368b9885ea3a90ae67d7cd5c6867d0e47a'};
 for(const instrument of M.INSTRUMENTS){const p={schema:M.SCHEMA,instrument,duration:1,bpm:120,seed:'legacy-adsr-proof',notes:[{id:'first',start:0,duration:.37,pitch:60,velocity:.6},{id:'later',start:.4,duration:.6,pitch:67,velocity:.8}]},original=M.renderWav(p,{sampleRate:22050});assert.equal(crypto.createHash('sha256').update(Buffer.from(original.bytes)).digest('hex'),hashes[instrument]);const restored=apply(apply(p),null);assert(!Object.hasOwn(restored,'envelope'));assert.deepEqual(M.renderWav(restored,{sampleRate:22050}).bytes,original.bytes);}
});
