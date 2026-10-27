// Test-only Firebase REST fixture. Production always verifies actual ID tokens
// and uses Firestore rules. Keep provider assertions focused on provider calls.
const assert=require('node:assert/strict');
function firebaseTransport(provider,{uid='fixture-user'}={}){
 const documents=new Map();let clock=Date.now();
 return async(url,options={})=>{
  const address=String(url);
  if(address.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup?')){
   assert.equal(typeof JSON.parse(options.body).idToken,'string');
   return Response.json({users:[{localId:uid}]});
  }
  if(address.startsWith('https://firestore.googleapis.com/v1/')){
   const name=address.replace('https://firestore.googleapis.com/v1/','');
   assert.match(new Headers(options.headers).get('authorization')||'',/^Bearer /);
   if(!name.endsWith(':commit'))return documents.has(name)?Response.json(documents.get(name)):Response.json({error:{status:'NOT_FOUND'}},{status:404});
   const writes=JSON.parse(options.body).writes;
   for(const write of writes){const old=documents.get(write.update?.name||write.delete);if(write.currentDocument?.exists===false&&old||write.currentDocument?.updateTime&&old?.updateTime!==write.currentDocument.updateTime)return Response.json({error:{status:'FAILED_PRECONDITION'}},{status:409});}
   for(const write of writes){if(write.delete){documents.delete(write.delete);continue;}const doc=structuredClone(write.update),time=new Date(++clock).toISOString();for(const transform of write.updateTransforms||[])doc.fields[transform.fieldPath]={timestampValue:time};doc.updateTime=time;documents.set(doc.name,doc);}
   return Response.json({commitTime:new Date(clock).toISOString(),writeResults:writes.map(()=>({updateTime:new Date(clock).toISOString()}))});
  }
  return provider(url,options);
 };
}
function firebaseEnv(get){return key=>get(key)||({FIREBASE_WEB_API_KEY:'public-fixture-key',FIREBASE_PROJECT_ID:'fixture-project'})[key]||'';}
module.exports={firebaseTransport,firebaseEnv};
