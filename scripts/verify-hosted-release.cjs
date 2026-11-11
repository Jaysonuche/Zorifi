'use strict';
// Read-only release verification plus unsigned auth rejection probes. No AI calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function verifyHostedRelease(base,{build=path.join(root,'web-dist'),transport=fetch}={}){
 const origin=new URL(base);if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||!(origin.protocol==='https:'||origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))throw Error('Use an HTTPS site origin or a loopback test origin, without credentials.');
 const expected=JSON.parse(fs.readFileSync(path.join(build,'release.json'),'utf8')),nonce=Date.now().toString();
 const get=async(relative,options={})=>{const url=new URL(relative,origin);url.searchParams.set('release_check',nonce);return transport(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000),headers:{'cache-control':'no-cache',...(options.headers||{})}});};
 const releaseResponse=await get('/release.json');if(!releaseResponse.ok)throw Error('Hosted release manifest is unavailable.');const actual=await releaseResponse.json();if(actual.version!==expected.version||actual.sourceCommit!==expected.sourceCommit)throw Error('Hosted version/commit differs from the tested local build.');
 const indexResponse=await get('/');if(!indexResponse.ok)throw Error('Hosted application failed to load.');const html=await indexResponse.text();if(!html.includes(`name="zorifi-version" content="${expected.version}"`))throw Error('Hosted HTML has the wrong version.');
 const verified=[];
 for(const file of ['app.js','sw.js','zorifi-app-settings.js','zorifi-motion-graph.js','zorifi-motion-renderer.js','zorifi-motion-workspace.js','zorifi-editor-audio-workflows.js','zorifi-editor-workflow-bridge.js','zorifi-parallax-workflow.js','zorifi-background-cutout.js','zorifi-vanessa-production.js','zorifi-vanessa-professional.js']){
  const response=await get('/'+file);if(!response.ok||Number(response.headers.get('content-length'))>20_000_000)throw Error('A required hosted runtime is unavailable.');const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>20_000_000||sha(bytes)!==sha(fs.readFileSync(path.join(build,file))))throw Error('Hosted runtime differs from the tested build: '+file);verified.push(file);
 }
 const auth=[];for(const endpoint of ['/api/vanessa/chat','/api/vanessa/openai']){const response=await get(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'capabilities'})});if(response.status!==401)throw Error('Unsigned backend requests were not rejected at '+endpoint);auth.push({endpoint,status:response.status});}
 const settings=await get('/api/ai-settings');if(!settings.ok)throw Error('Existing AI settings route is unavailable.');const config=await settings.json(),language=config.configurations?.language;
 return {verifiedAt:new Date().toISOString(),origin:origin.origin,version:actual.version,sourceCommit:actual.sourceCommit,verifiedAssets:verified,authRejections:auth,language:language?{provider:language.provider,model:language.model,configured:Boolean(language.configured)}:null,aiGenerationCalls:0,productionSecretsChanged:false};
}
if(require.main===module)verifyHostedRelease(process.argv[2]||'https://zorifi.vercel.app/').then(report=>{fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/upgrade-hosted-release.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={verifyHostedRelease};
