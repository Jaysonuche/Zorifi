const test=require('node:test'),assert=require('node:assert/strict'),M=require('../zorifi-native-music.js');
const pattern=(extra={})=>({schema:M.SCHEMA,instrument:'kick',duration:8,bpm:120,timeSignature:'4/4',locked:false,revision:1,notes:[],...extra});
const step=(p,extra={})=>M.editPattern(p,{operation:'step',steps:16,bar:0,index:0,enabled:true,...extra});

test('16, 32 and 64 steps evenly divide each actual source meter, with one-based labels kept out of engine indices',()=>{
  for(const [meter,barDuration]of [['4/4',2],['3/4',1.5],['6/8',1.5],['7/8',1.75]])for(const steps of [16,32,64]){
    const p=pattern({timeSignature:meter}),grid=M.drumGrid(p,{steps,bar:1});assert.equal(grid.barDuration,barDuration);assert.equal(grid.cells.length,steps);
    const changed=step(p,{steps,bar:1,index:steps/2});assert.equal(changed.notes[0].start,barDuration*1.5);assert.equal(grid.cells[steps/2].start,changed.notes[0].start);
    assert.equal(changed.notes[0].pitch,36);assert.equal(changed.notes[0].velocity,.75);assert.equal(p.notes.length,0);
  }
});
test('a step changes only notes at its exact source position and MIDI pitch, retaining other bars, pitches and off-grid notes',()=>{
  const p=pattern({notes:[{id:'cell',start:.5,duration:.1,pitch:36,velocity:.4},{id:'same-cell',start:.5,duration:.2,pitch:36,velocity:.5},{id:'other-pitch',start:.5,duration:.1,pitch:38,velocity:.6},{id:'off-grid',start:.5001,duration:.1,pitch:36,velocity:.7},{id:'other-bar',start:2.5,duration:.1,pitch:36,velocity:.8}]});
  const changed=step(p,{index:4,velocity:.9});assert.deepEqual(changed.notes.slice(2),p.notes.slice(2));assert(changed.notes.slice(0,2).every(n=>n.velocity===.9));assert.deepEqual(changed.notes.map(n=>n.duration),p.notes.map(n=>n.duration));
  const removed=step(changed,{index:4,enabled:false});assert.deepEqual(removed.notes,p.notes.slice(2));assert.equal(removed.revision,3);assert.equal(M.drumGrid(removed).cells[4].enabled,false);assert.equal(p.notes[0].velocity,.4);
});
test('subdivision changes read the same underlying notes and fractional-tempo round trips keep the hit on its cell',()=>{
  const p=step(pattern({bpm:113}),{steps:64,bar:2,index:32,pitch:42,velocity:.62}),reopened=JSON.parse(JSON.stringify(p));
  for(const steps of [16,32,64]){const grid=M.drumGrid(reopened,{steps,bar:2,pitch:42});assert.equal(grid.cells[steps/2].enabled,true);assert.equal(grid.cells[steps/2].velocity,.62);}
  assert.equal(step(reopened,{steps:32,bar:2,index:16,pitch:42,enabled:false}).notes.length,0);
});
test('partial last bars disable unavailable cells and clamp note tails inside the source',()=>{
  const p=pattern({duration:2.02}),grid=M.drumGrid(p,{steps:64,bar:1});assert.equal(grid.totalBars,2);assert.equal(grid.cells[0].available,true);assert.equal(grid.cells[1].available,false);
  const changed=step(p,{steps:64,bar:1,index:0});assert(Math.abs(changed.notes[0].duration-.02)<1e-8);assert.equal(changed.notes[0].start+changed.notes[0].duration,p.duration);
  assert.throws(()=>step(p,{steps:64,bar:1,index:1}),/outside/);assert.equal(p.notes.length,0);
});
test('invalid or locked drum edits reject atomically before native rendering',()=>{
  const p=pattern(),before=structuredClone(p);
  for(const extra of [{steps:8},{steps:'16'},{index:-1},{index:16},{index:1.5},{bar:-1},{bar:4},{bar:.5},{pitch:128},{pitch:42.5},{velocity:0},{velocity:NaN},{velocity:2},{enabled:'true'},{script:'run'}]){assert.throws(()=>step(p,extra));assert.deepEqual(p,before);}
  assert.throws(()=>step({...p,locked:true}),/Unlock/);assert.throws(()=>step({...p,instrument:'piano'}),/kick, snare or hat/);assert.throws(()=>M.drumGrid({...p,timeSignature:'0/4'}),/meter/);
});
test('sequenced notes render real changed PCM and remain exportable MIDI note events',()=>{
  const p=pattern({duration:2,instrument:'snare'}),changed=step(p,{steps:32,index:4,velocity:.6}),quiet=M.renderWav(p),audio=M.renderWav(changed);
  assert.equal(changed.notes[0].pitch,38);assert.equal(audio.duration,2);assert.equal(quiet.rms,0);assert(audio.rms>.001);assert.notDeepEqual(audio.bytes,quiet.bytes);
  const imported=M.parseMidi(M.midiFile([changed])).patterns.find(p=>p.instrument==='snare');assert(imported);assert.equal(imported.notes.length,1);assert(Math.abs(imported.notes[0].start-.25)<.001);assert(Math.abs(imported.notes[0].velocity-.6)<.01);
});
