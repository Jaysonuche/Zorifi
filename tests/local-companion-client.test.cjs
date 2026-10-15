const test=require('node:test');
const assert=require('node:assert/strict');
const companion=require('../zorifi-local-companion.js');

test('hosted music companion probes and requests only the fixed loopback endpoint',async()=>{
  const previous=global.fetch,calls=[];
  global.fetch=async(url,options)=>{
    calls.push({url,options});
    return Response.json(calls.length===1?{configurations:{music:{provider:'Local CPU',configured:true,model:'Stable Audio 3 small music'}}}:{status:'running',requestId:'local-1'});
  };
  try{
    const config=await companion.probe();
    assert.equal(config.provider,'Local CPU');
    const status=await companion.request({action:'start',prompt:'warm piano',duration:5});
    assert.equal(status.requestId,'local-1');
    assert.deepEqual(calls.map(call=>call.url),[
      'http://127.0.0.1:47321/api/ai-settings',
      'http://127.0.0.1:47321/api/vanessa-music'
    ]);
    assert.deepEqual(calls.map(call=>call.options.method),['GET','POST']);
    for(const {options} of calls){
      assert.equal(options.mode,'cors');
      assert.equal(options.credentials,'omit');
      assert.equal(options.targetAddressSpace,'loopback');
      assert.equal(options.redirect,'error');
    }
    assert.deepEqual(JSON.parse(calls[1].options.body),{action:'start',prompt:'warm piano',duration:5});
  }finally{global.fetch=previous;}
});

test('companion refuses an unavailable model and gives a local connection error',async()=>{
  const previous=global.fetch;
  try{
    global.fetch=async()=>Response.json({configurations:{music:{provider:'Local CPU',configured:false}}});
    await assert.rejects(companion.probe(),/local music model is unavailable/);
    global.fetch=async()=>{throw new TypeError('network failed');};
    await assert.rejects(companion.probe(),/Open Zorifi on this computer/);
    assert.throws(()=>companion.request({action:'cloud'}),/Invalid local music request/);
  }finally{global.fetch=previous;}
});
