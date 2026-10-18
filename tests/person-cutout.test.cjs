const test=require('node:test');
const assert=require('node:assert/strict');
const Cutout=require('../zorifi-person-cutout.js');
const Tools=require('../zorifi-tool-registry.js');
test('person cutout does not download a model implicitly or invent a shape mask',async()=>{
  assert.equal(Cutout.ready(),false);assert.equal(Cutout.status().scope,'people');
  await assert.rejects(Cutout.prepare(),/Enable person cutout/);
  assert.throws(()=>Cutout.cutout({width:20,height:20}),/not ready/);
  const alpha=Cutout.alphaFromConfidence(new Float32Array([0,.1,.45,.8,1]),{threshold:.45,softness:.12});
  assert.deepEqual([alpha[0],alpha[1],alpha[3],alpha[4]],[0,0,255,255]);assert(Math.abs(alpha[2]-127.5)<1);
  assert(!Tools.capabilities().some(tool=>tool.id==='person-cutout'));
  assert(Tools.capabilities([],{allowPersonCutout:true}).some(tool=>tool.id==='person-cutout'&&tool.scope==='people-only'));
});
