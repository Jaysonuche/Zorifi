import {createPublicKey,verify} from 'node:crypto';
import {OpenAIServiceError} from './openai-responses.mjs';
const env=n=>globalThis.Netlify?.env?.get?.(n)||process.env[n]||'';
let cached=null;
export async function verifyAppCheck(request){
 const token=request.headers.get('x-firebase-appcheck');
 const denied=()=>new OpenAIServiceError('A valid app-attestation token is required.',403,'APP_CHECK_REQUIRED');
 if(!token||token.length>12000)throw denied();const pieces=token.split('.');if(pieces.length!==3)throw denied();let header,claims;try{header=JSON.parse(Buffer.from(pieces[0],'base64url'));claims=JSON.parse(Buffer.from(pieces[1],'base64url'));}catch{throw denied();}
 const appId=env('FIREBASE_APP_ID'),project=env('FIREBASE_PROJECT_NUMBER')||appId.match(/^1:(\d+):/)?.[1],now=Math.floor(Date.now()/1000);
 if(!project||!appId)throw new OpenAIServiceError('Configure the Firebase app identity for attestation.',503,'APP_CHECK_NOT_CONFIGURED');
 if(header.alg!=='RS256'||header.typ!=='JWT'||typeof header.kid!=='string'||header.kid.length>200||claims.iss!=='https://firebaseappcheck.googleapis.com/'+project||!Array.isArray(claims.aud)||!claims.aud.includes('projects/'+project)||claims.sub!==appId||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+120)throw denied();
 if(!cached||cached.until<Date.now()){
  let response;try{response=await fetch('https://firebaseappcheck.googleapis.com/v1/jwks',{redirect:'error',signal:AbortSignal.timeout(5000)});const data=await response.json();if(!response.ok||!Array.isArray(data.keys)||data.keys.length>20)throw Error();cached={keys:data.keys,until:Date.now()+300000};}catch{throw new OpenAIServiceError('App attestation verification is temporarily unavailable.',503,'APP_CHECK_UNAVAILABLE');}
 }
 const jwk=cached.keys.find(key=>key.kid===header.kid&&key.kty==='RSA'&&(!key.alg||key.alg==='RS256'));if(!jwk)throw denied();try{const key=createPublicKey({key:jwk,format:'jwk'});if(!verify('RSA-SHA256',Buffer.from(pieces[0]+'.'+pieces[1]),key,Buffer.from(pieces[2],'base64url')))throw denied();}catch{throw denied();}
 return {appId};
}
