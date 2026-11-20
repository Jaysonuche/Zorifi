const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../zorifi-motion-graph.js'),Tools=require('../zorifi-vanessa-professional-tools.js');
const action=(command,parameters={},target='stroke')=>({command,parameters,target});
const fixture=()=>{const p={projectId:'trim',frameWidth:320,frameHeight:180,ratio:'16 / 9',duration:4,clips:[],mediaAssets:[],trackStates:{},creatorSettings:{}};G.apply(p,action('layer.create',{id:'stroke',kind:'shape',duration:4,geometry:{type:'rectangle',width:200,height:100,roundness:0,fillEnabled:false,strokeEnabled:true,strokeWidth:8}},null));return p;};
const endpoints=trim=>trim.parts.map(part=>({from:part[0][0],to:part.at(-1)[3]}));
test('native Trim Paths defines full, empty, wrapped and offset ranges without changing original geometry',()=>{
 const p=fixture(),g=p.clips[0].motion.geometry,before=structuredClone(g);assert(G.trimmedStroke(g).full);assert.equal(G.trimmedStroke({...g,trimStart:20,trimEnd:20}).parts.length,0);
 const quarter=G.trimmedStroke({...g,trimStart:0,trimEnd:25});assert.equal(quarter.full,false);assert.equal(quarter.parts.length,1);assert.equal(quarter.parts[0].length,1);assert(Math.abs(endpoints(quarter)[0].to.x-50)<.2);assert.equal(endpoints(quarter)[0].to.y,-50);
 const wrap=G.trimmedStroke({...g,trimStart:75,trimEnd:25});assert.equal(wrap.parts.length,2);const offset=G.trimmedStroke({...g,trimStart:0,trimEnd:25,trimOffset:-90});assert.equal(offset.parts.length,1);assert(Math.abs(endpoints(offset)[0].from.x+50)<.2);assert.equal(endpoints(offset)[0].from.y,50);assert.deepEqual(g,before);
});
test('trimmed Bezier pieces retain curve tangents rather than replacing the source with a polyline',()=>{
 const g={type:'path',width:200,height:100,closed:false,points:[{x:-100,y:0,out:[0,-100]},{x:100,y:0,in:[0,-100]}],trimStart:25,trimEnd:75};const before=structuredClone(g),trim=G.trimmedStroke(g);assert.equal(trim.parts.length,1);assert.equal(trim.parts[0].length,1);const [a,b,c,d]=trim.parts[0][0];assert(a.x<0&&d.x>0);assert(b.y<a.y&&c.y<d.y);assert(Math.abs(a.y-d.y)<1e-8);assert.deepEqual(g,before);
});
test('manual and animated trim channels use the existing scalar evaluator and nested source clock',()=>{
 const p=fixture();G.apply(p,action('shape.set',{trimStart:10,trimEnd:70,trimOffset:45}));assert.equal(G.evaluate(p,1).layers[0].geometry.trimEnd,70);
 for(const [time,value]of [[0,0],[4,100]])G.apply(p,action('animation.keyframe',{property:'shapeTrimEnd',time,value}));assert.equal(G.evaluate(p,1).layers[0].geometry.trimEnd,25);assert.equal(G.evaluate(p,3).layers[0].geometry.trimEnd,75);assert.equal(G.evaluate(p,1).layers[0].geometry.trimEnd,25);
 G.apply(p,action('composition.precompose',{id:'nested',layerIds:['stroke'],track:8},null));G.apply(p,action('layer.set',{start:5},'nested'));G.apply(p,action('source.retime',{rate:2,mode:'source'},'nested'));const child=G.evaluate(p,6).layers.find(n=>n.id==='stroke');assert.equal(child.localTime,2);assert.equal(child.geometry.trimEnd,50);assert.equal(child.geometry.trimOffset,45);assert.equal(child.geometry.fillEnabled,false);assert.deepEqual(G.evaluate(JSON.parse(JSON.stringify(p)),6).layers.find(n=>n.id==='stroke').geometry,child.geometry);
});
test('internal groups own separate trim channels without changing the layer or sibling geometry',()=>{
 const p=fixture();for(const id of ['a','b'])G.apply(p,action('shape.group',{id,geometry:{type:'ellipse',width:60,height:60,trimStart:10,trimEnd:80,trimOffset:30,strokeEnabled:true},transform:{x:id==='a'?-50:50}}));
 G.apply(p,action('animation.keyframe',{property:'group:a:trimEnd',time:0,value:0}));G.apply(p,action('animation.keyframe',{property:'group:a:trimEnd',time:2,value:100}));const n=G.evaluate(p,1).layers[0];assert.equal(n.groups[0].geometry.trimEnd,50);assert.equal(n.groups[1].geometry.trimEnd,80);assert.equal(n.geometry.trimEnd,100);assert.equal(n.groups[0].geometry.trimOffset,30);assert.equal(n.groups[0].matrix[4],-50);
});
test('malformed trim settings are rejected atomically and easing overshoot is bounded for renderer safety',()=>{
 const p=fixture(),before=structuredClone(p);for(const change of [{trimStart:-1},{trimEnd:101},{trimOffset:Infinity},{trimStart:'30'},{trimSomething:4}]){assert.throws(()=>G.apply(p,action('shape.set',change)));assert.deepEqual(p,before);}
 for(const [time,value]of [[0,-200],[1,300]])G.apply(p,action('animation.keyframe',{property:'shapeTrimEnd',time,value}));assert.equal(G.evaluate(p,0).layers[0].geometry.trimEnd,0);assert.equal(G.evaluate(p,1).layers[0].geometry.trimEnd,100);p.clips[0].motion.geometry.trimEnd=-20;assert.throws(()=>G.validateGraph(p),/trimEnd/);
});
test('Vanessa staged motion.edit validates, applies and verifies the same editable stroke geometry',()=>{
 const p=fixture(),before=structuredClone(p),input={command:'motion.edit',target:'stroke',parameters:{operation:'shape.set',dataJson:JSON.stringify({trimStart:0,trimEnd:40,trimOffset:90})}},validated=Tools.validateAction(input,p);G.apply(p,action(validated.parameters.operation,JSON.parse(validated.parameters.dataJson)));assert(Tools.verifyAction(validated,before,p));assert.equal(p.clips[0].motion.geometry.trimEnd,40);assert.equal(p.clips[0].motion.geometry.trimOffset,90);assert.equal(p.clips[0].motion.geometry.strokeEnabled,true);
});
