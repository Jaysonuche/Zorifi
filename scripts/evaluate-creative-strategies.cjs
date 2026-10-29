#!/usr/bin/env node
'use strict';
// Offline developer release gate. Reads exported categorical records, never AI
// conversations or project data. This command cannot deploy or modify code.
const fs=require('node:fs');
const {createHmac,randomBytes}=require('node:crypto');
const Learning=require('../zorifi-vanessa-creative-learning.js');

async function evaluateExport(input,{project,signingKey}={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['documents','manifest','candidateVersion','candidateStrategy','baselineStrategy','regression'].includes(key)))throw new Error('Use a categorical feedback export and the documented evaluation fields.');
  if(!Array.isArray(input.documents)||input.documents.length>100000)throw new Error('Export at most 100,000 feedback documents.');
  const {verifyFeedbackRecord}=await import('../netlify/functions/_shared/creative-feedback.mjs'),salt=randomBytes(32),groups=new Map(),seen=new Set();
  for(const document of input.documents){const record=verifyFeedbackRecord(document,{project,signingKey}),account=createHmac('sha256',salt).update(record.uid).digest('hex'),duplicate=`${account}:${record.event.id}`;if(seen.has(duplicate))continue;seen.add(duplicate);const strategy=record.event.strategy;if(!groups.has(strategy))groups.set(strategy,{events:[],owners:new Set()});groups.get(strategy).events.push(record.event);groups.get(strategy).owners.add(account);}
  const aggregates={};for(const [strategy,group] of groups)aggregates[strategy]=Learning.aggregateEvents(group.events,{distinctUsers:group.owners.size});
  const catalog=new Learning.StrategyCatalog({manifest:input.manifest}),manifest=catalog.inspect();
  if(manifest.versions.find(item=>item.version===input.candidateVersion)?.strategy!==input.candidateStrategy||manifest.versions.find(item=>item.version===manifest.active)?.strategy!==input.baselineStrategy)throw new Error('The measured strategies must match the registered candidate and active baseline versions.');
  const candidate=aggregates[input.candidateStrategy],baseline=aggregates[input.baselineStrategy],evaluation=catalog.evaluate(input.candidateVersion,{candidate,baseline,regression:input.regression});
  return {schema:'zorifi.creative-evaluation/1',aggregates,evaluation,activeStrategy:catalog.inspect().active,productionChanged:false,requiresHumanReview:true};
}
async function main(argv=process.argv.slice(2)){
  if(argv.length!==2||argv.some(arg=>arg.startsWith('-')))throw new Error('Usage: node scripts/evaluate-creative-strategies.cjs <categorical-export.json> <aggregate-report.json>. Set FIREBASE_PROJECT_ID and VANESSA_SESSION_SIGNING_KEY (or configured provider key) in the process environment.');
  const input=JSON.parse(fs.readFileSync(argv[0],'utf8')),signingKey=process.env.VANESSA_SESSION_SIGNING_KEY||process.env.GEMINI_API_KEY||process.env.AI_PROVIDER_KEY||process.env.OPENAI_LANGUAGE_API_KEY||process.env.OPENAI_API_KEY,report=await evaluateExport(input,{project:process.env.FIREBASE_PROJECT_ID,signingKey});fs.writeFileSync(argv[1],JSON.stringify(report,null,2)+'\n',{flag:'wx'});process.stdout.write(`Creative strategy report saved. Eligible: ${report.evaluation.eligible}. Production unchanged; human review required.\n`);
}
if(require.main===module)main().catch(error=>{process.stderr.write(`Creative evaluation failed: ${error.message}\n`);process.exitCode=1;});
module.exports={evaluateExport,main};
