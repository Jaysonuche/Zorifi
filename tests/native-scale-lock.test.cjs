const test=require('node:test'),assert=require('node:assert/strict'),M=require('../zorifi-native-music.js');
const fixture=(extra={})=>({schema:M.SCHEMA,instrument:'piano',duration:5,bpm:120,key:'A',scaleMode:'minor',timeSignature:'4/4',revision:1,notes:[{id:'old',pitch:61,start:.25,duration:.25,velocity:.4,label:'preserve'}],...extra});
const enable=(source=fixture(),extra={})=>M.editPattern(source,{operation:'scaleLock',enabled:true,key:'C',scaleMode:'major',...extra});
const note=(pitch,id='new')=>({operation:'add',note:{id,pitch,start:1,duration:.5,velocity:.7}});
test('persistent scale lock and target changes preserve existing notes and unrelated source metadata',()=>{
 const source=fixture({extra:{keep:true}}),before=structuredClone(source),locked=enable(source);assert.deepEqual(source,before);assert.deepEqual(locked.notes,source.notes);assert.deepEqual(locked.extra,source.extra);assert.equal(locked.key,'A');assert.equal(locked.scaleMode,'minor');assert.equal(locked.revision,2);assert.deepEqual(locked.scaleLock,{enabled:true,key:'C',scaleMode:'major'});
 const changed=enable(locked,{key:'F#',scaleMode:'pentatonic'});assert.deepEqual(changed.notes,source.notes);assert.deepEqual(changed.scaleLock,{enabled:true,key:'F#',scaleMode:'pentatonic'});assert.equal(changed.revision,3);assert.deepEqual(M.validatePattern(JSON.parse(JSON.stringify(changed))),changed);
});
test('new notes and actual pitch updates map to nearest allowed pitch with lower ties',()=>{
 const source=enable(),added=M.editPattern(source,note(61));assert.equal(added.notes.at(-1).pitch,60);assert.deepEqual(added.notes[0],source.notes[0]);assert.deepEqual(source.notes,fixture().notes);
 const updated=M.editPattern(added,{operation:'update',id:'new',changes:{pitch:63,start:2,velocity:.3}});assert.equal(updated.notes.at(-1).pitch,62);assert.equal(updated.notes.at(-1).start,2);assert.equal(updated.notes.at(-1).velocity,.3);assert.deepEqual(updated.notes[0],source.notes[0]);
 const disabled=M.editPattern(updated,{operation:'scaleLock',enabled:false}),chromatic=M.editPattern(disabled,note(61,'free'));assert.equal(chromatic.notes.at(-1).pitch,61);assert.deepEqual(disabled.scaleLock,{enabled:false,key:'C',scaleMode:'major'});
});
test('timing, duration and velocity-only updates do not silently retune existing out-of-scale pitches',()=>{
 const source=enable();for(const changes of [{start:1},{duration:.75},{velocity:.8},{pitch:61,start:1,velocity:.9}]){const updated=M.editPattern(source,{operation:'update',id:'old',changes});assert.equal(updated.notes[0].pitch,61);}
 const move=M.pianoRollEdit(source,{mode:'move',noteId:'old',time:2,pitch:61,duration:.25});assert.equal(move.changes.pitch,61);assert.equal(M.editPattern(source,move).notes[0].pitch,61);
 const draw=M.pianoRollEdit(source,{mode:'add',time:1,pitch:63,duration:.5,id:'draw'});assert.equal(draw.note.pitch,62);
});
test('chords and transposition share lock mapping and keep unrelated notes untouched',()=>{
 const source=enable(),chord=M.editPattern(source,{operation:'chord',root:60,quality:'minor',inversion:0,start:1,duration:.25,velocity:.6,idPrefix:'triad'});assert.deepEqual(chord.notes.slice(1).map(n=>n.pitch),[60,62,67]);assert.deepEqual(chord.notes[0],source.notes[0]);
 const transposed=M.editPattern(chord,{operation:'transpose',semitones:2});assert.deepEqual(transposed.notes.map(n=>n.pitch),[62,62,64,69]);assert.deepEqual(transposed.notes.map(n=>[n.id,n.start,n.duration,n.velocity]),chord.notes.map(n=>[n.id,n.start,n.duration,n.velocity]));
 const zero=M.editPattern(source,{operation:'transpose',semitones:0});assert.deepEqual(zero.notes,source.notes);
});
test('scale lock stays in MIDI bounds for every native key and scale; keyboard steps reach adjacent allowed pitches',()=>{
 for(const key of M.NOTES)for(const scaleMode of Object.keys(M.SCALES)){const source=enable(fixture(),{key,scaleMode}),allowed=M.SCALES[scaleMode].map(n=>(M.NOTES.indexOf(key)+n)%12);for(const pitch of [0,1,61,126,127]){const mapped=M.editPattern(source,note(pitch)).notes.at(-1).pitch;assert(mapped>=0&&mapped<=127&&allowed.includes(mapped%12));}}
 const source=enable();assert.equal(M.stepPitch(source,60,1),62);assert.equal(M.stepPitch(source,60,-1),59);assert.equal(M.stepPitch(source,61,1),62);assert.equal(M.stepPitch(source,61,-1),60);assert.equal(M.stepPitch(source,0,-1),0);assert.equal(M.stepPitch(source,127,1),127);assert.throws(()=>M.stepPitch(source,60,0));
});
test('drum sounds suspend mapping without rewriting pitches or forgetting the pitched scale lock',()=>{
 const source=enable(),drum=M.editPattern(source,{operation:'instrument',instrument:'kick'});assert.deepEqual(drum.notes,source.notes);assert.deepEqual(drum.scaleLock,source.scaleLock);const hit=M.editPattern(drum,note(61));assert.equal(hit.notes.at(-1).pitch,61);assert.equal(M.stepPitch(hit,60,1),61);
 const sequenced=M.editPattern(hit,{operation:'step',steps:16,bar:0,pitch:61,index:8,enabled:true,velocity:.6});assert(sequenced.notes.some(n=>n.pitch===61&&n.start===1));const piano=M.editPattern(hit,{operation:'instrument',instrument:'piano'});assert.deepEqual(piano.notes,hit.notes);assert.equal(M.editPattern(piano,note(63,'resumed')).notes.at(-1).pitch,62);assert.throws(()=>enable(drum),/pitched/);assert.equal(M.editPattern(drum,{operation:'scaleLock',enabled:false}).scaleLock.enabled,false);
});
test('malformed settings, composition locks, no-ops and invalid pitches fail atomically',()=>{
 for(const setting of [null,[],{enabled:'yes',key:'C',scaleMode:'major'},{enabled:true,key:'H',scaleMode:'major'},{enabled:true,key:'C',scaleMode:'toString'},{enabled:true,key:'C',scaleMode:'major',remote:'provider'}])assert.throws(()=>M.validatePattern(fixture({scaleLock:setting})));
 for(const edit of [{enabled:1},{enabled:true,key:'H'},{enabled:true,scaleMode:'harmonic-minor'},{enabled:true,unknown:true}]){const source=fixture(),before=structuredClone(source);assert.throws(()=>M.editPattern(source,{operation:'scaleLock',...edit}));assert.deepEqual(source,before);}
 const source=enable(),before=structuredClone(source);assert.throws(()=>enable(source),/already/);assert.throws(()=>enable({...source,locked:true}),/Unlock/);for(const pitch of [-1,128,60.5,Infinity])assert.throws(()=>M.editPattern(source,note(pitch)));assert.deepEqual(source,before);
 assert.throws(()=>M.editPattern(source,{operation:'chord',root:125,quality:'major',start:1,duration:.5,idPrefix:'unsafe'}),/MIDI/);assert.throws(()=>M.editPattern({...source,notes:[{id:'edge',pitch:127,start:0,duration:.1,velocity:.5}]},{operation:'transpose',semitones:1}),/MIDI/);
});
test('explicit one-shot scale correction remains distinct and locked source renders real deterministic PCM and MIDI',()=>{
 const source=enable(),snapped=M.editPattern(source,{operation:'scale',key:'D',scaleMode:'minor'});assert.deepEqual(snapped.scaleLock,source.scaleLock);assert.equal(snapped.key,'D');const edited=M.editPattern(source,note(63)),wav=M.renderWav(edited,{sampleRate:22050});assert.equal(wav.bytes.byteLength,44+5*22050*2);assert(wav.peak>.001);assert.deepEqual(M.renderWav(edited,{sampleRate:22050}).bytes,wav.bytes);
 const imported=M.parseMidi(M.midiFile([edited]));assert.deepEqual(imported.patterns[0].notes.map(n=>n.pitch).sort(),edited.notes.map(n=>n.pitch).sort());assert.notDeepEqual(M.renderWav(source,{sampleRate:22050}).bytes,wav.bytes);
});
