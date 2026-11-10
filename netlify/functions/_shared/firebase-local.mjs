// Emulators are an explicit loopback-only demo-project mode, never auth fallback.
const env=n=>globalThis.Netlify?.env?.get?.(n)||process.env[n]||'';
export function localFirebase(request){
 const enabled=env('ZORIFI_FIREBASE_EMULATORS')==='true';if(!enabled)return null;
 const hostname=new URL(request.url).hostname;
 if(env('NODE_ENV')==='production'||env('VERCEL')||env('NETLIFY')||!['localhost','127.0.0.1','[::1]'].includes(hostname)||!/^demo-[a-z0-9-]+$/.test(env('FIREBASE_PROJECT_ID')))throw Object.assign(Error('Firebase emulators are allowed only on a local demo project.'),{status:503,code:'UNSAFE_EMULATOR_CONFIG'});
 const host=(name,fallback)=>{const value=env(name)||fallback;if(!/^(?:127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(value))throw Object.assign(Error('Emulators must use a loopback address.'),{status:503,code:'UNSAFE_EMULATOR_CONFIG'});return 'http://'+value;};
 return {project:env('FIREBASE_PROJECT_ID'),auth:host('FIREBASE_AUTH_EMULATOR_HOST','127.0.0.1:9099'),firestore:host('FIRESTORE_EMULATOR_HOST','127.0.0.1:8085')};
}
