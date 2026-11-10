import {assertOpenAIAccess,enforceQuotas} from './openai-policy.mjs';
import {localFirebase} from './firebase-local.mjs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {OpenAIServiceError} from './openai-responses.mjs';
const context=new AsyncLocalStorage(),env=n=>globalThis.Netlify?.env?.get?.(n)||process.env[n]||'';
export class OpenAIState{
 static async open(filename){const {DatabaseSync}=await import('node:sqlite');return new OpenAIState(new DatabaseSync(filename));}
 constructor(db){this.db=db;db.exec(`PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,uid TEXT NOT NULL,operation TEXT NOT NULL,status TEXT NOT NULL,started INTEGER NOT NULL,finished INTEGER,input_tokens INTEGER,output_tokens INTEGER,total_tokens INTEGER,reserved INTEGER NOT NULL,response_id TEXT,model TEXT,error_code TEXT);
 CREATE INDEX IF NOT EXISTS requests_uid_started ON requests(uid,started);
 CREATE TABLE IF NOT EXISTS resources(handle TEXT PRIMARY KEY,uid TEXT NOT NULL,kind TEXT NOT NULL,upstream_id TEXT NOT NULL,created INTEGER NOT NULL);`);}
 reserve(uid,operation,reserved=6000,now=Date.now()){
  this.db.exec('BEGIN IMMEDIATE');try{
   const rows=this.db.prepare('SELECT operation,status,started,reserved,total_tokens FROM requests WHERE uid=? AND started>?').all(uid,now-86400000);enforceQuotas(rows,operation,reserved,now);
   const id=randomUUID();this.db.prepare('INSERT INTO requests(id,uid,operation,status,started,reserved) VALUES(?,?,?,?,?,?)').run(id,uid,operation,'pending',now,Math.max(1,reserved));this.db.exec('COMMIT');return id;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 finish(id,{usage={},responseId=null,model=null,status='complete',code=null}={}){const valid=n=>Number.isSafeInteger(n)&&n>=0?n:null;this.db.prepare('UPDATE requests SET status=?,finished=?,input_tokens=COALESCE(?,input_tokens),output_tokens=COALESCE(?,output_tokens),total_tokens=COALESCE(?,total_tokens),response_id=COALESCE(?,response_id),model=COALESCE(?,model),error_code=? WHERE id=?').run(status,Date.now(),valid(usage.inputTokens),valid(usage.outputTokens),valid(usage.totalTokens),typeof responseId==='string'?responseId.slice(0,160):null,typeof model==='string'?model.slice(0,120):null,code?String(code).replace(/[^A-Z0-9_]/g,'').slice(0,80):null,id);}
 summary(uid){return this.db.prepare('SELECT operation,status,COUNT(*) AS requests,SUM(input_tokens) AS inputTokens,SUM(output_tokens) AS outputTokens,SUM(total_tokens) AS totalTokens,SUM(CASE WHEN total_tokens IS NULL THEN 1 ELSE 0 END) AS unreportedUsage FROM requests WHERE uid=? GROUP BY operation,status').all(uid);}
 assertCapacity(uid){if(this.db.prepare('SELECT COUNT(*) AS n FROM resources WHERE uid=?').get(uid).n>=128)throw new OpenAIServiceError('Remove unused private resources before creating more.',429,'RESOURCE_LIMIT');}
 bind(uid,kind,upstreamId){this.assertCapacity(uid);if(!['file','vector','video'].includes(kind)||!/^[-_a-zA-Z0-9]{1,160}$/.test(upstreamId))throw new OpenAIServiceError('Invalid provider resource.',502,'INVALID_PROVIDER_RESPONSE');const handle=randomUUID();this.db.prepare('INSERT INTO resources VALUES(?,?,?,?,?)').run(handle,uid,kind,upstreamId,Date.now());return handle;}
 resolve(uid,kind,handle){if(typeof handle!=='string'||handle.length>160)throw new OpenAIServiceError('This resource is unavailable for this account.',404,'RESOURCE_NOT_FOUND');const row=this.db.prepare('SELECT upstream_id FROM resources WHERE uid=? AND kind=? AND handle=?').get(uid,kind,handle);if(!row)throw new OpenAIServiceError('This resource is unavailable for this account.',404,'RESOURCE_NOT_FOUND');return row.upstream_id;}
 remove(uid,kind,handle){this.db.prepare('DELETE FROM resources WHERE uid=? AND kind=? AND handle=?').run(uid,kind,handle);}
 close(){this.db.close();}
}
export async function withOpenAIScope(request,uid,run){if(!uid)throw new OpenAIServiceError('Authentication is required.',401,'AUTH_REQUIRED');const scope={request,uid,state:null};return context.run(scope,async()=>{try{return await run();}finally{scope.state?.close();}});}
export async function openAIState(){const scope=context.getStore();if(!scope)throw new OpenAIServiceError('An authenticated backend request is required.',401,'AUTH_REQUIRED');if(scope.state)return {state:scope.state,uid:scope.uid};const local=['127.0.0.1','localhost','[::1]'].includes(new URL(scope.request.url).hostname),configured=env('OPENAI_STATE_PATH');if(env('OPENAI_STATE_BACKEND')==='firestore'||env('VERCEL')||env('NETLIFY')||!configured&&!local){const {OpenAIFirestoreState}=await import('./openai-firestore-state.mjs');scope.state=new OpenAIFirestoreState({uid:scope.uid,token:scope.request.headers.get('authorization')?.slice(7),project:env('FIREBASE_PROJECT_ID'),origin:localFirebase(scope.request)?.firestore||'https://firestore.googleapis.com'});return {state:scope.state,uid:scope.uid};}const filename=configured||path.resolve('.zorifi-private/openai/state.sqlite');if(!path.isAbsolute(filename))throw new OpenAIServiceError('OPENAI_STATE_PATH must be an absolute server-private file path.',503,'NOT_CONFIGURED');mkdirSync(path.dirname(filename),{recursive:true});scope.state=await OpenAIState.open(filename);return {state:scope.state,uid:scope.uid};}
export async function accountedOpenAI(operation,reserved,run){const scope=context.getStore();if(!scope)throw new OpenAIServiceError('An authenticated backend request is required.',401,'AUTH_REQUIRED');await assertOpenAIAccess(scope.request,scope.uid,operation);const {state,uid}=await openAIState(),id=await state.reserve(uid,operation,reserved);let measured={};try{const result=await run(async data=>{measured=data;await state.finish(id,{...data,status:'pending'});});await state.finish(id,{...measured,status:'complete'});return result;}catch(error){await state.finish(id,{...measured,status:error.code==='CANCELLED'?'cancelled':'failed',code:error.code||'SERVICE_FAILED'});throw error;}}
