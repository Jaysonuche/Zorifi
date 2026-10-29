const test=require('node:test');
const assert=require('node:assert/strict');
const Learning=require('../zorifi-vanessa-creative-learning.js');
const Memory=require('../zorifi-vanessa-memory.js');
function device(){const data=new Map();return {data,getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};}
const timeline={duration:10,aspectRatio:'9:16',clips:[{id:'PRIVATE-CLIP',name:'private-name.mp4',mediaId:'PRIVATE-ASSET',type:'video',start:0,duration:5,filter:'cinematic',transition:'dissolve',effects:[{id:'glow'}]},{id:'PRIVATE-LOGO',type:'image',start:5,duration:5,src:'https://private.example/file',transition:'none'},{id:'PRIVATE-TEXT',type:'text',text:'SECRET BRAND TEXT',fontFamily:'Inter',start:0,duration:4}]};

test('creative learning reuses PersonalMemoryStore with authenticated UID isolation and no guest fallback',()=>{
  const storage=device();assert.throws(()=>new Learning.CreativeLearning({storage}),/authenticated/);assert.throws(()=>new Learning.CreativeLearning({uid:'guest',storage}),/authenticated/);assert.throws(()=>new Learning.CreativeLearning({uid:'user',storage:null}),/storage/);
  const first=new Learning.CreativeLearning({uid:'first-user',storage}),second=new Learning.CreativeLearning({uid:'second-user',storage});assert(first.store instanceof Memory.PersonalMemoryStore);
  const saved=first.rememberPreference({dimension:'transition',value:'Short dissolves',approved:true});assert.equal(first.inspect().preferences.length,1);assert.equal(second.inspect().preferences.length,0);assert.equal(second.deletePreference(saved.id),false);assert.throws(()=>second.updatePreference(saved.id,{value:'bad'}),/not found/);
  assert.equal(new Learning.CreativeLearning({uid:'first-user',storage}).inspect().preferences[0].value,'Short dissolves');
  assert.throws(()=>new Learning.CreativeLearning({uid:'first-user',storage,personalMemoryStore:second.store}),/belong/);
});
test('full Firebase UIDs remain isolated beyond one hundred characters',()=>{const storage=device(),prefix='a'.repeat(100),first=new Learning.CreativeLearning({uid:prefix+'alice',storage}),second=new Learning.CreativeLearning({uid:prefix+'bob',storage});first.rememberPreference({dimension:'pacing',value:'Slow',approved:true});assert.equal(second.inspect().preferences.length,0);assert.notEqual(first.store.key,second.store.key);});

test('preference inspection, editing, disabling and deletion preserve unrelated memories',()=>{
  const storage=device(),memoryStore=new Memory.PersonalMemoryStore({storage,userId:'user'});memoryStore.add({category:'interests',value:'Photography'});
  const engine=new Learning.CreativeLearning({uid:'user',storage,personalMemoryStore:memoryStore});assert.throws(()=>engine.rememberPreference({dimension:'colour',value:'Violet'}),/approval/);
  const preference=engine.rememberPreference({dimension:'colour',value:'Violet',approved:true});assert.equal(engine.rememberPreference({dimension:'colour',value:'Violet',approved:true}).id,preference.id);
  const updated=engine.updatePreference(preference.id,{value:'Neutral',polarity:'avoid'});assert.equal(updated.value,'Neutral');assert.equal(engine.providerContext().preferences[0].polarity,'avoid');
  engine.setMemoryEnabled(false);assert.deepEqual(engine.providerContext().preferences,[]);assert.throws(()=>engine.rememberPreference({dimension:'pacing',value:'Fast',approved:true}),/disabled/);assert.equal(new Learning.CreativeLearning({uid:'user',storage}).inspect().settings.memoryEnabled,false);
  engine.setMemoryEnabled(true);assert.equal(engine.providerContext().preferences.length,1);assert.equal(engine.deletePreference(preference.id),true);assert.equal(engine.deletePreference(preference.id),false);
  engine.rememberPreference({dimension:'music',value:'Instrumental ambient',approved:true});engine.clearPersonalMemory();assert.equal(engine.inspect().preferences.length,0);assert.equal(memoryStore.inspect().memories[0].value,'Photography');
});

