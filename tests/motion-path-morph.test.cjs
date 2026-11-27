const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../zorifi-motion-graph.js'),Tools=require('../zorifi-vanessa-professional-tools.js');
const action=(command,parameters={},target='path')=>({command,parameters,target});
const start=[{x:-60,y:-20,in:[-5,0],out:[20,-10]},{x:60,y:-20,in:[-20,-10],out:[5,0]},{x:60,y:20,in:[0,-5],out:[-20,10]},{x:-60,y:20,in:[20,10],out:[0,-5]}];
const end=start.map(p=>({x:p.x*.5+40,y:p.y*2,in:p.in.map(v=>v*2),out:p.out.map(v=>v*.5)}));
function fixture(){const p={frameWidth:320,frameHeight:180,clips:[],mediaAssets:[],trackStates:{},creatorSettings:{}};G.apply(p,action('layer.create',{id:'path',kind:'shape',duration:6,geometry:{type:'path',width:120,height:40,points:start,closed:true,roundness:0,fill:'#fa39a4',strokeEnabled:true,strokeWidth:2,trimStart:10,trimEnd:80,trimOffset:30,repeater:{enabled:false,count:2,x:30}}},null));return p;}
function keys(p,extra={}){for(const [time,points]of [[0,start],[2,end]])G.apply(p,action('shape.morph',{time,points,closed:true,...extra}));return p;}
const sample=(p,time)=>G.evaluate(p,time).layers.find(n=>n.id==='path');

test('native morph evaluates each matching vertex and Bezier handle exactly without changing source controls',()=>{
 const p=fixture(),original=structuredClone(p.clips[0].motion.geometry);keys(p);const mid=sample(p,1);
 assert.deepEqual(sample(p,0).geometry.points,start);assert.deepEqual(sample(p,2).geometry.points,end);
 for(let i=0;i<start.length;i++){assert.equal(mid.geometry.points[i].x,(start[i].x+end[i].x)/2);assert.equal(mid.geometry.points[i].y,(start[i].y+end[i].y)/2);for(const field of ['in','out'])assert.deepEqual(mid.geometry.points[i][field],start[i][field].map((v,n)=>(v+end[i][field][n])/2));}
 for(const field of ['fill','stroke','strokeWidth','trimStart','trimEnd','trimOffset','roundness'])assert.deepEqual(mid.geometry[field],original[field]);
 assert.deepEqual(p.clips[0].motion.geometry,original);assert.deepEqual(sample(p,1),mid);sample(p,5);sample(p,.25);assert.deepEqual(sample(p,1),mid);assert.deepEqual(sample(JSON.parse(JSON.stringify(p)),1),mid);
 assert.equal(G.validateGraph(p).keyframes,2);assert.equal(G.validateGraph(p).morphVertices,8);
});

test('hold, nonlinear and temporal Bezier interpolation remain deterministic and reject overshoot',()=>{
 for(const [easing,progress]of [['hold',0],['ease-in',.125],['ease-out',.875],['easy-ease',.5],['linear',.5]]){const p=keys(fixture(),{easing});assert.equal(sample(p,1).geometry.points[0].x,start[0].x+(end[0].x-start[0].x)*progress);}
 const p=keys(fixture(),{easing:'bezier',bezier:[.2,.1,.8,.9]}),mid=sample(p,1);assert(Math.abs(mid.geometry.points[0].x-(start[0].x+end[0].x)/2)<1e-9);
 for(const bezier of [[.2,-.1,.8,1],[.2,0,.8,1.01],[-.01,0,.8,1],[.2,0,1.01,1]])assert.throws(()=>G.apply(p,action('shape.morph',{time:3,points:end,closed:true,easing:'bezier',bezier})),/Bezier/);
 const malformed=structuredClone(p);malformed.clips[0].motion.pathMorph.keys[0].bezier=[.2,2,.8,-1];assert.throws(()=>G.evaluate(malformed,1),/Bezier/);
});

