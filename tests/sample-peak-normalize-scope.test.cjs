const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const repo=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(repo,name),'utf8');
const app=read('app.js'),nativeHistory=[app.match(/function pushHistory\(overrides=\{\}\) \{[\s\S]*?\n\}/)[0],app.match(/function snapshot\(\)\{[^\n]+/)[0],app.match(/function undo\(\)\{[^\n]+/)[0],app.match(/function redo\(\)\{[^\n]+/)[0]].join('\n');
class Node {
 constructor(tag){this.tag=tag;this.dataset={};this.children=[];this.attributes={};}
 append(...children){this.children.push(...children);}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(){}
 remove(){this.removed=true;}
 showModal(){this.open=true;}
 querySelector(selector){const key=selector.match(/^\[data-([^\]]+)\]$/)?.[1]?.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.children.find(child=>key&&Object.hasOwn(child.dataset,key))||this.children.map(child=>child.querySelector?.(selector)).find(Boolean)||null;}
}
function harness({hold=false,large=false}={}){
 const timers=new Map(),metrics={captures:0,stackSerializations:0,renderChecks:0,renders:0,saves:0};let nextTimer=0,release,started;
 const start=new Promise(r=>started=r),gate=new Promise(r=>release=r),context={console,Blob,DOMException,AbortController,setTimeout,clearTimeout,structuredClone,document:{createElement:tag=>new Node(tag),body:new Node('body'),addEventListener(){}},addEventListener(){},setInterval:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id)};
 context.ZorifiOfflineMix={render:async(project,options)=>{metrics.renders++;for(let i=0;i<1000;i++){options.check();metrics.renderChecks++;}if(hold&&metrics.renders===1){started();await gate;}options.check();const peak=project.clips[0].volume/200;return {report:{pcm:{channels:[{samplePeak:peak,rmsDbfs:-18},{samplePeak:peak/2,rmsDbfs:-24}]}}};}};
 vm.createContext(context);vm.runInContext(read('zorifi-project-model.js'),context);vm.runInContext(read('zorifi-motion-graph.js'),context);
 context.metrics=metrics;vm.runInContext(`
 var ProjectModel=ZorifiProjectModel,baseCapture=ProjectModel.captureHistory;
 ProjectModel={...ProjectModel,captureHistory(...args){metrics.captures++;return baseCapture(...args);}};
 var currentUser={id:'local-editor',cloudUid:'local-cloud'},firebaseGateway={session:{uid:'local-cloud'}},autosaveTimer=null;
 var state={view:'editor',projectId:'local-project',duration:4,currentProject:'Scope proof',selected:'audio',frameWidth:320,frameHeight:180,creatorSettings:{compositionDuration:4},proSettings:{audioMaster:100},trackStates:{},undo:[],redo:[],mediaAssets:[{id:'source',type:'audio',duration:4,size:16,file:new Blob([new Uint8Array(16)],{type:'audio/wav'}),url:'blob:local-source'}],clips:[{id:'audio',name:'Selected recording',type:'audio',mediaId:'source',track:1,start:0,duration:2,volume:100}]};
 var snapshotCalls=0;
 function render(){} function recalculateDuration(){} function scheduleProjectSave(){}
 function saveProject(){metrics.saves++;return true;}
 var ZorifiProductionBridge={savedMatches:()=>true};
 ${nativeHistory}
 `,context);
 if(large)vm.runInContext(`const points=Array.from({length:2000},(_,i)=>({x:Math.round(Math.cos(i*Math.PI/1000)*5000)/100,y:Math.round(Math.sin(i*Math.PI/1000)*5000)/100,in:[0,0],out:[0,0]}));state.clips.push({id:'path',type:'video',layerKind:'shape',name:'Large editable path',track:0,start:0,duration:4,motion:{version:1,geometry:{type:'path',points,closed:true,fill:'#ffffff',stroke:'#000000',strokeWidth:1},pathMorph:{version:1,keys:Array.from({length:32},(_,i)=>({time:i/10,points,closed:true,easing:'linear'}))}}});`,context);
 vm.runInContext(`const saved=JSON.stringify(baseCapture(state));state.undo=Array(30).fill(saved);Object.defineProperty(state.undo,'toJSON',{value(){metrics.stackSerializations++;return this.slice();}});`,context);
 vm.runInContext(read('zorifi-sample-peak-normalize.js'),context);
 return {context,api:context.ZorifiSamplePeakNormalize,metrics,run:code=>vm.runInContext(code,context),tick:()=>[...timers.values()].forEach(fn=>fn()),start,release,dispose(){context.ZorifiSamplePeakNormalize.close();}};
}
test('idle dialog monitoring performs zero deep history or Undo serialization on a valid 64000-vertex project',()=>{
 const h=harness({large:true});try{assert.equal(h.run('ZorifiMotionGraph.validateGraph(state).morphVertices'),64000);h.api.open();const afterOpen=h.metrics.captures;assert.equal(afterOpen,1);for(let i=0;i<100;i++)h.tick();assert.equal(h.metrics.captures,afterOpen);assert.equal(h.metrics.stackSerializations,0);assert.equal(h.api.inspect().open,true);h.run("state.selected='path'");h.tick();assert.equal(h.api.inspect().open,false);assert.equal(h.metrics.captures,afterOpen);}finally{h.dispose();}
});
test('thousands of renderer progress checks reuse unchanged native stacks without deep snapshot work',async()=>{
 const h=harness();try{const result=await h.api.execute({target:'audio',targetDbfs:-12});assert.equal(result.verified,true);assert.equal(result.persisted,true);assert.equal(h.metrics.renderChecks,2000);assert(h.metrics.captures<12,JSON.stringify(h.metrics));assert.equal(h.metrics.stackSerializations,0);assert.equal(h.metrics.saves,1);assert.equal(h.run('state.undo.length'),30);assert.equal(h.run("typeof state.undo[0]"),'string');assert.equal(h.run('state.clips[0].volume'),100*Math.pow(10,-12/20)/.5);}finally{h.dispose();}
});
test('manual submission still verifies current project structure after idle edits without polling deep state',async()=>{
 const h=harness();try{const pane=h.api.open(),afterOpen=h.metrics.captures;h.run('state.clips[0].volume=73');for(let i=0;i<10;i++)h.tick();assert.equal(h.metrics.captures,afterOpen);assert.equal(h.api.inspect().open,true);await pane.querySelector('[data-sample-peak-form]').onsubmit({preventDefault(){}});assert.equal(h.api.inspect().open,false);assert.equal(h.metrics.captures,afterOpen+1);assert.equal(h.run('state.clips[0].volume'),73);assert.equal(h.metrics.renders,0);assert.equal(h.metrics.saves,0);}finally{h.dispose();}
});
test('native Undo, Redo, snapshot, stack replacement/order/length and checkpoint-string changes invalidate pending work',async()=>{
 const changes=["undo()","state.redo.push(JSON.stringify({...ProjectModel.captureHistory(state),currentProject:'Redo target'}));redo()","snapshot()","state.undo=state.undo.slice()","state.redo=state.redo.slice()","state.undo.push(state.undo[0])","state.undo.pop()","state.undo[0]=state.undo[0]+' '","state.undo.reverse()"];
 for(const change of changes){const h=harness({hold:true});try{if(change==='state.undo.reverse()')h.run("state.undo[0]=JSON.stringify({...ProjectModel.captureHistory(state),currentProject:'Earlier proof'})");const pending=h.api.execute({target:'audio',targetDbfs:-12});await h.start;h.run(change);const expected=h.run('JSON.stringify({clips:state.clips,undo:state.undo,redo:state.redo})');h.release();await assert.rejects(pending,{name:'AbortError'},change);assert.equal(h.run('JSON.stringify({clips:state.clips,undo:state.undo,redo:state.redo})'),expected,change);assert.equal(h.metrics.renders,1,change);assert.equal(h.metrics.saves,0,change);}finally{h.dispose();}}
});
test('current clip, keyframe and mixer mutations are rechecked after rendering even when live identities remain unchanged',async()=>{
 for(const change of ["state.clips[0].volume=73","state.clips[0].keyframes={volume:[{time:0,value:77}]}","state.proSettings.audioMaster=80"]){const h=harness({hold:true});try{const pending=h.api.execute({target:'audio',targetDbfs:-12});await h.start;h.run(change);const expected=h.run('JSON.stringify(state.clips)');h.release();await assert.rejects(pending,{name:'AbortError'},change);assert.equal(h.run('JSON.stringify(state.clips)'),expected);assert.equal(h.metrics.saves,0);}finally{h.dispose();}}
});
test('cheap live guards retain account, session, source, selection and project protection',async()=>{
 for(const change of ["currentUser={id:'another',cloudUid:'another'}","firebaseGateway.session={...firebaseGateway.session}","state.mediaAssets[0].url+='changed'","state.selected=null","state={...state}"]){const h=harness({hold:true});try{const pending=h.api.execute({target:'audio',targetDbfs:-12});await h.start;h.run(change);h.release();await assert.rejects(pending,{name:'AbortError'},change);assert.equal(h.metrics.saves,0);}finally{h.dispose();}}
});
test('mutable non-native checkpoint entries refuse before rendering rather than weakening the supported history guard',async()=>{
 const h=harness();try{h.run('state.undo[0]={clips:[]}');await assert.rejects(h.api.execute({target:'audio',targetDbfs:-12}),/native saved-history strings/);assert.equal(h.metrics.renders,0);assert.equal(h.metrics.saves,0);}finally{h.dispose();}
});
