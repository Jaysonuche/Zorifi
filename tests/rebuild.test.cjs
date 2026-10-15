const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function browserModule(name){const window={};vm.runInNewContext(fs.readFileSync(path.join(root,name),'utf8'),{window,globalThis:window});return window;}
test('web build excludes server secrets and includes every offline asset',()=>{
 const env={...process.env,OPENAI_API_KEY:'test-secret-never-publish',FIREBASE_WEB_API_KEY:'public-web-config'};
 const result=spawnSync(process.execPath,['scripts/build-web.cjs'],{cwd:root,env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const html=fs.readFileSync(path.join(root,'web-dist/index.html'),'utf8');assert.ok(html.includes('public-web-config'));assert.ok(!html.includes(env.OPENAI_API_KEY));assert.ok(!fs.existsSync(path.join(root,'web-dist/netlify')));
 const worker={addEventListener(){}};vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8')+';self.assets=CORE;',{self:worker});
 for(const asset of worker.assets){assert.ok(fs.existsSync(path.join(root,'web-dist',asset.split('?')[0])),asset);}
});
test('scene plans reference real supplied media and produce executable timeline operations',()=>{
 const Scenes=browserModule('zorifi-scenes.js').ZorifiScenes;
 const capabilities={mediaIds:['a','b'],transitions:['dissolve'],effects:['cinema']};
 const plan=Scenes.createScenePlan({prompt:'Create a travel story',direction:'cinematic',media:[{id:'a',type:'image',duration:5},{id:'b',type:'video',duration:8}],...capabilities});
 assert.ok(plan.scenes.length);for(const scene of plan.scenes)assert.ok(scene.mediaIds.every(id=>capabilities.mediaIds.includes(id)));
 assert.ok(Scenes.planToOperations(plan,capabilities).some(item=>item.type==='add_clip'));
 assert.throws(()=>Scenes.validateScenePlan({scenes:[{mediaIds:['lost-file']}]},capabilities));
});
test('project schema migration retains edits and clamps invalid timeline values',()=>{
 const Model=browserModule('zorifi-project-model.js').ZorifiProjectModel;
 const migrated=Model.migrateProject({id:'recovered',schemaVersion:1,clips:[{id:'clip',start:-10,duration:-1,volume:999}],duration:20,currentTime:100});
 assert.equal(migrated.schemaVersion,4);assert.equal(migrated.clips[0].start,0);assert.equal(migrated.clips[0].volume,200);assert.equal(migrated.currentTime,20);
});
test('assistant transaction restores the editor if a later action fails',async()=>{
 const Actions=browserModule('zorifi-vanessa-actions.js').ZorifiVanessaActions;
 const state={clips:[{id:'clip',type:'video',name:'Original',start:0,duration:5,track:0,volume:100,opacity:100}],selected:'clip',trackStates:{},view:'editor',duration:5};
 const before=structuredClone(state);let count=0;
 const result=await Actions.execute({actions:[{command:'clip.set',target:'clip',parameters:{property:'volume',value:50}},{command:'clip.set',target:'clip',parameters:{property:'opacity',value:70}}]},Actions.buildContext(state),{capture:()=>structuredClone(state),state:()=>state,apply:()=>{state.clips[0].volume=50;if(++count===2)throw new Error('Simulated editing failure');},restore:value=>Object.assign(state,value)},{confirmed:true});
 assert.equal(result.status,Actions.STATUS.FAILED);assert.equal(result.rolledBack,true);assert.deepEqual(state,before);
});
test('personal memory candidates cannot enter approved provider memory',()=>{
 const {PersonalMemoryStore}=require('../zorifi-vanessa-memory.js');const {MemoryManager}=require('../zorifi-vanessa-memory-manager.js');
 const store=new PersonalMemoryStore({userId:'a'}),manager=new MemoryManager({store});const candidate=store.createCandidate({category:'creative_preferences',key:'style',value:'cinematic travel videos'});
 assert.equal(store.forProvider('cinematic travel').length,0);manager.approve(candidate.id);assert.equal(store.forProvider('cinematic travel').length,1);
 assert.throws(()=>store.createCandidate({category:'preferences',value:'My API key is sk-secret-value'}));
});
