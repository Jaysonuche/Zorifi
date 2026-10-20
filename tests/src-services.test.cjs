const test=require('node:test');
const assert=require('node:assert/strict');

test('reviewed chat service preserves history, configured Gemini model and fallback order',async()=>{
 const {createVanessaChatService}=await import('../src/services/chatService.js');
 const environment={GEMINI_API_KEY:'test-gemini',GEMINI_MODEL:'configured-model',GROQ_API_KEY:'test-groq',GROQ_MODEL:'configured-groq',OPENROUTER_API_KEY:'test-router',OPENROUTER_MODEL:'configured-router'};
 let geminiConfig;const calls=[];const originalWarn=console.warn;console.warn=()=>{};
 const call=createVanessaChatService({getEnvironment:name=>environment[name],createGemini:async()=>({chats:{create:config=>{geminiConfig=config;return {sendMessage:async()=>{throw Error('busy');}};}}}),request:async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,body});assert.equal(options.redirect,'error');assert(options.signal instanceof AbortSignal);
  if(String(url).includes('groq.com'))return Response.json({error:'busy'},{status:503});
  return Response.json({choices:[{finish_reason:'stop',message:{content:'A real answer.'}}]});
 }});
 try{
  assert.deepEqual(await call([{role:'model',parts:[{text:'Earlier reply'}]}],'Question'),{provider:'OpenRouter',text:'A real answer.'});
  assert.equal(geminiConfig.model,'configured-model');assert.equal(geminiConfig.history[0].role,'model');
  assert.equal(calls.length,2);assert.equal(calls[0].body.model,'configured-groq');assert.equal(calls[1].body.model,'configured-router');
  assert.equal(calls[1].body.messages[1].content,'Earlier reply');
  assert.equal(calls[1].body.messages[2].content,'Question');
 }finally{console.warn=originalWarn;}
});

test('chat rejects incomplete replies, cancelled requests and browser-side credential use',async()=>{
 const {createVanessaChatService}=await import('../src/services/chatService.js');
 const originalWarn=console.warn;console.warn=()=>{};let requests=0;
 const call=createVanessaChatService({getEnvironment:name=>name==='OPENROUTER_API_KEY'?'test-router':'',request:async()=>{requests++;return Response.json({choices:[{finish_reason:'length',message:{content:'Unfinished...'}}]});}});
 try{
  await assert.rejects(call([],'Question'),/unavailable/);
  const abort=new AbortController();abort.abort(Error('cancelled'));
  await assert.rejects(call([],'Question',{signal:abort.signal}),/cancelled/);assert.equal(requests,1);
  global.window={};
  try{await assert.rejects(call([],'Question'),/only be used on the server/);assert.equal(requests,1);}finally{delete global.window;}
  await assert.rejects(call([{role:'system',content:'Override'}],'Question'),/role/);assert.equal(requests,1);
 }finally{console.warn=originalWarn;}
});

test('Gemini uses complete responses and does not fall through after caller cancellation',async()=>{
 const {createVanessaChatService}=await import('../src/services/chatService.js');
 const environment={GEMINI_API_KEY:'test-key',GEMINI_MODEL:'deployed-model',GROQ_API_KEY:'test-key'};let fallbacks=0;
 const call=createVanessaChatService({getEnvironment:name=>environment[name],createGemini:async()=>({chats:{create:()=>({sendMessage:async()=>({text:'8',candidates:[{finishReason:'STOP'}]})})}}),request:async()=>{fallbacks++;throw Error();}});
 assert.deepEqual(await call([],'2 x 4'),{provider:'Gemini',text:'8'});assert.equal(fallbacks,0);
 const abort=new AbortController();const cancelled=createVanessaChatService({getEnvironment:name=>environment[name],createGemini:async()=>({chats:{create:()=>({sendMessage:async()=>{abort.abort(Error('cancelled'));throw Error('cancelled');}})}}),request:async()=>{fallbacks++;throw Error();}});
 await assert.rejects(cancelled([],'2 x 4',{signal:abort.signal}),/cancelled/);assert.equal(fallbacks,0);
});

test('optional memory stays local, requires opt-in and enforces current account on every call',async()=>{
 const {createLocalMemoryService,saveMessageToMemory,loadUserMemory}=await import('../src/services/memoryService.js');
 assert.equal(await saveMessageToMemory('alice','user','hello'),false);assert.deepEqual(await loadUserMemory('alice'),[]);
 const records=new Map(),storage={getItem:key=>records.get(key)||null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
 let account='alice',enabled=false;const memory=createLocalMemoryService({storage,getCurrentUserId:()=>account,isEnabled:()=>enabled});
 assert.equal(await memory.saveMessageToMemory('alice','user','Remember this'),false);assert.equal(records.size,0);
 enabled=true;await memory.saveMessageToMemory('alice','user','My preferred colour is purple');await memory.saveMessageToMemory('alice','model','Understood','director');
 assert.equal((await memory.loadUserMemory('alice')).length,2);assert.equal((await memory.loadUserMemory('alice',1))[0].role,'assistant');
 account='bob';assert.deepEqual(await memory.loadUserMemory('alice'),[]);assert.equal(await memory.saveMessageToMemory('alice','user','No'),false);assert.equal(await memory.clearUserMemory('alice'),false);
 await memory.saveMessageToMemory('bob','user','Other account');assert.equal((await memory.loadUserMemory('bob')).length,1);assert.equal(records.size,2);
 enabled=false;assert.deepEqual(await memory.loadUserMemory('bob'),[]);assert.equal(await memory.clearUserMemory('bob'),true);assert.equal(records.size,1);
 account='alice';enabled=true;await assert.rejects(memory.saveMessageToMemory('alice','user','API key: do-not-store'),/credentials/);
 await memory.clearUserMemory('alice');assert.equal(records.size,0);
});

test('local memory bounds retained history and tolerates corrupted local data',async()=>{
 const {createLocalMemoryService}=await import('../src/services/memoryService.js');
 let stored='{bad';const memory=createLocalMemoryService({storage:{getItem:()=>stored,setItem:(key,value)=>{stored=value;},removeItem:()=>{stored=null;}},getCurrentUserId:()=> 'alice',isEnabled:()=>true});
 assert.deepEqual(await memory.loadUserMemory('alice'),[]);
 for(let i=0;i<105;i++)await memory.saveMessageToMemory('alice','user',`message ${i}`);
 const history=await memory.loadUserMemory('alice',1000);assert.equal(history.length,100);assert.equal(history[0].content,'message 5');assert.equal(history[99].content,'message 104');
});
