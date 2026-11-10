// Explicit individual LOCAL tests. Never run automatically during deployment.
const fs=require('node:fs'),path=require('node:path');
const {configureDemo,emulatorAccount}=require('./vanessa-openai-local.cjs');
const SAMPLE='Zorifi public test document. The sample destination is London.';
const FLAGS={voice:['VOICE'],image:['IMAGES'],video:['VIDEO'],files:['FILES'],retrieval:['FILES','RETRIEVAL'],realtime:['REALTIME']};
function testPlan(capability){if(!Object.hasOwn(FLAGS,capability))throw Error('Choose voice, image, video, files, retrieval or realtime.');return {capability,flags:FLAGS[capability],maxRequests:capability==='retrieval'?11:capability==='files'?3:capability==='video'?2:1,publicSampleOnly:true,qualityVerified:false};}
async function runPlan({capability,call,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const plan=testPlan(capability),summary={capability,publicSampleOnly:true,requests:0,providerVerified:false,qualityVerified:false},invoke=async body=>{if(++summary.requests>plan.maxRequests)throw Error('The bounded test request limit was reached.');return call({...body,consent:true});};let file,vector,binary=null;
 try{
  if(capability==='voice'||capability==='image'){
   const data=await invoke(capability==='voice'?{operation:'voice.generate',text:'This is the Zorifi public voice test.',voice:'coral',speed:1}:{operation:'images.generate',prompt:'An original abstract purple geometric orb on a plain dark background. No people or text.'});
   const bytes=Buffer.from(data.data||'','base64'),valid=capability==='voice'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(!valid)throw Error('The provider did not return the expected media container.');binary={bytes,extension:capability==='voice'?'wav':'png'};Object.assign(summary,{providerVerified:true,containerVerified:true,mimeType:data.mimeType,bytes:bytes.length});
  }else if(capability==='video'){
   const job=await invoke({operation:'video.create',prompt:'An original abstract purple geometric orb slowly rotating on a plain dark background.'}),status=await invoke({operation:'video.status',handle:job.handle});Object.assign(summary,{providerVerified:true,jobHandle:job.handle,jobState:status.status,renderVerified:false,note:'One creation and one status request only. This does not verify a completed video; an accepted provider job can continue after this test exits.'});
  }else if(capability==='realtime'){
   const data=await invoke({operation:'realtime.create'});if(typeof data.clientSecret!=='string'||!data.clientSecret.startsWith('ek_'))throw Error('No valid short-lived credential was returned.');Object.assign(summary,{providerVerified:true,expiresAt:data.expiresAt,webRTCVerified:false,note:'Credential creation only. No microphone or audio session is started. The credential is not saved or printed.'});
  }else{
   file=await invoke({operation:'files.upload',name:'zorifi-public-test.txt',data:Buffer.from(SAMPLE).toString('base64')});
   if(capability==='files'){const read=await invoke({operation:'files.read',handle:file.handle});if(Buffer.from(read.data||'','base64').toString()!==SAMPLE)throw Error('The uploaded document did not round-trip exactly.');Object.assign(summary,{providerVerified:true,roundTripVerified:true});}
   else{
    vector=await invoke({operation:'vector.create'});await invoke({operation:'vector.attach',handle:vector.handle,fileHandle:file.handle});let complete=false;
    for(let i=0;i<5;i++){const status=await invoke({operation:'vector.status',handle:vector.handle});if(status.status==='completed'&&!status.fileCounts?.in_progress&&!status.fileCounts?.failed){complete=true;break;}if(i<4)await wait(2000);}
    if(!complete)throw Error('Indexing was not verified within the bounded test window. No generation was retried.');const found=await invoke({operation:'vector.search',handle:vector.handle,query:'Which city is the sample destination?'});if(!found.results?.some(row=>/London/.test(row.text||'')))throw Error('Retrieval did not return the public test fact.');Object.assign(summary,{providerVerified:true,retrievalVerified:true});
   }
  }
 }finally{
  if(vector){try{const d=await invoke({operation:'vector.delete',handle:vector.handle});summary.vectorDeleted=d.deleted===true;}catch{summary.vectorDeleted=false;}}
  if(file){try{const d=await invoke({operation:'files.delete',handle:file.handle});summary.fileDeleted=d.deleted===true;}catch{summary.fileDeleted=false;}}
 }
 return {summary,binary};
}
async function main(){const capability=process.argv[2],plan=testPlan(capability);configureDemo();if(!process.env.OPENAI_API_KEY)throw Error('Enter the key with the hidden PowerShell launcher.');
 for(const name of ['VOICE','REALTIME','IMAGES','VIDEO','FILES','RETRIEVAL'])process.env['OPENAI_ENABLE_'+name]=plan.flags.includes(name)?'true':'false';
 const account=await emulatorAccount();process.env.OPENAI_ALLOWED_MEDIA_UIDS=account.uid;
 const server=require('./dev-server.cjs').createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{const {summary,binary}=await runPlan({capability,call:async body=>{const response=await fetch(origin+'/api/vanessa/openai',{method:'POST',headers:{authorization:'Bearer '+account.token,'content-type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'The provider test failed.'),{code:data.code||'TEST_FAILED'});return data;}});const artifacts=path.resolve(__dirname,'../artifacts');fs.mkdirSync(artifacts,{recursive:true});if(binary)fs.writeFileSync(path.join(artifacts,'openai-'+capability+'-sample.'+binary.extension),binary.bytes);fs.writeFileSync(path.join(artifacts,'openai-'+capability+'-live.json'),JSON.stringify({...summary,testedAt:new Date().toISOString()},null,2));console.log(JSON.stringify(summary,null,2));}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({verified:false,code:error.code||'LOCAL_TEST_FAILED',message:'The bounded local modality test did not complete. No automatic generation retry was made.'}));process.exitCode=1;});
module.exports={testPlan,runPlan};
