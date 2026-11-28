import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {FinanceError,createUltimatePolicy,integer,identifier,accountId,contentHash,utcPeriods,verifiedTier,authorizeOperation,WALLETS} from './ultimate-policy.mjs';

const json=value=>JSON.stringify(value);
const hash=value=>createHash('sha256').update(json(value)).digest('hex');
const safeReference=value=>identifier(value,'result reference',{max:160});
const active="('reserved','dispatched','reconciliation')";
const assertLocalRuntime=()=>{if(process.env.VERCEL||process.env.NETLIFY||process.env.NODE_ENV==='production')throw new FinanceError('The privileged production financial ledger is not configured. Paid generation remains disabled.','PRIVILEGED_LEDGER_REQUIRED',503);};

/**
 * Internal server foundation, deliberately not a public API. The caller must
 * authenticate the UID before use. resolveEntitlement must read server-owned
 * records; it must never return a client-selected plan. Input hashes must be
 * calculated from the validated request on the server, not accepted from users.
 * No raw media, prompts,
 * tokens or credentials are stored. All mutations below are SQLite transactions.
 * Hosted use is disabled until a privileged, durable transactional adapter exists.
 */
export class UltimateFinanceLedger {
 static async open(filename,options){assertLocalRuntime();const {DatabaseSync}=await import('node:sqlite');return new UltimateFinanceLedger(new DatabaseSync(filename),options);}
 constructor(db,{policy=createUltimatePolicy(),resolveEntitlement,clock=Date.now,allowSandboxGrants=false}={}){
  assertLocalRuntime();
  if(typeof resolveEntitlement!=='function')throw new FinanceError('Configure a trusted subscription resolver.','ENTITLEMENT_UNAVAILABLE',503);
  this.db=db;this.policy=policy;this.resolveEntitlement=resolveEntitlement;this.clock=clock;this.allowSandboxGrants=allowSandboxGrants;
  db.exec(`PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL;
   CREATE TABLE IF NOT EXISTS ultimate_budget(month TEXT PRIMARY KEY,spent INTEGER NOT NULL DEFAULT 0,held INTEGER NOT NULL DEFAULT 0,CHECK(spent>=0 AND held>=0));
   CREATE TABLE IF NOT EXISTS ultimate_flags(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS ultimate_wallet(uid TEXT NOT NULL,wallet TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(uid,wallet),CHECK(balance>=0));
   CREATE TABLE IF NOT EXISTS ultimate_allowance(uid TEXT NOT NULL,metric TEXT NOT NULL,period TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,held INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(uid,metric,period),CHECK(used>=0 AND held>=0));
   CREATE TABLE IF NOT EXISTS ultimate_reservation(id TEXT PRIMARY KEY,uid TEXT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,operation TEXT NOT NULL,wallet TEXT,credit_units INTEGER NOT NULL,included INTEGER NOT NULL,bought INTEGER NOT NULL,allowance_period TEXT,quota_metric TEXT,quota_period TEXT,quota_units INTEGER NOT NULL,month TEXT NOT NULL,quote INTEGER NOT NULL,actual INTEGER,status TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,result_ref TEXT,error_code TEXT,UNIQUE(uid,request_key));
   CREATE INDEX IF NOT EXISTS ultimate_reservation_account ON ultimate_reservation(uid,status,created);
   CREATE TABLE IF NOT EXISTS ultimate_entry(id INTEGER PRIMARY KEY AUTOINCREMENT,uid TEXT NOT NULL,wallet TEXT NOT NULL,delta INTEGER NOT NULL,kind TEXT NOT NULL,reference TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(uid,kind,reference));
   CREATE TABLE IF NOT EXISTS ultimate_grant(receipt TEXT PRIMARY KEY,uid TEXT NOT NULL,wallet TEXT NOT NULL,units INTEGER NOT NULL,currency TEXT NOT NULL,amount_minor INTEGER NOT NULL,created INTEGER NOT NULL,mode TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS ultimate_unlock_batch(id TEXT PRIMARY KEY,uid TEXT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,month TEXT NOT NULL,added INTEGER NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,artifact_hash TEXT,UNIQUE(uid,request_key));
   CREATE TABLE IF NOT EXISTS ultimate_song_unlock(uid TEXT NOT NULL,song_id TEXT NOT NULL,batch_id TEXT NOT NULL,status TEXT NOT NULL,unlocked INTEGER,PRIMARY KEY(uid,song_id));`);
 }
 transaction(run){this.db.exec('BEGIN IMMEDIATE');try{const value=run();this.db.exec('COMMIT');return value;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 counter(uid,metric,period){return this.db.prepare('SELECT used,held FROM ultimate_allowance WHERE uid=? AND metric=? AND period=?').get(uid,metric,period)||{used:0,held:0};}
 // Negative deltas cannot be inserted into a new counter (CHECK); ensure it exists
 // before doing arithmetic when releasing reservations.
 changeCounter(uid,metric,period,used,held){this.db.prepare('INSERT OR IGNORE INTO ultimate_allowance(uid,metric,period) VALUES(?,?,?)').run(uid,metric,period);this.db.prepare('UPDATE ultimate_allowance SET used=used+?,held=held+? WHERE uid=? AND metric=? AND period=?').run(used,held,uid,metric,period);}
 wallet(uid,wallet){return this.db.prepare('SELECT balance FROM ultimate_wallet WHERE uid=? AND wallet=?').get(uid,wallet)?.balance||0;}
 changeWallet(uid,wallet,delta,kind,reference,now){this.db.prepare('INSERT OR IGNORE INTO ultimate_wallet(uid,wallet) VALUES(?,?)').run(uid,wallet);this.db.prepare('UPDATE ultimate_wallet SET balance=balance+? WHERE uid=? AND wallet=?').run(delta,uid,wallet);this.db.prepare('INSERT INTO ultimate_entry(uid,wallet,delta,kind,reference,created) VALUES(?,?,?,?,?,?)').run(uid,wallet,delta,kind,reference,now);}
 publicReservation(row){return {id:row.id,operation:row.operation,status:row.status,creditUnits:row.credit_units,includedUnits:row.included,purchasedUnits:row.bought,reservedCostGbpMicros:row.quote,actualCostGbpMicros:row.actual??null,resultReference:row.result_ref||null,expiresAt:row.expires};}
 getReservation(uid,id){const row=this.db.prepare('SELECT * FROM ultimate_reservation WHERE uid=? AND id=?').get(accountId(uid),identifier(id,'reservation'));if(!row)throw new FinanceError('Reservation is unavailable for this account.','NOT_FOUND',404);return row;}
 release(row,outcome,now){
  if(row.included)this.changeCounter(row.uid,'wallet:'+row.wallet,row.allowance_period,0,-row.included);
  if(row.quota_units)this.changeCounter(row.uid,row.quota_metric,row.quota_period,0,-row.quota_units);
  if(row.bought)this.changeWallet(row.uid,row.wallet,row.bought,'refund',row.id,now);
  this.db.prepare('UPDATE ultimate_budget SET held=held-? WHERE month=?').run(row.quote,row.month);
  this.db.prepare('UPDATE ultimate_reservation SET status=?,actual=0 WHERE id=?').run(outcome,row.id);
 }
 expire(now){
  const rows=this.db.prepare(`SELECT * FROM ultimate_reservation WHERE status IN ('reserved','dispatched') AND expires<=?`).all(now);
  for(const row of rows){if(row.status==='reserved')this.release(row,'expired',now);else this.db.prepare("UPDATE ultimate_reservation SET status='reconciliation',error_code='USAGE_UNKNOWN' WHERE id=?").run(row.id);}
 }
 async reserve({uid,key,inputHash,priceId,units=1,reasoning='standard',durationSeconds=null}={}){
  accountId(uid);identifier(key,'idempotency key');contentHash(inputHash);identifier(priceId,'price identifier');
  const entitlement=await this.resolveEntitlement(uid),price=this.policy.price(priceId);
  integer(units,'units',{min:1,max:price.maxUnits});
  const quote=integer(price.unitCostGbpMicros*units,'cost quote'),credits=price.wallet?integer(price.creditUnitsPerUnit*units,'credit units'):0;
  const fingerprint=hash({inputHash,priceId,units,reasoning,durationSeconds,quote,credits,operation:price.operation});
  return this.transaction(()=>{
   // Entitlement resolution may cross a UTC reset. The transaction, budget and
   // subscription expiry must all use a fresh timestamp after that await.
   const now=integer(this.clock(),'time'),tier=verifiedTier(entitlement,now),plan=authorizeOperation(this.policy,tier,{operation:price.operation,reasoning,durationSeconds});
   this.expire(now);
   const previous=this.db.prepare('SELECT * FROM ultimate_reservation WHERE uid=? AND request_key=?').get(uid,key);
   if(previous){if(previous.fingerprint!==fingerprint)throw new FinanceError('This idempotency key was already used for a different request.','IDEMPOTENCY_CONFLICT',409);return this.publicReservation(previous);}
   if(this.db.prepare("SELECT value FROM ultimate_flags WHERE key='halt'").get()?.value==='true')throw new FinanceError('Generation is paused for spending reconciliation.','SPENDING_HALTED',503);
   if(this.db.prepare('SELECT COUNT(*) AS n FROM ultimate_reservation WHERE uid=? AND created>?').get(uid,now-60_000).n>=this.policy.requestsPerMinute)throw new FinanceError('Please wait before making another generation request.','RATE_LIMITED',429);
   if(this.db.prepare(`SELECT COUNT(*) AS n FROM ultimate_reservation WHERE uid=? AND status IN ${active}`).get(uid).n>=this.policy.perUserConcurrent)throw new FinanceError('Wait for this account’s active generation or its cost reconciliation.','ACCOUNT_CONCURRENCY',429);
   if(this.db.prepare(`SELECT COUNT(*) AS n FROM ultimate_reservation WHERE status IN ${active}`).get().n>=this.policy.globalConcurrent)throw new FinanceError('Generation is busy. Try again shortly.','GLOBAL_CONCURRENCY',429);
   const {day,month}=utcPeriods(now);this.db.prepare('INSERT OR IGNORE INTO ultimate_budget(month) VALUES(?)').run(month);
   const budget=this.db.prepare('SELECT spent FROM ultimate_budget WHERE month=?').get(month);
   // A dispatched December job can still incur a January charge. Unknown-cost
   // holds from every month reduce the current month's remaining capacity.
   const allHeld=this.db.prepare('SELECT COALESCE(SUM(held),0) AS total FROM ultimate_budget').get().total;
   if(budget.spent+allHeld+quote>this.policy.monthlyBudgetGbpMicros)throw new FinanceError('The shared monthly AI spending allowance is exhausted.','GLOBAL_BUDGET_EXHAUSTED',429);
   const quotaMetric=price.operation==='native_music'?'native_music':null,quotaPeriod=quotaMetric?day:null,quotaUnits=quotaMetric?units:0;
   if(quotaMetric){const quota=this.counter(uid,quotaMetric,day);if(quota.used+quota.held+units>plan.nativeMusicPerDay)throw new FinanceError('Today’s music-generation allowance is exhausted.','MUSIC_DAILY_LIMIT',429);}
   let included=0,allocationPeriod=null;
   if(price.wallet){
    const allocation=plan.credits[price.wallet];
    if(allocation){allocationPeriod=allocation.period==='day'?day:month;const counter=this.counter(uid,'wallet:'+price.wallet,allocationPeriod);included=Math.min(credits,Math.max(0,allocation.units-counter.used-counter.held));}
    const bought=credits-included;
    if(this.wallet(uid,price.wallet)<bought)throw new FinanceError('This account does not have enough included allowance or purchased credits.','CREDITS_EXHAUSTED',402);
   }
   const id=randomUUID(),bought=credits-included;
   if(included)this.changeCounter(uid,'wallet:'+price.wallet,allocationPeriod,0,included);
   if(quotaUnits)this.changeCounter(uid,quotaMetric,quotaPeriod,0,quotaUnits);
   if(bought)this.changeWallet(uid,price.wallet,-bought,'reservation',id,now);
   this.db.prepare('UPDATE ultimate_budget SET held=held+? WHERE month=?').run(quote,month);
   this.db.prepare('INSERT INTO ultimate_reservation(id,uid,request_key,fingerprint,operation,wallet,credit_units,included,bought,allowance_period,quota_metric,quota_period,quota_units,month,quote,status,created,expires) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,uid,key,fingerprint,price.operation,price.wallet,credits,included,bought,allocationPeriod,quotaMetric,quotaPeriod,quotaUnits,month,quote,'reserved',now,now+this.policy.reservationTtlMs);
   return this.publicReservation(this.getReservation(uid,id));
  });
 }
 markDispatched(uid,id){const result=this.transaction(()=>{const row=this.getReservation(uid,id),now=integer(this.clock(),'time');if(row.status==='dispatched')return this.publicReservation(row);if(row.status!=='reserved')throw new FinanceError('This request cannot be dispatched.','RESERVATION_CLOSED',409);if(row.expires<=now){this.release(row,'expired',now);return this.publicReservation(this.getReservation(uid,id));}this.db.prepare("UPDATE ultimate_reservation SET status='dispatched' WHERE id=?").run(id);return this.publicReservation(this.getReservation(uid,id));});if(result.status!=='dispatched')throw new FinanceError('This reservation expired before dispatch.','RESERVATION_EXPIRED',409);return result;}
 cancel(uid,id){return this.transaction(()=>{const row=this.getReservation(uid,id);if(row.status==='reserved'){this.release(row,'cancelled',this.clock());}else if(row.status==='dispatched'){this.db.prepare("UPDATE ultimate_reservation SET status='reconciliation',error_code='CANCEL_USAGE_UNKNOWN' WHERE id=?").run(id);}return this.publicReservation(this.getReservation(uid,id));});}
 /** Actual costs must come from trusted provider usage, never a client field. */
 settle(uid,id,{outcome,actualCostGbpMicros,resultReference=null}={}){
  if(!['success','failed','cancelled'].includes(outcome))throw new FinanceError('Invalid completion outcome.');integer(actualCostGbpMicros,'actual provider cost');if(outcome==='success')safeReference(resultReference);else if(resultReference!==null)throw new FinanceError('An unsuccessful request cannot have a successful result reference.');
  return this.transaction(()=>{
   const row=this.getReservation(uid,id),finalStatus=outcome==='success'?'complete':outcome;
   if(['complete','failed','cancelled','expired'].includes(row.status)){if(row.status!==finalStatus||row.actual!==actualCostGbpMicros||(row.result_ref||null)!==resultReference)throw new FinanceError('Completion does not match the recorded result.','SETTLEMENT_CONFLICT',409);return this.publicReservation(row);}
   if(!['dispatched','reconciliation'].includes(row.status)&&!(row.status==='reserved'&&row.quote===0))throw new FinanceError('Dispatch must be recorded before settling a paid operation.','NOT_DISPATCHED',409);
   if(row.included)this.changeCounter(uid,'wallet:'+row.wallet,row.allowance_period,outcome==='success'?row.included:0,-row.included);
   if(row.quota_units)this.changeCounter(uid,row.quota_metric,row.quota_period,outcome==='success'?row.quota_units:0,-row.quota_units);
   if(row.bought&&outcome!=='success')this.changeWallet(uid,row.wallet,row.bought,'refund',id,this.clock());
   const settlementMonth=utcPeriods(this.clock()).month;
   this.db.prepare('INSERT OR IGNORE INTO ultimate_budget(month) VALUES(?)').run(settlementMonth);
   const settled=this.db.prepare('SELECT spent FROM ultimate_budget WHERE month=?').get(settlementMonth);
   integer(settled.spent+actualCostGbpMicros,'accumulated provider cost');
   this.db.prepare('UPDATE ultimate_budget SET held=held-? WHERE month=?').run(row.quote,row.month);
   // Record actual costs in the month in which usage is reconciled. This is
   // deliberately conservative across calendar boundaries and is not an invoice.
   this.db.prepare('UPDATE ultimate_budget SET spent=spent+? WHERE month=?').run(actualCostGbpMicros,settlementMonth);
   this.db.prepare('UPDATE ultimate_reservation SET status=?,actual=?,result_ref=? WHERE id=?').run(finalStatus,actualCostGbpMicros,resultReference,id);
   if(actualCostGbpMicros>row.quote)this.db.prepare("INSERT INTO ultimate_flags(key,value) VALUES('halt','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
   return {...this.publicReservation(this.getReservation(uid,id)),spendingHalted:actualCostGbpMicros>row.quote};
  });
 }
 /** Sandbox-only seed, not a payment endpoint. Live credit grants remain disabled. */
 applySandboxGrant({uid,receipt,wallet,units,currency='GBP',amountMinor=0,mode='sandbox'}={}){
  if(!this.allowSandboxGrants||mode!=='sandbox')throw new FinanceError('Live purchases are disabled.','LIVE_PAYMENTS_DISABLED',503);
  accountId(uid);identifier(receipt,'verified sandbox receipt');if(!WALLETS.includes(wallet))throw new FinanceError('Invalid credit wallet.');integer(units,'grant units',{min:1,max:1_000_000});integer(amountMinor,'sandbox purchase amount');if(!/^[A-Z]{3}$/.test(currency))throw new FinanceError('Invalid currency.');
  return this.transaction(()=>{const old=this.db.prepare('SELECT * FROM ultimate_grant WHERE receipt=?').get(receipt);if(old){if(old.uid!==uid||old.wallet!==wallet||old.units!==units||old.currency!==currency||old.amount_minor!==amountMinor)throw new FinanceError('Sandbox receipt was already used.','RECEIPT_CONFLICT',409);return {receipt,balance:this.wallet(uid,wallet),duplicate:true};}integer(this.wallet(uid,wallet)+units,'wallet balance');const now=this.clock();this.db.prepare('INSERT INTO ultimate_grant VALUES(?,?,?,?,?,?,?,?)').run(receipt,uid,wallet,units,currency,amountMinor,now,'sandbox');this.changeWallet(uid,wallet,units,'sandbox_grant',receipt,now);return {receipt,balance:this.wallet(uid,wallet),duplicate:false};});
 }
 async reserveSongUnlocks({uid,key,inputHash,songIds}={}){
  accountId(uid);identifier(key,'idempotency key');contentHash(inputHash);if(!Array.isArray(songIds)||songIds.length>100||!songIds.length)throw new FinanceError('Select between one and 100 generated songs.');
  const ids=[...new Set(songIds.map(id=>identifier(id,'song identity')))].sort(),entitlement=await this.resolveEntitlement(uid),fingerprint=hash({inputHash,ids});
  return this.transaction(()=>{
   const now=integer(this.clock(),'time'),tier=verifiedTier(entitlement,now),month=utcPeriods(now).month;
   const old=this.db.prepare('SELECT * FROM ultimate_unlock_batch WHERE uid=? AND request_key=?').get(uid,key);if(old){if(old.fingerprint!==fingerprint)throw new FinanceError('This unlock key was already used for different content.','IDEMPOTENCY_CONFLICT',409);return {id:old.id,status:old.status,newUnlocks:old.added};}
   const additions=[];for(const song of ids){const row=this.db.prepare('SELECT status FROM ultimate_song_unlock WHERE uid=? AND song_id=?').get(uid,song);if(row?.status==='pending')throw new FinanceError('This song is already being exported by another request.','SONG_UNLOCK_BUSY',409);if(!row)additions.push(song);}
   const allowance=this.counter(uid,'music_unlock',month);if(allowance.used+allowance.held+additions.length>this.policy.plans[tier].musicUnlocksPerMonth)throw new FinanceError('This export exceeds the remaining monthly song-unlock allowance.','MUSIC_UNLOCK_LIMIT',403);
   const id=randomUUID();this.db.prepare('INSERT INTO ultimate_unlock_batch(id,uid,request_key,fingerprint,month,added,status,created) VALUES(?,?,?,?,?,?,?,?)').run(id,uid,key,fingerprint,month,additions.length,'pending',now);
   for(const song of additions)this.db.prepare("INSERT INTO ultimate_song_unlock(uid,song_id,batch_id,status) VALUES(?,?,?,'pending')").run(uid,song,id);
   if(additions.length)this.changeCounter(uid,'music_unlock',month,0,additions.length);
   return {id,status:'pending',newUnlocks:additions.length};
  });
 }
 /** Call only after the server/export coordinator verifies an actual artifact. */
 settleSongUnlocks(uid,id,{success,artifactHash=null}={}){
  accountId(uid);identifier(id,'unlock reservation');if(typeof success!=='boolean')throw new FinanceError('Invalid unlock completion.');if(success)contentHash(artifactHash);else if(artifactHash!==null)throw new FinanceError('A failed export cannot have a successful artifact receipt.');
  return this.transaction(()=>{const row=this.db.prepare('SELECT * FROM ultimate_unlock_batch WHERE uid=? AND id=?').get(uid,id);if(!row)throw new FinanceError('Unlock reservation is unavailable for this account.','NOT_FOUND',404);const status=success?'complete':'failed';if(row.status!=='pending'){if(row.status!==status||row.artifact_hash!==artifactHash)throw new FinanceError('Unlock completion does not match the recorded result.','SETTLEMENT_CONFLICT',409);return {id,status,newUnlocks:row.added};}if(row.added)this.changeCounter(uid,'music_unlock',row.month,success?row.added:0,-row.added);if(success)this.db.prepare("UPDATE ultimate_song_unlock SET status='complete',unlocked=? WHERE uid=? AND batch_id=?").run(this.clock(),uid,id);else this.db.prepare("DELETE FROM ultimate_song_unlock WHERE uid=? AND batch_id=? AND status='pending'").run(uid,id);this.db.prepare('UPDATE ultimate_unlock_batch SET status=?,artifact_hash=? WHERE uid=? AND id=?').run(status,artifactHash,uid,id);return {id,status,newUnlocks:row.added};});
 }
 summary(uid){accountId(uid);return {wallets:Object.fromEntries(WALLETS.map(wallet=>[wallet,this.wallet(uid,wallet)])),allowances:this.db.prepare('SELECT metric,period,used,held FROM ultimate_allowance WHERE uid=? ORDER BY period,metric').all(uid),requests:this.db.prepare('SELECT id,operation,status,quote,actual,created FROM ultimate_reservation WHERE uid=? ORDER BY created DESC LIMIT 100').all(uid),songExports:this.db.prepare('SELECT id,status,added AS newUnlocks,month,created FROM ultimate_unlock_batch WHERE uid=? ORDER BY created DESC LIMIT 100').all(uid),history:this.db.prepare('SELECT wallet,delta,kind,reference,created FROM ultimate_entry WHERE uid=? ORDER BY id DESC LIMIT 100').all(uid),purchases:this.db.prepare('SELECT receipt,wallet,units,currency,amount_minor AS amountMinor,mode,created FROM ultimate_grant WHERE uid=? ORDER BY created DESC LIMIT 100').all(uid)};}
 close(){this.db.close();}
}

/** No ephemeral SQLite on serverless hosts and no user-token global ledger. */
export async function openLocalUltimateFinance({filename,requestUrl='http://localhost',...options}={}){
 const host=new URL(requestUrl).hostname;
 if(process.env.VERCEL||process.env.NETLIFY||process.env.NODE_ENV==='production'||!['localhost','127.0.0.1','[::1]'].includes(host))throw new FinanceError('The privileged production financial ledger is not configured. Paid generation remains disabled.','PRIVILEGED_LEDGER_REQUIRED',503);
 if(typeof filename!=='string'||!path.isAbsolute(filename))throw new FinanceError('Use an absolute server-private ledger path.','LEDGER_CONFIGURATION',503);
 mkdirSync(path.dirname(filename),{recursive:true});return UltimateFinanceLedger.open(filename,options);
}
