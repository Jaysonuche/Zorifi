const {randomUUID,randomBytes}=require('node:crypto');
const path=require('node:path');
function configureDemo(){
 if(process.env.NODE_ENV==='production'||process.env.VERCEL||process.env.NETLIFY)throw Error('Run this development launcher locally, not on a hosted service.');
 Object.assign(process.env,{ZORIFI_FIREBASE_EMULATORS:'true',FIREBASE_PROJECT_ID:'demo-zorifi-openai',FIREBASE_WEB_API_KEY:'demo-web-key',FIREBASE_AUTH_DOMAIN:'localhost',VANESSA_LANGUAGE_PROVIDER:'openai',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8085'});
 process.env.VANESSA_SESSION_SIGNING_KEY=process.env.VANESSA_SESSION_SIGNING_KEY||randomBytes(32).toString('hex');
 process.env.OPENAI_STATE_PATH=process.env.OPENAI_STATE_PATH||path.resolve('.zorifi-private/openai/local.sqlite');
}
function mockOpenAI(realFetch,{onCall=()=>{},respond}={}){
 return async(url,options={})=>{
  const address=String(url);
  if(address.startsWith('https://api.openai.com/')){onCall(address,options);if(respond)return respond(address,options);if(!address.endsWith('/responses'))return Response.json({error:{message:'Optional modality is disabled in this local mock.'}},{status:403});const body=JSON.parse(options.body),prompt=body.input?.[0]?.content?.filter(c=>c.type==='input_text').map(c=>c.text).join('')||'',data=/connection OK/.test(prompt)?'Zorifi OpenAI connection OK':JSON.stringify({reply:'This is the local mocked OpenAI response. No provider was contacted.',actions:[]});return Response.json({id:'resp_mock_'+randomUUID().replaceAll('-',''),model:body.model,status:'completed',usage:{input_tokens:60,output_tokens:30,total_tokens:90},output:[{type:'message',content:[{type:'output_text',text:data}]}]});}
  if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+\//.test(address))throw Error('Local test blocked an unexpected remote request.');
  return realFetch(url,options);
 };
}
async function emulatorAccount(fetcher=fetch){const response=await fetcher('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-web-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'local-'+randomUUID()+'@example.test',password:randomBytes(24).toString('hex'),returnSecureToken:true})});if(!response.ok)throw Error('The Firebase Auth emulator did not create the local test account.');const data=await response.json();return {uid:data.localId,token:data.idToken};}
async function main(){configureDemo();const mode=process.argv[2]||'--serve-mock',live=mode==='--live-test'||mode==='--serve-live';if(!live){process.env.OPENAI_API_KEY='local-mock-not-a-real-key';global.fetch=mockOpenAI(global.fetch);}else if(!process.env.OPENAI_API_KEY)throw Error('Use Start-ZorifiOpenAI.ps1 to enter the key with hidden input.');
 await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-zorifi-openai/config',{signal:AbortSignal.timeout(3000)}).catch(()=>{throw Error('Start Firebase Auth and Firestore emulators first: npm run openai:emulators');});
 const server=require('./dev-server.cjs').createServer();await new Promise(r=>server.listen(mode==='--live-test'?0:Number(process.env.PORT)||4175,'127.0.0.1',r));
 if(mode!=='--live-test'){console.log('Zorifi local '+(live?'LIVE OpenAI (provider usage may be billed)':'MOCK OpenAI (no provider calls)')+': http://127.0.0.1:'+server.address().port);console.log('Sign up with a disposable account; authentication and conversations use local demo emulators.');return;}
 try{const account=await emulatorAccount(),response=await fetch('http://127.0.0.1:'+server.address().port+'/api/vanessa/openai',{method:'POST',headers:{authorization:'Bearer '+account.token,'content-type':'application/json'},body:JSON.stringify({operation:'connection.test'})}),result=await response.json();const receipt={testedAt:new Date().toISOString(),liveConnectionTest:true,status:response.status,connected:result.connected===true,model:result.model||null,responseId:result.responseId||null,usage:result.usage||null,...(!response.ok?{code:result.code||'FAILED',error:result.error}: {})};const fs=require('node:fs');fs.mkdirSync(path.resolve(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../artifacts/openai-live-test.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));if(!response.ok)process.exitCode=1;}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
if(require.main===module)main().catch(error=>{console.error(error.code||'LOCAL_SETUP_FAILED',error.message?.startsWith('Start Firebase')?error.message:'Local test could not complete. Check the emulators, backend configuration and sanitized API error.');process.exitCode=1;});
module.exports={configureDemo,mockOpenAI,emulatorAccount};