test('morph point order is retained and missing handles interpolate as zero without optical reconstruction',()=>{
 const p=fixture(),plain=start.map(({x,y})=>({x,y}));G.apply(p,action('shape.morph',{time:0,points:plain,closed:true}));G.apply(p,action('shape.morph',{time:2,points:end,closed:true}));assert.deepEqual(sample(p,0).geometry.points,plain);assert.deepEqual(sample(p,1).geometry.points[0].in,end[0].in.map(v=>v/2));assert.deepEqual(sample(p,2).geometry.points,end);
});

test('native path morph rejects incompatible topology, untyped data and unsafe input atomically',()=>{
 const p=keys(fixture()),before=structuredClone(p);for(const bad of [{points:start.slice(1)},{closed:false},{closed:1},{time:'1'},{points:[...start,{x:1,y:2}]},{points:start.map(p=>({...p,x:Infinity}))},{points:start.map(p=>({...p,extra:1}))},{points:start.map(p=>({...p,in:[1]}))},{points:start.map(p=>({...p,x:16385}))},{easing:'javascript'},{code:'eval()'},{remove:'true'},{remove:true,points:start},{groupId:'absent'}]){assert.throws(()=>G.apply(p,action('shape.morph',{time:1,points:start,closed:true,...bad})));assert.deepEqual(p,before);}
 assert.throws(()=>G.apply(p,action('shape.vertices',{points:start.slice(1)})),/topology/);assert.deepEqual(p,before);
 assert.throws(()=>G.apply(p,action('shape.set',{type:'ellipse'})),/editable path/);assert.deepEqual(p,before);
});

test('separate group morphs preserve transforms, paint, masks, expressions, trim and repeaters',()=>{
 const p=keys(fixture());G.apply(p,action('shape.group',{id:'a',name:'Path A',geometry:{type:'path',points:start,closed:true,roundness:0,fill:'#40ffff',trimEnd:70,repeater:{enabled:true,count:2,x:20}},transform:{x:40,y:10,rotation:20}}));G.apply(p,action('shape.group',{id:'b',geometry:{type:'ellipse',width:20,height:20},transform:{x:-70}}));keys(p,{groupId:'a'});G.apply(p,action('mask.set',{type:'rectangle',width:300,height:170,rotation:5}));G.apply(p,action('expression.set',{property:'positionY',expression:{type:'oscillate',frequency:1,amplitude:2}}));G.apply(p,action('shape.group',{id:'a',name:'Renamed',transform:{x:50}}));
 const n=sample(p,1);assert.deepEqual(n.groups[0].geometry.points,n.geometry.points);assert.equal(n.groups[0].geometry.trimEnd,70);assert.equal(n.groups[0].geometry.repeater.count,2);assert.equal(n.groups[0].matrix[4],50);assert.equal(n.groups[1].geometry.type,'ellipse');assert.equal(n.mask.rotation,5);assert.equal(p.clips[0].motion.expressions.positionY.type,'oscillate');assert.equal(p.clips[0].motion.groups[0].pathMorph.keys.length,2);
});

test('nested morph clocks follow containing source timing and preserve exact scrub after retime/precompose/duplicate',()=>{
 const p=fixture();G.apply(p,action('layer.set',{start:2,duration:4}));for(const [time,points]of [[2,start],[6,end]])G.apply(p,action('shape.morph',{time,points,closed:true}));G.apply(p,action('composition.precompose',{id:'comp',layerIds:['path'],track:8},null));G.apply(p,action('layer.set',{start:5},'comp'));G.apply(p,action('source.retime',{rate:2,mode:'source'},'comp'));const n=sample(p,6);assert.equal(n.localTime,2);assert.equal(n.geometry.points[0].x,(start[0].x+end[0].x)/2);
 const q=keys(fixture());G.apply(q,action('animation.retime',{from:0,to:2,newFrom:1,newTo:5}));assert.equal(sample(q,3).geometry.points[0].x,(start[0].x+end[0].x)/2);G.apply(q,action('layer.duplicate',{id:'copy',start:2,track:1}));assert.deepEqual(q.clips.find(c=>c.id==='copy').motion.pathMorph.keys.map(k=>k.time),[3,7]);const retained=structuredClone(q.clips.find(c=>c.id==='copy').motion.pathMorph);G.apply(q,action('animation.copy',{sourceId:'path'},'copy'));assert.deepEqual(q.clips.find(c=>c.id==='copy').motion.pathMorph,retained);
});

