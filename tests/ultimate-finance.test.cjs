const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const imports=Promise.all([import('../netlify/functions/_shared/ultimate-policy.mjs'),import('../netlify/functions/_shared/ultimate-finance-ledger.mjs')]);
const digest=value=>createHash('sha256').update(value).digest('hex');
const start=Date.UTC(2026,10,16,12);
const prices=[{id:'synthetic-test-standard',operation:'vanessa',wallet:'vanessa',unitCostGbpMicros:1_000_000,maxUnits:100,creditUnitsPerUnit:1,enabled:true,verified:true},{id:'synthetic-test-image',operation:'image',wallet:'image',unitCostGbpMicros:2_000_000,maxUnits:20,enabled:true,verified:true},{id:'synthetic-test-cut',operation:'advanced_autocut',wallet:'vanessa',unitCostGbpMicros:100_000,enabled:true,verified:true}];
async function setup(t,options={}){
 const [policyModule,ledgerModule]=await imports,dir=mkdtempSync(path.join(tmpdir(),'zorifi-finance-')),filename=path.join(dir,'private.sqlite');let now=start;
 const policy=policyModule.createUltimatePolicy({catalog:prices,globalConcurrent:10,includedCredits:{pro:{vanessa:{period:'day',units:30}},nexus:{vanessa:{period:'day',units:60}}},...options.policy});
 const resolveEntitlement=options.resolveEntitlement||(()=>({verified:true,tier:'free'}));
 const config={policy,resolveEntitlement,clock:()=>now,allowSandboxGrants:true};
 let ledger=await ledgerModule.UltimateFinanceLedger.open(filename,config);
 const instances=[ledger];t.after(()=>{for(const item of instances)try{item.close();}catch{}rmSync(dir,{recursive:true,force:true});});
 return {policy,filename,config,get ledger(){return ledger;},setTime(value){now=value;},async reopen(){ledger.close();ledger=await ledgerModule.UltimateFinanceLedger.open(filename,config);instances.push(ledger);return ledger;},async second(){const other=await ledgerModule.UltimateFinanceLedger.open(filename,config);instances.push(other);return other;},reserve:overrides=>ledger.reserve({uid:'account-a',key:'request-1',inputHash:digest('private prompt'),priceId:'synthetic-test-standard',...overrides})};
}
const code=(expected)=>error=>error.code===expected;

test('Ultimate policy exposes three tiers/modes, four wallets and inactive live pricing',async()=>{
 const [p]=await imports,policy=p.createUltimatePolicy();assert.deepEqual(p.TIERS,['free','pro','nexus']);assert.deepEqual(p.REASONING_MODES,['standard','advanced','nexus']);assert.deepEqual(p.WALLETS,['vanessa','image','video','vocal']);assert.equal(policy.livePaymentsEnabled,false);assert.equal(policy.monthlyBudgetGbpMicros,15_000_000);assert.throws(()=>policy.price('a-cloud-provider'),code('PRICE_UNAVAILABLE'));assert.throws(()=>p.createUltimatePolicy({monthlyBudgetGbpMicros:15_000_001}));
});

test('Untrusted or missing subscriptions fail closed; an expired paid plan becomes Free',async(t)=>{
 const s=await setup(t,{resolveEntitlement:()=>({tier:'nexus'})});await assert.rejects(s.reserve(),code('ENTITLEMENT_UNAVAILABLE'));
 const [p]=await imports;assert.equal(p.verifiedTier({verified:true,tier:'nexus',expiresAt:start-1},start),'free');assert.throws(()=>p.verifiedTier({verified:true,tier:'ultimate'},start),code('ENTITLEMENT_UNAVAILABLE'));
});

