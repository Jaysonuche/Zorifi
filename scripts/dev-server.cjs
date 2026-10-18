const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createLocalMediaJobs} = require('./local-media-jobs.cjs');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.jpeg':'image/jpeg', '.mp4':'video/mp4', '.webm':'video/webm', '.wav':'audio/wav', '.mp3':'audio/mpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon'};
const services = new Set(['vanessa-director-tools','vanessa','vanessa-global','vanessa-language','vanessa-image','vanessa-scene-image','vanessa-video','vanessa-video-tool','vanessa-motion','vanessa-music','vanessa-stems','vanessa-voice','vanessa-speech','vanessa-captions','vanessa-scenes','vanessa-autocut','vanessa-provider-test','support-email']);
function json(res, status, value) { res.writeHead(status, {'content-type':'application/json', 'cache-control':'no-store'}); res.end(JSON.stringify(value)); }
function createServer({crmDirectory=path.join(root,'.zorifi-private'),crmKey,localMedia=createLocalMediaJobs()}={}) {
 const crm=require('./crm-store.cjs').createCRM({directory:crmDirectory,...(crmKey?{key:crmKey}:{})});
 const server=http.createServer(async (req, res) => {
  try {
   if(!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host||''))return json(res,403,{error:'Untrusted host.'});
   const origin=`http://${req.headers.host}`,url = new URL(req.url, origin);
   if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,{error:'Cross-origin requests are not allowed.'});
   if(url.pathname==='/api/crm')return crm(req,res);
   if (url.pathname === '/api/ai-settings') {
    if (req.method !== 'GET') return json(res, 405, {error:'Configure credentials through environment variables or the desktop app.'});
    const {configuration} = await import('../netlify/functions/_shared/provider.mjs');
    const configurations=configuration();
    for(const kind of ['image','music'])if(localMedia.enabled(kind))configurations[kind]=localMedia.configuration(kind);
    return json(res, 200, {server:'Zorifi development server', configurations, imageConfigured:configurations.image.configured, musicConfigured:configurations.music.configured, secureStorage:{available:false}, provider:{name:'Vanessa AI Provider'}});
   }
   if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) {
    const name = url.pathname === '/api/vanessa-provider' ? (url.searchParams.get('service')||'vanessa-global') : url.pathname.split('/').at(-1);
    if (!services.has(name)) return json(res, 404, {error:'Unknown service.'});
    const chunks=[]; let size=0;
    for await (const chunk of req) {size+=chunk.length;if(size>32*1024*1024)return json(res,413,{error:'Request too large.'});chunks.push(chunk);}
    const localKind=name==='vanessa-image'?'image':name==='vanessa-music'?'music':null;
    if(localKind&&localMedia.enabled(localKind)){
      if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{return json(res,400,{error:'Request must contain valid JSON.'});}
      const result=await localMedia.run(localKind,input);
      return json(res,result.status,result.body);
    }
    if(name==='vanessa-provider-test'&&['image','music'].some(kind=>localMedia.enabled(kind))){
      if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{return json(res,400,{error:'Request must contain valid JSON.'});}
      if(['image','music'].includes(input?.type)&&localMedia.enabled(input.type)){
        const config=localMedia.configuration(input.type);
        return json(res,config.configured?200:503,config.configured?{connected:true,provider:config.provider,model:config.model,verification:'Local CPU runtime and model files are installed. The sample render was verified separately.'}:{error:`Local ${input.type} runtime is not installed on this computer.`});
      }
    }
    const headers = new Headers(); for(const [key,value] of Object.entries(req.headers)) if(value) headers.set(key, Array.isArray(value)?value.join(','):value);
    const request = new Request(`${origin}${req.url}`, {method:req.method, headers, ...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const handler = (await import(pathToFileURL(path.join(root,'netlify','functions',`${name}.mjs`)).href)).default;
    const result = await handler(request); if(result.headers.get('content-type')?.includes('text/event-stream'))return await require('../netlify/functions/_shared/stream-response.cjs')(result,res); res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
   }
   if (!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'Method not allowed.'});
   const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
   if (!(['crm.html','crm.js','crm.css','ZorifiVanessaStudioCore.js','ZorifiVanessaTrueAudioAI.js','ZorifiAutoCaptions.js','ZorifiMulticamSyncEngine.js'].includes(relative)||relative==='index.html'||relative==='app.js'||relative==='styles.css'||relative==='sw.js'||relative==='manifest.webmanifest'||/^zorifi-[\w-]+\.(js|json|css)$/.test(relative)||/^(icons|assets)\/[\w./-]+$/.test(relative)))return json(res,404,{error:'Not found.'});
   const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))return json(res,403,{error:'Forbidden.'});
   const data=await fs.promises.readFile(file);
   res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});
   res.end(req.method==='HEAD'?undefined:data);
  } catch(error) {json(res,error.code==='ENOENT'?404:500,{error:error.code==='ENOENT'?'Not found.':'The local server could not complete this request.'});}
 });
 server.once('close',()=>localMedia.dispose());
 return server;
}
if(require.main===module){
 const envFile=path.join(root,'.env');
 if(fs.existsSync(envFile)){
  if(typeof process.loadEnvFile!=='function')throw new Error('Use Node.js 22 or newer to load the local .env file.');
  process.loadEnvFile(envFile);
 }
 createServer().listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log(`Zorifi: http://127.0.0.1:${Number(process.env.PORT)||4173}`));
}
module.exports={createServer};
