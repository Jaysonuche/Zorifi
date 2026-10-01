(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiTerms=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const CONFIG=Object.freeze({
    version:'3.37.0',
    publishedAt:'2026-09-29',
    supportEmail:'zorifvideoeditor@gmail.com',
    storageNamespace:'zorifi-terms-acceptance-v1',
    privacyPolicyStatus:'REVIEW_REQUIRED'
  });

  const SECTIONS=Object.freeze([
    {id:'about',title:'1. About Zorifi',body:['Zorifi is a video-editing application designed to help creators edit supported video, images, audio and other media. It includes editing tools, AI-assisted features, templates and effects where available, export tools, and Vanessa—Zorifi’s AI-assisted creative and support partner.','Zorifi is under active development, so features may change as the product develops. These product Terms should be reviewed and updated by the Zorifi owner or legal adviser before wider release.']},
    {id:'eligibility',title:'2. Eligibility',body:['You must provide accurate account information and comply with the age requirements and laws that apply where you live. Zorifi’s final minimum-age policy has not yet been legally approved and remains a configurable product requirement.']},
    {id:'acceptable-use',title:'3. Acceptable use',body:['You must not use Zorifi to break applicable laws, harm or impersonate people, distribute malicious software, compromise accounts or internal systems, bypass security controls, abuse support, deliberately overload the service, interfere with another user’s projects or data, or misuse Vanessa outside her authorised capabilities.']},
    {id:'content',title:'4. Your content',body:['You remain responsible for the videos, photographs, audio, text, logos and other material you import. You must have the rights or permission needed to use that material. Zorifi does not claim ownership of your original content merely because you edit it using Zorifi.']},
    {id:'vanessa',title:'5. AI and Vanessa',body:['Vanessa is an AI-assisted feature that can understand supported natural-language editing requests, provide guidance, assist with authorised editing actions, diagnose supported problems, and help with customer support. Vanessa is not infallible; review important edits and exported results.','Vanessa receives only the capabilities allowed by Zorifi’s controlled architecture. She does not have unrestricted access to source code, private files, credentials, external systems or your entire device.']},
    {id:'support',title:'6. Support',body:['Vanessa is Zorifi’s first-line support assistant. When she cannot safely resolve an issue, Zorifi may create a case for human review using a case ID, category, severity, reproduction information, safe runtime diagnostics, expected and actual behaviour, and relevant conversation context.','Sensitive information is filtered through the existing support system. Zorifi does not claim that an escalation email was sent unless delivery was actually confirmed.']},
    {id:'beta',title:'7. Controlled Beta disclosure',important:true,body:['Zorifi 3.37.0 is a controlled pre-release Beta. You may encounter bugs, incomplete features, unexpected behaviour, performance problems, platform-specific limitations, changing features or temporary service limitations.','Your feedback helps Zorifi identify and correct problems before wider release. Beta participation remains recorded internally for diagnostics, tester identification, reporting and lifecycle management.']},
    {id:'local-data',title:'8. Local storage and device limitations',important:true,body:['Projects, imported media, sessions and relevant Vanessa history may remain local to this device and browser or application profile. Automatic cloud synchronisation between Windows, macOS, Linux, iPhone, iPad, Android, browsers or other devices is not currently provided.','Changing device or profile, clearing application data, or browser storage eviction may make locally stored work unavailable. Keep copies of important source media and exports.']},
    {id:'exports',title:'9. Exports',body:['Review exported files before publishing or distributing them. Zorifi cannot promise that every export will succeed or be compatible with every external platform. Genuine export failures must be reported instead of being represented as successful.']},
    {id:'third-parties',title:'10. Third-party services',body:['Some capabilities depend on external AI, email, payment, cloud or other providers. Their availability and terms may affect Zorifi. A provider is not treated as active unless it is actually configured, and provider credentials are never displayed in this agreement.']},
    {id:'security',title:'11. Accounts and security',body:['You are responsible for keeping your account credentials secure. Do not attempt to access another user’s account or data. Zorifi continues to use its existing account-isolation and security controls.']},
    {id:'payments',title:'12. Zorifi Pro and payments',body:['Zorifi Pro and payment availability depends on verified billing infrastructure. A plan change is not complete unless Zorifi’s entitlement system confirms it. No payment feature or successful upgrade is implied by this agreement.']},
    {id:'availability',title:'13. Availability and changes',body:['Zorifi is under active development. Features may be changed, improved, temporarily unavailable, removed or replaced. Uninterrupted availability is not promised.']},
    {id:'restrictions',title:'14. Account restrictions',body:['Accounts may be restricted or terminated where necessary for serious misuse, security abuse, unlawful use, attempts to compromise the service, or material violations of these Terms. This agreement does not itself perform any account deletion or restriction.']},
    {id:'feedback',title:'15. Feedback',body:['You may submit feedback, bug reports and feature suggestions to help improve Zorifi. Submitting feedback does not transfer ownership of your original creative content or ideas beyond permissions that may later be set out in legally reviewed terms.']},
    {id:'contact',title:'16. Contact and support',body:[`Support is available through Zorifi’s Help & Support system. Unresolved matters may be escalated for human review at ${CONFIG.supportEmail}; delivery is only confirmed when the configured support provider confirms it.`]}
  ]);

  const clean=(value,max=160)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const validTimestamp=value=>typeof value==='string'&&!Number.isNaN(Date.parse(value));

  class AcceptanceStore{
    constructor({storage=null,userId='guest',namespace=CONFIG.storageNamespace}={}){
      this.storage=storage;this.userId=clean(userId,100)||'guest';this.key=`${namespace}:${encodeURIComponent(this.userId)}`;this.data=this.read();
    }
    read(){
      try{
        const saved=JSON.parse(this.storage?.getItem(this.key)||'{}'),history=Array.isArray(saved.history)?saved.history:[];
        return {schema:'zorifi.terms/1',history:history.filter(item=>item&&clean(item.userId,100)===this.userId&&clean(item.version,40)&&validTimestamp(item.acceptedAt)).slice(-12).map(item=>({version:clean(item.version,40),acceptedAt:new Date(item.acceptedAt).toISOString(),userId:this.userId,betaVersion:clean(item.betaVersion,40)||null}))};
      }catch{return {schema:'zorifi.terms/1',history:[]};}
    }
    save(){this.storage?.setItem(this.key,JSON.stringify(this.data));return this.inspect();}
    accepted(version=CONFIG.version){return this.data.history.some(item=>item.version===clean(version,40));}
    current(version=CONFIG.version){return clone(this.data.history.findLast?.(item=>item.version===clean(version,40))||[...this.data.history].reverse().find(item=>item.version===clean(version,40))||null);}
    accept({version=CONFIG.version,betaVersion=null,acceptedAt=new Date().toISOString()}={}){
      const normalizedVersion=clean(version,40);if(!normalizedVersion)throw new Error('A Terms version is required.');
      const timestamp=new Date(acceptedAt);if(Number.isNaN(timestamp.getTime()))throw new Error('A valid acceptance timestamp is required.');
      const record={version:normalizedVersion,acceptedAt:timestamp.toISOString(),userId:this.userId,betaVersion:clean(betaVersion,40)||null};
      this.data.history=this.data.history.filter(item=>item.version!==record.version);this.data.history.push(record);this.data.history=this.data.history.slice(-12);this.save();return clone(record);
    }
    requiresAcceptance(version=CONFIG.version){return !this.accepted(version);}
    history(){return clone(this.data.history);}
    inspect(){return {currentVersion:CONFIG.version,accepted:this.accepted(),current:this.current(),history:this.history()};}
  }

  const agreementDate=(record=null,locale='en-GB')=>new Intl.DateTimeFormat(locale,{dateStyle:'long'}).format(new Date(record?.acceptedAt||Date.now()));
  return {CONFIG,SECTIONS,AcceptanceStore,agreementDate};
});