test('Included allowance is reserved first, then purchased credits; purchases persist',async(t)=>{
 const s=await setup(t,{policy:{includedCredits:{free:{vanessa:{period:'day',units:2}}}}});
 s.ledger.applySandboxGrant({uid:'account-a',receipt:'sandbox:one',wallet:'vanessa',units:5,currency:'NGN',amountMinor:123});
 const r=await s.reserve({units:3});assert.equal(r.includedUnits,2);assert.equal(r.purchasedUnits,1);assert.equal(s.ledger.summary('account-a').wallets.vanessa,4);
 s.ledger.markDispatched('account-a',r.id);s.ledger.settle('account-a',r.id,{outcome:'success',actualCostGbpMicros:2_900_000,resultReference:'asset:one'});
 await s.reopen();const summary=s.ledger.summary('account-a');assert.equal(summary.wallets.vanessa,4);assert.equal(summary.allowances[0].used,2);assert.equal(summary.allowances[0].held,0);assert.equal(summary.purchases[0].currency,'NGN');assert.equal(summary.purchases[0].mode,'sandbox');
});

test('Reservation and settlement are idempotent and bound to account/content',async(t)=>{
 const s=await setup(t);const r=await s.reserve(),again=await s.reserve();assert.equal(r.id,again.id);assert.equal(s.ledger.summary('account-a').requests.length,1);
 await assert.rejects(s.reserve({inputHash:digest('changed prompt')}),code('IDEMPOTENCY_CONFLICT'));
 assert.throws(()=>s.ledger.markDispatched('account-b',r.id),code('NOT_FOUND'));
 s.ledger.markDispatched('account-a',r.id);const receipt={outcome:'success',actualCostGbpMicros:999_999,resultReference:'asset:stable'};s.ledger.settle('account-a',r.id,receipt);s.ledger.settle('account-a',r.id,receipt);
 assert.throws(()=>s.ledger.settle('account-a',r.id,{...receipt,actualCostGbpMicros:3}),code('SETTLEMENT_CONFLICT'));
 assert.equal(s.ledger.db.prepare('SELECT spent,held FROM ultimate_budget').get().spent,999_999);
});

test('Two database connections reserve one shared budget atomically',async(t)=>{
 const s=await setup(t,{policy:{monthlyBudgetGbpMicros:1_000_000}}),other=await s.second();
 const outcomes=await Promise.allSettled([s.reserve(),other.reserve({uid:'account-b',key:'request-b',inputHash:digest('b'),priceId:'synthetic-test-standard'})]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'GLOBAL_BUDGET_EXHAUSTED');assert.equal(s.ledger.db.prepare('SELECT spent,held FROM ultimate_budget').get().held,1_000_000);
});

test('Cancel before dispatch releases credits and budget exactly once',async(t)=>{
 const s=await setup(t,{policy:{includedCredits:{free:{vanessa:{period:'day',units:0}}}}});s.ledger.applySandboxGrant({uid:'account-a',receipt:'sandbox:two',wallet:'vanessa',units:2});const r=await s.reserve();assert.equal(s.ledger.summary('account-a').wallets.vanessa,1);s.ledger.cancel('account-a',r.id);s.ledger.cancel('account-a',r.id);assert.equal(s.ledger.summary('account-a').wallets.vanessa,2);assert.equal(s.ledger.db.prepare('SELECT held FROM ultimate_budget').get().held,0);
});

test('Cancel after dispatch retains unknown-cost hold and blocks further spending until reconciled',async(t)=>{
 const s=await setup(t),r=await s.reserve();s.ledger.markDispatched('account-a',r.id);assert.equal(s.ledger.cancel('account-a',r.id).status,'reconciliation');assert.equal(s.ledger.db.prepare('SELECT held FROM ultimate_budget').get().held,1_000_000);await assert.rejects(s.reserve({key:'other-request'}),code('ACCOUNT_CONCURRENCY'));
 s.ledger.settle('account-a',r.id,{outcome:'cancelled',actualCostGbpMicros:250_000});const budget=s.ledger.db.prepare('SELECT held,spent FROM ultimate_budget').get();assert.equal(budget.held,0);assert.equal(budget.spent,250_000);assert.equal(s.ledger.summary('account-a').allowances[0].used,0);
});

