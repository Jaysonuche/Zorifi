const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createServer}=require('../scripts/dev-server.cjs');
test('CRM authentication, durable records, safe import and optimistic concurrency',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zorifi-crm-')),key='test-admin-'.repeat(5);let server;
 async function start(){server=createServer({crmDirectory:dir,crmKey:()=>key});await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;}
 let base=await start();const call=async(input,auth=key)=>{const r=await fetch(base+'/api/crm',{method:input?'POST':'GET',headers:{authorization:`Bearer ${auth}`,'content-type':'application/json'},...(input?{body:JSON.stringify(input)}:{})});return {status:r.status,data:await r.json()};};
 try{
 assert.equal((await call(null,'bad')).status,401);assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/.zorifi-private/customers.json')).status,404);
 assert.equal((await fetch(base+'/api/crm',{headers:{origin:'https://example.com',authorization:`Bearer ${key}`}})).status,403);
 let result=await call({action:'create',revision:0,name:'Customer',email:'customer@example.com'});assert.equal(result.status,200);let db=result.data,id=db.customers[0].id;
 assert.equal((await call({action:'note',revision:0,customerId:id,text:'Stale'})).status,409);
 assert.equal((await call({action:'profile',revision:db.revision,customerId:id,plan:'PRO',followup:'2026-02-30'})).status,400);
 assert.equal((await call()).data.customers[0].plan,'UNKNOWN');
 const concurrent=await Promise.all(['First','Second'].map(text=>call({action:'note',revision:db.revision,customerId:id,text})));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);db=(await call()).data;
 result=await call({action:'import',revision:db.revision,customers:[{name:'Imported',email:'import@example.com',password:'NEVER_SAVE_THIS',token:'SECRET_TOKEN',cases:[{id:'case1',title:'Help',status:'OPEN'}]}]});assert.equal(result.status,200);db=result.data;
 db=(await call({action:'import',revision:db.revision,customers:[{name:'Imported',email:'import@example.com',cases:[{id:'case1',title:'Duplicate'}]}]})).data;assert.equal(db.customers[1].cases.length,1);
 db=(await call({action:'deletion',revision:db.revision,customerId:id,text:'Requested by customer'})).data;
 db=(await call({action:'deletionStatus',revision:db.revision,customerId:id,itemId:db.customers[0].deletions[0].id,status:'COMPLETED'})).data;assert.equal(db.customers.length,2);
 const saved=await fs.readFile(path.join(dir,'customers.json'),'utf8');assert(!saved.includes('NEVER_SAVE_THIS'));assert(!saved.includes('SECRET_TOKEN'));
 await new Promise(r=>server.close(r));base=await start();assert.deepEqual((await call()).data,db);
 }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
