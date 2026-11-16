// Server-only policy foundation. Proposed allowances are preview configuration,
// not a published subscription offer or permission to enable a paid provider.
export const TIERS=Object.freeze(['free','pro','nexus']);
export const WALLETS=Object.freeze(['vanessa','image','video','vocal']);
export const REASONING_MODES=Object.freeze(['standard','advanced','nexus']);
export const GLOBAL_MONTHLY_CEILING_GBP_MICROS=15_000_000;
export class FinanceError extends Error {
 constructor(message,code='INVALID_REQUEST',status=400){super(message);this.name='FinanceError';this.code=code;this.status=status;}
}
export function integer(value,name,{min=0,max=Number.MAX_SAFE_INTEGER}={}){
 if(!Number.isSafeInteger(value)||value<min||value>max)throw new FinanceError(`Invalid ${name}.`);
 return value;
}
export function identifier(value,name,{max=128}={}){
 if(typeof value!=='string'||!value.length||value.length>max||!/^[a-zA-Z0-9:_./-]+$/.test(value))throw new FinanceError(`Invalid ${name}.`);
 return value;
}
export function accountId(value){return identifier(value,'account identifier');}
export function contentHash(value){if(typeof value!=='string'||!(/^[a-f0-9]{64}$/).test(value))throw new FinanceError('A SHA-256 input hash is required.');return value;}
export function utcPeriods(now){integer(now,'time');const date=new Date(now);if(!Number.isFinite(date.getTime()))throw new FinanceError('Invalid time.');return {day:date.toISOString().slice(0,10),month:date.toISOString().slice(0,7)};}
export function verifiedTier(record,now){
 if(!record||record.verified!==true||!TIERS.includes(record.tier))throw new FinanceError('A server-verified subscription is required.','ENTITLEMENT_UNAVAILABLE',503);
 if(record.tier!=='free'&&(!Number.isSafeInteger(record.expiresAt)||record.expiresAt<=now))return 'free';
 return record.tier;
}
const proposed={
 free:{nativeMusicPerDay:1,musicUnlocksPerMonth:5,maxSongSeconds:60,maxStorySeconds:60,modes:['standard'],advancedAutoCut:false},
 pro:{nativeMusicPerDay:3,musicUnlocksPerMonth:15,maxSongSeconds:180,maxStorySeconds:180,modes:['standard','advanced'],advancedAutoCut:true},
 nexus:{nativeMusicPerDay:6,musicUnlocksPerMonth:30,maxSongSeconds:600,maxStorySeconds:600,modes:['standard','advanced','nexus'],advancedAutoCut:true}
};
export function createUltimatePolicy({includedCredits={},catalog=[],monthlyBudgetGbpMicros=GLOBAL_MONTHLY_CEILING_GBP_MICROS,perUserConcurrent=1,globalConcurrent=2,requestsPerMinute=20,reservationTtlMs=120_000}={}){
 integer(monthlyBudgetGbpMicros,'monthly budget',{max:GLOBAL_MONTHLY_CEILING_GBP_MICROS});
 integer(perUserConcurrent,'per-account concurrency',{min:1,max:4});integer(globalConcurrent,'global concurrency',{min:1,max:20});integer(requestsPerMinute,'request rate',{min:1,max:60});integer(reservationTtlMs,'reservation lifetime',{min:1000,max:600_000});
 const plans={};
 for(const tier of TIERS){
  const credits={...(tier==='free'?{vanessa:{period:'day',units:15}}:{})};
  const input=includedCredits[tier]||{};
  for(const [wallet,allocation] of Object.entries(input)){
   if(!WALLETS.includes(wallet)||!allocation||!['day','month'].includes(allocation.period))throw new FinanceError('Invalid included-credit configuration.','POLICY_INVALID',503);
   credits[wallet]={period:allocation.period,units:integer(allocation.units,'included credits',{max:1_000_000})};
  }
  for(const allocation of Object.values(credits))Object.freeze(allocation);
  plans[tier]=Object.freeze({...proposed[tier],modes:Object.freeze([...proposed[tier].modes]),credits:Object.freeze(credits)});
 }
 const entries=new Map();
 for(const entry of catalog){
  identifier(entry.id,'price identifier');if(entries.has(entry.id)||entry.id==='native-music-local-v1')throw new FinanceError('Duplicate or reserved price identifier.','POLICY_INVALID',503);
  if(!['vanessa','image','video','vocal','native_music','advanced_autocut'].includes(entry.operation))throw new FinanceError('Invalid price operation.','POLICY_INVALID',503);
  const wallet=entry.operation==='advanced_autocut'?'vanessa':entry.operation==='native_music'?null:entry.operation;
  if(entry.wallet!==wallet||entry.enabled!==true||entry.verified!==true)throw new FinanceError('A verified enabled server price is required.','POLICY_INVALID',503);
  const unitCostGbpMicros=integer(entry.unitCostGbpMicros,'maximum unit cost',{max:GLOBAL_MONTHLY_CEILING_GBP_MICROS});
  if(entry.operation!=='native_music'&&unitCostGbpMicros===0)throw new FinanceError('Cloud work requires a positive maximum cost quote.','PRICE_UNAVAILABLE',503);
  entries.set(entry.id,Object.freeze({...entry,wallet,unitCostGbpMicros,maxUnits:integer(entry.maxUnits??1,'maximum units',{min:1,max:10_000}),creditUnitsPerUnit:integer(entry.creditUnitsPerUnit??1,'credit units',{min:1,max:1_000_000})}));
 }
 // This is original on-device composition, not an external model or AI invoice.
 entries.set('native-music-local-v1',Object.freeze({id:'native-music-local-v1',operation:'native_music',wallet:null,unitCostGbpMicros:0,maxUnits:1,creditUnitsPerUnit:1,enabled:true,verified:true}));
 return Object.freeze({schema:'zorifi.ultimate.policy/1',preview:true,livePaymentsEnabled:false,plans:Object.freeze(plans),monthlyBudgetGbpMicros,perUserConcurrent,globalConcurrent,requestsPerMinute,reservationTtlMs,price(id){const price=entries.get(id);if(!price)throw new FinanceError('This operation has no approved server cost configuration.','PRICE_UNAVAILABLE',503);return price;}});
}
export function authorizeOperation(policy,tier,{operation,reasoning='standard',durationSeconds=null}={}){
 const plan=policy.plans[tier];if(!plan)throw new FinanceError('Invalid subscription.','ENTITLEMENT_UNAVAILABLE',503);
 if(!REASONING_MODES.includes(reasoning))throw new FinanceError('Choose Standard, Advanced or Nexus reasoning.');
 if(!plan.modes.includes(reasoning))throw new FinanceError('This reasoning mode requires a higher subscription tier.','TIER_REQUIRED',403);
 if(operation==='advanced_autocut'&&!plan.advancedAutoCut)throw new FinanceError('Advanced AutoCut requires Pro or Nexus.','TIER_REQUIRED',403);
 if(durationSeconds!==null){integer(durationSeconds,'duration',{min:1,max:3600});const limit=operation==='native_music'?plan.maxSongSeconds:plan.maxStorySeconds;if(durationSeconds>limit)throw new FinanceError(`The requested duration exceeds this plan’s ${limit}-second limit. Choose a shorter duration explicitly.`, 'DURATION_LIMIT',403);}
 return plan;
}
