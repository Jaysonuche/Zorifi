const test=require('node:test'),assert=require('node:assert/strict'),M=require('../zorifi-native-music.js');
const pattern=(overrides={})=>({schema:M.SCHEMA,instrument:'piano',duration:5,bpm:120,timeSignature:'4/4',notes:[{id:'original',start:.25,duration:.25,pitch:60,velocity:.6}],...overrides});
test('piano-roll source windows honor meter, actual end and visible pitch bank without mutating notes',()=>{
 const p=pattern({timeSignature:'7/8',notes:[{id:'inside',start:1.8,duration:.5,pitch:65,velocity:.6},{id:'outside-pitch',start:2,duration:.1,pitch:90,velocity:.5}]});const before=structuredClone(p),g=M.pianoRollGrid(p,{bar:1,bars:2,minPitch:48});assert.equal(g.barDuration,1.75);assert.equal(g.start,1.75);assert.equal(g.span,3.25);assert.equal(g.end,5);assert.equal(g.step,.125);assert.equal(g.totalBars,3);assert.deepEqual(g.notes.map(n=>n.id),['inside']);assert.deepEqual(p,before);
 for(const meter of ['3/4','6/8'])assert.equal(M.pianoRollGrid(pattern({timeSignature:meter})).barDuration,1.5);
});
test('piano-roll view bounds are explicit and dense windows are capped without losing source data',()=>{
 for(const value of [{bar:-1},{bar:3},{bars:3},{beats:.3},{minPitch:-1},{minPitch:105}])assert.throws(()=>M.pianoRollGrid(pattern(),value));
 const notes=Array.from({length:600},(_,i)=>({id:'hit'+i,start:i*.008,duration:.005,pitch:60,velocity:.3})),p=pattern({notes}),g=M.pianoRollGrid(p,{bars:4});assert.equal(g.notes.length,512);assert.equal(g.visibleCount,600);assert(g.truncated);assert.equal(p.notes.length,600);
});
test('piano-roll add proposals clamp source bounds and reject invalid identities and numeric values',()=>{
 const p=pattern(),before=structuredClone(p),edit=M.pianoRollEdit(p,{mode:'add',id:'drawn',time:4.95,pitch:64,duration:.25,velocity:.7});assert.equal(edit.note.start,4.75);const updated=M.editPattern(p,edit);assert.equal(updated.notes.at(-1).duration,.25);assert.deepEqual(p,before);
 for(const changes of [{id:'original'},{id:''},{pitch:128},{pitch:60.2},{time:NaN},{duration:Infinity},{velocity:1.1},{mode:'anything'}])assert.throws(()=>M.pianoRollEdit(p,{mode:'add',id:'new',time:1,pitch:64,duration:.25,...changes}));
});
test('moving and resizing a source note preserves unrelated notes and detaches drum ownership',()=>{
 let p=pattern({instrument:'kick',notes:[{id:'anchor',start:0,duration:.1,pitch:36,velocity:.7},{id:'unrelated',start:.07,duration:.01,pitch:37,velocity:.4}]});p=M.editPattern(p,{operation:'step',steps:16,index:0,enabled:true,articulation:'flam',hits:2});const before=structuredClone(p),edit=M.pianoRollEdit(p,{mode:'move',noteId:'anchor',time:.5,pitch:40,duration:.1}),moved=M.editPattern(p,edit);assert.equal(moved.notes.find(n=>n.id==='anchor').start,.5);assert.equal(moved.notes.find(n=>n.id==='anchor').pitch,40);assert(!moved.notes.some(n=>n.drumStep));assert.deepEqual(moved.notes.find(n=>n.id==='unrelated'),before.notes.find(n=>n.id==='unrelated'));assert.deepEqual(p,before);
 const resized=M.editPattern(moved,M.pianoRollEdit(moved,{mode:'resize',noteId:'anchor',time:.5,pitch:40,duration:10}));assert.equal(resized.notes.find(n=>n.id==='anchor').duration,4.5);
});
test('composition locks and synthesis budgets remain enforced on piano-roll edits',()=>{
 const locked=pattern({locked:true});assert.equal(M.pianoRollGrid(locked).notes.length,1);assert.throws(()=>M.pianoRollEdit(locked,{mode:'move',noteId:'original',time:1,pitch:62,duration:.25}),/Unlock/);
 const p=pattern({notes:Array.from({length:32},(_,i)=>({id:'voice'+i,start:0,duration:.1,pitch:60,velocity:.5}))}),edit=M.pianoRollEdit(p,{mode:'add',id:'too-many',time:0,pitch:60,duration:.1});assert.throws(()=>M.editPattern(p,edit),/32 simultaneous/);assert.equal(p.notes.length,32);
});
test('piano-roll source changes produce actual distinct PCM and MIDI without changing duration',()=>{
 const p=pattern(),updated=M.editPattern(p,M.pianoRollEdit(p,{mode:'add',id:'drawn',time:1,pitch:67,duration:.5,velocity:.75})),a=M.renderWav(p,{sampleRate:22050}),b=M.renderWav(updated,{sampleRate:22050});assert.equal(a.duration,b.duration);assert.equal(a.duration,5);assert.notDeepEqual(a.bytes,b.bytes);assert.notDeepEqual(M.midiFile([p]),M.midiFile([updated]));assert.deepEqual(M.renderWav(updated,{sampleRate:22050}).bytes,b.bytes);
});
