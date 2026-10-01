(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiBetaProgram=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CONFIG=Object.freeze({enabled:true,version:'3.37.0',supportEmail:'zorifvideoeditor@gmail.com',mode:'CONTROLLED_BETA'});
  const CHECKLIST=Object.freeze([
    {id:'import-video',group:'Core editing',label:'Import a real video'},
    {id:'import-image',group:'Core editing',label:'Import an image'},
    {id:'import-audio',group:'Core editing',label:'Import WAV or other supported audio'},
    {id:'reject-duplicate',group:'Core editing',label:'Confirm duplicate media is rejected'},
    {id:'reject-malformed',group:'Core editing',label:'Confirm malformed media fails safely'},
    {id:'split',group:'Core editing',label:'Split a timeline clip'},
    {id:'text',group:'Core editing',label:'Add and edit text'},
    {id:'effects',group:'Core editing',label:'Apply an effect and change its parameters'},
    {id:'undo-redo',group:'Core editing',label:'Undo and redo a real edit'},
    {id:'timeline',group:'Core editing',label:'Move, trim, zoom and scrub the timeline'},
    {id:'export',group:'Core editing',label:'Export and open a real output file'},
    {id:'vanessa-chat',group:'Vanessa',label:'Have a normal conversation'},
    {id:'vanessa-edit',group:'Vanessa',label:'Run a supported editor request and verify the result'},
    {id:'vanessa-permission',group:'Vanessa',label:'Check permission or confirmation behavior'},
    {id:'vanessa-recovery',group:'Vanessa',label:'Undo or recover a Vanessa edit where supported'},
    {id:'reload-project',group:'Persistence',label:'Reload and reopen the same project'},
    {id:'session-history',group:'Persistence',label:'Verify login session and Vanessa history persist'},
    {id:'support-persistence',group:'Persistence',label:'Verify a support case survives reload'},
    {id:'support-report',group:'Support',label:'Submit a beta test report and view its status'},
    {id:'responsive',group:'Platform',label:'Check controls at this screen size/orientation'},
    {id:'touch-browser',group:'Platform',label:'Check touch or browser behavior where applicable'}
  ]);
  const REPORT_CATEGORIES=Object.freeze(['BUG','FEATURE_UX','PERFORMANCE','VANESSA','EXPORT','IMPORT','OTHER']);
  const SEVERITIES=Object.freeze(['RED','YELLOW','GREEN']);
  const REPRODUCIBILITY=Object.freeze(['ALWAYS','OFTEN','SOMETIMES','ONCE','UNKNOWN']);
  const clean=(value,max=1000)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const random=()=>{try{return crypto.randomUUID();}catch{return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;}};
  const testerId=()=>`ZB-${random().replace(/[^a-z0-9]/gi,'').slice(0,16).toUpperCase()}`;
  function platformInfo({userAgent='',platform='',width=0,maxTouchPoints=0,standalone=false}={}){
    const ua=String(userAgent),ipad=/iPad/i.test(ua)||(platform==='MacIntel'&&maxTouchPoints>1),iphone=/iPhone|iPod/i.test(ua),android=/Android/i.test(ua),mobile=iphone||android&&/Mobile/i.test(ua)||Number(width)<=760;
    return {kind:ipad?'iPad PWA/Web':iphone?'iPhone PWA/Web':android?'Android PWA/Web':/Win/i.test(platform||ua)?'Windows':/Mac/i.test(platform||ua)?'macOS Web/Desktop':/Linux/i.test(platform||ua)?'Linux Web/Desktop':mobile?'Mobile Web/PWA':'Web/Desktop',native:false,installed:Boolean(standalone)};
  }
  class BetaState{
    constructor({storage=null,userId='guest',namespace='zorifi-controlled-beta-v1'}={}){this.storage=storage;this.userId=clean(userId,100)||'guest';this.key=`${namespace}:${encodeURIComponent(this.userId)}`;this.data=this.read();}
    read(){try{const value=JSON.parse(this.storage?.getItem(this.key)||'{}');return {testerId:clean(value.testerId,40)||testerId(),acknowledgedVersion:clean(value.acknowledgedVersion,30),acknowledgedAt:clean(value.acknowledgedAt,50),checklist:value.checklist&&typeof value.checklist==='object'?value.checklist:{}};}catch{return {testerId:testerId(),acknowledgedVersion:'',acknowledgedAt:'',checklist:{}};}}
    save(){this.storage?.setItem(this.key,JSON.stringify({schema:'zorifi.beta/1',...this.data}));return this.snapshot();}
    ensure(){this.save();return this.snapshot();}
    acknowledged(version=CONFIG.version){return this.data.acknowledgedVersion===version;}
    acknowledge(version=CONFIG.version){this.data.acknowledgedVersion=clean(version,30);this.data.acknowledgedAt=new Date().toISOString();return this.save();}
    setChecklist(id,complete){if(!CHECKLIST.some(item=>item.id===id))throw new Error('Unknown beta checklist item.');this.data.checklist[id]=Boolean(complete);return this.save();}
    resetChecklist(){this.data.checklist={};return this.save();}
    snapshot(){return JSON.parse(JSON.stringify(this.data));}
  }
  function reportInput(input={},runtime={}){
    const category=REPORT_CATEGORIES.includes(input.category)?input.category:'OTHER',severity=SEVERITIES.includes(input.severity)?input.severity:'YELLOW',reproducibility=REPRODUCIBILITY.includes(input.reproducibility)?input.reproducibility:'UNKNOWN';
    return {beta:true,title:clean(input.title,160),description:clean(input.description,3000),stepsToReproduce:clean(input.stepsToReproduce,3000),expectedResult:clean(input.expectedResult,2000),actualResult:clean(input.actualResult,2000),userSeverity:severity,reproducibility,platform:clean(input.platform||runtime.platform,120),runtime:clean(input.runtime||runtime.runtime,240),browser:clean(input.browser||runtime.browser,160),version:CONFIG.version,testIdentifier:clean(input.testIdentifier,120),testerId:clean(runtime.testerId,60),betaCategory:category};
  }
  return {CONFIG,CHECKLIST,REPORT_CATEGORIES,SEVERITIES,REPRODUCIBILITY,BetaState,platformInfo,reportInput};
});
