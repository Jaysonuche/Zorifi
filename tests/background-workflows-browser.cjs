const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ status: 401, json: { error: 'No provider in this local matte fixture.' } }));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.locator('.zorifi-opening').waitFor({ state: 'detached' });
    const original = await page.evaluate(async () => {
      currentUser = { id: 'background-fixture', name: 'Background editor', language: 'en-GB' };
      syncPhase10Stores(); termsAcceptance.accept(); betaProgramState.acknowledge(); createNewProject();
      state.creatorSettings.addZorifiEnding = false; state.clips = []; state.mediaAssets = [];
      state.frameWidth = 320; state.frameHeight = 180; state.ratio = '16 / 9'; state.view = 'editor';
      const source = document.createElement('canvas'); source.width = 320; source.height = 180;
      const context = source.getContext('2d'); context.fillStyle = '#00ff00'; context.fillRect(0, 0, 320, 180);
      context.fillStyle = '#ff0000'; context.fillRect(110, 40, 100, 100);
      const file = new File([await new Promise(resolve => source.toBlob(resolve, 'image/png'))], 'source-green-red.png', { type: 'image/png' });
      await importFiles([file]); const asset = state.mediaAssets[0]; addMediaToTimeline(asset.id);
      const clip = state.clips.find(c => c.mediaId === asset.id); clip.duration = 2;
      state.selected = clip.id; state.currentTime = 0; state.activePanel = 'background';
      state.undo = []; state.redo = []; render(); saveProject();
      return { projectId: state.projectId, mediaId: asset.id, clipId: clip.id, user: currentUser };
    });
    await page.waitForFunction(() => document.querySelector('[data-preview-clip]')?.naturalWidth > 0);
    const readMatte = async () => page.evaluate(async () => {
      const clip = cutoutTargetClip(), image = new Image(); image.src = clip.manualMaskData; await image.decode();
      const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
      c.getContext('2d').drawImage(image, 0, 0);
      return { center: c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data[3], edge: c.getContext('2d').getImageData(5, 5, 1, 1).data[3], mediaId: clip.mediaId, method: clip.backgroundRemoval.method };
    });
    async function strokeCenter() {
      const rect = await page.locator('[data-mask-paint-canvas]').boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down(); await page.mouse.up();
    }
    await page.evaluate(() => { window.backgroundFixturePending = ZorifiBackgroundTool.run({ mode: 'simple' }); });
    await page.locator('[data-background-apply]:enabled').waitFor(); await page.locator('[data-background-apply]').click();
    await page.waitForFunction(() => cutoutTargetClip()?.backgroundRemoval?.method === 'simple');
    const automatic = await readMatte(); assert.equal(automatic.center, 255); assert.equal(automatic.edge, 0);
    assert.equal(automatic.mediaId, original.mediaId); assert.equal(await page.evaluate(() => state.mediaAssets.length), 1);
    await page.evaluate(async () => { await window.backgroundFixturePending; undo(); });
    assert.equal(await page.evaluate(() => cutoutTargetClip().maskShape || 'none'), 'none');
    await page.locator('[data-mask-paint]').click();
    await page.locator('[data-paint-reset="all"]').click();
    await page.locator('[data-paint-mode="erase"]').click(); await strokeCenter();
    await page.locator('[data-paint-apply]').click(); await page.locator('.mask-painter-backdrop').waitFor({ state: 'detached' });
    const erased = await readMatte(); assert.equal(erased.center, 0); assert.equal(erased.edge, 255); assert.equal(erased.mediaId, original.mediaId);
    assert.equal(erased.method, 'manual');
    await page.evaluate(() => undo()); assert.equal(await page.evaluate(() => cutoutTargetClip().maskShape || 'none'), 'none');
    await page.evaluate(() => redo()); assert.equal((await readMatte()).center, 0);
    await page.locator('[data-mask-paint]').click(); await page.locator('[data-paint-mode="keep"]').click(); await strokeCenter();
    await page.locator('[data-paint-apply]').click(); await page.locator('.mask-painter-backdrop').waitFor({ state: 'detached' });
    assert.equal((await readMatte()).center, 255);
    await page.evaluate(() => ZorifiBackgroundTool.configure({ maskInvert: true, maskFeather: 5 }));
    assert.equal(await page.evaluate(() => cutoutTargetClip().maskInvert), true);
    await page.evaluate(() => ZorifiBackgroundTool.reset());
    assert.equal(await page.evaluate(() => cutoutTargetClip().maskShape), 'none');
    await page.locator('details.background-method').filter({ hasText: 'Chroma Key' }).locator('summary').click();
    await page.locator('[data-motion-toggle="chromaKey"]').first().click();
    const chromaPixels = await page.evaluate(async () => {
      const clip = cutoutTargetClip(); clip.motion = { version: 1 }; saveProject(); render();
      const image = new Image(); image.src = state.mediaAssets.find(a => a.id === clip.mediaId).url; await image.decode();
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      ZorifiMotionRenderer.draw(c.getContext('2d'), state, 0, { source: () => image });
      const sample = (x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data];
      return { center: sample(160, 90), edge: sample(5, 5) };
    });
    assert(chromaPixels.center[0] > 240 && chromaPixels.center[1] < 10, JSON.stringify(chromaPixels));
    assert(chromaPixels.edge[3] < 10 || chromaPixels.edge[1] < 10, JSON.stringify(chromaPixels));
    await page.evaluate(id => {
      ZorifiMotionWorkspace.apply({ command: 'composition.precompose', parameters: { id: 'background-nest', layerIds: [id], width: 320, height: 180 } });
      state.selected = id; state.activePanel = 'background'; render();
    }, original.clipId);
    await page.locator('[data-mask-paint]').click(); await page.locator('[data-paint-reset="blank"]').click();
    await page.locator('[data-paint-mode="keep"]').click(); await strokeCenter();
    await page.locator('[data-paint-apply]').click(); await page.locator('.mask-painter-backdrop').waitFor({ state: 'detached' });
    assert.equal((await readMatte()).edge, 0, 'Nested brush Apply must commit to the native child layer.');
    const saved = await page.evaluate(() => ({ clips: state.clips, projectId: state.projectId, selected: state.selected }));
    await page.reload(); await page.locator('.zorifi-opening').waitFor({ state: 'detached' });
    await page.evaluate(async ({ saved, user }) => { currentUser = user; syncPhase10Stores(); termsAcceptance.accept(); betaProgramState.acknowledge(); await loadProject(getSavedProjects().find(p => p.id === saved.projectId)); state.selected = saved.selected; state.activePanel = 'background'; state.view = 'editor'; render(); }, { saved, user: original.user });
    assert.deepEqual(await page.evaluate(() => state.clips), saved.clips);
    assert.equal((await readMatte()).edge, 0); assert.equal((await readMatte()).mediaId, original.mediaId);
    const format = await page.evaluate(() => { showExport(); return preferredMime('mp4') ? 'mp4' : 'webm'; });
    const modal = page.locator('.export-modal');
    await modal.locator('[data-export-resolution]').selectOption('custom');
    await modal.locator('[data-export-width]').fill('320'); await modal.locator('[data-export-height]').fill('180');
    await modal.locator('[data-export-fps]').selectOption('24'); await modal.locator('[data-export-format]').selectOption(format);
    const ready = page.waitForEvent('download', { timeout: 45000 }); await modal.locator('[data-start]').click();
    const downloaded = await ready, output = 'artifacts/consolidated-background-export.' + format;
    await downloaded.saveAs(output); const bytes = fs.readFileSync(output); assert(bytes.length > 1000);
    await page.route('**/background-export-check', route => route.fulfill({ contentType: 'video/' + format, body: bytes }));
    const exportPixels = await page.evaluate(async () => {
      const blob = await (await fetch('/background-export-check')).blob(), url = URL.createObjectURL(blob), video = document.createElement('video');
      video.muted = true; video.src = url;
      try {
        await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(Error('Background export did not decode.')); });
        video.currentTime = .5; await new Promise(resolve => video.onseeked = resolve);
        const c = document.createElement('canvas'); c.width = 320; c.height = 180; c.getContext('2d').drawImage(video, 0, 0);
        const pixel = (x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data];
        return { center: pixel(160, 90), edge: pixel(5, 5), width: video.videoWidth, height: video.videoHeight };
      } finally { URL.revokeObjectURL(url); }
    });
    assert(exportPixels.center[0] > 200 && exportPixels.center[1] < 30, JSON.stringify(exportPixels));
    assert(exportPixels.edge.slice(0, 3).every(value => value < 30), JSON.stringify(exportPixels));
    assert.equal(exportPixels.width, 320); assert.equal(exportPixels.height, 180);
    fs.writeFileSync('artifacts/consolidated-background-export.json', JSON.stringify({ format, ...exportPixels }, null, 2));
    assert.deepEqual(errors, []);
    console.log('Actual automatic even-colour matte, brush erase/restore, original-source retention, native Undo/Redo, refinement/reset, chroma pixels, nested matte Apply, save/reopen and decoded nested-matte ' + format + ' export passed. No automatic person segmentation/provider quality claim.');
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
