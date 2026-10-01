// Studio redesign refresh: reinstalling this worker refreshes the current release assets.
const CACHE = 'zorifi-v176';
const CORE = ['./', './index.html', './zorifi-support.js?v=171', './zorifi-beta-program.js?v=171', './zorifi-terms.js?v=173', './zorifi-billing.js?v=170', './styles.css?v=170', './zorifi-stickers.js?v=170', './zorifi-vanessa-identity.js?v=170', './zorifi-vanessa-memory.js?v=170', './zorifi-vanessa-memory-manager.js?v=170', './zorifi-vanessa-memory-context.js?v=170', './zorifi-vanessa-conversation-continuity.js?v=170', './zorifi-vanessa-personalization.js?v=170', './zorifi-vanessa-intent.js?v=170', './zorifi-vanessa-response-planner.js?v=170', './zorifi-vanessa-workflow.js?v=170', './zorifi-vanessa-reference-analysis.js?v=170', './zorifi-vanessa-visual-analysis.js?v=170', './zorifi-vanessa-reference-execution.js?v=170', './zorifi-vanessa-style-intelligence.js?v=170', './zorifi-vanessa-content-matching.js?v=170', './zorifi-vanessa-edit-planner.js?v=170', './zorifi-vanessa-execution-feedback.js?v=170', './zorifi-vanessa-edit-adaptation.js?v=170', './zorifi-vanessa-task-orchestration.js?v=170', './zorifi-vanessa-task-continuity.js?v=170', './zorifi-vanessa-goal-understanding.js?v=170', './zorifi-vanessa-creative-intent.js?v=170', './zorifi-vanessa-capability-planner.js?v=170', './zorifi-vanessa-creative-plan.js?v=170', './zorifi-vanessa-creative-conversation.js?v=170', './zorifi-vanessa-creative-verification.js?v=170', './zorifi-vanessa-creative-pipeline.js?v=170', './zorifi-vanessa-router.js?v=170', './zorifi-vanessa-core.js?v=170', './zorifi-audio-engine.js?v=170', './zorifi-project-model.js?v=170', './zorifi-advanced-editing.js?v=170', './zorifi-visual-tools.js?v=170', './zorifi-motion-effects.js?v=170', './zorifi-compute-engine.js?v=170', './zorifi-ai-provider.js?v=170', './zorifi-ai-platform.js?v=170', './zorifi-scenes.js?v=170', './zorifi-vanessa-actions.js?v=170', './zorifi-creator-platform.js?v=170', './zorifi-phase8.js?v=170', './zorifi-phase9.js?v=170', './zorifi-phase10.js?v=170', './zorifi-phase11.js?v=170', './zorifi-editor-overhaul.js?v=170', './app.js?v=170', './manifest.webmanifest', './icons/zorifi-logo.jpeg', './icons/favicon-64.png', './icons/icon-192.png', './icons/icon-512.png', './assets/zorifi-background.jpeg'];

CORE.unshift('./zorifi-theme.js?v=174');
CORE.unshift('./styles.css?v=170&studio=8','./zorifi-billing.js?v=170&tier=2','./zorifi-firebase.js?v=170','./zorifi-music-studio.js?v=170&studio=6','./zorifi-ai-provider.js?v=172','./app.js?v=170&studio=7');

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).pathname.startsWith('/.netlify/functions/')) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
