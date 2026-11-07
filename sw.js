// Studio redesign refresh: reinstalling this worker refreshes the current release assets.
const CACHE = 'zorifi-v249';
const CORE = [
  "./zorifi-vanessa-voice.js?v=249",
  "./zorifi-vanessa-voice.css?v=249",
  "./zorifi-vanessa-professional-tools.js?v=249",
  "./zorifi-vanessa-media-review.js?v=249",
  "./zorifi-vanessa-creative-learning.js?v=249",
  "./zorifi-vanessa-professional-engine.js?v=249",
  "./zorifi-vanessa-workflow-recovery.js?v=249",
  "./zorifi-vanessa-professional.js?v=249",
  "./zorifi-vanessa-professional.css?v=244",

  "./zorifi-timeline-edit-api.js?v=242",
  "./zorifi-vanessa-production.js?v=249",
  "./zorifi-director-companion.css?v=249",
  "./zorifi-director-engine.js?v=241",
  "./zorifi-director-engine.js",
  "./ZorifiVanessaDirectorEngine.js",
  "./zorifi-director-timeline.js?v=241",
  "./zorifi-director-companion.js?v=249",
  "./zorifi-director-integration.js?v=249",
  "./zorifi-studio-director.js?v=239",
  "./zorifi-studio-director.js",
  "./ZorifiVanessaStudioDirector.js",
  "./ZorifiVanessaStudioCore.js",
  "./zorifi-audio-worker.js?v=238",
  "./zorifi-interface-language.js?v=249",
  "./zorifi-interface-catalog.json?v=249",
  "./zorifi-keyframe-workspace.css?v=236",
  "./assets/tool-previews/city-walk.webp",
  "./assets/tool-previews/park-portrait.webp",
  "./assets/tool-previews/rooftop-portrait.webp",
  "./assets/tool-previews/plaza-portrait.webp",
  "./zorifi-editor-colors.css?v=234",
  "./zorifi-timeline-tracks.js?v=234",
  "./zorifi-mask-painter.js?v=233",
  "./zorifi-layer-masks.js?v=233",
  "./zorifi-composition-workspace.js?v=240",
  "./zorifi-composition-workspace.css?v=234",
  "./",
  "./manifest.webmanifest?v=231",
  "./icons/favicon-64.png?v=231",
  "./icons/icon-192.png?v=231",
  "./icons/icon-512.png?v=231",
  "./icons/zorifi-logo.jpeg?v=231",
  "./assets/vanessa-orb.webp?v=231",
  "./zorifi-theme.js?v=174",
  "./styles.css?v=229&studio=8",
  "./zorifi-touch-workspace.css?v=222",
  "./zorifi-template-feed.css?v=1",
  "./zorifi-vanessa-orb.css?v=231",
  "./zorifi-device-lab.css?v=1",
  "./zorifi-editor-workbench.css?v=222",
  "./zorifi-vanessa-chat.css?v=249",
  "./zorifi-music-catalogue.css?v=222",
  "./zorifi-background-cutout.css?v=222",
  "./zorifi-editor-refinements.css?v=240",
  "./zorifi-social.css?v=223",
  "./zorifi-timeline-interactions.css?v=225",
  "./zorifi-pocket-editor.css?v=235",
  "./zorifi-social-creator.css?v=225",
  "./zorifi-app-settings.css?v=237",
  "./zorifi-google-connections.css?v=225",
  "./zorifi-editor-future.css?v=234",
  "./zorifi-music-future.css?v=226",
  "./zorifi-vanessa-future.css?v=231",
  "./zorifi-opening.css?v=231",
  "./zorifi-photos.css?v=232",
  "./assets/tutorial/zorifi-tour.mp4",
  "./assets/tutorial/zorifi-tour.vtt",
  "./assets/tutorial/zorifi-tour-poster.svg",
  "./zorifi-support.js?v=171",
  "./zorifi-beta-program.js?v=171",
  "./zorifi-terms.js?v=173",
  "./zorifi-billing.js?v=170&tier=2",
  "./zorifi-firebase.js?v=225",
  "./zorifi-stickers.js?v=170",
  "./zorifi-vanessa-identity.js?v=237",
  "./zorifi-vanessa-memory.js?v=244",
  "./zorifi-vanessa-memory-manager.js?v=170",
  "./zorifi-vanessa-memory-context.js?v=170",
  "./zorifi-vanessa-conversation-continuity.js?v=170",
  "./zorifi-vanessa-personalization.js?v=170",
  "./zorifi-vanessa-intent.js?v=212",
  "./zorifi-vanessa-response-planner.js?v=170",
  "./zorifi-vanessa-workflow.js?v=170",
  "./zorifi-vanessa-reference-analysis.js?v=170",
  "./zorifi-vanessa-visual-analysis.js?v=170",
  "./zorifi-vanessa-reference-execution.js?v=170",
  "./zorifi-vanessa-style-intelligence.js?v=170",
  "./zorifi-vanessa-content-matching.js?v=170",
  "./zorifi-vanessa-edit-planner.js?v=170",
  "./zorifi-vanessa-execution-feedback.js?v=170",
  "./zorifi-vanessa-edit-adaptation.js?v=170",
  "./zorifi-vanessa-task-orchestration.js?v=170",
  "./zorifi-vanessa-task-continuity.js?v=170",
  "./zorifi-vanessa-goal-understanding.js?v=170",
  "./zorifi-vanessa-creative-intent.js?v=170",
  "./zorifi-vanessa-capability-planner.js?v=170",
  "./zorifi-vanessa-creative-plan.js?v=170",
  "./zorifi-vanessa-creative-conversation.js?v=170",
  "./zorifi-vanessa-creative-verification.js?v=170",
  "./zorifi-vanessa-creative-pipeline.js?v=170",
  "./zorifi-vanessa-router.js?v=249",
  "./zorifi-vanessa-core.js?v=249",
  "./zorifi-optimization.js?v=238",
  "./zorifi-multicam.js?v=1",
  "./zorifi-audio-engine.js?v=238",
  "./zorifi-music-studio.js?v=170&studio=6",
  "./zorifi-project-model.js?v=244",
  "./zorifi-advanced-editing.js?v=170",
  "./zorifi-color-scopes.js?v=1",
  "./zorifi-visual-tools.js?v=170",
  "./zorifi-motion-effects.js?v=249",
  "./zorifi-compute-engine.js?v=170",
  "./zorifi-ai-provider.js?v=208",
  "./zorifi-local-companion.js?v=1",
  "./zorifi-ai-platform.js?v=170",
  "./zorifi-scenes.js?v=239",
  "./zorifi-vanessa-actions.js?v=219",
  "./zorifi-creator-platform.js?v=219",
  "./zorifi-phase8.js?v=242",
  "./zorifi-phase9.js?v=170",
  "./zorifi-phase10.js?v=237",
  "./zorifi-phase11.js?v=218",
  "./zorifi-autocut-media.js?v=220&decode=2",
  "./zorifi-sfx.js?v=222",
  "./zorifi-music-catalogue.js?v=222",
  "./zorifi-social.js?v=225",
  "./zorifi-autocut.js?v=220",
  "./zorifi-tool-registry.js?v=233",
  "./zorifi-person-cutout.js?v=1",
  "./zorifi-background-cutout.js?v=222",
  "./zorifi-autocut-creative.js?v=233",
  "./zorifi-autocut-director.js?v=222",
  "./zorifi-autocut-renderer.js?v=222",
  "./zorifi-autocut-studio.js?v=222",
  "./zorifi-template-feed.js?v=1",
  "./zorifi-device-lab.js?v=222",
  "./zorifi-editor-workbench.js?v=222",
  "./zorifi-editor-overhaul.js?v=229",
  "./zorifi-privacy.js?v=1",
  "./zorifi-vanessa-listening.js?v=249",
  "./zorifi-photos.js?v=232",
  "./app.js?v=249",
  "./zorifi-app-settings.js?v=249",
  "./zorifi-google-connections.js?v=225",
  "./zorifi-google-integration.js?v=227",
  "./zorifi-social-creator.js?v=225",
  "./zorifi-social-integration.js?v=222",
  "./zorifi-device-integration.js?v=241",
  "./zorifi-workbench-integration.js?v=241",
  "./zorifi-background-integration.js?v=222",
  "./zorifi-timeline-interactions.js?v=234",
  "./zorifi-pocket-editor.js?v=236",
  "./zorifi-opening.js?v=231",
  "./zorifi-master-app.js?v=249",
  "./zorifi-privacy-ui.js?v=228"
];

