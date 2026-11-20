const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../zorifi-production-preflight.js');
const Review=require('../zorifi-vanessa-media-review.js');
const title=(id='title')=>({id,type:'text',name:'Delivery',start:0,duration:2,track:0,opacity:100,fontSize:44});
const fixture=()=>({projectId:'local',ratio:'16 / 9',duration:2,clips:[title()],mediaAssets:[],trackStates:{},creatorSettings:{compositionDuration:2}});
test('text-only delivery is visible; control layers do not create visible output',()=>{
 const p=fixture();assert(!Core.audit(p).issues.some(i=>i.code==='no_visuals'));
 p.clips=[{...title('null'),type:'video',generated:true,layerKind:'null'}];assert(Core.audit(p).issues.some(i=>i.code==='no_visuals'));
 p.clips[0].layerKind='camera';assert(Core.audit(p).issues.some(i=>i.code==='no_visuals'));
});
test('nested media is audited on its source clock with inherited private source registry',()=>{
 const p=fixture();p.clips=[{id:'comp',type:'video',start:0,duration:2,track:0,composition:{width:500,height:500,duration:3,trackStates:{},clips:[{id:'child',type:'video',mediaId:'source',start:1,duration:2,track:0,sourceStart:0}]}}];p.mediaAssets=[{id:'source',type:'video',duration:2,url:'blob:private'}];
 const before=structuredClone(p),r=Core.audit(p);assert.equal(r.summary.compositions,2);assert(!r.issues.some(i=>i.code==='missing_media'||i.code==='source_overrun'));assert.deepEqual(r.scopes[1],{path:['comp'],duration:3,layers:1});assert(r.issues.some(i=>i.code==='timeline_gap'&&i.scope[0]==='comp'&&i.range.from===0&&i.range.to===1));assert.deepEqual(p,before);
 p.clips[0].composition.clips[0].mediaId='missing';assert(Core.audit(p).issues.some(i=>i.code==='missing_media'&&i.clipId==='child'&&i.scope[0]==='comp'));
});
test('bounded audit catches malformed compositions, duplicate identities, cycles and deep trees',()=>{
 const p=fixture();p.clips.push({...title('comp'),type:'video',composition:{clips:[]}});assert(Core.audit(p).issues.some(i=>i.code==='invalid_composition'));
 p.clips=[{...title('comp'),type:'video',composition:{width:10,height:10,duration:2,clips:[title('comp')]}}];assert(Core.audit(p).issues.some(i=>i.code==='duplicate_layer_id'));
 p.clips[0].composition.clips=p.clips;assert(Core.audit(p).issues.some(i=>i.code==='review_limit'));
});
test('audio delivery does not flag intentional black video; muted audio is reported honestly',()=>{
 const p=fixture();p.clips=[{...title('audio'),type:'audio',mediaId:'wav',volume:100}];p.mediaAssets=[{id:'wav',type:'audio',duration:2,url:'blob:local'}];let r=Core.audit(p,{kind:'audio'});assert.equal(r.summary.errors,0);assert(!r.issues.some(i=>['no_visuals','timeline_gap','no_audio'].includes(i.code)));p.trackStates[0]={muted:true};assert(Core.audit(p,{kind:'audio'}).issues.some(i=>i.code==='no_audio'));assert(Core.audit(p).issues.some(i=>i.code==='no_visuals'));
});
test('500-layer limit explicitly reports incomplete inspection without modifying input',()=>{
 const p=fixture();p.clips=Array.from({length:501},(_,i)=>title('text'+i));const r=Core.audit(p);assert.equal(r.summary.layers,500);assert(r.issues.some(i=>i.code==='review_limit'));assert.equal(p.clips.length,501);
});
test('actual sampled pixels carry measured evidence and retain final-encode limitations',()=>{
 const data=new Uint8ClampedArray(16*4);for(let i=3;i<data.length;i+=4)data[i]=255;
 const rendered=Review.reviewRenderedFrames([{time:0,width:4,height:4,data}]),r=Core.audit(fixture(),{rendered});assert.equal(r.summary.frames,1);assert(r.issues.some(i=>i.code==='rendered_black_sample'));assert(r.unassessed.some(i=>i.id==='final-encode'));assert(r.unassessed.some(i=>i.id==='delivery-review'));assert.equal(r.providerCalls,0);assert.equal(r.readOnly,true);
});
test('decoder failures become explicit unmeasured checks rather than success evidence',()=>{
 const r=Core.audit(fixture(),{error:'Original source cannot be decoded'});assert.equal(r.summary.frames,0);assert(r.unassessed.some(i=>i.reason.includes('cannot be decoded')));assert.equal(r.status,'review-required');
});
test('only explicit bounded read-only preflight intents are intercepted',()=>{
 for(const message of ['Run production preflight','Please check my export readiness.','Open the pre-export check for this project'])assert(Core.intent(message));
 for(const message of ['Remove the black frames','Export my video','What is production preflight?','Run production preflight and delete all clips','hello'])assert(!Core.intent(message));
});
