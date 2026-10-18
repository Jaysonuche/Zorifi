const test=require('node:test'),assert=require('node:assert/strict');
const tools=[{id:'spatial',params:{rotateY:25}},{id:'mask',params:{shape:'circle'}},{id:'shake',params:{amount:1}}];
const shot=extra=>({mediaId:'video',sourceStart:1,duration:3,speed:1,motion:'push-in',transition:'flash',grade:'natural',fit:'cover',caption:'Hello',captionPosition:'bottom',layout:'split',secondaryMediaIds:['photo'],tools,...extra});
const input=extra=>({cleanEdit:true,prompt:'A coherent travel story without titles',style:'balanced',media:[{id:'video',type:'video'},{id:'photo',type:'image'}],recipes:[],...extra});
test('clean editorial defaults remove arbitrary collages masks 3D and camera movement from an ordinary brief',async()=>{
  const {refineEditorialPlan}=await import('../netlify/functions/_shared/autocut-planner.mjs');const result=refineEditorialPlan({shots:[shot()]},input()).shots[0];assert.equal(result.layout,'single');assert.deepEqual(result.secondaryMediaIds,[]);assert.equal(result.motion,'none');assert.equal(result.transition,'cut');assert.equal(result.caption,'');assert.deepEqual(result.tools,[]);
});
test('reading and speech preserve legibility and pace while explicit stylized briefs retain supported tools',async()=>{
  const {refineEditorialPlan}=await import('../netlify/functions/_shared/autocut-planner.mjs');const result=refineEditorialPlan({shots:[shot({contentRole:'reading',speed:1.5}),shot({contentRole:'speech',speed:.5})]},input()).shots;assert.equal(result[0].fit,'contain');assert.equal(result[0].motion,'none');assert.equal(result[0].caption,'');assert.equal(result[0].speed,1);assert.deepEqual(result[0].tools,[]);assert.equal(result[1].speed,1);
  const stylized=refineEditorialPlan({shots:[shot()]},input({prompt:'A 3D split-screen with circle mask, camera push-in and selective impact flashes',style:'anime-impact'})).shots[0];assert.equal(stylized.layout,'split');assert.equal(stylized.motion,'push-in');assert.equal(stylized.transition,'flash');assert.equal(stylized.tools.length,3);
});
test('cleaning retains bounded recipe references so expanded complex treatments remain compilable',async()=>{
  const {refineEditorialPlan}=await import('../netlify/functions/_shared/autocut-planner.mjs'),Director=require('../zorifi-autocut-director.js');
  const recipes=Array.from({length:3},(_,index)=>({id:`recipe:colour-${index}`,name:`Colour ${index}`,operations:Array.from({length:8},()=>({id:'grade',params:{mode:'natural'}}))})),value=shot({layout:'single',secondaryMediaIds:[],tools:recipes.map(recipe=>({id:recipe.id,params:{}})),reason:'The real visible setting introduces this scene.'}),plan=refineEditorialPlan({title:'A clean cut',story:'An observed moment.',warnings:[],shots:[value]},input({recipes}));
  assert.equal(plan.shots[0].tools.length,3);assert.equal(plan.shots[0].tools[0].id,recipes[0].id);const result=Director.compile({plan},[{id:'video',name:'Original footage',type:'video',duration:8,url:'blob:original'}],{recipes});assert.equal(result.clips[0].autoCutTools.length,24);
});
