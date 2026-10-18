const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const AutoCut=require('../zorifi-autocut.js');

function sandboxModule(file,extra={}){
  const canvases=[],drawn=[],sandbox={module:{exports:{}},setTimeout,clearTimeout,TextEncoder,...extra};
  sandbox.document={createElement(type){assert.equal(type,'canvas');const canvas={width:0,height:0,getContext(){return {drawImage(image){drawn.push(image);},getImageData(){return {data:new Uint8ClampedArray(48*27*4).fill(128)};}};},toDataURL(){return 'data:image/jpeg;base64,/9j/AAAA';}};canvases.push(canvas);return canvas;}};
  vm.runInNewContext(fs.readFileSync(require.resolve(file),'utf8'),sandbox);
  return {api:sandbox.module.exports,canvases,drawn,sandbox};
}

test('multi-hour source analysis retains its actual duration and bounded ending samples',async()=>{
  let positions;
  const result=await AutoCut.analyzeMediaAssets([{id:'long',type:'video',name:'Two hours.mp4',duration:7200}],{sampleVideoFrames:async(asset,times)=>{positions=times;return {duration:7200,width:3840,height:2160,frames:[]};}});
  assert.equal(result[0].duration,7200);
  assert.equal(positions.length,36);
  assert(positions.at(-1)>7199);
  const candidates=AutoCut.candidatesFor({...result[0],cuts:[],frameSamples:[]},AutoCut.pacing('balanced'));
  assert.equal(candidates.length,150);
  assert.equal(candidates[0].sourceStart,0);
  assert(Math.abs(candidates.at(-1).sourceStart+candidates.at(-1).duration-7200)<.002);
});

test('day-long candidate selection creates only the bounded windows while keeping scene boundaries',()=>{
  let scans=0;
  const frameSamples={filter(){scans++;return [];}},candidates=AutoCut.candidatesFor({mediaId:'day',name:'A day',type:'video',duration:86400,cuts:[21600,43200,64800],frameSamples},AutoCut.pacing('energetic'));
  assert.equal(candidates.length,150);
  assert.equal(scans,150);
  assert(Math.abs(candidates.at(-1).sourceStart+candidates.at(-1).duration-86400)<.002);
  assert(candidates.every(item=>item.duration>0&&item.sourceStart+item.duration<=86400.001));
});

test('bounded long-video candidates retain the moments that were actually analyzed',()=>{
  const frameSamples=AutoCut.sampleTimes(21600,36).map(time=>({time,score:.8,difference:.1})),candidates=AutoCut.candidatesFor({mediaId:'six-hours',name:'Six hours',type:'video',duration:21600,cuts:[],frameSamples},AutoCut.pacing('balanced'));
  assert.equal(candidates.length,150);
  assert(frameSamples.every(frame=>candidates.some(candidate=>frame.time>=candidate.sourceStart-.15&&frame.time<=candidate.sourceStart+candidate.duration+.15)));
  assert(candidates.filter(candidate=>candidate.confidence==='measured').length>=36);
});