test('preferences reject sensitive values, executable payloads and unknown fields',()=>{
  const engine=new Learning.CreativeLearning({uid:'user',storage:device()});
  assert.throws(()=>engine.rememberPreference({dimension:'brand',value:'My api key: example',approved:true}),/sensitive/);
  assert.throws(()=>engine.rememberPreference({dimension:'effect',value:'javascript:alert(1)',approved:true}),/sensitive/);
  assert.throws(()=>engine.rememberPreference({dimension:'script',value:'eval',approved:true}),/preference/);
  assert.throws(()=>engine.rememberPreference({dimension:'pacing',value:'fast',approved:true,projectId:'private'}),/fields/);
  assert.throws(()=>engine.rememberPreference({dimension:'export',value:{fps:120},approved:true}),/rate/);
  const saved=engine.rememberPreference({dimension:'export',value:{aspectRatio:'9:16',width:1080,height:1920,fps:30,format:'mp4'},approved:true});assert.equal(saved.value.height,1920);
});

test('remember this style requires actual editor verification and explicit approval, excludes private content',()=>{
  const engine=new Learning.CreativeLearning({uid:'user',storage:device()});assert.throws(()=>engine.captureStyle(timeline,{approved:true}),/verification/);assert.throws(()=>engine.captureStyle(timeline,{verified:true}),/approval/);assert.throws(()=>engine.captureStyle({clips:[]},{verified:true,approved:true}),/populated/);
  const saved=engine.captureStyle(timeline,{verified:true,approved:true}),encoded=JSON.stringify(saved);assert.equal(saved.dimension,'style');assert.equal(saved.value.aspectRatio,'9:16');assert.deepEqual(saved.value.transitions,['dissolve','none']);assert.deepEqual(saved.value.effects,['glow']);assert.deepEqual(saved.value.typography,['Inter']);assert(!/PRIVATE|private|SECRET|https:/.test(encoded));
});

test('contextual feedback separates controls, reported technical errors, lasting preferences and temporary instructions',()=>{
  const cheap=Learning.classifyFeedback('Vanessa, that transition looks cheap.',{targetIds:['clip-1']});assert.equal(cheap.kind,'creative-preference');assert.equal(cheap.scope,'project');assert.equal(cheap.persist,false);assert.deepEqual(cheap.targetIds,['clip-1']);
  const stop=Learning.classifyFeedback('Stop here.');assert.equal(stop.control,'stop');assert.equal(stop.persist,false);assert.equal(Learning.classifyFeedback('Pause editing').control,'pause');
  const mistake=Learning.classifyFeedback('You made a mistake at 12 seconds.');assert.equal(mistake.kind,'objective-error');assert.equal(mistake.atSeconds,12);assert.equal(mistake.verified,false);
  const sync=Learning.classifyFeedback('The audio is out of sync.');assert.equal(sync.issue,'audio-sync');assert.equal(sync.kind,'objective-error');
  const temporary=Learning.classifyFeedback('Make the first five seconds stronger. Keep everything else unchanged.');assert.equal(temporary.kind,'project-instruction');assert.equal(temporary.section,'opening');assert.equal(temporary.preserveOthers,true);assert.equal(temporary.persist,false);
  const avoid=Learning.classifyFeedback("Don't use that effect again.");assert.equal(avoid.scope,'personal');assert.equal(avoid.persist,true);assert.equal(avoid.requiresApproval,true);assert.equal(avoid.polarity,'avoid');
  const perfect=Learning.classifyFeedback('This is perfect. Remember this style.');assert.equal(perfect.kind,'accepted-style');assert.equal(perfect.scope,'personal');
  assert.equal(Learning.classifyFeedback('Always use this only for this project.').scope,'project');
});

