const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, webkit} = require('playwright');
const {createServer} = require('../scripts/dev-server.cjs');

const root = path.resolve(__dirname, '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const humanSources = ['city-walk', 'park-portrait', 'rooftop-portrait', 'plaza-portrait']
  .map(name => `assets/tool-previews/${name}.webp`);

async function seed(page, url, touch) {
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.locator('#zorifi-startup').waitFor({state: 'detached'});
  await page.locator('.zorifi-opening').waitFor({state: 'detached'});
  await page.evaluate(touch => {
    currentUser = {id: 'tool-loop-proof', name: 'Tool preview creator'};
    syncPhase10Stores();
    termsAcceptance.accept();
    betaProgramState.acknowledge();
    createNewProject();
    const source = document.createElement('canvas');
    source.width = 640;
    source.height = 360;
    const context = source.getContext('2d');
    context.fillStyle = '#9553c8';
    context.fillRect(0, 0, 640, 360);
    const url = source.toDataURL();
    state.mediaAssets = [{id: 'source', name: 'Imported source.png', type: 'image', url, thumbnail: url, width: 640, height: 360, duration: 8}];
    state.clips = [{id: 'human-clip', name: 'Imported source', mediaId: 'source', type: 'video', track: 0, start: 0, duration: 8, sourceStart: 0, playbackRate: 1, opacity: 100, volume: 0, scale: 100, scaleX: 100, scaleY: 100, positionX: 0, positionY: 0, rotation: 0, fit: 'contain', keyframes: {}, visualEffects: VisualTools.normalize(), effectStack: [], animations: []}];
    state.creatorSettings.addZorifiEnding = false;
    state.creatorSettings.firstMediaId = 'source';
    state.duration = 12;
    state.currentTime = 2;
    state.selected = 'human-clip';
    state.view = 'editor';
    state.activePanel = 'media';
    state.panelCollapsed = false;
    state.inspectorCollapsed = false;
    state.responsivePanel = '';
    state.mobileInspectorOpen = false;
    state.mobileToolSheetOpen = false;
    state.timelineTool = 'select';
    state.zoom = touch ? 30 : 70;
    vanessaOpen = false;
    render();
  }, touch);
}

async function openPanel(page, panel, touch, section = '') {
  await page.evaluate(({panel, touch, section}) => {
    state.activePanel = panel;
    state.responsivePanel = touch ? 'tools' : '';
    state.mobileInspectorOpen = false;
    state.selected = 'human-clip';
    state.animationQuery = '';
    state.animationCategory = 'ALL';
    state.effectBrowserQuery = '';
    state.effectBrowserCategory = 'All';
    state.effectBrowserPage = 1;
    if (section) state.effectSection = section;
    render();
  }, {panel, touch, section});
  await page.locator('.media-panel').waitFor({state: 'visible'});
  await page.waitForFunction(() => window.ZorifiPocketEditor?.previewStatus?.().registered > 0);
  assert.equal(await page.locator('.pocket-preview-play').count(), 0, 'Demonstrations play on the tool card without a separate Preview control');
}

async function frame(page, selector) {
  return page.locator(selector).evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 4) {
      hash = Math.imul(hash ^ data[index], 16777619);
      hash = Math.imul(hash ^ data[index + 1], 16777619);
      hash = Math.imul(hash ^ data[index + 2], 16777619);
    }
    return {hash: hash >>> 0, frame: Number(canvas.dataset.previewFrame || 0), source: canvas.dataset.previewSource};
  });
}

