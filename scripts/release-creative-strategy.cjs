#!/usr/bin/env node
'use strict';
// Local developer command only. The browser and feedback API cannot invoke it.
const fs=require('node:fs'),path=require('node:path');
const Learning=require('../zorifi-vanessa-creative-learning.js');
const {evaluateExport}=require('./evaluate-creative-strategies.cjs');
async function prepareRelease({manifest,operation,version,input,project,signingKey,reviewed=false}){
 if(reviewed!==true)throw Error('An explicit developer review is required.');
 const catalog=new Learning.StrategyCatalog({manifest});
 if(operation==='rollback')return catalog.rollback(version,{reviewed:true});
 if(operation!=='promote'||!input)throw Error('Promotion needs a verified categorical export and regression results.');
 const report=await evaluateExport({...input,manifest,candidateVersion:version},{project,signingKey});
 const candidate=report.aggregates[input.candidateStrategy],baseline=report.aggregates[input.baselineStrategy];
 const result=catalog.evaluate(version,{candidate,baseline,regression:input.regression});if(!result.eligible)throw Error('Strategy release gate failed: '+result.reasons.join(', '));
 return catalog.promote(version,{reviewed:true});
}
async function main(argv=process.argv.slice(2)){
 const [operation,version,exportFile,reviewed]=argv;
 if(!['promote','rollback'].includes(operation)||!version||reviewed!=='--reviewed'||argv.length!==4)throw Error('Usage: node scripts/release-creative-strategy.cjs promote|rollback <version> <verified-export.json|-> --reviewed');
 const target=path.resolve(__dirname,'..','zorifi-creative-strategies.json'),original=fs.readFileSync(target,'utf8'),manifest=JSON.parse(original),input=operation==='promote'?JSON.parse(fs.readFileSync(exportFile,'utf8')):null;
 const next=await prepareRelease({manifest,operation,version,input,reviewed:true,project:process.env.FIREBASE_PROJECT_ID,signingKey:process.env.VANESSA_SESSION_SIGNING_KEY||process.env.GEMINI_API_KEY||process.env.AI_PROVIDER_KEY||process.env.OPENAI_LANGUAGE_API_KEY||process.env.OPENAI_API_KEY});
 if(fs.readFileSync(target,'utf8')!==original)throw Error('Strategy manifest changed during evaluation. Retry against the latest version.');fs.writeFileSync(target,JSON.stringify(next,null,2)+'\n');
 process.stdout.write(`Prepared ${operation} to ${next.active} in the tracked manifest. Review the Git diff, run regressions, commit and deploy through the normal release process. Nothing was deployed.\n`);
}
if(require.main===module)main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
module.exports={prepareRelease};