test('outcome metrics need verified execution, default to no sharing, and never collect identifiers or free text',()=>{
  const storage=device(),engine=new Learning.CreativeLearning({uid:'user',storage});assert.equal(engine.inspect().settings.sharingConsent,false);
  assert.throws(()=>engine.recordOutcome({outcome:'succeeded'}),/verification/);assert.throws(()=>engine.recordOutcome({outcome:'failed',projectId:'PRIVATE'}),/fields/);assert.throws(()=>engine.recordOutcome({outcome:'failed',issue:'private comment'}),/issue/);
  engine.recordOutcome({outcome:'succeeded',verified:true,quality:'pass',durationSeconds:45,strategy:'fashion-v1',style:'fashion'});engine.recordOutcome({outcome:'accepted',approvalSeconds:90});engine.recordOutcome({outcome:'corrected',issue:'transition'});engine.recordOutcome({outcome:'undone'});
  assert.equal(engine.sharedBatch().length,0);const metrics=engine.inspect().metrics;assert.equal(metrics.executionSuccessRate,1);assert.equal(metrics.acceptanceRate,1);assert.equal(metrics.qualityPassRate,1);assert.equal(metrics.correctionsPerExecution,1);assert.equal(metrics.undosPerExecution,1);assert.equal(metrics.approval['30-120s'],1);
  engine.setSharingConsent(true);const event=engine.recordOutcome({outcome:'failed',issue:'gap',quality:'fail',durationSeconds:45,correctionCount:3});assert.equal(engine.sharedBatch().length,1);assert.equal(event.duration,'30-60s');assert.equal(event.turns,'2-4');assert(!('uid' in event));assert(!('projectId' in event));assert(!('message' in event));assert(!('timestamp' in event));
  assert.throws(()=>Learning.sharedEvent({...event,privateText:'SECRET'}),/fields/);engine.acknowledgeShared([event.id]);assert.equal(engine.sharedBatch().length,0);
  engine.recordOutcome({outcome:'accepted'});engine.setSharingConsent(false);assert.equal(engine.sharedBatch().length,0);assert.equal(engine.inspect().pendingSharedEvents,0);assert.equal(new Learning.CreativeLearning({uid:'user',storage}).sharedBatch().length,0);engine.clearMeasurements();assert.equal(engine.inspect().metrics.executions,0);
});

test('sharing is prospective and the bounded queue survives reload only for the consenting account',()=>{
  const storage=device(),a=new Learning.CreativeLearning({uid:'A',storage}),b=new Learning.CreativeLearning({uid:'B',storage});a.recordOutcome({outcome:'failed'});a.setSharingConsent(true);assert.equal(a.sharedBatch().length,0);
  for(let n=0;n<110;n++)a.recordOutcome({outcome:'failed',issue:'media'});assert.equal(a.inspect().pendingSharedEvents,100);assert.equal(a.inspect().recentOutcomes.length,40);assert.equal(a.sharedBatch().length,25);assert.equal(b.sharedBatch().length,0);assert.equal(new Learning.CreativeLearning({uid:'A',storage}).sharedBatch().length,25);
  storage.setItem(a.key,JSON.stringify({...JSON.parse(storage.getItem(a.key)),queue:[{privateMessage:'secret'}]}));assert.equal(new Learning.CreativeLearning({uid:'A',storage}).sharedBatch().length,0);
});

test('another tab revoking consent or disabling memory is respected before the next operation',()=>{
  const storage=device(),tabA=new Learning.CreativeLearning({uid:'user',storage}),tabB=new Learning.CreativeLearning({uid:'user',storage});tabA.setSharingConsent(true);tabA.recordOutcome({outcome:'failed'});assert.equal(tabB.sharedBatch().length,1);tabB.setSharingConsent(false);tabA.recordOutcome({outcome:'failed'});assert.equal(tabA.sharedBatch().length,0);assert.equal(tabA.inspect().settings.sharingConsent,false);
  tabA.rememberPreference({dimension:'pacing',value:'Balanced',approved:true});tabB.setMemoryEnabled(false);assert.equal(tabA.providerContext().disabled,true);assert.throws(()=>tabA.rememberPreference({dimension:'music',value:'Ambient',approved:true}),/disabled/);tabB.clearPersonalMemory();assert.equal(tabA.preferences().length,0);
});

