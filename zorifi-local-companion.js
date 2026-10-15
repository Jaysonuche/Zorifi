(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZorifiLocalCompanion=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const BASE='http://127.0.0.1:47321';

  async function companionFetch(path,{method='GET',payload,signal,timeoutMs=10000}={}){
    const controller=new AbortController();
    const abort=()=>controller.abort();
    if(signal?.aborted)controller.abort();
    else signal?.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(abort,timeoutMs);
    try{
      const response=await root.fetch(BASE+path,{
        method,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
        targetAddressSpace:'loopback',signal:controller.signal,
        ...(payload===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      });
      let data;
      try{data=await response.json();}catch{throw new Error('The Zorifi desktop companion returned an unreadable response.');}
      if(!response.ok)throw new Error(typeof data?.error==='string'?data.error:'The Zorifi desktop companion could not complete the request.');
      return data;
    }catch(error){
      if(signal?.aborted)throw error;
      if(controller.signal.aborted)throw new Error('The Zorifi desktop companion did not respond in time.');
      if(error instanceof TypeError)throw new Error('Open Zorifi on this computer and allow local network access in your browser, then reconnect.');
      throw error;
    }finally{
      clearTimeout(timeout);
      signal?.removeEventListener('abort',abort);
    }
  }

  async function probe({signal}={}){
    const data=await companionFetch('/api/ai-settings',{signal,timeoutMs:3000});
    const music=data?.configurations?.music;
    if(music?.provider!=='Local CPU'||music.configured!==true)throw new Error('The local music model is unavailable in the Zorifi desktop app.');
    return music;
  }

  function request(payload,{signal}={}){
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||!['start','status','cancel'].includes(payload.action))throw new Error('Invalid local music request.');
    return companionFetch('/api/vanessa-music',{method:'POST',payload,signal,timeoutMs:15000});
  }

  return Object.freeze({BASE,probe,request});
});
