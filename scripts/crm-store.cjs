const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const CASES=['NEW','OPEN','WAITING','RESOLVED','CLOSED'];
const DELETIONS=['REQUESTED','VERIFYING','IN_PROGRESS','COMPLETED','DECLINED'];
const clean=(value,max=2000)=>String(value??'').trim().slice(0,max);
function problem(message,status=400){return Object.assign(new Error(message),{status});}
function enumValue(value,values){if(!values.includes(value))throw problem('Invalid status.');return value;}
function date(value){if(!value)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw problem('Use a valid follow-up date.');return value;}
function createCRM({directory,key=()=>process.env.CRM_ADMIN_KEY||''}){
 const file=path.join(directory,'customers.json');let queue=Promise.resolve();
 async function read(){try{const data=JSON.parse(await fs.readFile(file,'utf8'));if(data.schema!==1||!Array.isArray(data.customers))throw Error();return data;}catch(error){if(error.code==='ENOENT')return {schema:1,revision:0,customers:[],audit:[]};throw problem('Customer storage could not be read. No changes were saved.',500);}}
 function change(db,input){
  if(input.action==='import'){
   if(!Array.isArray(input.customers)||input.customers.length>500)throw problem('Import at most 500 local profiles at a time.');
   for(const item of input.customers){
    if(!item||typeof item!=='object')throw problem('Invalid imported profile.');
    const email=clean(item.email,254).toLowerCase();let existing=db.customers.find(c=>c.email===email);
    if(!existing){change(db,{action:'create',name:item.name,email});existing=db.customers.at(-1);}
    if(existing.plan==='UNKNOWN'&&['FREE','PRO'].includes(item.plan))existing.plan=item.plan;
    for(const report of (Array.isArray(item.cases)?item.cases:[]).slice(0,100)){
     if(!report||typeof report!=='object')throw problem('Invalid imported case.');
     const sourceId=clean(report.id,100),title=clean(report.title,200);if(!sourceId||!title||existing.cases.some(c=>c.sourceId===sourceId)||existing.cases.length>=200)continue;
     existing.cases.push({id:crypto.randomUUID(),sourceId,title,status:CASES.includes(report.status)?report.status:'OPEN',createdAt:new Date().toISOString()});
    }
   }
   db.revision++;db.audit.push({at:new Date().toISOString(),action:'import',count:input.customers.length});db.audit=db.audit.slice(-500);return db;
  }
  const now=new Date().toISOString(),id=clean(input.customerId,100);let customer=db.customers.find(c=>c.id===id);
  if(input.action==='create'){
   if(db.customers.length>=5000)throw problem('Customer limit reached.');const name=clean(input.name,160),email=clean(input.email,254).toLowerCase();
   if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw problem('Enter a name and valid email address.');
   if(db.customers.some(c=>c.email===email))throw problem('This email already has a customer record.',409);
   customer={id:crypto.randomUUID(),name,email,plan:'UNKNOWN',followup:'',notes:[],cases:[],deletions:[],createdAt:now,updatedAt:now};db.customers.push(customer);
  }else{
   if(!customer)throw problem('Customer not found.',404);
   if(input.action==='profile'){customer.plan=enumValue(input.plan,['UNKNOWN','FREE','PRO']);customer.followup=date(input.followup);}
   else if(input.action==='note'){const text=clean(input.text);if(!text)throw problem('Enter a note.');if(customer.notes.length>=200)throw problem('Note limit reached.');customer.notes.push({id:crypto.randomUUID(),text,createdAt:now});}
   else if(input.action==='case'){const title=clean(input.title,200);if(!title)throw problem('Enter a case title.');if(customer.cases.length>=200)throw problem('Case limit reached.');customer.cases.push({id:crypto.randomUUID(),title,status:'NEW',createdAt:now});}
   else if(input.action==='caseStatus'){const item=customer.cases.find(c=>c.id===input.itemId);if(!item)throw problem('Case not found.',404);item.status=enumValue(input.status,CASES);item.updatedAt=now;}
   else if(input.action==='deletion'){const reason=clean(input.text);if(!reason)throw problem('Record the request details.');if(customer.deletions.some(d=>!['COMPLETED','DECLINED'].includes(d.status)))throw problem('An active deletion request already exists.',409);if(customer.deletions.length>=50)throw problem('Request limit reached.');customer.deletions.push({id:crypto.randomUUID(),reason,status:'REQUESTED',createdAt:now});}
   else if(input.action==='deletionStatus'){const item=customer.deletions.find(d=>d.id===input.itemId);if(!item)throw problem('Request not found.',404);item.status=enumValue(input.status,DELETIONS);item.updatedAt=now;}
   else throw problem('Unknown CRM operation.');
   customer.updatedAt=now;
  }
  db.revision++;db.audit.push({at:now,action:input.action,customerId:customer.id});db.audit=db.audit.slice(-500);return db;
 }
 return async function crm(req,res){
  const reply=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
  const expected=key();if(expected.length<32)return reply(503,{error:'Local CRM is not configured. Set a CRM_ADMIN_KEY of at least 32 characters on the local server.'});
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  const hash=value=>crypto.createHash('sha256').update(value).digest();
  if(!token||!crypto.timingSafeEqual(hash(token),hash(expected)))return reply(401,{error:'An administrator key is required.'});
  try{
   if(req.method==='GET')return reply(200,await read());
   if(req.method!=='POST')return reply(405,{error:'Method not allowed.'});
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>256*1024)throw problem('Request is too large.',413);chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{throw problem('Invalid JSON.');}
   if(!input||typeof input!=='object'||Array.isArray(input))throw problem('A JSON object is required.');
   const task=queue.then(async()=>{const db=await read();if(!Number.isInteger(input.revision)||input.revision!==db.revision)throw problem('Records changed. Refresh and try again.',409);change(db,input);await fs.mkdir(directory,{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(db),{mode:0o600});await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}return db;});queue=task.catch(()=>{});
   return reply(200,await task);
  }catch(error){return reply(error.status||500,{error:error.status?error.message:'Customer records could not be saved.'});}
 };
}
module.exports={createCRM};
