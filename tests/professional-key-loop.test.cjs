const test=require('node:test'),assert=require('node:assert/strict');
const Graph=require('../zorifi-motion-graph.js');
test('shared backend accepts bounded visual loop proposals and rejects audio, arbitrary code and locked targets',async()=>{
 const Planner=await import('../netlify/functions/_shared/professional-planner.mjs');
 const manifest={clips:[],mediaAssets:[],trackStates:{},frameWidth:320,frameHeight:180,duration:3,creatorSettings:{compositionDuration:3}};
 Graph.apply(manifest,{command:'layer.create',parameters:{id:'title-shape',kind:'shape',duration:3}});
 for(const [time,value]of [[0,-30],[1,30]])Graph.apply(manifest,{command:'animation.keyframe',target:'title-shape',parameters:{property:'positionX',time,value,easing:'linear'}});
 const before=structuredClone(manifest),catalog=Planner.professionalCatalog({catalog:{supportedCommands:['motion.edit']}}),context={manifest,evidence:{media:[]}};
 const action=expression=>({command:'motion.edit',target:'title-shape',parameters:{operation:'expression.set',dataJson:JSON.stringify({property:'positionX',expression})}});
 const proposal=actions=>({reply:'Review this editable loop.',title:'Repeated movement',strategy:'Loop the existing keyed segment without duplicating layers.',actions,observations:[],warnings:[]});
 for(const mode of ['cycle','ping-pong']){
  const result=Planner.validateProfessionalResult(proposal([action({type:'loop',mode})]),context,catalog);assert.equal(result.actions.length,1);
  const rendered=structuredClone(manifest);Graph.apply(rendered,{command:'expression.set',target:'title-shape',parameters:JSON.parse(result.actions[0].parameters.dataJson)});
  const at=t=>Graph.propertyResolver(rendered.clips)(rendered.clips.find(n=>n.id==='title-shape'),'positionX',t);
  assert(Math.abs(at(.25)-at(mode==='cycle'?1.25:1.75))<1e-6);
 }
 assert.deepEqual(manifest,before);
 assert.throws(()=>Planner.validateProfessionalResult(proposal([action({type:'loop',mode:'cycle',script:'arbitrary()'})]),context,catalog),/unexpected|unsupported|loop/i);
 const audio=action({type:'loop',mode:'cycle'});audio.parameters.dataJson=JSON.stringify({property:'volume',expression:{type:'loop',mode:'cycle'}});
 assert.throws(()=>Planner.validateProfessionalResult(proposal([audio]),context,catalog),/visual|audio|loop/i);
 const locked=structuredClone(manifest);locked.trackStates[0]={locked:true};assert.throws(()=>Planner.validateProfessionalResult(proposal([action({type:'loop',mode:'cycle'})]),{...context,manifest:locked},catalog),/unlock|locked/i);
});
