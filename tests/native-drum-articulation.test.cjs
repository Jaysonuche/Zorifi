const test=require('node:test'),assert=require('node:assert/strict'),M=require('../zorifi-native-music.js');
const pattern=(extra={})=>({schema:M.SCHEMA,instrument:'snare',duration:5,bpm:120,timeSignature:'4/4',locked:false,revision:1,seed:'articulation',notes:[],...extra});
const step=(source,extra={})=>M.editPattern(source,{operation:'step',steps:16,bar:0,index:4,enabled:true,velocity:.8,...extra});

test('flam and every bounded roll are actual deterministic source notes within one step at 16, 32 and 64 subdivisions',()=>{
  for(const steps of [16,32,64])for(const [articulation,hits]of [['flam',2],...([2,3,4,6,8].map(hits=>['roll',hits]))]){
    const p=pattern({bpm:113}),changed=step(p,{steps,bar:1,articulation,hits}),grid=M.drumGrid(changed,{steps,bar:1}),cell=grid.cells[4],ordered=[...changed.notes].sort((a,b)=>a.start-b.start);
    assert.equal(ordered.length,hits);assert.equal(cell.articulation,articulation);assert.equal(cell.hits,hits);assert.equal(cell.noteIds.length,1);assert.equal(cell.hitIds.length,hits);assert.equal(cell.velocity,.8);
    assert.equal(ordered[0].start,cell.start);assert(ordered.every(n=>n.start>=cell.start&&n.start<cell.start+grid.stepDuration&&n.start+n.duration<=p.duration));
    assert.equal(ordered[0].velocity,articulation==='flam'?.52:.8);assert(ordered.slice(1).every(n=>n.velocity===.8&&n.drumStep.anchorId===ordered[0].id));
    assert.deepEqual(changed,step(p,{steps,bar:1,articulation,hits}));assert.equal(p.notes.length,0);
    const reopened=JSON.parse(JSON.stringify(changed));assert.deepEqual(M.drumGrid(reopened,{steps,bar:1}),grid);
  }
});

test('changing and removing a step replaces only its owned retriggers, preserving other bars, pitches and off-grid source hits',()=>{
  const p=pattern({notes:[{id:'anchor',start:.5,duration:.18,pitch:38,velocity:.4},{id:'off-grid',start:.53,duration:.1,pitch:38,velocity:.7},{id:'other-pitch',start:.5,duration:.1,pitch:42,velocity:.6},{id:'other-bar',start:2.5,duration:.1,pitch:38,velocity:.6}]}),before=structuredClone(p);
  const rolled=step(p,{articulation:'roll',hits:8});assert.deepEqual(rolled.notes.filter(n=>['off-grid','other-pitch','other-bar'].includes(n.id)),p.notes.slice(1));assert.equal(rolled.notes.find(n=>n.id==='anchor').duration,.18);
  const flam=step(rolled,{articulation:'flam'});assert.equal(flam.notes.length,p.notes.length+1);assert.equal(M.drumGrid(flam).cells[4].hits,2);
  const single=step(flam,{articulation:'single'});assert.equal(single.notes.length,p.notes.length);assert.equal(single.notes.find(n=>n.id==='anchor').velocity,.8);
  const removed=step(rolled,{enabled:false});assert.deepEqual(removed.notes,p.notes.slice(1));assert.deepEqual(p,before);
  const velocity=step(flam,{velocity:.6});assert.equal(M.drumGrid(velocity).cells[4].articulation,'flam');assert.equal(velocity.notes.find(n=>n.id==='anchor').velocity,.39);assert.equal(M.drumGrid(velocity).cells[4].velocity,.6);
});

test('individual source edits detach articulation ownership so later step changes preserve independently edited hits',()=>{
  const rolled=step(pattern(),{articulation:'roll',hits:4}),child=rolled.notes.find(n=>n.drumStep);
  for(const id of [child.id,rolled.notes[0].id]){
    const changed=M.editPattern(rolled,{operation:'update',id,changes:{velocity:.4}});assert(changed.notes.every(n=>!n.drumStep));
    const removed=step(changed,{enabled:false});assert.equal(removed.notes.length,3);assert(removed.notes.some(n=>n.id===child.id));
  }
  const deleted=M.editPattern(rolled,{operation:'delete',id:rolled.notes[0].id});assert.equal(deleted.notes.length,3);assert(deleted.notes.every(n=>!n.drumStep));
  assert.doesNotThrow(()=>M.editPattern(rolled,{operation:'quantize',beats:.25}));
});

test('flams and rolls reject locked, malformed, out-of-source and over-budget edits atomically',()=>{
  const p=pattern(),before=structuredClone(p);
  for(const extra of [{articulation:'random'},{articulation:'flam',hits:4},{articulation:'single',hits:2},{articulation:'roll',hits:1},{articulation:'roll',hits:5},{articulation:'roll',hits:9},{articulation:'roll',hits:2.5},{articulation:'roll',hits:'4'},{hits:4}]){assert.throws(()=>step(p,extra));assert.deepEqual(p,before);}
  assert.throws(()=>step({...p,locked:true},{articulation:'flam'}),/Unlock/);
  for(const articulation of ['flam','roll'])assert.throws(()=>step(pattern({duration:2.006}),{bar:1,index:0,articulation,hits:articulation==='flam'?2:8}),/too little room/);
  const dense=pattern({notes:Array.from({length:32},(_,i)=>({id:'dense-'+i,start:.5,duration:.3,pitch:38,velocity:.5}))});assert.throws(()=>step(dense,{articulation:'roll',hits:8}),/simultaneous/);assert.equal(dense.notes.length,32);
  const malformed=step(p,{articulation:'roll',hits:4});malformed.notes[1].drumStep.anchorId='missing';assert.throws(()=>M.validatePattern(malformed),/original earlier hit/);
});

test('articulated source notes produce changed PCM and all retriggers survive MIDI export as real note events',()=>{
  const single=step(pattern()),roll=step(single,{articulation:'roll',hits:4}),a=M.renderWav(roll),b=M.renderWav(JSON.parse(JSON.stringify(roll)));
  assert.equal(a.duration,5);assert(a.rms>.001);assert.deepEqual(a.bytes,b.bytes);assert.notDeepEqual(a.bytes,M.renderWav(single).bytes);
  const imported=M.parseMidi(M.midiFile([roll])).patterns.find(p=>p.instrument==='snare');assert.equal(imported.notes.length,4);
  const starts=roll.notes.map(n=>n.start).sort((a,b)=>a-b),actual=imported.notes.map(n=>n.start).sort((a,b)=>a-b);assert(starts.every((at,i)=>Math.abs(at-actual[i])<.002));
});
