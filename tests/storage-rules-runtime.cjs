// Official Firebase Storage rules runtime, using isolated synthetic data only.
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),readline=require('node:readline');
const root=path.resolve(__dirname,'..'),java=process.env.ZORIFI_TEST_JAVA||path.join(root,'artifacts/verification-tools/jre21/jdk-21.0.12.1+1-jre/bin/java.exe'),jar=path.join(root,'artifacts/verification-tools/cloud-storage-rules-runtime-v1.1.3.jar');
const value=v=>v===null?{null_value:null}:typeof v==='string'?{string_value:v}:typeof v==='boolean'?{bool_value:v}:typeof v==='number'?{int_value:v}:{map_value:{fields:Object.fromEntries(Object.entries(v).map(([k,v])=>[k,value(v)]))}};
const field=v=>typeof v==='number'?{integerValue:String(v)}:{stringValue:v};
(async()=>{
 if(!fs.existsSync(java)||!fs.existsSync(jar))throw Error('Install the official Firebase Storage rules runtime and Java 21 before this integration check.');
 const child=spawn(java,['-jar',jar,'serve'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),pending=new Map();let serial=0,document=null;
 const ready=new Promise((resolve,reject)=>{pending.set(-1,{resolve,reject});});
 readline.createInterface({input:child.stdout}).on('line',line=>{let data;try{data=JSON.parse(line);}catch{return;}
  if(data.action==='fetch_firestore_document'){child.stdin.write(JSON.stringify({id:data.server_request_id,status:document?'ok':'not_found',warnings:[],errors:[],...(document?{result:{name:'projects/demo-zorifi-social/databases/(default)/documents/socialPosts/post-first',fields:Object.fromEntries(Object.entries(document).map(([k,v])=>[k,field(v)]))}}:{})})+'\n');return;}
  const responseId=data.id??data.server_request_id,item=pending.get(responseId);if(item){pending.delete(responseId);item.resolve(data);}
 });child.stderr.on('data',()=>{});child.on('error',error=>{for(const p of pending.values())p.reject(error);});child.on('exit',()=>{for(const p of pending.values())p.reject(Error('Storage rules runtime exited before responding'));});
 const send=body=>new Promise((resolve,reject)=>{const id=serial++,timer=setTimeout(()=>{pending.delete(id);reject(Error('Storage rules runtime timed out'));},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});child.stdin.write(JSON.stringify({id,...body})+'\n');});
 const timeout=setTimeout(()=>child.kill(),90000);
 try{
  await ready;const loaded=await send({action:'load_ruleset',context:{rulesetName:'zorifi',source:{files:[{name:'storage.rules',content:fs.readFileSync(path.join(root,'storage.rules'),'utf8')}]}}});assert.deepEqual(loaded.errors,[],JSON.stringify(loaded));
  const verify=async(method,{uid='alice',media='social-media/alice/post-first/video',size=1024,mime='video/mp4',metadata={},status='uploading',missing=false}={})=>{
   document=missing?null:{uid:'alice',status,mediaPath:'social-media/alice/post-first/video',bytes:1024,mime:'video/mp4'};
   const resource={name:media,bucket:'demo-zorifi-social.appspot.com',size,contentType:mime,metadata};
   const request=value({auth:uid?{uid,token:{sub:uid}}:null,resource:method==='create'||method==='update'?resource:null});request.map_value.fields.path={path_value:{segments:('/b/demo-zorifi-social.appspot.com/o/'+media).split('/').filter(Boolean).map(simple=>({simple}))}};request.map_value.fields.time={timestamp_value:new Date().toISOString()};
   const result=await send({action:'verify',context:{rulesetName:'zorifi',service:'firebase.storage',path:'/b/demo-zorifi-social.appspot.com/o/'+media,method,variables:{request,resource:value(method==='create'?null:resource)}}});return result.result?.permit===true;
  };
  assert(await verify('create'),'An owner can upload the exact bounded private draft');
  for(const options of [{uid:null},{uid:'bob'},{size:1025},{mime:'text/html'},{metadata:{firebaseStorageDownloadTokens:'public-link'}},{status:'published'},{missing:true},{media:'projects/alice/private-source'}])assert.equal(await verify('create',options),false,JSON.stringify(options));
  assert.equal(await verify('get',{uid:'bob'}),false);assert(await verify('get',{uid:'bob',status:'published'}));assert.equal(await verify('get',{uid:null,status:'published'}),false);assert.equal(await verify('update'),false);assert.equal(await verify('list',{media:'social-media/alice'}),false);assert(await verify('delete'));assert.equal(await verify('delete',{uid:'bob'}),false);
  console.log('Official Storage runtime: compile and 16 upload/read/delete/privacy checks passed. No production storage or personal files were accessed.');
 }finally{clearTimeout(timeout);child.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
