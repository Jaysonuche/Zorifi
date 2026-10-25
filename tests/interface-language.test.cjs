const test=require('node:test');const assert=require('node:assert/strict');
const {validTranslation,BUILTIN}=require('../zorifi-interface-language.js');
const identity=require('../zorifi-vanessa-identity.js');
test('interface translations preserve the brand and placeholders and reject markup',()=>{
 assert.equal(validTranslation('Install Zorifi','Installer Zorifi'),true);
 for(const value of ['Installer ZORIFI','Installer un logiciel','<b>Installer Zorifi</b>','Installer Zorifi\0'])assert.equal(validTranslation('Install Zorifi',value),false);
 assert.equal(validTranslation('Hey, {0}','Bonjour, {0}'),true);assert.equal(validTranslation('Hey, {0}','Bonjour'),false);
 for(const [locale,dict] of Object.entries(BUILTIN)){assert.equal(dict.Settings.length>0,true,locale);assert.equal(Object.values(dict).every(value=>typeof value==='string'),true,locale);}
});
test('interface service accepts only shipped copy, validates provider output and reuses public translations',async()=>{
 const {translateInterface}=await import('../netlify/functions/_shared/interface-translation.mjs');let calls=0;
 const generate=async prompt=>{calls++;const input=JSON.parse(prompt);return {translations:Object.fromEntries(input.labels.map(source=>[source,'T '+source]))};};
 const result=await translateInterface({locale:'sw-KE',strings:['Settings','About Zorifi']},{generate});assert.deepEqual(result.translations,{'Settings':'T Settings','About Zorifi':'T About Zorifi'});
 await translateInterface({locale:'sw-KE',strings:['Settings']},{generate});assert.equal(calls,1);
 await assert.rejects(()=>translateInterface({locale:'xx-ZZ',strings:['Settings']},{generate}));
 await assert.rejects(()=>translateInterface({locale:'sw-KE',strings:['Private creator text never shipped with Zorifi 8c97e']},{generate}));assert.equal(calls,1);
 await assert.rejects(()=>translateInterface({locale:'sw-KE',strings:['Import']},{generate:async()=>({translations:{Import:'<img src=x>'}})}));
});
test('company facts identify the owner and CEO without substituting the user',()=>{
 for(const question of ['Who is the CEO of Zorifi?','Who is the C.E.O of zorifi','Who owns Zorifi?','Who made Zorifi?'])assert.equal(identity.companyAnswer(question),'Zorifi is made and owned by J.U.P.C.O Enterprises. Its CEO is Jayson Uche.');
 assert.equal(identity.companyAnswer('Who owns another app?'),null);assert.equal(identity.companyAnswer('Add text who owns Zorifi to my video'),null);assert.equal(identity.companyAnswer('Who owns Zorifi?',{locale:'fr-FR'}),null);
 assert.match(identity.providerInstructions({preferredLanguage:'fr-FR'}),/owned by J\.U\.P\.C\.O Enterprises.*CEO is Jayson Uche/s);
});