function usableAsset(request,response){
  if(!response?.ok)return false;
  const type=response.headers.get('content-type')||'',path=new URL(request.url).pathname;
  if(request.destination==='script'||/\.js$/.test(path))return /(?:javascript|ecmascript)/i.test(type);
  if(request.destination==='style'||/\.css$/.test(path))return /text\/css/i.test(type);
  if(/\.(?:json|webmanifest)$/.test(path))return /(?:json|manifest)/i.test(type);
  return true;
}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    for(let index=0;index<CORE.length;index+=8)await Promise.all(CORE.slice(index,index+8).map(async asset=>{
      const request=new Request(new URL(asset,self.location.href),{cache:'reload'}),response=await fetch(request);
      if(!usableAsset(request,response))throw Error('An application asset could not be verified.');
      await cache.put(request,response);
    }));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  // Keep the previous shell for already-open installed windows; never delete
  // unrelated device caches or substitute one release's HTML for JavaScript.
  event.waitUntil(caches.keys().then(keys => {const previous=keys.filter(key=>/^zorifi-v\d+$/.test(key)&&key!==CACHE).sort((a,b)=>Number(b.slice(8))-Number(a.slice(8)))[0];return Promise.all(keys.filter(key=>/^zorifi-v\d+$/.test(key)&&key!==CACHE&&key!==previous).map(key=>caches.delete(key)));}).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/.netlify/functions/') || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    // Fetch a new release's HTML before reusing a saved shell. Offline
    // launches still use the cached page.
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
      }
      return response;
    }).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match(event.request)||await cache.match(new URL('./index.html',self.location.href))||Response.error();}));
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);if(usableAsset(event.request,cached))return cached;
    try{const response=await fetch(event.request);if(!usableAsset(event.request,response))return new Response('Application asset unavailable. Reconnect and reload.',{status:503,headers:{'content-type':'text/plain','cache-control':'no-store'}});
      if(response.status!==206&&!event.request.headers.has('range')){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;
    }catch{return Response.error();}
  })());
});
