(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){
    const controller=api.createThemeController({window:root,document:root.document,storage:root.localStorage});
    controller.start();
    root.ZorifiTheme={...api,controller};
  }
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const STORAGE_KEY='zorifi-theme-preference-v1';
  const PREFERENCES=Object.freeze(['system','light','dark']);
  const isPreference=value=>PREFERENCES.includes(value);
  const safeGet=storage=>{try{const value=storage?.getItem(STORAGE_KEY);return isPreference(value)?value:'system';}catch{return 'system';}};
  const resolveTheme=(preference,systemDark)=>preference==='system'?(systemDark?'dark':'light'):preference;
  function createThemeController(options={}){
    const win=options.window;
    const doc=options.document;
    const storage=options.storage;
    const media=win?.matchMedia?.('(prefers-color-scheme: dark)')||null;
    let preference=safeGet(storage),started=false;
    const systemDark=()=>Boolean(media?.matches);
    const apply=()=>{
      const resolved=resolveTheme(preference,systemDark());
      if(doc?.documentElement){
        doc.documentElement.dataset.theme=resolved;
        doc.documentElement.dataset.themePreference=preference;
        doc.documentElement.style.colorScheme=resolved;
      }
      const meta=doc?.querySelector?.('meta[name="theme-color"]');
      meta?.setAttribute?.('content',resolved==='dark'?'#090b10':'#f4f6fb');
      return {preference,resolved,systemDark:systemDark()};
    };
    const onSystemChange=()=>{if(preference==='system')apply();};
    return {
      start(){if(!started){media?.addEventListener?.('change',onSystemChange);media?.addListener?.(onSystemChange);started=true;}return apply();},
      stop(){if(started){media?.removeEventListener?.('change',onSystemChange);media?.removeListener?.(onSystemChange);started=false;}},
      setPreference(value){if(!isPreference(value))throw new Error('Choose System, Light, or Dark appearance.');preference=value;try{storage?.setItem(STORAGE_KEY,value);}catch{}return apply();},
      getPreference:()=>preference,
      snapshot:()=>({preference,resolved:resolveTheme(preference,systemDark()),systemDark:systemDark()})
    };
  }
  return {STORAGE_KEY,PREFERENCES,isPreference,resolveTheme,createThemeController};
});
