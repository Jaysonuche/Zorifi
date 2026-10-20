const {test}=require('node:test');
const assert=require('node:assert/strict');
const Social=require('../zorifi-social.js');
const Creator=require('../zorifi-social-creator.js');

function client({enabled=false,bucket='zorifi.firebasestorage.app'}={}){
  const gateway={configured:()=>true,session:{uid:'alice'},config:{projectId:'zorifi',storageBucket:bucket,socialMediaEnabled:enabled}};
  return new Social.Client(gateway);
}

test('usernames normalize safely and reject invalid handles',()=>{
  assert.equal(Creator.username(' @Jayson_Uche '),'jayson_uche');
  for(const value of ['a','123creator','ab!','a'.repeat(25),'éclair'])assert.throws(()=>Creator.username(value),{code:'INVALID_USERNAME'});
});

test('only explicit, bounded finished videos are accepted',()=>{
  const valid=new Blob([new Uint8Array(1024)],{type:'video/mp4'});
  assert.deepEqual(Creator.videoMetadata(valid,{duration:12.34567,width:1080,height:1920}),{bytes:1024,mime:'video/mp4',duration:12.346,width:1080,height:1920});
  assert.throws(()=>Creator.videoMetadata(new Blob(['image'],{type:'image/png'}),{duration:10,width:100,height:100}),{code:'INVALID_VIDEO'});
  assert.throws(()=>Creator.videoMetadata(valid,{duration:181,width:100,height:100}),{code:'INVALID_VIDEO'});
  assert.throws(()=>Creator.videoMetadata(valid,{duration:10,width:8000,height:100}),{code:'INVALID_VIDEO'});
});

test('Social upload remains disabled until protected cloud storage is explicitly configured',()=>{
  Creator.installClient();
  const disabled=client();
  assert.equal(disabled.storageConfigured(),false);
  assert.throws(()=>Creator.bucket(disabled),{code:'STORAGE_SETUP_REQUIRED'});
  const enabled=client({enabled:true});
  assert.equal(enabled.storageConfigured(),true);
  assert.equal(Creator.mediaPath(enabled,'post-five'),'social-media/alice/post-five/video');
  assert.throws(()=>Creator.mediaPath(enabled,'../private'),{code:'INVALID_POST'});
});

test('creator feed queries only published posts, ordered by publish time',async()=>{
  Creator.installClient();const c=client();let captured;
  c.query=async (collection,options)=>{captured={collection,options};return [];};
  await c.posts();
  assert.equal(captured.collection,'socialPosts');
  assert.equal(captured.options.where.fieldFilter.value.stringValue,'published');
  assert.equal(captured.options.orderBy[0].field.fieldPath,'publishedAt');
  assert.equal(captured.options.limit,20);
  await c.posts({owner:'bob'});
  assert.equal(captured.options.where.compositeFilter.filters[1].fieldFilter.value.stringValue,'bob');
});

test('Vanessa Social requires explicit AI consent and sends no Inbox messages',async()=>{
  const c=client();let sent;
  c.gateway.authenticatedFetch=async(path,options)=>{sent={path,body:JSON.parse(options.body)};return Response.json({reply:'A concise caption.'});};
  await assert.rejects(Creator.requestVanessa(c,'Write a caption',[],{getConsent:()=>false}),{code:'PRIVACY_CONSENT_REQUIRED'});
  assert.equal(sent,undefined);
  const result=await Creator.requestVanessa(c,'Write a caption',[{role:'user',content:'Describe neon city.'},{role:'system',content:'Private inbox secret'}],{getConsent:()=>true});
  assert.equal(result,'A concise caption.');
  assert.equal(sent.path,'/api/vanessa-provider?service=vanessa-global');
  assert.deepEqual(sent.body.history,[{role:'user',text:'Describe neon city.'}]);
  assert.equal(sent.body.editorContext.view,'social');
  assert(!JSON.stringify(sent.body).includes('Private inbox secret'));
});
