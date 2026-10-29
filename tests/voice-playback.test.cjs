const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Voice=require('../zorifi-vanessa-voice.js');
const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('function toggleVanessaSpeech()'),code=source.slice(start,source.indexOf("\nif('speechSynthesis' in window)",start));
function setup(){
 const events=[],utterances=[],values=new Map();let resumed=0,cancelled=0;
 const synthesis={getVoices:()=>[{voiceURI:'sonia',name:'Microsoft Sonia Natural',lang:'en-GB',localService:true}],speak:utterance=>utterances.push(utterance),cancel:()=>cancelled++,resume:()=>{}};
 const context={vanessaVoiceEnabled:true,currentUser:{id:'u',language:'en-GB'},state:{projectId:'p'},globalI18n:{locale:'en'},vanessaSpeechTimer:null,vanessaCloudAudio:null,vanessaCloudAudioUrl:null,vanessaWakeEnabled:true,vanessaBusy:false,VANESSA_VOICE_KEY:'voice',vanessaFemaleVoice:null,localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},window:{ZorifiVanessaVoice:Voice,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:synthesis,dispatchEvent(event){events.push(event);return true;}},ZorifiVanessaVoice:Voice,showVanessaVoiceOrb(){},hideVanessaVoiceOrb(){},stopVanessaWakeRecognition(){},scheduleVanessaWake(){resumed++;},clearTimeout,setTimeout,revokeManagedUrl(){},toast(){},mountVanessa(){},vanessaFetch(){throw Error('Vanessa speech must not call a cloud provider.');}};
 vm.createContext(context);vm.runInContext(code,context);return {context,events,utterances,value:name=>vm.runInContext(name,context),get resumed(){return resumed;},get cancelled(){return cancelled;}};
}
test('Vanessa speaks with device synthesis without ElevenLabs or any network request',async()=>{
 const app=setup();await app.context.speakAsVanessa('**Hello** from Vanessa.');assert.equal(app.utterances.length,1);assert.equal(app.utterances[0].text,'Hello from Vanessa.');assert.equal(app.utterances[0].voice.voiceURI,'sonia');assert.equal(app.value('vanessaVoicePlaybackState'),'preparing');
 app.utterances[0].onstart();assert.equal(app.value('vanessaVoicePlaybackState'),'speaking');app.utterances[0].onboundary({charIndex:6,charLength:0,elapsedTime:.3,name:'word'});app.utterances[0].onend({elapsedTime:1});
 assert.deepEqual(app.events.map(e=>e.detail.status),['preparing','speaking','boundary','ended']);assert(app.events.every(e=>e.detail.text==='Hello from Vanessa.'&&e.detail.userId==='u'&&e.detail.request===1));assert.equal(app.events[2].detail.charIndex,6);assert.equal(app.value('vanessaVoicePlaybackState'),'idle');assert.equal(app.resumed,1);
});
test('muting cancels active device speech and prevents delayed callbacks',async()=>{
 const app=setup();await app.context.speakAsVanessa('Hello');const utterance=app.utterances[0],lateStart=utterance.onstart;app.context.toggleVanessaSpeech();lateStart();assert.equal(app.value('vanessaVoicePlaybackState'),'idle');assert.equal(app.context.vanessaVoiceEnabled,false);assert(app.cancelled>0);assert.deepEqual(app.events.map(e=>e.detail.status),['preparing','stopped']);
});
test('blocked device speech can be replayed by a tap without provider calls',async()=>{
 const app=setup();await app.context.speakAsVanessa('Hello');app.utterances[0].onerror({error:'not-allowed'});assert.equal(app.value('vanessaVoicePlaybackState'),'blocked');assert.equal(app.events.at(-1).detail.text,'Hello');assert.match(app.events.at(-1).detail.message,/Tap Hear reply/);await app.context.playPendingVanessaAudio();assert.equal(app.utterances.length,2);app.utterances[1].onstart();app.utterances[1].onend({elapsedTime:1});assert.equal(app.value('vanessaVoicePlaybackState'),'idle');
});
test('account changes cannot deliver an obsolete speech event to the new account',async()=>{
 const app=setup();await app.context.speakAsVanessa('Hello');const utterance=app.utterances[0];app.context.currentUser={id:'other',language:'en'};utterance.onstart();assert.deepEqual(app.events.map(e=>e.detail.status),['preparing']);assert.equal(app.events[0].detail.userId,'u');assert.equal(app.context.getVanessaVoiceService().isSpeaking(),false);
});
test('speech service reports unavailable synthesis rather than claiming it played',async()=>{
 const app=setup();app.context.window.SpeechSynthesisUtterance=undefined;await app.context.speakAsVanessa('Hello');assert.equal(app.value('vanessaVoicePlaybackState'),'error');assert.equal(app.utterances.length,0);assert.deepEqual(app.events.map(e=>e.detail.status),['preparing','error']);
});
