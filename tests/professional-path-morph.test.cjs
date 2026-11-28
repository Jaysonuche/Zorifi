const test=require('node:test'),assert=require('node:assert/strict'),Graph=require('../zorifi-motion-graph.js');
test('shared backend validates native path morph proposals and rejects incompatible or protected geometry',async()=>{
 const Planner=await import('../netlify/functions/_shared/professional-planner.mjs'),manifest={clips:[],mediaAssets:[],trackStates:{},frameWidth:320,frameHeight:180,duration:3,creatorSettings:{compositionDuration:3}};
 Graph.apply(manifest,{command:'layer.create',parameters:{id:'morph',kind:'shape',duration:3,geometry:{type:'rectangle',width:60,height:40,roundness:0}}});Graph.apply(manifest,{command:'shape.to_path',target:'morph',parameters:{}});
 const points=structuredClone(manifest.clips[0].motion.geometry.points),target=points.map(p=>({...p,x:p.x+40})),before=structuredClone(manifest),catalog=Planner.professionalCatalog({catalog:{supportedCommands:['motion.edit']}}),context={manifest,evidence:{media:[]}};
 const action=p=>({command:'motion.edit',target:'morph',parameters:{operation:'shape.morph',dataJson:JSON.stringify(p)}}),proposal=actions=>({reply:'Review the editable path animation.',title:'Shape movement',strategy:'Interpolate matching vertices and handles with native keys.',actions,observations:[],warnings:[]});
 const result=Planner.validateProfessionalResult(proposal([action({time:0,points,closed:true}),action({time:1,points:target,closed:true})]),context,catalog);assert.equal(result.actions.length,2);assert.deepEqual(manifest,before);
 const applied=structuredClone(manifest);for(const a of result.actions)Graph.apply(applied,{command:a.parameters.operation,target:a.target,parameters:JSON.parse(a.parameters.dataJson)});assert(Math.abs(Graph.evaluate(applied,.5).layers[0].geometry.points[0].x-(-10))<1e-7);
 assert.throws(()=>Planner.validateProfessionalResult(proposal([action({time:0,points:target.slice(1),closed:true})]),context,catalog),/count|topology|match/i);
 assert.throws(()=>Planner.validateProfessionalResult(proposal([action({time:0,points,closed:true,script:'arbitrary()'})]),context,catalog),/unexpected|unsupported/i);
 const locked=structuredClone(manifest);locked.trackStates[0]={locked:true};assert.throws(()=>Planner.validateProfessionalResult(proposal([action({time:0,points,closed:true})]),{...context,manifest:locked},catalog),/unlock|locked/i);
});
