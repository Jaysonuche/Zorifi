const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../zorifi-motion-graph.js');
const points=width=>[{x:-width,y:-10,in:[0,0],out:[0,0]},{x:width,y:-10,in:[0,0],out:[0,0]},{x:width,y:10,in:[0,0],out:[0,0]},{x:-width,y:10,in:[0,0],out:[0,0]}];
const action=(command,parameters)=>({command,target:'path',parameters});
function fixture(){
 const p={frameWidth:320,frameHeight:180,clips:[],mediaAssets:[{id:'recording',type:'video',duration:12}],trackStates:{},creatorSettings:{}};
 G.apply(p,{command:'layer.create',parameters:{id:'path',kind:'shape',start:7,duration:4,mediaId:'recording',geometry:{type:'path',width:60,height:20,points:points(10),closed:true,roundness:0}}});
 G.apply(p,action('layer.set',{sourceStart:2}));
 G.apply(p,action('shape.group',{id:'group',geometry:{type:'path',width:60,height:20,points:points(10),closed:true,roundness:0},transform:{x:30,y:20}}));
 for(const groupId of [undefined,'group'])for(const [time,width]of [[7,10],[9,20],[11,30]])G.apply(p,action('shape.morph',{time,points:points(width),closed:true,easing:'linear',...(groupId?{groupId}:{})}));
 G.apply(p,action('animation.keyframe',{property:'opacity',time:7,value:100}));G.apply(p,action('animation.keyframe',{property:'opacity',time:11,value:50}));
 return p;
}
function channels(clip){return [clip.motion.pathMorph,clip.motion.groups[0].pathMorph];}
test('source duration retiming scales main and grouped path morph clocks around a nonzero trimmed clip start',()=>{
 for(const [rate,duration,times,mid]of [[2,2,[7,8,9],8],[.5,8,[7,11,15],11]]){
  const p=fixture(),before=G.evaluate(p,9).layers[0],original=p.clips[0],vertices=channels(original).map(channel=>channel.keys.map(key=>structuredClone(key.points))),geometry=structuredClone(original.motion.geometry),groupGeometry=structuredClone(original.motion.groups[0].geometry);
  G.apply(p,action('source.retime',{rate,mode:'source'}));const clip=p.clips[0],sample=G.evaluate(p,mid).layers[0];
  assert.equal(clip.start,7);assert.equal(clip.sourceStart,2);assert.equal(clip.duration,duration);assert.equal(clip.playbackRate,rate);
  channels(clip).forEach((channel,index)=>{assert.deepEqual(channel.keys.map(key=>key.time),times);assert.deepEqual(channel.keys.map(key=>key.points),vertices[index]);});
  assert.deepEqual(clip.keyframes.opacity.map(key=>key.time),[times[0],times[2]]);assert.deepEqual(sample.geometry.points,before.geometry.points);assert.deepEqual(sample.groups[0].geometry.points,before.groups[0].geometry.points);assert.equal(sample.sourceTime,before.sourceTime);assert.equal(sample.opacity,before.opacity);
  assert.deepEqual(clip.motion.geometry,geometry);assert.deepEqual(clip.motion.groups[0].geometry,groupGeometry);assert.equal(G.validateGraph(p).valid,true);
 }
});
test('timeline duration retiming keeps main and grouped morph channels at their existing composition times',()=>{
 const p=fixture(),before=channels(p.clips[0]).map(channel=>structuredClone(channel)),mid=G.evaluate(p,9).layers[0];
 G.apply(p,action('source.retime',{rate:2,mode:'timeline'}));const clip=p.clips[0],sample=G.evaluate(p,9).layers[0];
 assert.equal(clip.duration,4);assert.equal(clip.sourceStart,2);assert.equal(clip.playbackRate,2);assert.deepEqual(channels(clip),before);assert.deepEqual(clip.keyframes.opacity.map(key=>key.time),[7,11]);assert.deepEqual(sample.geometry.points,mid.geometry.points);assert.deepEqual(sample.groups[0].geometry.points,mid.groups[0].geometry.points);
});
