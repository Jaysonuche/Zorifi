const { app, BrowserWindow, shell, safeStorage, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createLocalMediaJobs } = require('./scripts/local-media-jobs.cjs');
const {LANGUAGE_SERVICES, validFirebaseWebConfig, hostedFirebaseWebConfig, firebaseConfigScript, hostedLanguageConfiguration, relayHostedLanguage} = require('./scripts/hosted-language-gateway.cjs');

app.setName('Zorifi');
if(process.env.ZORIFI_SMOKE_DATA){fs.mkdirSync(process.env.ZORIFI_SMOKE_DATA,{recursive:true});app.setPath('userData',process.env.ZORIFI_SMOKE_DATA);app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('no-sandbox');app.commandLine.appendSwitch('disable-gpu-sandbox');}
if(process.env.ZORIFI_SMOKE_PORT&&/^\d{4,5}$/.test(process.env.ZORIFI_SMOKE_PORT))app.commandLine.appendSwitch('remote-debugging-port',process.env.ZORIFI_SMOKE_PORT);
const LOCAL_PORT = process.env.ZORIFI_SMOKE_PORT ? Number(process.env.ZORIFI_SMOKE_PORT)+1 : 47321;
// Runtime verification uses its own isolated profile and must not be blocked by
// a user-owned Zorifi window that is already open.
const singleInstanceLock = process.env.ZORIFI_SMOKE_DATA ? true : app.requestSingleInstanceLock();
if (!singleInstanceLock) app.quit();