test('Provider failures refund customer credits while preserving actual provider charges',async(t)=>{
 const s=await setup(t,{policy:{includedCredits:{free:{vanessa:{period:'day',units:0}}}}});s.ledger.applySandboxGrant({uid:'account-a',receipt:'sandbox:three',wallet:'vanessa',units:1});const r=await s.reserve();s.ledger.markDispatched('account-a',r.id);s.ledger.settle('account-a',r.id,{outcome:'failed',actualCostGbpMicros:300_000});assert.equal(s.ledger.summary('account-a').wallets.vanessa,1);assert.equal(s.ledger.db.prepare('SELECT spent FROM ultimate_budget').get().spent,300_000);assert.equal(s.ledger.summary('account-a').history.filter(e=>e.kind==='refund').length,1);
});

test('Over-quote provider usage is recorded truthfully and halts additional generation',async(t)=>{
 const s=await setup(t),r=await s.reserve();s.ledger.markDispatched('account-a',r.id);const result=s.ledger.settle('account-a',r.id,{outcome:'success',actualCostGbpMicros:1_100_000,resultReference:'asset:overrun'});assert.equal(result.spendingHalted,true);assert.equal(s.ledger.db.prepare('SELECT spent FROM ultimate_budget').get().spent,1_100_000);await assert.rejects(s.reserve({key:'next'}),code('SPENDING_HALTED'));
});

test('Expired pre-dispatch holds refund; dispatched expiries remain reserved for reconciliation',async(t)=>{
 const s=await setup(t,{policy:{reservationTtlMs:1000}}),first=await s.reserve();s.setTime(start+1001);const second=await s.reserve({key:'second'});assert.equal(s.ledger.getReservation('account-a',first.id).status,'expired');s.ledger.markDispatched('account-a',second.id);s.setTime(start+2002);await assert.rejects(s.reserve({key:'third'}),code('ACCOUNT_CONCURRENCY'));
 // The failed reservation rolls back housekeeping too; no expiry can release an
 // unknown paid charge. Explicit cancellation records its conservative status.
 assert.equal(s.ledger.cancel('account-a',second.id).status,'reconciliation');assert.equal(s.ledger.db.prepare('SELECT held FROM ultimate_budget').get().held,1_000_000);
});

test('Native generations preserve exact requested duration, enforce plan limits and refund failed attempts',async(t)=>{
 const s=await setup(t);await assert.rejects(s.reserve({priceId:'native-music-local-v1',durationSeconds:90}),code('DURATION_LIMIT'));
 const r=await s.reserve({priceId:'native-music-local-v1',durationSeconds:60});assert.equal(r.reservedCostGbpMicros,0);s.ledger.settle('account-a',r.id,{outcome:'failed',actualCostGbpMicros:0});const good=await s.reserve({key:'native-second',priceId:'native-music-local-v1',durationSeconds:60});s.ledger.settle('account-a',good.id,{outcome:'success',actualCostGbpMicros:0,resultReference:'asset:local'});await assert.rejects(s.reserve({key:'native-third',priceId:'native-music-local-v1'}),code('MUSIC_DAILY_LIMIT'));
 s.setTime(start+86400000);assert.equal((await s.reserve({key:'native-next-day',priceId:'native-music-local-v1'})).status,'reserved');
});

test('Purchased credits cannot unlock advanced reasoning or Advanced AutoCut on Free',async(t)=>{
 const s=await setup(t);s.ledger.applySandboxGrant({uid:'account-a',receipt:'sandbox:tier',wallet:'vanessa',units:100});await assert.rejects(s.reserve({reasoning:'advanced'}),code('TIER_REQUIRED'));await assert.rejects(s.reserve({priceId:'synthetic-test-cut'}),code('TIER_REQUIRED'));await assert.rejects(s.reserve({reasoning:'super-ultra'}));
});

test('Nexus allowance enables verified 600-second native music and Nexus reasoning',async(t)=>{
 const s=await setup(t,{resolveEntitlement:()=>({verified:true,tier:'nexus',expiresAt:start+86400000})});const r=await s.reserve({priceId:'native-music-local-v1',durationSeconds:600,reasoning:'nexus'});assert.equal(r.status,'reserved');
});

