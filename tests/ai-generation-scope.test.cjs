const test=require('node:test');
const assert=require('node:assert/strict');
const {GenerationManager}=require('../zorifi-ai-platform.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('account switch aborts running jobs and ignores late progress, success, and history writes',async()=>{
  const response=deferred(),cancel=deferred(),events=[];let signal,update,cancelled=0;
  const manager=new GenerationManager({scope:'alice',onUpdate:item=>events.push(item)});
  const job=manager.create({type:'image',prompt:'Alice private prompt',run:async context=>{({signal,update}=context);return response.promise;},cancel:()=>{cancelled++;return cancel.promise;}});
  const running=manager.start(job.id),token=manager.captureScope();
  manager.switchScope('bob',[]);
  assert.equal(signal.aborted,true);assert.equal(cancelled,1);assert.equal(token.current(),false);
  const count=events.length;assert.equal(update({stage:'processing',result:{url:'alice-only'}}),null);
  response.resolve({url:'alice-only'});assert.equal(await running,null);cancel.resolve();
  assert.equal(events.length,count);assert.deepEqual(manager.history,[]);assert.equal(manager.jobs.size,0);
  const bob=manager.create({type:'language',prompt:'Bob prompt',run:async()=>({text:'Bob result'})});
  await manager.start(bob.id);assert.equal(manager.history[0].scope,'bob');assert.equal(manager.history[0].prompt,'Bob prompt');
  assert.equal(JSON.stringify(manager.history).includes('Alice'),false);
});

test('cancellation is effective before a slow provider cancellation completes',async()=>{
  const response=deferred(),remoteCancel=deferred();let signal,update;
  const manager=new GenerationManager({scope:'alice'}),job=manager.create({type:'video',run:async context=>{({signal,update}=context);return response.promise;},cancel:()=>remoteCancel.promise});
  const running=manager.start(job.id),stopping=manager.cancel(job.id);
  assert.equal(signal.aborted,true);assert.equal(manager.history[0].stage,'cancelled');
  assert.equal(update({stage:'completed',result:{url:'too-late'}}),null);
  response.resolve({url:'too-late'});assert.equal(await running,null);
  remoteCancel.resolve();assert.equal(await stopping,true);assert.equal(manager.history[0].stage,'cancelled');assert.equal(manager.history[0].result,null);
});

test('a failed old-account request cannot append an error to the next account',async()=>{
  const response=deferred(),manager=new GenerationManager({scope:'alice'}),job=manager.create({type:'voice',run:()=>response.promise});
  const running=manager.start(job.id);manager.switchScope('bob',[{id:'bob-saved',type:'voice',stage:'completed',prompt:'Bob saved',result:{url:'https://example.invalid/bob.wav'}}]);
  response.reject(new Error('Alice request failed'));assert.equal(await running,null);assert.equal(manager.history.length,1);assert.equal(manager.history[0].id,'bob-saved');
});
