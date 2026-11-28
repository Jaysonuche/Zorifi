const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('../zorifi-motion-graph.js');
const Tools=require('../zorifi-vanessa-professional-tools.js');
const action=(command,parameters={},target='subject')=>({command,target,parameters});
const fixture=()=>{
 const p={frameWidth:320,frameHeight:180,clips:[],mediaAssets:[],trackStates:{},creatorSettings:{}};
 G.apply(p,action('layer.create',{id:'subject',kind:'shape',start:0,duration:10},null));
 return p;
};
const path=[{x:-60,y:-15,out:[20,-5]},{x:60,y:-15,in:[-20,-5]},{x:60,y:15},{x:-60,y:15}];

test('partial native mask transforms preserve editable path geometry and evaluate their own animation channel',()=>{
 const p=fixture();
 G.apply(p,action('mask.set',{type:'path',points:path,closed:true,opacity:42,invert:true}));
 G.apply(p,action('mask.set',{x:22,y:-4,rotation:30}));
 const c=p.clips[0],mask=c.motion.mask;
 assert.deepEqual(mask.points,path);assert.equal(mask.opacity,42);assert.equal(mask.invert,true);
 assert.equal(c.rotation,0);assert.equal(c.positionX,0);
 assert.equal(G.evaluate(p,1).layers[0].mask.rotation,30);
 for(const [time,value]of [[0,0],[2,90]])G.apply(p,action('animation.keyframe',{property:'mask:rotation',time,value}));
 const sample=t=>G.evaluate(p,t).layers[0].mask;
 assert.equal(sample(1).rotation,45);assert.equal(sample(.5).rotation,22.5);assert.equal(sample(1).rotation,45);
 assert.deepEqual(sample(1).points,path);assert.equal(sample(1).x,22);
 assert.deepEqual(G.evaluate(JSON.parse(JSON.stringify(p)),1).layers[0].mask,sample(1));
});

test('nested mask rotation uses the nested source clock after composition timing changes',()=>{
 const p=fixture();
 G.apply(p,action('layer.set',{start:2,duration:4}));
 G.apply(p,action('mask.set',{type:'rectangle',width:100,height:20}));
 for(const [time,value]of [[2,0],[6,120]])G.apply(p,action('animation.keyframe',{property:'mask:rotation',time,value}));
 G.apply(p,action('composition.precompose',{id:'nested',layerIds:['subject'],track:8},null));
 G.apply(p,action('layer.set',{start:5},'nested'));
 G.apply(p,action('source.retime',{rate:2,mode:'source'},'nested'));
 const child=G.evaluate(p,6).layers.find(n=>n.id==='subject');
 assert.equal(child.localTime,2);assert.equal(child.mask.rotation,60);
});

test('mask removal clears mask-only channels and expressions without removing layer animation',()=>{
 const p=fixture();G.apply(p,action('mask.set',{rotation:35}));
 for(const property of ['opacity','mask:rotation','mask:x'])G.apply(p,action('animation.keyframe',{property,time:1,value:20}));
 for(const property of ['positionX','mask:y'])G.apply(p,action('expression.set',{property,expression:{type:'oscillate',amplitude:2,frequency:1}}));
 G.apply(p,action('mask.set',{remove:true}));
 assert.equal(p.clips[0].motion.mask,undefined);
 assert.deepEqual(Object.keys(p.clips[0].keyframes),['opacity']);
 assert.deepEqual(Object.keys(p.clips[0].motion.expressions),['positionX']);
 G.apply(p,action('mask.set',{width:70}));
 assert.equal(G.evaluate(p,1).layers[0].mask.rotation,0);
});

test('malformed mask edits are rejected atomically and malformed persisted masks fail validation',()=>{
 for(const bad of [{type:'triangle'},{type:'path',points:[{x:0,y:0}]},{rotation:NaN},{rotation:Infinity},{rotation:'90'},{invert:1},{opacity:-1},{opacity:101},{feather:-1},{width:0},{unknown:42},{remove:'true'}]){
  const p=fixture();G.apply(p,action('mask.set',{type:'path',points:path}));const before=structuredClone(p);
  assert.throws(()=>G.apply(p,action('mask.set',bad)),undefined,JSON.stringify(bad));assert.deepEqual(p,before);
 }
 for(const bad of [{type:'triangle'},{rotation:'90'},{opacity:-1},{invert:1},{feather:-1}]){
  const p=fixture();G.apply(p,action('mask.set',{width:70}));Object.assign(p.clips[0].motion.mask,bad);
  assert.throws(()=>G.validateGraph(p));
 }
});

test('overshooting mask keys are bounded before renderer use',()=>{
 const p=fixture();G.apply(p,action('mask.set',{type:'ellipse'}));
 for(const [property,value]of [['mask:opacity',200],['mask:width',-100],['mask:feather',-10],['mask:height',40000]])G.apply(p,action('animation.keyframe',{property,time:1,value}));
 const mask=G.evaluate(p,1).layers[0].mask;
 assert.equal(mask.opacity,100);assert.equal(mask.width,.01);assert.equal(mask.feather,0);assert.equal(mask.height,20000);
});

test('Vanessa validates mask transforms through the same graph and verifies exact resulting editable data',()=>{
 const p=fixture();G.apply(p,action('mask.set',{type:'path',points:path,opacity:55}));
 const step={command:'motion.edit',target:'subject',parameters:{operation:'mask.set',dataJson:JSON.stringify({rotation:75,x:12,invert:true})}};
 Tools.validateAction(step,p);const before=structuredClone(p);
 G.apply(p,action(step.parameters.operation,JSON.parse(step.parameters.dataJson)));
 assert.equal(Tools.verifyAction(step,before,p),true);assert.deepEqual(p.clips[0].motion.mask.points,path);
 const incorrect=structuredClone(p);incorrect.clips[0].motion.mask.rotation=0;
 assert.throws(()=>Tools.verifyAction(step,before,incorrect),/verify/);
 p.trackStates[p.clips[0].track]={locked:true};assert.throws(()=>Tools.validateAction(step,p),/Unlock/);
});