async function proveLoop(page, {panel, section, kind, id}, touch) {
  const clipsBefore = await page.evaluate(() => JSON.stringify(state.clips));
  await openPanel(page, panel, touch, section);
  const selector = `.pocket-real-preview[data-preview-kind="${kind}"][data-preview-id="${id}"]`;
  await page.locator(selector).scrollIntoViewIfNeeded();
  try { await page.waitForFunction(selector => {
    const canvas=document.querySelector(selector);if(!canvas)return false;
    const panel=canvas.closest('.media-panel'),b=canvas.getBoundingClientRect(),p=panel.getBoundingClientRect();
    // Restored panel scroll can land after WebKit's scrollIntoView completes.
    // Keep the measured card on screen, just as a real user scrolling to it.
    if(b.top<p.top||b.bottom>p.bottom){panel.scrollTop+=b.top-p.top-(p.height-b.height)/2;return false;}
    return Number(canvas.dataset.previewFrame||0)>1;
  }, selector); }
  catch(error){
    const diagnostic=await page.locator(selector).evaluate(canvas=>{const b=canvas.getBoundingClientRect(),p=canvas.closest('.media-panel').getBoundingClientRect();let direct;try{direct=ZorifiPocketEditor.drawPreview(canvas,canvas.dataset.previewKind,canvas.dataset.previewId,.5);}catch(error){direct=error.message;}return {visibility:document.visibilityState,status:ZorifiPocketEditor.previewStatus(),frame:canvas.dataset.previewFrame,source:canvas.dataset.previewSource,box:{x:b.x,y:b.y,w:b.width,h:b.height},panel:{x:p.x,y:p.y,w:p.width,h:p.height},direct};});
    throw new Error(`${kind}/${id} failed to animate: ${JSON.stringify(diagnostic)}`,{cause:error});
  }
  const sources = await page.locator('.pocket-real-preview').evaluateAll(canvases => [...new Set(canvases.map(canvas => (canvas.dataset.previewSource || '').replace(/^\//, '')))]);
  assert(sources.length >= 3, `${kind} cards use varied human photos: ${JSON.stringify(sources)}`);
  assert(sources.every(source => humanSources.includes(source)), `All ${kind} sources are bundled human photos, independent of the imported graphic`);
  const samples = [await frame(page, selector)];
  // Keep sampling beyond the full 3.2-second cycle: the old manual previews
  // stopped after 2.2 seconds and would fail this frame-counter assertion.
  for (let index = 0; index < 8; index++) {
    await page.waitForTimeout(500);
    samples.push(await frame(page, selector));
  }
  assert(samples.at(-1).frame > samples[5].frame + 1, `${kind} keeps drawing after the first loop`);
  assert(new Set(samples.map(sample => sample.hash)).size >= 3, `${kind} visibly changes pixels while demonstrating ${id}`);
  assert(new Set(samples.slice(5).map(sample => sample.hash)).size >= 2, `${kind} visibly repeats instead of freezing after the old 2.2-second preview`);
  assert.equal(await page.evaluate(() => JSON.stringify(state.clips)), clipsBefore, 'Browsing animated cards does not apply tools or modify project clips');
  const status = await page.evaluate(() => ZorifiPocketEditor.previewStatus());
  assert(status.running && status.visible > 0 && status.visible <= status.registered, JSON.stringify(status));
  return selector;
}

async function proveOffscreenPause(page) {
  const first = page.locator('.pocket-real-preview').first();
  await first.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const scrolled = await page.locator('.media-panel').evaluate(panel => {
    panel.scrollTop = panel.scrollHeight;
    return panel.scrollHeight > panel.clientHeight + 150;
  });
  assert(scrolled, 'The effects library has offscreen cards to exercise visibility suspension');
  await page.waitForTimeout(180);
  const isOutside = await first.evaluate(canvas => {
    const photo = canvas.getBoundingClientRect(), panel = canvas.closest('.media-panel').getBoundingClientRect();
    return photo.bottom <= panel.top || photo.top >= panel.bottom;
  });
  assert(isOutside, 'The measured demonstration is outside the scrolling tool panel');
  const before = await first.getAttribute('data-preview-frame');
  await page.waitForTimeout(350);
  assert.equal(await first.getAttribute('data-preview-frame'), before, 'Offscreen demonstrations pause instead of spending drawing time');
}

async function applyTools(page, touch) {
  await openPanel(page, 'animation', touch);
  const animation = page.locator('.animation-grid [data-animation-preset="zoom-in"]');
  await animation.scrollIntoViewIfNeeded();
  await (touch ? animation.tap() : animation.click());
  assert(await page.evaluate(() => state.clips.find(clip => clip.id === 'human-clip').animations.some(item => item.animationId === 'zoom-in')), 'Tapping an animated card applies its real editable animation');
  assert(await page.evaluate(() => state.clips.find(clip => clip.id === 'human-clip').keyframes.scale.length >= 2));

  await openPanel(page, 'transitions', touch);
  const transition = page.locator('.professional-transition-grid [data-transition="dissolve"]');
  await transition.scrollIntoViewIfNeeded();
  await (touch ? transition.tap() : transition.click());
  assert.equal(await page.evaluate(() => state.clips.find(clip => clip.id === 'human-clip').transition), 'dissolve', 'The looping transition card still applies to the selected clip');

  await openPanel(page, 'effects', touch, 'element');
  // Phones render twelve library results per page; locate this effect through
  // the same search control a creator uses rather than assuming a desktop page.
  const effectSearch = page.locator('[data-element-effect-search]');
  await effectSearch.scrollIntoViewIfNeeded();
  await effectSearch.fill('Golden Hour');
  await page.waitForFunction(() => document.querySelectorAll('.virtual-effect-grid [data-element-effect]').length === 1 && document.querySelector('.virtual-effect-grid [data-element-effect]')?.dataset.elementEffect === 'golden-hour');
  const element = page.locator('.virtual-effect-grid [data-element-effect="golden-hour"]');
  await element.waitFor({state: 'visible'});
  await element.scrollIntoViewIfNeeded();
  if (touch) await element.tap();
  else await element.dragTo(page.locator('[data-clip="human-clip"]'), {force: true});
  await page.waitForFunction(() => state.clips.find(clip => clip.id === 'human-clip').effectStack.some(item => item.effectId === 'golden-hour'));

  await openPanel(page, 'effects', touch, 'effects');
  const timelineEffect = page.locator('.effect-card[data-effect="film-burn"]');
  await timelineEffect.scrollIntoViewIfNeeded();
  if (touch) await timelineEffect.tap();
  else {
    const destination = page.locator('.timeline-new-track-drop');
    await destination.scrollIntoViewIfNeeded();
    const bounds = await destination.boundingBox();
    const position = {x: bounds.width * .7, y: bounds.height / 2};
    const hit = await page.evaluate(({x, y}) => Boolean(document.elementFromPoint(x, y)?.closest('.timeline-new-track-drop')), {x: bounds.x + position.x, y: bounds.y + position.y});
    assert(hit, 'The effect is dropped on the visible new-track target');
    await timelineEffect.dragTo(destination, {targetPosition: position});
  }
  await page.waitForFunction(() => state.clips.some(clip => clip.type === 'effect' && clip.effectId === 'film-burn'));
}

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const engines = process.env.ZORIFI_TEST_ENGINE ? [process.env.ZORIFI_TEST_ENGINE] : ['chromium', 'webkit'];
  try {
    for (const engine of engines) {
      if (engine === 'webkit' && !fs.existsSync(webkit.executablePath())) throw new Error('WebKit runtime unavailable');
      const browser = await (engine === 'webkit' ? webkit.launch({headless: true}) : chromium.launch({headless: true, executablePath: edge}));
      try {
        for (const touch of [false, true]) {
          const context = await browser.newContext({viewport: touch ? {width: 390, height: 844} : {width: 1440, height: 900}, hasTouch: touch, isMobile: touch && engine === 'chromium', serviceWorkers: 'block', reducedMotion: 'no-preference'});
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          if (!touch) await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', {value: 0, configurable: true}));
          await seed(page, url, touch);
          const loaded = await page.evaluate(async sources => Promise.all(sources.map(source => new Promise(resolve => {
            const image = new Image();
            image.onload = () => resolve({source, width: image.naturalWidth, height: image.naturalHeight});
            image.onerror = () => resolve({source, width: 0, height: 0});
            image.src = source;
          }))), humanSources);
          for (const image of loaded) assert(image.width >= 320 && image.height >= 180, `A real local human photograph loads: ${JSON.stringify(image)}`);
          await proveLoop(page, {panel: 'animation', kind: 'animation', id: 'zoom-in'}, touch);
          await proveLoop(page, {panel: 'transitions', kind: 'transition', id: 'dissolve'}, touch);
          await proveLoop(page, {panel: 'effects', section: 'effects', kind: 'timeline', id: 'film-burn'}, touch);
          await proveOffscreenPause(page);
          await page.screenshot({path: path.join(root, `artifacts/tool-preview-loops-${engine}-${touch ? 'phone' : 'desktop'}.png`)});
          await applyTools(page, touch);
          await page.evaluate(() => {state.activePanel = 'media';state.responsivePanel = '';render();});
          const stopped = await page.evaluate(() => ZorifiPocketEditor.previewStatus());
          assert.equal(stopped.registered, 0, 'Leaving the libraries unregisters old card canvases');
          assert.equal(stopped.running, false, 'Leaving the libraries stops their animation scheduler');
          assert.deepEqual(errors, []);
          console.log(`${engine} ${touch ? 'phone' : 'desktop'}: human photos, automatic repeated animation/transition/FX, offscreen pause, isolated previews and working ${touch ? 'tap' : 'tap/drag'} application passed`);
          await context.close();
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
