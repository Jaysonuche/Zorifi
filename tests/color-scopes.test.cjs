const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzePixels,ZorifiColorScopesEngine:Engine}=require('../zorifi-color-scopes.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8);
test('waveform bins preserve horizontal position and count actual RGB levels',()=>{
 const data=new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]);
 const {waveform}=analyzePixels({width:2,height:2,data});
 assert.equal(waveform.grid[0][54],1);assert.equal(waveform.grid[0][18],1);assert.equal(waveform.grid[1][182],1);assert.equal(waveform.grid[1][255],1);
 assert.equal(waveform.rgb.r[0][255],1);assert.equal(waveform.rgb.r[0][0],1);
});
test('vectorscope uses the same Rec709 luma matrix, with neutral center and correct primary axes',()=>{
 const {vectorscope}=analyzePixels({width:3,height:1,data:new Uint8ClampedArray([128,128,128,255,255,0,0,255,0,0,255,255])},{sampleStep:1});
 near(vectorscope.points[0].x,0);near(vectorscope.points[0].y,0);near(vectorscope.points[1].y,127.5);near(vectorscope.points[2].x,127.5);
 near(vectorscope.points[1].x,-54.213/1.8556);
});
test('transparent pixels are skipped, partial alpha uses black backing, and bounds are enforced',()=>{
 const result=analyzePixels({width:2,height:1,data:new Uint8ClampedArray([255,255,255,0,255,255,255,128])},{sampleStep:1});
 assert.equal(result.waveform.grid[0].reduce((a,b)=>a+b),0);assert.equal(result.waveform.grid[1][128],1);assert.equal(result.vectorscope.points.length,1);
 assert.throws(()=>analyzePixels({width:0,height:0,data:[]}));assert.throws(()=>analyzePixels({width:1024,height:1024,data:[]}));
});
test('capture errors are explicit and disposal only releases owned canvases',()=>{
 let restored=0;const ctx={filter:'none',save(){},restore(){restored++;},setTransform(){},fillRect(){},drawImage(){},getImageData(){throw Object.assign(new Error('tainted'),{name:'SecurityError'});}};
 const canvas={width:2,height:2,getContext:()=>ctx},engine=new Engine(canvas);
 assert.throws(()=>engine.analyzeFrame({}),/CORS/);assert.equal(restored,1);engine.dispose();assert.equal(canvas.width,2);assert.equal(engine.computeWaveformData({}),null);
 const owned=new Engine(canvas,{ownsCanvas:true});owned.dispose();owned.dispose();assert.equal(canvas.width,0);
});