test('Gemini collection decodes large sources serially through resized previews without reading source bytes',async()=>{
  let active=0,peak=0,disposed=0,reads=0;const seeks=[],options=[];
  const helper={
    async openVideo(asset){active++;peak=Math.max(peak,active);await Promise.resolve();return {media:{id:asset.id},width:7680,height:4320,duration:7200,dispose(){active--;disposed++;}};},
    async loadImage(asset,settings){options.push(settings);active++;peak=Math.max(peak,active);return {image:{id:asset.id,width:384,height:256},width:24000,height:16000,dispose(){active--;disposed++;}};},
    async seek(media,time){seeks.push(time);}
  };
  const {api,canvases}=sandboxModule('../zorifi-autocut-director.js',{ZorifiAutoCutMedia:helper});
  const updates=[],result=await api.collect([{id:'long',type:'video',name:'Large recording',file:{size:2*1024**3,arrayBuffer(){reads++;throw Error('Must not read the entire movie');}}},{id:'photo',type:'image',name:'Huge panorama'}],{onProgress:update=>updates.push(update)});
  assert.equal(peak,1);assert.equal(active,0);assert.equal(disposed,2);assert.equal(reads,0);
  assert.equal(result.media[0].frames.length,8);assert.equal(result.media[0].duration,7200);assert(seeks.at(-1)>7199);
  assert.equal(result.media[1].width,24000);assert.equal(result.media[1].height,16000);assert.equal(options[0].maxDimension,384);assert.equal(options[0].maxPixels,384*384);
  assert(result.warnings.some(value=>value.includes('audio sampling skipped')));
  assert(canvases.every(canvas=>canvas.width===1&&canvas.height===1));
  assert(updates.every(update=>Number.isFinite((update.assetIndex-1+update.frame/Math.max(1,update.frames))/update.assetCount)),'Opening progress must remain compatible with the studio progress meter');
});

test('local photo and long-video analysis dispose bounded decoders before opening the next source',async()=>{
  let active=0,peak=0,disposed=0;const seeks=[],imageOptions=[];
  const helper={
    async openVideo(){active++;peak=Math.max(peak,active);return {media:{videoWidth:7680,videoHeight:4320},duration:10800,width:7680,height:4320,dispose(){active--;disposed++;}};},
    async loadImage(asset,options){active++;peak=Math.max(peak,active);imageOptions.push(options);return {image:{},width:18000,height:12000,dispose(){active--;disposed++;}};},
    async seek(video,time){seeks.push(time);}
  };
  const {api,canvases}=sandboxModule('../zorifi-autocut.js',{ZorifiAutoCutMedia:helper});
  const analyses=await api.analyzeMediaAssets([{id:'a',name:'Three hours',type:'video',duration:10},{id:'b',name:'Large still',type:'image',duration:5}]);
  assert.equal(peak,1);assert.equal(disposed,2);assert.equal(active,0);
  assert.equal(analyses[0].duration,10800);assert.equal(analyses[0].frameSamples.length,36);assert(seeks.at(-1)>10799);
  assert.equal(analyses[1].width,18000);assert.equal(imageOptions[0].maxDimension,512);assert.equal(imageOptions[0].maxPixels,512*512);
  assert(canvases.every(canvas=>canvas.width===1&&canvas.height===1));
});

test('Gemini shot validation uses decoded duration instead of stale imported metadata',async()=>{
  const helper={async openVideo(){return {media:{},width:1920,height:1080,duration:7200,dispose(){}};},async seek(){}};
  const {api}=sandboxModule('../zorifi-autocut-director.js',{ZorifiAutoCutMedia:helper});
  const result=await api.createPlan([{id:'long',name:'Recording',type:'video',duration:900}],{includeAudio:false,targetDuration:2,requestPlan:async input=>{
    assert.equal(input.media[0].duration,7200);
    return {plan:{shots:[{mediaId:'long',sourceStart:7195,duration:2,speed:1,reason:'Use a sampled ending.',layout:'single',secondaryMediaIds:[],motion:'none',grade:'natural',caption:'',transition:'cut',fit:'contain'}]}};
  }});
  assert.equal(result.clips[0].sourceStart,7195);
});

test('cancelling a large-image decode releases its proxy and sends no Gemini request',async()=>{
  const controller=new AbortController();let disposed=0,requests=0;
  const helper={async loadImage(){controller.abort();return {image:{},width:24000,height:16000,dispose(){disposed++;}};}};
  const {api}=sandboxModule('../zorifi-autocut-director.js',{ZorifiAutoCutMedia:helper});
  await assert.rejects(api.createPlan([{id:'photo',type:'image'}],{signal:controller.signal,requestPlan:()=>{requests++;}}),{name:'AbortError'});
  assert.equal(disposed,1);assert.equal(requests,0);
});