test('Rate limits include cancelled attempts and operate separately from refunded allowances',async(t)=>{
 const s=await setup(t,{policy:{requestsPerMinute:1}}),r=await s.reserve();s.ledger.cancel('account-a',r.id);await assert.rejects(s.reserve({key:'retry'}),code('RATE_LIMITED'));s.setTime(start+60001);assert.equal((await s.reserve({key:'later'})).status,'reserved');
});

test('Sandbox receipts cannot be replayed for a second account or wallet, and live grants are disabled',async(t)=>{
 const s=await setup(t),grant={uid:'account-a',receipt:'sandbox:receipt',wallet:'image',units:2};s.ledger.applySandboxGrant(grant);assert.equal(s.ledger.applySandboxGrant(grant).duplicate,true);assert.equal(s.ledger.summary('account-a').wallets.image,2);assert.throws(()=>s.ledger.applySandboxGrant({...grant,uid:'account-b'}),code('RECEIPT_CONFLICT'));assert.throws(()=>s.ledger.applySandboxGrant({...grant,mode:'live'}),code('LIVE_PAYMENTS_DISABLED'));assert.equal(s.ledger.summary('account-b').purchases.length,0);assert.equal(s.ledger.summary('account-b').history.length,0);
});

test('First successful song download consumes one unlock; repeated and next-month use are free',async(t)=>{
 const s=await setup(t),input={uid:'account-a',key:'export-one',inputHash:digest('song export'),songIds:['song:stable','song:stable']};const first=await s.ledger.reserveSongUnlocks(input);assert.equal(first.newUnlocks,1);assert.equal((await s.ledger.reserveSongUnlocks(input)).id,first.id);assert.throws(()=>s.ledger.settleSongUnlocks('account-b',first.id,{success:true,artifactHash:digest('wav')}),code('NOT_FOUND'));s.ledger.settleSongUnlocks('account-a',first.id,{success:true,artifactHash:digest('wav')});s.ledger.settleSongUnlocks('account-a',first.id,{success:true,artifactHash:digest('wav')});s.setTime(Date.UTC(2026,11,1));const reuse=await s.ledger.reserveSongUnlocks({...input,key:'reuse'});assert.equal(reuse.newUnlocks,0);assert.equal(s.ledger.summary('account-a').allowances.find(a=>a.metric==='music_unlock').used,1);
});

test('Multi-song exports reserve atomically, prevent concurrent double-unlock and refund failed artifacts',async(t)=>{
 const s=await setup(t),input={uid:'account-a',key:'many',inputHash:digest('batch'),songIds:['song:1','song:2','song:3','song:4']};const batch=await s.ledger.reserveSongUnlocks(input);await assert.rejects(s.ledger.reserveSongUnlocks({...input,key:'concurrent',songIds:['song:1']}),code('SONG_UNLOCK_BUSY'));await assert.rejects(s.ledger.reserveSongUnlocks({...input,key:'too-many',songIds:['song:5','song:6']}),code('MUSIC_UNLOCK_LIMIT'));assert.equal(s.ledger.db.prepare('SELECT COUNT(*) AS n FROM ultimate_song_unlock').get().n,4);s.ledger.settleSongUnlocks('account-a',batch.id,{success:false});assert.equal(s.ledger.db.prepare('SELECT COUNT(*) AS n FROM ultimate_song_unlock').get().n,0);assert.equal(s.ledger.summary('account-a').allowances[0].held,0);assert.equal((await s.ledger.reserveSongUnlocks({...input,key:'retry'})).newUnlocks,4);
});

test('Hosted finance cannot fall back to ephemeral SQLite or a user-bearer global document',async()=>{
 const [,m]=await imports;await assert.rejects(m.openLocalUltimateFinance({filename:path.resolve('never-created.sqlite'),requestUrl:'https://zorifi.vercel.app',resolveEntitlement:()=>({verified:true,tier:'free'})}),code('PRIVILEGED_LEDGER_REQUIRED'));await assert.rejects(m.openLocalUltimateFinance({filename:'relative.sqlite',resolveEntitlement:()=>({verified:true,tier:'free'})}),code('LEDGER_CONFIGURATION'));
 const previous=process.env.VERCEL;try{process.env.VERCEL='1';await assert.rejects(m.UltimateFinanceLedger.open(':memory:',{resolveEntitlement:()=>({verified:true,tier:'free'})}),code('PRIVILEGED_LEDGER_REQUIRED'));}finally{if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}
});

