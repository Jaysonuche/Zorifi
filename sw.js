// Studio redesign refresh: reinstalling this worker refreshes the current release assets.
const CACHE = 'zorifi-v230';
const CORE = [
  "./",
  "./manifest.webmanifest?v=230",
  "./icons/favicon-64.png",
  "./icons/icon-192.png",
  "./zorifi-theme.js?v=174",
  "./styles.css?v=229&studio=8",
  "./zorifi-touch-workspace.css?v=222",
  "./zorifi-template-feed.css?v=1",
  "./zorifi-vanessa-orb.css?v=222",
  "./zorifi-device-lab.css?v=1",
  "./zorifi-editor-workbench.css?v=222",
  "./zorifi-vanessa-chat.css?v=222",
  "./zorifi-music-catalogue.css?v=222",
  "./zorifi-background-cutout.css?v=222",
  "./zorifi-editor-refinements.css?v=222",
  "./zorifi-social.css?v=223",
  "./zorifi-timeline-interactions.css?v=225",
  "./zorifi-pocket-editor.css?v=225",
  "./zorifi-social-creator.css?v=225",
  "./zorifi-app-settings.css?v=228",
  "./zorifi-google-connections.css?v=225",
  "./zorifi-editor-future.css?v=226",
  "./zorifi-music-future.css?v=226",
  "./zorifi-vanessa-future.css?v=226",
  "./zorifi-opening.css?v=230",
  "./assets/tutorial/zorifi-tour.mp4",
  "./assets/tutorial/zorifi-tour.vtt",
  "./assets/tutorial/zorifi-tour-poster.svg",
  "./zorifi-support.js?v=171",
  "./zorifi-beta-program.js?v=171",
  "./zorifi-terms.js?v=173",
  "./zorifi-billing.js?v=170&tier=2",
  "./zorifi-firebase.js?v=225",
  "./zorifi-stickers.js?v=170",
  "./zorifi-vanessa-identity.js?v=170",
  "./zorifi-vanessa-memory.js?v=170",
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
  "./zorifi-vanessa-router.js?v=208",
  "./zorifi-vanessa-core.js?v=206",
  "./zorifi-optimization.js?v=1",
  "./zorifi-multicam.js?v=1",
  "./zorifi-audio-engine.js?v=170",
  "./zorifi-music-studio.js?v=170&studio=6",
  "./zorifi-project-model.js?v=170",
  "./zorifi-advanced-editing.js?v=170",
  "./zorifi-color-scopes.js?v=1",
  "./zorifi-visual-tools.js?v=170",
  "./zorifi-motion-effects.js?v=170",
  "./zorifi-compute-engine.js?v=170",
  "./zorifi-ai-provider.js?v=208",
  "./zorifi-local-companion.js?v=1",
  "./zorifi-ai-platform.js?v=170",
  "./zorifi-scenes.js?v=170",
  "./zorifi-vanessa-actions.js?v=219",
  "./zorifi-creator-platform.js?v=219",
  "./zorifi-phase8.js?v=170",
  "./zorifi-phase9.js?v=170",
  "./zorifi-phase10.js?v=170",
  "./zorifi-phase11.js?v=218",
  "./zorifi-autocut-media.js?v=220&decode=2",
  "./zorifi-sfx.js?v=222",
  "./zorifi-music-catalogue.js?v=222",
  "./zorifi-social.js?v=225",
  "./zorifi-autocut.js?v=220",
  "./zorifi-tool-registry.js?v=1",
  "./zorifi-person-cutout.js?v=1",
  "./zorifi-background-cutout.js?v=222",
  "./zorifi-autocut-creative.js?v=219",
  "./zorifi-autocut-director.js?v=222",
  "./zorifi-autocut-renderer.js?v=222",
  "./zorifi-autocut-studio.js?v=222",
  "./zorifi-template-feed.js?v=1",
  "./zorifi-device-lab.js?v=222",
  "./zorifi-editor-workbench.js?v=222",
  "./zorifi-editor-overhaul.js?v=229",
  "./zorifi-privacy.js?v=1",
  "./zorifi-vanessa-listening.js?v=222",
  "./app.js?v=230",
  "./zorifi-app-settings.js?v=228",
  "./zorifi-google-connections.js?v=225",
  "./zorifi-google-integration.js?v=227",
  "./zorifi-social-creator.js?v=225",
  "./zorifi-social-integration.js?v=222",
  "./zorifi-device-integration.js?v=222",
  "./zorifi-workbench-integration.js?v=222",
  "./zorifi-background-integration.js?v=222",
  "./zorifi-timeline-interactions.js?v=225",
  "./zorifi-pocket-editor.js?v=225",
  "./zorifi-opening.js?v=230",
  "./zorifi-master-app.js?v=220",
  "./zorifi-privacy-ui.js?v=228"
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    for(let index=0;index<CORE.length;index+=8)await cache.addAll(CORE.slice(index,index+8));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