test('morphs reject locked native layers, nested tracks and containing composition tracks',()=>{
 const p=keys(fixture());p.trackStates[0]={locked:true};const before=structuredClone(p);assert.throws(()=>G.apply(p,action('shape.morph',{time:1,points:end,closed:true})),/Unlock/);assert.deepEqual(p,before);delete p.trackStates[0];G.apply(p,action('composition.precompose',{id:'comp',layerIds:['path'],track:8},null));p.clips[0].composition.trackStates[0]={locked:true};assert.throws(()=>G.apply(p,action('shape.morph',{remove:true})),/Unlock/);delete p.clips[0].composition.trackStates[0];p.trackStates[8]={locked:true};assert.throws(()=>G.apply(p,action('shape.morph',{remove:true})),/Unlock/);assert.equal(G.isLocked(p,'path'),true);
});

test('local path bounds include handle hulls and reject excessive planes before allocation',()=>{
 const p=keys(fixture()),n=sample(p,1);assert(n.renderBounds.left<-30);assert(n.renderBounds.width>100);assert(n.renderBounds.height>50);
 const before=structuredClone(p);for(const points of [start.map((p,i)=>({...p,x:i%2?10000:-10000})),start.map((p,i)=>({...p,x:i%2?3000:-3000,y:i%2?3000:-3000}))]){assert.throws(()=>G.apply(p,action('shape.morph',{time:1,points,closed:true})),/16384|million/);assert.deepEqual(p,before);}
 G.apply(p,action('layer.create',{id:'cam',kind:'camera',duration:6},null));const projected=sample(p,1);assert.equal(projected.perspective,true);assert(projected.quad.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});

test('morph segment bounds reject oversized intermediate planes before committing main or grouped keys',()=>{
 const rectangle=(x,y)=>[{x:-x,y:-y},{x,y:-y},{x,y},{x:-x,y}],wide=rectangle(7000,200),tall=rectangle(200,7000);
 for(const groupId of [undefined,'morph-group'])for(const easing of ['linear','ease-in','ease-out','easy-ease','bezier']){
  const p=fixture(),extra={...(groupId?{groupId}:{}),easing,...(easing==='bezier'?{bezier:[.2,.1,.8,.9]}:{})};
  if(groupId)G.apply(p,action('shape.group',{id:groupId,geometry:{type:'path',points:start,closed:true,strokeEnabled:false}}));
  G.apply(p,action('shape.morph',{time:0,points:wide,closed:true,...extra}));const before=structuredClone(p);
  assert.throws(()=>G.apply(p,action('shape.morph',{time:2,points:tall,closed:true,...extra})),/interpolation plane.*million/);assert.deepEqual(p,before);
 }
 // The maximum area can occur away from the temporal midpoint.
 const p=fixture();G.apply(p,action('shape.set',{strokeEnabled:false}));G.apply(p,action('shape.morph',{time:0,points:rectangle(7500,555),closed:true}));const before=structuredClone(p);
 assert.throws(()=>G.apply(p,action('shape.morph',{time:2,points:rectangle(500,1250),closed:true})),/interpolation plane.*million/);assert.deepEqual(p,before);
});

test('safe moving bounds and held path jumps remain editable without allocating the endpoint union',()=>{
 const p=fixture(),from=start.map(vertex=>({...vertex,x:vertex.x-7000,y:vertex.y-7000})),to=start.map(vertex=>({...vertex,x:vertex.x+7000,y:vertex.y+7000}));
 G.apply(p,action('shape.morph',{time:0,points:from,closed:true}));G.apply(p,action('shape.morph',{time:2,points:to,closed:true}));
 assert.deepEqual(sample(p,1).geometry.points[0],start[0]);assert(sample(p,1).renderBounds.width<200);assert(sample(p,1).renderBounds.height<200);
 const q=fixture(),rectangle=(x,y)=>[{x:-x,y:-y},{x,y:-y},{x,y},{x:-x,y}].map(vertex=>({...vertex,in:[0,0],out:[0,0]})),wide=rectangle(7000,200),tall=rectangle(200,7000);
 G.apply(q,action('shape.morph',{time:0,points:wide,closed:true,easing:'hold'}));G.apply(q,action('shape.morph',{time:2,points:tall,closed:true}));assert.deepEqual(sample(q,1).geometry.points,wide);assert.deepEqual(sample(q,2).geometry.points,tall);
});

test('path morph has bounded per-channel keys, total keyed vertices, depth and finite stored data',()=>{
 const p=fixture(),channel={version:1,keys:Array.from({length:129},(_,time)=>({time,points:start,closed:true}))};p.clips[0].motion.pathMorph=channel;assert.throws(()=>G.validateGraph(p),/128/);
 const q=fixture(),points=Array.from({length:2000},(_,i)=>({x:i%100,y:Math.floor(i/100)}));q.clips[0].motion.geometry.points=points;q.clips[0].motion.pathMorph={version:1,keys:Array.from({length:33},(_,time)=>({time,points,closed:true}))};assert.throws(()=>G.validateGraph(q),/65536/);
 const r=keys(fixture());r.clips[0].motion.pathMorph.keys[1].time=0;assert.throws(()=>G.validateGraph(r),/duplicate/);r.clips[0].motion.pathMorph.keys[1].time=2;r.clips[0].motion.pathMorph.keys[1].points[0].out[0]=NaN;assert.throws(()=>G.validateGraph(r),/finite/);
 const deep=fixture();let nested=deep.clips[0].motion;for(let i=0;i<35;i++)nested=nested.unknown={};assert.throws(()=>G.validateGraph(deep),/deeply/);
});

test('deleting, replacing and removing path keys restores original vertices without changing scalar keys',()=>{
 const p=keys(fixture());G.apply(p,action('animation.keyframe',{property:'opacity',time:1,value:60}));G.apply(p,action('shape.morph',{time:2,points:start,closed:true}));assert.equal(p.clips[0].motion.pathMorph.keys.length,2);assert.deepEqual(sample(p,1).geometry.points,start);G.apply(p,action('shape.morph',{time:0,remove:true}));assert.equal(p.clips[0].motion.pathMorph.keys.length,1);G.apply(p,action('shape.morph',{remove:true}));assert.equal(p.clips[0].motion.pathMorph,undefined);assert.deepEqual(sample(p,1).geometry.points,start);assert.equal(sample(p,1).opacity,.6);
});

test('reviewed Vanessa morph validates and verifies the exact native channel',()=>{
 const p=fixture(),before=structuredClone(p),request={command:'motion.edit',target:'path',parameters:{operation:'shape.morph',dataJson:JSON.stringify({time:1,points:end,closed:true,easing:'linear'})}};Tools.validateAction(request,p);G.apply(p,action(request.parameters.operation,JSON.parse(request.parameters.dataJson)));assert.equal(Tools.verifyAction(request,before,p),true);const wrong=structuredClone(p);wrong.clips[0].motion.pathMorph.keys[0].points[0].x+=1;assert.throws(()=>Tools.verifyAction(request,before,wrong),/verify/);
});
