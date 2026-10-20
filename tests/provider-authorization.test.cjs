const test=require('node:test');
const assert=require('node:assert/strict');

const hosted=(headers={})=>new Request('https://zorifi.vercel.app/api/vanessa-chat',{method:'POST',headers:{authorization:'Bearer verified-token',...headers},body:'{}'});

test('hosted chat verifies Firebase once per request without a billing lookup',async()=>{
 const {authorize,accountRole,handler}=await import('../netlify/functions/_shared/provider.mjs');
 const originalFetch=global.fetch,previous={FIREBASE_WEB_API_KEY:process.env.FIREBASE_WEB_API_KEY,FIREBASE_PROJECT_ID:process.env.FIREBASE_PROJECT_ID,ZORIFI_ADMIN_UIDS:process.env.ZORIFI_ADMIN_UIDS};
 process.env.FIREBASE_WEB_API_KEY='public-test-key';process.env.FIREBASE_PROJECT_ID='test-project';process.env.ZORIFI_ADMIN_UIDS='owner';
 let lookups=0;
 global.fetch=async(url)=>{assert(String(url).startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='));lookups++;await Promise.resolve();return Response.json({users:[{localId:'owner'}]});};
 try{
  const request=hosted();
  const values=await Promise.all([authorize(request),accountRole(request),accountRole(request)]);
  assert.deepEqual(values.slice(1),[{uid:'owner',role:'admin'},{uid:'owner',role:'admin'}]);
  assert.equal(lookups,1,'concurrent checks share one live identity lookup');
  const run=handler(async(input,request)=>accountRole(request));
  assert.equal((await run(hosted())).status,200);
  assert.equal(lookups,2,'new requests never reuse a prior verified session');
 }finally{global.fetch=originalFetch;for(const [key,value]of Object.entries(previous))value===undefined?delete process.env[key]:process.env[key]=value;}
});

test('revoked, disabled, malformed and unavailable identity checks fail closed',async()=>{
 const {authorize,accountRole}=await import('../netlify/functions/_shared/provider.mjs');
 const originalFetch=global.fetch,key=process.env.FIREBASE_WEB_API_KEY;process.env.FIREBASE_WEB_API_KEY='public-test-key';
 try{
  global.fetch=async()=>Response.json({users:[{localId:'member'}]});
  await authorize(hosted());
  global.fetch=async()=>Response.json({users:[{localId:'member',disabled:true}]});
  await assert.rejects(authorize(hosted()),error=>error.status===401&&error.code==='AUTH_REQUIRED');
  for(const status of [400,401]){
   global.fetch=async()=>new Response('{}',{status});
   await assert.rejects(authorize(hosted()),error=>error.status===401);
  }
  for(const data of [{users:[]},{users:[{localId:42}]},null]){
   global.fetch=async()=>Response.json(data);
   await assert.rejects(authorize(hosted()),error=>error.status===401);
  }
  for(const fake of [async()=>{throw Error('network');},async()=>new Response('{bad'),async()=>new Response('{}',{status:503})]){
   global.fetch=fake;
   await assert.rejects(accountRole(hosted()),error=>error.status===503&&error.code==='AUTH_UNAVAILABLE');
  }
  let called=false;global.fetch=async()=>{called=true;throw Error();};
  await assert.rejects(authorize(new Request('https://zorifi.vercel.app/api/test')),error=>error.status===401);
  assert.equal(called,false,'unsigned requests are rejected before any upstream call');
 }finally{global.fetch=originalFetch;if(key===undefined)delete process.env.FIREBASE_WEB_API_KEY;else process.env.FIREBASE_WEB_API_KEY=key;}
});

test('paid checks read only the verified UID and never trust another user or a denied billing record',async()=>{
 const {authorize,subscription}=await import('../netlify/functions/_shared/provider.mjs');
 const originalFetch=global.fetch,key=process.env.FIREBASE_WEB_API_KEY,project=process.env.FIREBASE_PROJECT_ID;
 process.env.FIREBASE_WEB_API_KEY='public-test-key';process.env.FIREBASE_PROJECT_ID='test-project';
 let identityCalls=0,billingCalls=0,billing=()=>Response.json({fields:{uid:{stringValue:'verified-member'},verified:{booleanValue:true},plan:{stringValue:'PRO'},status:{stringValue:'ACTIVE'}}});
 global.fetch=async(url)=>{
  if(String(url).includes('identitytoolkit')){identityCalls++;return Response.json({users:[{localId:'verified-member'}]});}
  billingCalls++;assert(String(url).endsWith('/users/verified-member/private/subscription'));
  return billing();
 };
 try{
  const request=hosted({'x-user-id':'foreign-admin','x-plan':'PRO'});await authorize(request);
  assert.deepEqual(await subscription(request),{uid:'verified-member',pro:true});assert.equal(identityCalls,1);assert.equal(billingCalls,1);
  billing=()=>Response.json({fields:{uid:{stringValue:'foreign-admin'},verified:{booleanValue:true},plan:{stringValue:'PRO'},status:{stringValue:'ACTIVE'}}});
  assert.equal((await subscription(request)).pro,false);
  for(const result of [()=>new Response('{}',{status:403}),()=>new Response('{}',{status:404}),()=>new Response('{bad'),()=>{throw Error('billing unavailable');}]){
   billing=result;assert.deepEqual(await subscription(request),{uid:'verified-member',pro:false});
  }
  billing=()=>Response.json({fields:{uid:{stringValue:'verified-member'},verified:{booleanValue:false},plan:{stringValue:'PRO'},status:{stringValue:'ACTIVE'}}});
  assert.equal((await subscription(request)).pro,false);
 }finally{global.fetch=originalFetch;if(key===undefined)delete process.env.FIREBASE_WEB_API_KEY;else process.env.FIREBASE_WEB_API_KEY=key;if(project===undefined)delete process.env.FIREBASE_PROJECT_ID;else process.env.FIREBASE_PROJECT_ID=project;}
});

test('changing a Request bearer token triggers a new identity check; local service rejects foreign origins',async()=>{
 const {authorize,accountRole}=await import('../netlify/functions/_shared/provider.mjs');
 const originalFetch=global.fetch,key=process.env.FIREBASE_WEB_API_KEY;process.env.FIREBASE_WEB_API_KEY='public-test-key';let calls=0;
 global.fetch=async()=>{calls++;return Response.json({users:[{localId:'member'}]});};
 try{
  const request=hosted();await authorize(request);request.headers.set('authorization','Bearer changed-token');await accountRole(request);assert.equal(calls,2);
  await authorize(new Request('http://127.0.0.1:4173/api/test',{headers:{origin:'http://127.0.0.1:4173'}}));assert.equal(calls,2);
  await assert.rejects(authorize(new Request('http://127.0.0.1:4173/api/test',{headers:{origin:'https://foreign.example'}})),error=>error.status===403);
 }finally{global.fetch=originalFetch;if(key===undefined)delete process.env.FIREBASE_WEB_API_KEY;else process.env.FIREBASE_WEB_API_KEY=key;}
});
