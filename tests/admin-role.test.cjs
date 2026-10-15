const test=require('node:test');
const assert=require('node:assert/strict');
test('administrator permissions require a verified allowlisted UID',async()=>{
 const {accountRole,requireAdmin}=await import('../netlify/functions/_shared/provider.mjs');
 const originalFetch=global.fetch,key=process.env.FIREBASE_WEB_API_KEY,admins=process.env.ZORIFI_ADMIN_UIDS;
 process.env.FIREBASE_WEB_API_KEY='test-key';process.env.ZORIFI_ADMIN_UIDS='owner-uid';
 let account={localId:'owner-uid',email:'owner@example.test'};
 global.fetch=async()=>({ok:true,json:async()=>({users:[account]})});
 const request=()=>new Request('https://zorifi.vercel.app/api/test',{headers:{authorization:'Bearer test-token'}});
 try{
  assert.equal((await requireAdmin(request())).role,'admin');
  account={localId:'another-uid',email:'owner@example.test',admin:true};
  assert.equal((await accountRole(request())).role,'member');
  await assert.rejects(requireAdmin(request()),e=>e.status===403);
  account={localId:'owner-uid',disabled:true};
  await assert.rejects(accountRole(request()),e=>e.status===401);
  await assert.rejects(accountRole(new Request('https://zorifi.vercel.app/api/test')),e=>e.status===401);
  global.fetch=async()=>({ok:false,status:400});
  await assert.rejects(accountRole(request()),e=>e.status===401);
  global.fetch=async()=>({ok:false,status:403});
  await assert.rejects(accountRole(request()),e=>e.status===503&&e.code==='AUTH_UNAVAILABLE');
 }finally{
  global.fetch=originalFetch;
  if(key===undefined)delete process.env.FIREBASE_WEB_API_KEY;else process.env.FIREBASE_WEB_API_KEY=key;
  if(admins===undefined)delete process.env.ZORIFI_ADMIN_UIDS;else process.env.ZORIFI_ADMIN_UIDS=admins;
 }
});
