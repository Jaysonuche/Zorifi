(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ZorifiGoogleConnections=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const READ='https://www.googleapis.com/auth/gmail.readonly',SEND='https://www.googleapis.com/auth/gmail.send';
  const cleanHeader=value=>{if(typeof value!=='string'||/[\r\n\x00]/.test(value))throw new Error('Use a single-line email header.');return value.trim();};
  function emailAddress(value){const text=cleanHeader(value);if(text.length>254||!/^[-.!#$%&'*+/=?^_`{|}~a-zA-Z0-9]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(text))throw new Error('Enter one valid recipient email address.');return text;}
  function base64(value){if(typeof Buffer!=='undefined')return Buffer.from(value,'utf8').toString('base64');const bytes=new TextEncoder().encode(value);let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);}
  function rawMessage({to,subject,body}){to=emailAddress(to);subject=cleanHeader(subject);if(!subject||subject.length>200||typeof body!=='string'||!body.trim()||body.length>30000)throw new Error('Add a subject and message of up to 30,000 characters.');const mime=`To: ${to}\r\nSubject: =?UTF-8?B?${base64(subject)}?=\r\nMIME-Version:1.0\r\nContent-Type:text/plain; charset=UTF-8\r\nContent-Transfer-Encoding:8bit\r\n\r\n${body}`;return base64(mime).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function plainText(part){if(!part||typeof part!=='object')return '';const chunks=[];const visit=(p,depth=0)=>{if(depth>8)return;if(p.mimeType==='text/plain'&&p.body?.data){try{const b64=p.body.data.replace(/-/g,'+').replace(/_/g,'/');chunks.push(typeof Buffer!=='undefined'?Buffer.from(b64,'base64').toString('utf8'):new TextDecoder().decode(Uint8Array.from(atob(b64),c=>c.charCodeAt(0))));}catch{}}for(const child of (p.parts||[]).slice(0,30))visit(child,depth+1);};visit(part);return chunks.join('\n').slice(0,30000);}
  class GmailClient{
    constructor({owner,getOwner,transport=root.fetch?.bind(root)}={}){this.owner=owner;this.getOwner=getOwner;this.transport=transport;this.token='';this.scopes=new Set();this.expiresAt=0;this.controller=new AbortController();this.epoch=0;}
    guard(){if(!this.owner||this.getOwner?.()!==this.owner){this.disconnect();throw new Error('Your Zorifi account changed. Reconnect Gmail.');}if(!this.token||Date.now()>=this.expiresAt)throw new Error('Reconnect Gmail to continue. Google email access expires automatically.');}
    grant(result){if(this.getOwner?.()!==this.owner)throw new Error('Your Zorifi account changed.');if(!result?.access_token||result.error||!Number.isFinite(Number(result.expires_in))||Number(result.expires_in)<=0)throw new Error('Google did not grant email access.');this.disconnect();this.token=result.access_token;this.scopes=new Set(String(result.scope||'').split(/\s+/));this.expiresAt=Date.now()+Math.min(3600,Number(result.expires_in))*1000;}
    async request(path,{method='GET',body,scope=READ}={}){
      this.guard();if(!this.scopes.has(scope))throw new Error(scope===SEND?'Allow Send email before sending a message.':'Allow Read email to open Gmail.');
      if(!/^\/(?:profile|messages(?:\/[A-Za-z0-9_-]+)?)(?:\?(?:maxResults=10|format=full|format=metadata))?$/.test(path)||(method!=='GET'&&!(method==='POST'&&path==='/messages/send'&&scope===SEND)))throw new Error('Unsupported Gmail operation.');
      const epoch=this.epoch,signal=this.controller.signal,assertCurrent=()=>{this.guard();if(this.epoch!==epoch||signal.aborted)throw new Error('Gmail connection changed.');};
      const response=await this.transport('https://gmail.googleapis.com/gmail/v1/users/me'+path,{method,headers:{Authorization:'Bearer '+this.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal});assertCurrent();
      if(response.status===401){this.disconnect();throw new Error('Google email access expired. Reconnect Gmail.');}if(!response.ok)throw new Error('Gmail could not complete this request. Check the permission and retry.');const data=await response.json();assertCurrent();return data;
    }
    profile(){return this.request('/profile');}
    list(){return this.request('/messages?maxResults=10');}
    read(id){if(!/^[A-Za-z0-9_-]{1,150}$/.test(id))throw new Error('Invalid Gmail message.');return this.request('/messages/'+id+'?format=full');}
    metadata(id){if(!/^[A-Za-z0-9_-]{1,150}$/.test(id))throw new Error('Invalid Gmail message.');return this.request('/messages/'+id+'?format=metadata');}
    send(draft){return this.request('/messages/send',{method:'POST',scope:SEND,body:{raw:rawMessage(draft)}});}
    disconnect(){this.epoch++;this.controller.abort();this.controller=new AbortController();this.token='';this.scopes.clear();this.expiresAt=0;}
  }
  return {READ,SEND,GmailClient,emailAddress,rawMessage,plainText};
});
