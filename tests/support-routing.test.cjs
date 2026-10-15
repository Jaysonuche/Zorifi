const test=require('node:test');
const assert=require('node:assert/strict');
const {supportIntent}=require('../zorifi-support.js');
test('general assistance and creative prompts reach Vanessa chat',()=>{
 for(const prompt of ['Help me write a cinematic script','Help me with a marketing plan','Write a report on renewable energy','Create a human character for my story','Explain how an AI agent works','Help me solve this maths problem','Can you help me edit my video?','How do I export my project?','I want to talk to you','Design a customer support website']){
   assert.equal(supportIntent(prompt),false,prompt);
 }
});
test('explicit support and app failures retain support handling',()=>{
 for(const prompt of ['Contact support','I need human support','Report a bug','Zorifi keeps crashing','My export failed','I cannot sign in','My payment was charged twice'])assert.equal(supportIntent(prompt),true,prompt);
});
