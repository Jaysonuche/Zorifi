const test=require('node:test');
const assert=require('node:assert/strict');
const Tools=require('../zorifi-tool-registry.js');
const Creative=require('../zorifi-autocut-creative.js');

test('saved tools are persistent validated recipes, never executable code or unbounded operations',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const recipe={id:'recipe:violet-depth',name:'Violet depth',operations:[{id:'spatial',params:{rotateY:-30,endRotateY:20}},{id:'glow',params:{color:'#be64ff',amount:12}}]};
  Tools.saveRecipe(recipe,storage);const restored=Tools.loadRecipes(storage);
  assert.equal(restored.length,1);assert.equal(restored[0].operations[0].params.perspective,2.4);
  const operations=Tools.expandTools([{id:recipe.id,params:{}}],restored);assert.equal(operations.length,2);
  const clip=Tools.applyTools({autoCutStyle:{caption:'Keep title'}},operations);assert.equal(clip.spatial3D.rotateY,-30);assert.equal(clip.autoCutGlow.color,'#be64ff');assert.equal(clip.autoCutStyle.caption,'Keep title');
  assert.throws(()=>Tools.validateRecipe({...recipe,operations:[{id:'eval',params:{source:'fetch(secret)'}}]}),/built-in/);
  assert.throws(()=>Tools.validateRecipe({...recipe,operations:[{id:recipe.id}]}),/built-in/);
  assert.throws(()=>Tools.validateTools([{id:'spatial',params:{rotateY:90}}]),/Invalid spatial/);
  assert.throws(()=>Tools.validateTools([{id:'transform',params:{scale:Infinity}}]),/Invalid transform/);
  assert.throws(()=>Tools.validateTools([{id:'glow',params:{color:'url(https://example.invalid)'}}]),/Invalid glow/);
  assert.throws(()=>Tools.validateTools([{id:'grade',params:JSON.parse('{"__proto__":{}}')}]),/Invalid parameters/);
  assert.throws(()=>Tools.validateTools([{id:'unknown'}]),/Unsupported/);
  assert.throws(()=>Tools.validateTools(Array.from({length:13},()=>({id:'blur'}))),/12 editing/);
  Tools.removeRecipe(recipe.id,storage);assert.deepEqual(Tools.loadRecipes(storage),[]);
  data.set(Tools.STORAGE_KEY,'not json');assert.deepEqual(Tools.loadRecipes(storage),[]);
});

test('spatial panels use perspective division and real depth; their opposite edges differ when tilted',()=>{
  const spatial=Tools.validateParams('spatial',{rotateX:10,endRotateX:10,rotateY:40,endRotateY:40,scale:.9,depth:0,endDepth:0});
  const clip={start:0,duration:2,spatial3D:spatial};const at=Creative.spatialAt(clip,0);
  const leftTop=Creative.projectPoint(0,0,640,360,at),leftBottom=Creative.projectPoint(0,1,640,360,at),rightTop=Creative.projectPoint(1,0,640,360,at),rightBottom=Creative.projectPoint(1,1,640,360,at);
  assert.ok(Math.abs(Math.hypot(leftTop.x-leftBottom.x,leftTop.y-leftBottom.y)-Math.hypot(rightTop.x-rightBottom.x,rightTop.y-rightBottom.y))>25);
  assert.notEqual(leftTop.perspective,rightTop.perspective);
  const depth=Tools.validateParams('spatial',{rotateY:0,endRotateY:0,depth:.6,endDepth:0,scale:1}),start=Creative.projectPoint(1,.5,640,360,Creative.spatialAt({...clip,spatial3D:depth},0)),end=Creative.projectPoint(1,.5,640,360,Creative.spatialAt({...clip,spatial3D:depth},2));
  assert.ok(end.x-start.x>40);assert.equal(end.x,640);
});

test('tool catalogue advertises only implemented operations and normalized saved recipes',()=>{
  const catalog=Tools.capabilities();assert.equal(catalog.length,Tools.BASE_IDS.length-1);
  assert(catalog.every(item=>item.status==='implemented'));assert(!catalog.some(item=>/rotoscop|generate|optical/i.test(item.id)));
  const applied=Tools.applyTools({autoCutStyle:{}},[{id:'mask',params:{shape:'triangle'}},{id:'transition',params:{mode:'whip-left'}},{id:'grade',params:{mode:'monochrome',contrast:1.4}},{id:'caption',params:{text:'First light'}}]);
  assert.equal(applied.maskShape,'triangle');assert.equal(applied.autoCutStyle.transition,'whip-left');assert.equal(applied.autoCutColor.contrast,1.4);assert.equal(applied.autoCutStyle.caption,'First light');
});