const root = __dirname;
// Browser asset allowlist family: zorifi-vanessa-creative-intent.js,
// zorifi-vanessa-capability-planner.js, zorifi-vanessa-creative-plan.js,
// zorifi-vanessa-creative-conversation.js, zorifi-vanessa-creative-verification.js,
// zorifi-vanessa-creative-pipeline.js. The server admits this bounded family below.
const functionFiles = new Map([
  ['vanessa', 'vanessa.mjs'],
  ['vanessa-video', 'vanessa-video.mjs'],
  ['vanessa-video-tool','vanessa-motion', 'vanessa-motion.mjs'],
  ['vanessa-image', 'vanessa-image.mjs'],
  ['vanessa-music', 'vanessa-music.mjs'],
  ['vanessa-stems', 'vanessa-stems.mjs'],
  ['vanessa-voice', 'vanessa-voice.mjs'],
  ['vanessa-language', 'vanessa-language.mjs'],
  ['vanessa-global', 'vanessa-global.mjs'],
  ['vanessa-provider-test', 'vanessa-provider-test.mjs'],
  ['vanessa-scene-image', 'vanessa-scene-image.mjs'],
  ['vanessa-speech', 'vanessa-speech.mjs'],
  ['vanessa-captions', 'vanessa-captions.mjs'],
  ['vanessa-scenes', 'vanessa-scenes.mjs']
  ,['support-email', 'support-email.mjs']
]);
const providerServices=new Set(functionFiles.keys());
const mimeTypes = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav'};
let localServer;
let localOrigin='';
let mainWindow=null;
let firebasePublicConfig=null;
// The desktop and the browser preview share the installed model cache. Keep
// this local provider separate from any saved hosted music credentials.
const localMusic = createLocalMediaJobs({env:{...process.env,ZORIFI_MUSIC_PROVIDER:'local'}});
const companionOrigin = (()=>{
  const value=process.env.ZORIFI_COMPANION_ORIGIN||'https://zorifi.vercel.app';
  try { const url=new URL(value); return url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash ? url.origin : ''; } catch { return ''; }
})();
function desktopUsesLocalMusic(){return process.env.ZORIFI_MUSIC_PROVIDER==='local'||(process.env.ZORIFI_MUSIC_PROVIDER!=='hosted'&&localMusic.ready('music'));}
function hasDesktopLanguageKey(){return Boolean(secretFromConfig('GEMINI_API_KEY')||secretFromConfig('AI_PROVIDER_KEY')||secretFromConfig('OPENAI_LANGUAGE_API_KEY')||secretFromConfig('OPENAI_API_KEY'));}
function companionRoute(pathname,method){return pathname==='/api/ai-settings'&&['GET','OPTIONS'].includes(method)||pathname==='/api/vanessa-music'&&['POST','OPTIONS'].includes(method);}
function companionHeaders(response,origin){response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');response.setHeader('Access-Control-Allow-Headers','Content-Type');response.setHeader('Access-Control-Allow-Private-Network','true');response.setHeader('Vary','Origin');}

function configPath(){return path.join(app.getPath('userData'),'vanessa-ai.bin');}
function firebasePublicConfigPath(){return path.join(app.getPath('userData'),'firebase-public-config.json');}
async function loadFirebasePublicConfig(){
  try{const cached=JSON.parse(fs.readFileSync(firebasePublicConfigPath(),'utf8'));if(validFirebaseWebConfig(cached))firebasePublicConfig=cached;}catch{}
  const hosted=await hostedFirebaseWebConfig();
  if(hosted){firebasePublicConfig=hosted;try{fs.writeFileSync(firebasePublicConfigPath(),JSON.stringify(hosted),'utf8');}catch{}}
}
function usagePath(){return path.join(app.getPath('userData'),'vanessa-provider-usage.json');}
function secureStorageState(){
  const encrypted=Boolean(safeStorage.isEncryptionAvailable());
  let backend=process.platform==='darwin'?'Keychain':process.platform==='win32'?'DPAPI':'unknown';
  if(process.platform==='linux'&&typeof safeStorage.getSelectedStorageBackend==='function')backend=safeStorage.getSelectedStorageBackend();
  const safe=encrypted&&backend!=='basic_text';
  return {available:safe,platform:process.platform,backend};
}
function readEncryptedConfig(){try{return JSON.parse(fs.readFileSync(configPath(),'utf8'));}catch{return {};}}
function secretFromConfig(name){
  if(process.env[name])return process.env[name];
  const value=readEncryptedConfig()[name];
  if(!value||!secureStorageState().available)return name==='ZORIFI_SUPPORT_EMAIL'?'zorifvideoeditor@gmail.com':'';
  try{return safeStorage.decryptString(Buffer.from(value,'base64'));}catch{return '';}
}
function saveSecrets(values){
  const storage=secureStorageState();
  if(!storage.available)throw new Error(process.platform==='linux'&&storage.backend==='basic_text'?'Secure credential storage is unavailable because this Linux session has no supported keyring. Install or unlock GNOME Keyring/libsecret or KWallet, then restart Zorifi.':'Operating-system secure credential storage is not available on this device.');
  const current=readEncryptedConfig();
  for(const [name,value] of Object.entries(values)){
    if(value===null||value===undefined)continue;
    if(value==='')delete current[name];
    else current[name]=safeStorage.encryptString(value).toString('base64');
  }
  fs.writeFileSync(configPath(),JSON.stringify(current),'utf8');
}
function ensureProviderIdentity(){
  return {name:'Vanessa AI Provider',id:'vanessa-local'};
}
function readProviderUsage(){try{return JSON.parse(fs.readFileSync(usagePath(),'utf8'));}catch{return {total:0,successful:0,failed:0,services:{},recent:[]};}}
function recordProviderUsage(service,status,startedAt){
  const usage=readProviderUsage(),successful=status>=200&&status<400,entry={service,status,successful,at:new Date().toISOString(),durationMs:Date.now()-startedAt};usage.total=(usage.total||0)+1;usage.successful=(usage.successful||0)+(successful?1:0);usage.failed=(usage.failed||0)+(successful?0:1);usage.services=usage.services||{};usage.services[service]=(usage.services[service]||0)+1;usage.recent=[entry,...(usage.recent||[])].slice(0,50);try{fs.writeFileSync(usagePath(),JSON.stringify(usage,null,2),'utf8');}catch{}
}
function json(response,status,body){response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(body));}
function readBody(request,limit=32*1024*1024){return new Promise((resolve,reject)=>{let size=0,chunks=[];request.on('data',chunk=>{size+=chunk.length;if(size>limit){reject(new Error('Request is too large.'));request.destroy();return;}chunks.push(chunk);});request.on('end',()=>resolve(Buffer.concat(chunks)));request.on('error',reject);});}
async function handleSettings(request,response){
  if(request.method==='GET'){
    if(request.headers.origin===companionOrigin){
      const music=localMusic.configuration('music');
      return json(response,200,{server:'Zorifi local companion',musicConfigured:music.configured,configurations:{music}});
    }
    const gpuConfigured=Boolean(secretFromConfig('VANESSA_GPU_URL')&&secretFromConfig('VANESSA_GPU_KEY')),xaiConfigured=Boolean(secretFromConfig('XAI_API_KEY')),legacyOpenAi=Boolean(secretFromConfig('OPENAI_API_KEY')),imageConfigured=Boolean(secretFromConfig('OPENAI_IMAGE_API_KEY'))||legacyOpenAi,languageConfigured=Boolean(secretFromConfig('OPENAI_LANGUAGE_API_KEY'))||legacyOpenAi,musicConfigured=Boolean(secretFromConfig('VANESSA_MUSIC_URL')&&secretFromConfig('VANESSA_MUSIC_KEY')),voiceConfigured=Boolean(secretFromConfig('ELEVENLABS_API_KEY')&&secretFromConfig('VANESSA_VOICE_ID'));
    const settings={server:'Vanessa AI Provider',provider:ensureProviderIdentity(),usage:readProviderUsage(),secureStorage:secureStorageState(),supportEmailConfigured:Boolean(secretFromConfig('GMAIL_ACCESS_TOKEN')&&secretFromConfig('ZORIFI_SUPPORT_EMAIL')),gpuConfigured,gpuUrl:secretFromConfig('VANESSA_GPU_URL')||'',gpuModel:secretFromConfig('VANESSA_GPU_MODEL')||'Wan-AI/Wan2.1-T2V-1.3B-Diffusers',musicConfigured,musicUrl:secretFromConfig('VANESSA_MUSIC_URL')||'',musicModel:secretFromConfig('VANESSA_MUSIC_MODEL')||'',xaiConfigured,openAiConfigured:imageConfigured||languageConfigured,imageConfigured,languageConfigured,voiceConfigured,configurations:{image:{provider:'OpenAI',model:secretFromConfig('VANESSA_IMAGE_MODEL')||'gpt-image-2',configured:imageConfigured,supported:['text-to-image','image-variation']},video:{provider:gpuConfigured?'Vanessa GPU':xaiConfigured?'xAI':'not configured',model:gpuConfigured?secretFromConfig('VANESSA_GPU_MODEL')||'Wan-AI/Wan2.1-T2V-1.3B-Diffusers':secretFromConfig('VANESSA_VIDEO_MODEL')||'grok-imagine-video-1.5',configured:gpuConfigured||xaiConfigured,supported:['text-to-video','image-to-video','reference-video']},music:{provider:musicConfigured?'Custom compatible provider':'not configured',model:secretFromConfig('VANESSA_MUSIC_MODEL')||'',configured:musicConfigured,supported:['text-to-music','variations']},voice:{provider:voiceConfigured?'ElevenLabs':'not configured',model:secretFromConfig('VANESSA_VOICE_MODEL')||'eleven_multilingual_v2',configured:voiceConfigured,supported:['text-to-speech','multilingual-voice']},language:{provider:'OpenAI',model:secretFromConfig('VANESSA_MODEL')||'gpt-5-nano',configured:languageConfigured,supported:['reasoning','scripts','hooks','storyboards','translation']}}};
    if(!hasDesktopLanguageKey()){
      const hostedLanguage=await hostedLanguageConfiguration();
      settings.configurations.language=hostedLanguage||{provider:'Zorifi Cloud',model:'',configured:false,supported:['reasoning','scripts','hooks','storyboards','translation']};
      settings.languageConfigured=Boolean(hostedLanguage);
      settings.hostedLanguage=true;
    }else if(secretFromConfig('GEMINI_API_KEY')){
      settings.configurations.language={provider:'Gemini',model:secretFromConfig('GEMINI_MODEL')||'gemini-3.8-flash',configured:true,supported:['reasoning','scripts','hooks','storyboards','translation']};
      settings.languageConfigured=true;
    }else if(secretFromConfig('AI_PROVIDER_KEY')){
      settings.configurations.language={provider:'OpenRouter',model:secretFromConfig('AI_PROVIDER_MODEL')||'openrouter/free',configured:true,supported:['reasoning','scripts','hooks','storyboards','translation']};
      settings.languageConfigured=true;
    }
    if(desktopUsesLocalMusic()){
      const music=localMusic.configuration('music');
      settings.musicConfigured=music.configured;
      settings.musicUrl='';
      settings.musicModel=music.model;
      settings.configurations.music=music;
    }
    return json(response,200,settings);
  }
  if(request.method!=='POST')return json(response,405,{error:'Method not allowed.'});
  try{
    const body=JSON.parse((await readBody(request,128*1024)).toString('utf8')||'{}'),values={};
    if(Object.prototype.hasOwnProperty.call(body,'xaiKey'))values.XAI_API_KEY=String(body.xaiKey||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'openAiKey'))values.OPENAI_API_KEY=String(body.openAiKey||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'imageKey'))values.OPENAI_IMAGE_API_KEY=String(body.imageKey||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'languageKey'))values.OPENAI_LANGUAGE_API_KEY=String(body.languageKey||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'elevenLabsKey'))values.ELEVENLABS_API_KEY=String(body.elevenLabsKey||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'voiceId'))values.VANESSA_VOICE_ID=String(body.voiceId||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'gpuUrl'))values.VANESSA_GPU_URL=String(body.gpuUrl||'').trim().replace(/\/+$/,'');
    if(Object.prototype.hasOwnProperty.call(body,'gpuKey'))values.VANESSA_GPU_KEY=String(body.gpuKey||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'gpuModel'))values.VANESSA_GPU_MODEL=String(body.gpuModel||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'musicUrl'))values.VANESSA_MUSIC_URL=String(body.musicUrl||'').trim().replace(/\/+$/,'');
    if(Object.prototype.hasOwnProperty.call(body,'musicKey'))values.VANESSA_MUSIC_KEY=String(body.musicKey||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'musicModel'))values.VANESSA_MUSIC_MODEL=String(body.musicModel||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'imageModel'))values.VANESSA_IMAGE_MODEL=String(body.imageModel||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'videoModel'))values.VANESSA_VIDEO_MODEL=String(body.videoModel||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'voiceModel'))values.VANESSA_VOICE_MODEL=String(body.voiceModel||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'languageModel'))values.VANESSA_MODEL=String(body.languageModel||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'gmailAccessToken'))values.GMAIL_ACCESS_TOKEN=String(body.gmailAccessToken||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'supportEmail'))values.ZORIFI_SUPPORT_EMAIL=String(body.supportEmail||'').trim();
    if(Object.prototype.hasOwnProperty.call(body,'supportSender'))values.ZORIFI_SUPPORT_SENDER=String(body.supportSender||'').trim();
    const removal={image:['OPENAI_IMAGE_API_KEY','VANESSA_IMAGE_MODEL'],video:['XAI_API_KEY','VANESSA_GPU_URL','VANESSA_GPU_KEY','VANESSA_GPU_MODEL','VANESSA_VIDEO_MODEL'],music:['VANESSA_MUSIC_URL','VANESSA_MUSIC_KEY','VANESSA_MUSIC_MODEL'],voice:['ELEVENLABS_API_KEY','VANESSA_VOICE_ID','VANESSA_VOICE_MODEL'],language:['OPENAI_LANGUAGE_API_KEY','VANESSA_MODEL']};if(body.removeProvider&&removal[body.removeProvider])removal[body.removeProvider].forEach(key=>values[key]='');
    if(values.XAI_API_KEY&&!/^xai-[A-Za-z0-9_-]{12,}$/.test(values.XAI_API_KEY))throw new Error('Enter a valid xAI API key.');
    if(values.OPENAI_API_KEY&&!/^sk-[A-Za-z0-9_-]{12,}$/.test(values.OPENAI_API_KEY))throw new Error('Enter a valid OpenAI API key.');
    if(values.OPENAI_IMAGE_API_KEY&&!/^sk-[A-Za-z0-9_-]{12,}$/.test(values.OPENAI_IMAGE_API_KEY))throw new Error('Enter a valid OpenAI image API key.');
    if(values.OPENAI_LANGUAGE_API_KEY&&!/^sk-[A-Za-z0-9_-]{12,}$/.test(values.OPENAI_LANGUAGE_API_KEY))throw new Error('Enter a valid OpenAI language API key.');
    if(values.ELEVENLABS_API_KEY&&values.ELEVENLABS_API_KEY.length<20)throw new Error('Enter a valid ElevenLabs API key.');
    if(values.VANESSA_VOICE_ID&&values.VANESSA_VOICE_ID.length<8)throw new Error('Enter a valid Vanessa voice ID.');
    if(values.VANESSA_GPU_URL){const gpuUrl=new URL(values.VANESSA_GPU_URL);if(!['http:','https:'].includes(gpuUrl.protocol))throw new Error('Enter a valid Vanessa GPU server URL.');}
    if(values.VANESSA_GPU_KEY&&values.VANESSA_GPU_KEY.length<16)throw new Error('The Vanessa GPU access key must contain at least 16 characters.');
    if(values.VANESSA_MUSIC_URL){const musicUrl=new URL(values.VANESSA_MUSIC_URL);if(musicUrl.protocol!=='https:')throw new Error('The music provider must use a secure HTTPS URL.');}
    if(values.VANESSA_MUSIC_KEY&&values.VANESSA_MUSIC_KEY.length<16)throw new Error('The music provider key must contain at least 16 characters.');
    if(values.GMAIL_ACCESS_TOKEN&&values.GMAIL_ACCESS_TOKEN.length<20)throw new Error('Enter a valid Gmail OAuth access token.');
    if(values.ZORIFI_SUPPORT_EMAIL&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.ZORIFI_SUPPORT_EMAIL))throw new Error('Enter a valid support recipient email address.');
    saveSecrets(values);const imageConfigured=Boolean(secretFromConfig('OPENAI_IMAGE_API_KEY')||secretFromConfig('OPENAI_API_KEY')),languageConfigured=Boolean(secretFromConfig('OPENAI_LANGUAGE_API_KEY')||secretFromConfig('OPENAI_API_KEY'));return json(response,200,{saved:true,provider:ensureProviderIdentity(),gpuConfigured:Boolean(secretFromConfig('VANESSA_GPU_URL')&&secretFromConfig('VANESSA_GPU_KEY')),musicConfigured:desktopUsesLocalMusic()?localMusic.ready('music'):Boolean(secretFromConfig('VANESSA_MUSIC_URL')&&secretFromConfig('VANESSA_MUSIC_KEY')),xaiConfigured:Boolean(secretFromConfig('XAI_API_KEY')),openAiConfigured:imageConfigured||languageConfigured,imageConfigured,languageConfigured,voiceConfigured:Boolean(secretFromConfig('ELEVENLABS_API_KEY')&&secretFromConfig('VANESSA_VOICE_ID'))});
  }catch(error){return json(response,400,{error:error.message||'AI settings could not be saved.'});}
}
async function handleLocalMusic(request,response){
  if(request.method!=='POST')return json(response,405,{error:'Method not allowed.'});
  let input;
  try{input=JSON.parse((await readBody(request,128*1024)).toString('utf8')||'{}');}
  catch{return json(response,400,{error:'Request must contain valid JSON.'});}
  const result=await localMusic.run('music',input);
  return json(response,result.status,result.body);
}
async function handleFunction(request,response,name){
  const file=functionFiles.get(name);if(!file)return json(response,404,{error:'Unknown Vanessa service.'});
  if(name==='vanessa-music'&&desktopUsesLocalMusic())return handleLocalMusic(request,response);
  try{
    const body=await readBody(request),headers=new Headers();for(const [key,value] of Object.entries(request.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
    if(name==='vanessa-provider-test'&&desktopUsesLocalMusic()){
      let input;try{input=JSON.parse(body.toString('utf8')||'{}');}catch{return json(response,400,{error:'Request must contain valid JSON.'});}
      if(input?.type==='music'){
        const music=localMusic.configuration('music');
        return json(response,music.configured?200:503,music.configured?{connected:true,provider:music.provider,model:music.model,verification:'Local CPU runtime and model files are installed.'}:{error:'Local music runtime is not installed on this computer.'});
      }
    }
    if(!hasDesktopLanguageKey()&&LANGUAGE_SERVICES.has(name)){
      let hostedLanguageRequest=name!=='vanessa-provider-test';
      if(!hostedLanguageRequest){try{hostedLanguageRequest=JSON.parse(body.toString('utf8')).type==='language';}catch{}}
      if(hostedLanguageRequest)return relayHostedLanguage({service:name,request,response,body});
    }
    global.Netlify={env:{get:key=>secretFromConfig(key)}};
    const module=await import(pathToFileURL(path.join(root,'netlify','functions',file)).href),handler=module.default;
    const apiRequest=new Request(`${localOrigin}/api/${name}`,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:body});
    const result=await handler(apiRequest);if(result.headers.get('content-type')?.includes('text/event-stream'))return await require('./netlify/functions/_shared/stream-response.cjs')(result,response);response.writeHead(result.status,Object.fromEntries(result.headers.entries()));response.end(Buffer.from(await result.arrayBuffer()));
  }catch(error){json(response,500,{error:error.message||'Vanessa Local could not complete the request.'});}
}
async function handleProvider(request,response,url){
  if(request.method==='GET'&&!url.searchParams.get('service'))return json(response,200,{provider:ensureProviderIdentity(),usage:readProviderUsage(),services:[...providerServices],online:true});
  const service=String(url.searchParams.get('service')||'').trim();if(!providerServices.has(service))return json(response,404,{error:'Unknown Vanessa capability.'});
  const startedAt=Date.now();response.once('finish',()=>recordProviderUsage(service,response.statusCode,startedAt));return handleFunction(request,response,service);
}
function serveStatic(response,pathname){
  if(pathname==='/zorifi-terms.js'){
    const termsFile=path.join(root,'zorifi-terms.js');
    fs.readFile(termsFile,(error,data)=>{if(error)return json(response,404,{error:'Not found.'});response.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=0'});response.end(data);});
    return;
  }
  if(pathname==='/zorifi-beta-program.js'){
    const betaFile=path.join(root,'zorifi-beta-program.js');
    fs.readFile(betaFile,(error,data)=>{if(error)return json(response,404,{error:'Not found.'});response.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=0'});response.end(data);});
    return;
  }
  const relative=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\/+/,''),allowed=['ZorifiVanessaStudioCore.js','ZorifiVanessaTrueAudioAI.js','ZorifiAutoCaptions.js','ZorifiMulticamSyncEngine.js'].includes(relative)||relative==='index.html'||relative==='app.js'||relative==='zorifi-local-companion.js'||relative==='zorifi-optimization.js'||relative==='zorifi-audio-worker.js'||relative==='zorifi-multicam.js'||relative==='zorifi-color-scopes.js'||relative==='zorifi-master-app.js'||relative==='zorifi-privacy.js'||relative==='zorifi-privacy-ui.js'||relative==='zorifi-theme.js'||relative==='zorifi-support.js'||relative==='zorifi-billing.js'||relative==='zorifi-firebase.js'||relative==='zorifi-scenes.js'||relative==='zorifi-project-model.js'||relative==='zorifi-advanced-editing.js'||relative==='zorifi-visual-tools.js'||relative==='zorifi-motion-effects.js'||relative==='zorifi-compute-engine.js'||relative==='zorifi-ai-provider.js'||relative==='zorifi-ai-platform.js'||relative==='zorifi-audio-engine.js'||relative==='zorifi-music-studio.js'||relative==='zorifi-vanessa-actions.js'||relative==='zorifi-creator-platform.js'||relative==='zorifi-phase8.js'||relative==='zorifi-phase9.js'||relative==='zorifi-phase10.js'||relative==='zorifi-phase11.js'||relative==='zorifi-editor-overhaul.js'||relative==='zorifi-stickers.js'||relative==='zorifi-vanessa-identity.js'||relative==='zorifi-vanessa-memory.js'||relative==='zorifi-vanessa-memory-manager.js'||relative==='zorifi-vanessa-memory-context.js'||relative==='zorifi-vanessa-conversation-continuity.js'||relative==='zorifi-vanessa-personalization.js'||relative==='zorifi-vanessa-intent.js'||relative==='zorifi-vanessa-response-planner.js'||relative==='zorifi-vanessa-workflow.js'||relative==='zorifi-vanessa-reference-analysis.js'||relative==='zorifi-vanessa-visual-analysis.js'||relative==='zorifi-vanessa-reference-execution.js'||relative==='zorifi-vanessa-style-intelligence.js'||relative==='zorifi-vanessa-content-matching.js'||relative==='zorifi-vanessa-edit-planner.js'||relative==='zorifi-vanessa-execution-feedback.js'||relative==='zorifi-vanessa-edit-adaptation.js'||relative==='zorifi-vanessa-task-orchestration.js'||relative==='zorifi-vanessa-task-continuity.js'||relative==='zorifi-vanessa-goal-understanding.js'||relative.startsWith('zorifi-vanessa-creative-')||relative==='zorifi-vanessa-capability-planner.js'||relative==='zorifi-vanessa-router.js'||relative==='zorifi-vanessa-core.js'||relative==='styles.css'||relative==='sw.js'||relative==='manifest.webmanifest'||relative.startsWith('assets/')||relative.startsWith('icons/');
  if(!allowed)return json(response,404,{error:'Not found.'});
  const file=path.resolve(root,relative);if(!file.startsWith(path.resolve(root)+path.sep)&&file!==path.resolve(root,'index.html'))return json(response,403,{error:'Forbidden.'});
  fs.readFile(file,(error,data)=>{if(error)return json(response,404,{error:'Not found.'});response.writeHead(200,{'content-type':mimeTypes[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':relative==='sw.js'?'no-cache':'public, max-age=0'});const script=relative==='index.html'?firebaseConfigScript(firebasePublicConfig):'';response.end(script?Buffer.from(data.toString('utf8').replace('<head>',`<head>\n    ${script}`)):data);});
}
function startLocalServer(){return new Promise((resolve,reject)=>{
  localServer=http.createServer(async(request,response)=>{
    try{
      if(request.headers.host!==new URL(localOrigin).host)return json(response,403,{error:'Untrusted local request.'});
      const url=new URL(request.url,localOrigin),origin=request.headers.origin||'';
      const companion=Boolean(companionOrigin&&origin===companionOrigin&&companionRoute(url.pathname,request.method));
      if(origin&&origin!==localOrigin&&!companion)return json(response,403,{error:'Untrusted local request.'});
      if(companion){
        companionHeaders(response,origin);
        if(request.method==='OPTIONS'){response.writeHead(204);return response.end();}
        if(url.pathname==='/api/ai-settings')return handleSettings(request,response);
        // A public website may reach only this installed local model. It never
        // proxies saved credentials or any other desktop capability.
        return handleLocalMusic(request,response);
      }
      if(url.pathname==='/api/ai-settings')return handleSettings(request,response);
      if(url.pathname==='/api/vanessa-provider')return handleProvider(request,response,url);
      if(url.pathname.startsWith('/api/'))return handleFunction(request,response,url.pathname.slice(5));
      serveStatic(response,url.pathname);
    }catch(error){json(response,500,{error:error.message||'Vanessa Local server error.'});}
  });
  localServer.once('error',reject);localServer.listen(LOCAL_PORT,'127.0.0.1',()=>{localOrigin=`http://127.0.0.1:${LOCAL_PORT}`;resolve(localOrigin);});
});}

function createWindow(origin) {
  const window = new BrowserWindow({width:1440,height:900,minWidth:1040,minHeight:680,backgroundColor:'#090b10',title:'Zorifi Video Editor',icon:path.join(root,'icons','icon-512.png'),autoHideMenuBar:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:!process.env.ZORIFI_SMOKE_DATA}});
  mainWindow=window;
  window.loadURL(`${origin}/index.html`);
  window.once('ready-to-show',()=>{if(!process.env.ZORIFI_SMOKE_DATA)window.show();});
  window.on('closed',()=>{if(mainWindow===window)mainWindow=null;});
  window.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith('https://'))shell.openExternal(url);return {action:'deny'};});
}

app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
if(singleInstanceLock)app.whenReady().then(async()=>{await loadFirebasePublicConfig();const origin=await startLocalServer();session.defaultSession.setPermissionRequestHandler((webContents,permission,callback)=>{const trusted=webContents.getURL().startsWith(origin),allowed=new Set(['media','display-capture','fullscreen','notifications']);callback(trusted&&allowed.has(permission));});createWindow(origin);app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow(origin);});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>{localMusic.dispose();localServer?.close();});