test('aggregation suppresses small cohorts, deduplicates random events and exposes categorical metrics only',()=>{
  const engine=new Learning.CreativeLearning({uid:'user',storage:device()}),events=[];engine.setSharingConsent(true);for(let i=0;i<30;i++)events.push(engine.recordOutcome({outcome:'succeeded',verified:true,quality:'pass'}));events.push(events[0]);
  assert.equal(Learning.aggregateEvents(events,{distinctUsers:9}).suppressed,true);assert.throws(()=>Learning.aggregateEvents(events,{distinctUsers:20,minimumCohort:1}),/cohort/);const aggregate=Learning.aggregateEvents(events,{distinctUsers:10});assert.equal(aggregate.samples,30);assert.equal(aggregate.metrics.executionSuccessRate,1);assert.equal(aggregate.metrics.qualityPassRate,1);assert(!('events' in aggregate));assert(!JSON.stringify(aggregate).includes(events[0].id));
});

function evidence({acceptance=.8,success=.9,corrections=.2,undos=.1,quality=.9}={}){return {suppressed:false,distinctUsers:10,samples:100,metrics:{executions:50,reviews:50,executionSuccessRate:success,acceptanceRate:acceptance,qualityPassRate:quality,correctionsPerExecution:corrections,undosPerExecution:undos}};}
function strategyCatalog(storage=null){return new Learning.StrategyCatalog({storage,manifest:{schema:'zorifi.creative-strategies/1',active:'baseline-v1',versions:[{version:'baseline-v1',strategy:'baseline-v1'},{version:'cinematic-1.1',strategy:'cinematic-v1'}],history:[]}});}
const regression={total:328,passed:328,criticalChecksPassed:true};
test('versioned strategy changes require cohort evidence, measurable improvement, regressions and explicit review; rollback is available',()=>{
  const storage=device(),catalog=strategyCatalog(storage);assert.throws(()=>catalog.promote('cinematic-1.1',{reviewed:true}),/passing evidence/);
  assert.equal(catalog.evaluate('cinematic-1.1',{candidate:evidence({acceptance:.86}),baseline:evidence(),regression:{...regression,passed:327}}).eligible,false);
  assert.equal(catalog.evaluate('cinematic-1.1',{candidate:{...evidence(),distinctUsers:9},baseline:evidence(),regression}).eligible,false);
  assert.equal(catalog.evaluate('cinematic-1.1',{candidate:evidence(),baseline:evidence(),regression}).eligible,false);
  const evaluated=catalog.evaluate('cinematic-1.1',{candidate:evidence({acceptance:.86}),baseline:evidence(),regression});assert.equal(evaluated.eligible,true);assert.throws(()=>catalog.promote('cinematic-1.1'),/review/);assert.equal(catalog.inspect().active,'baseline-v1');assert.equal(catalog.promote('cinematic-1.1',{reviewed:true}).active,'cinematic-1.1');assert.equal(JSON.parse(storage.getItem(catalog.key)).active,'cinematic-1.1');assert.throws(()=>catalog.rollback('baseline-v1'),/review/);assert.equal(catalog.rollback('baseline-v1',{reviewed:true}).active,'baseline-v1');assert.equal(catalog.inspect().history.at(-1).kind,'rollback');
});

test('regressions and unmeasured quality cannot become a strategy improvement',()=>{
  const catalog=strategyCatalog();for(const candidate of [evidence({acceptance:.9,quality:.8}),evidence({acceptance:.9,undos:.2}),evidence({acceptance:.9,quality:null}),evidence({acceptance:2})])assert.equal(catalog.evaluate('cinematic-1.1',{candidate,baseline:evidence(),regression}).eligible,false);
});

test('failed storage writes never claim preferences or consent were persisted',()=>{
  const storage=device(),engine=new Learning.CreativeLearning({uid:'user',storage});storage.setItem=()=>{throw new Error('QuotaExceededError');};assert.throws(()=>engine.setSharingConsent(true),/Quota/);assert.equal(engine.inspect().settings.sharingConsent,false);assert.throws(()=>engine.rememberPreference({dimension:'pacing',value:'slow',approved:true}),/Quota/);assert.equal(engine.inspect().preferences.length,0);
});

test('failed strategy persistence restores the exact active strategy and history',()=>{
  const storage=device(),catalog=strategyCatalog(storage);catalog.evaluate('cinematic-1.1',{candidate:evidence({acceptance:.86}),baseline:evidence(),regression});const original=catalog.inspect();storage.setItem=()=>{throw new Error('Unavailable storage');};assert.throws(()=>catalog.promote('cinematic-1.1',{reviewed:true}),/Unavailable/);assert.deepEqual(catalog.inspect(),original);
});
