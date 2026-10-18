const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../zorifi-vanessa-actions.js'),'utf8'),{window,globalThis:window});const Actions=window.ZorifiVanessaActions;
test('saved tools resolve explicit targets and reject missing, nonvisual and locked targets',()=>{
  const context=Actions.buildContext({clips:[{id:'a',type:'video',track:0},{id:'b',type:'video',track:1},{id:'text',type:'text',track:0}],selected:'a',trackStates:{1:{locked:true}}},{capabilities:{editingTools:[{id:'recipe:depth'}]}});
  const action=target=>({command:'tool.apply',target,parameters:{id:'recipe:depth'}});
  assert.equal(Actions.validate(action('a'),context).status,'SUCCESS');
  for(const target of ['missing','b','text'])assert.equal(Actions.validate(action(target),context).status,'FAILED');
  context.selectedClipId=null;assert.equal(Actions.validate(action('a'),context).status,'SUCCESS');
  assert.equal(Actions.validate(action('selected_clip'),context).status,'FAILED');
  assert.equal(Actions.validate({...action('a'),parameters:{id:'missing'}},context).status,'FAILED');
});
