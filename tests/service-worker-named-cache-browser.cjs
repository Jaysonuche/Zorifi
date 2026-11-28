const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const cacheName='zorifi-v99002-current-preview',previous='zorifi-v99001-previous-preview',obsolete='zorifi-v99000-older-preview';
 const source=fs.readFileSync(require.resolve('../sw.js'),'utf8').replace(/const CACHE = '[^']+';/,`const CACHE = '${cacheName}';`).replace(/const CORE = \[[\s\S]*?\];/,"const CORE = ['./','./index.html','./probe.js?v=99002'];");
 const server=http.createServer((req,res)=>{res.setHeader('cache-control','no-store');const path=new URL(req.url,'http://localhost').pathname;if(path==='/sw.js'){res.setHeader('content-type','text/javascript');return res.end(source);}if(path==='/probe.js'){res.setHeader('content-type','text/javascript');return res.end('window.probeVersion=99002;');}res.setHeader('content-type','text/html');res.end('<html><body>Named-cache verification</body></html>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const context=await browser.newContext({serviceWorkers:'allow'}),page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async({previous,obsolete})=>{const old=await caches.open(previous);await old.put('/probe.js?v=99001',new Response('window.previousPreview=99001;',{headers:{'content-type':'text/javascript'}}));await caches.open(obsolete);const media=await caches.open('user-media-cache');await media.put('/retained-user-fixture',new Response('private local fixture'));await caches.open('zorifi-project-media-v1');await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;},{previous,obsolete});
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const retained=await page.evaluate(async({cacheName,previous,obsolete})=>{const keys=await caches.keys();return {current:keys.includes(cacheName),previous:keys.includes(previous),obsolete:keys.includes(obsolete),media:keys.includes('user-media-cache')&&keys.includes('zorifi-project-media-v1'),data:await(await(await caches.open('user-media-cache')).match('/retained-user-fixture')).text()};},{cacheName,previous,obsolete});
  assert.deepEqual(retained,{current:true,previous:true,obsolete:false,media:true,data:'private local fixture'});
  await context.setOffline(true);const script=await page.evaluate(async()=>await(await fetch('/probe.js?v=99001')).text());assert.match(script,/previousPreview=99001/);
  fs.writeFileSync('artifacts/service-worker-named-cache-browser.json',JSON.stringify({namedReleasePruned:true,currentAndPreviousKept:true,unrelatedMediaPreserved:true,previousScriptWorksOffline:true,livePaidCalls:0},null,2));
  console.log('PASS: native named-cache activation prunes old app shells, retains current/previous and unrelated media, and serves exact prior scripts offline.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