test('Unknown prior-month charges cannot create another full monthly spending allowance',async(t)=>{
 const s=await setup(t,{policy:{monthlyBudgetGbpMicros:1_000_000}}),r=await s.reserve();s.ledger.markDispatched('account-a',r.id);s.setTime(Date.UTC(2026,11,1));await assert.rejects(s.reserve({uid:'account-b',key:'december'}),code('GLOBAL_BUDGET_EXHAUSTED'));
 s.ledger.settle('account-a',r.id,{outcome:'failed',actualCostGbpMicros:900_000});await assert.rejects(s.reserve({uid:'account-b',key:'december'}),code('GLOBAL_BUDGET_EXHAUSTED'));const december=s.ledger.db.prepare("SELECT spent,held FROM ultimate_budget WHERE month='2026-12'").get();assert.equal(december.spent,900_000);assert.equal(december.held,0);
});

test('Purchase history and pending exports can be recovered after restart without freeing unknown work',async(t)=>{
 const s=await setup(t),r=await s.reserve();s.ledger.markDispatched('account-a',r.id);const songs=await s.ledger.reserveSongUnlocks({uid:'account-a',key:'export-recovery',inputHash:digest('project'),songIds:['song:recover']});await s.reopen();assert.equal(s.ledger.summary('account-a').songExports[0].id,songs.id);assert.equal(s.ledger.summary('account-b').songExports.length,0);s.ledger.settleSongUnlocks('account-a',songs.id,{success:false});assert.equal(s.ledger.summary('account-a').songExports[0].status,'failed');await assert.rejects(s.reserve({key:'restarted'}),code('ACCOUNT_CONCURRENCY'));
});

test('Async subscription resolution cannot reserve against a stale month or expired tier',async(t)=>{
 let release;const paused=new Promise(resolve=>{release=resolve;});const s=await setup(t,{policy:{monthlyBudgetGbpMicros:1_000_000},resolveEntitlement:uid=>uid==='delayed'?paused:{verified:true,tier:'free'}});
 const waiting=s.reserve({uid:'delayed',key:'at-boundary'});s.setTime(Date.UTC(2026,11,1));const current=await s.reserve({uid:'current',key:'new-month'});s.ledger.markDispatched('current',current.id);s.ledger.settle('current',current.id,{outcome:'success',actualCostGbpMicros:1_000_000,resultReference:'asset:december'});release({verified:true,tier:'free'});await assert.rejects(waiting,code('GLOBAL_BUDGET_EXHAUSTED'));assert.equal(s.ledger.db.prepare('SELECT COALESCE(SUM(held),0) AS total FROM ultimate_budget').get().total,0);
});

test('A dispatcher cannot receive a successful result for an expired reservation',async(t)=>{
 const s=await setup(t,{policy:{reservationTtlMs:1000}}),r=await s.reserve();s.setTime(start+1000);assert.throws(()=>s.ledger.markDispatched('account-a',r.id),code('RESERVATION_EXPIRED'));assert.equal(s.ledger.getReservation('account-a',r.id).status,'expired');assert.equal(s.ledger.db.prepare('SELECT held FROM ultimate_budget').get().held,0);
});

test('Delayed entitlement lookup uses subscription expiry at transaction time',async(t)=>{
 let release;const paused=new Promise(resolve=>{release=resolve;});const s=await setup(t,{resolveEntitlement:()=>paused});const waiting=s.reserve({reasoning:'nexus'});s.setTime(start+2000);release({verified:true,tier:'nexus',expiresAt:start+1000});await assert.rejects(waiting,code('TIER_REQUIRED'));assert.equal(s.ledger.summary('account-a').requests.length,0);
});
