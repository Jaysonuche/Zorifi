const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const sharp = require('sharp');
const { createServer } = require('../scripts/dev-server.cjs');

const root = path.resolve(__dirname, '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sizes = [[320, 700], [390, 844], [844, 390], [1024, 768], [1440, 900]];

async function fixture(name, color) {
  return { name, mimeType: 'image/png', buffer: await sharp({ create: { width: 320, height: 480, channels: 3, background: color } }).png().toBuffer() };
}
async function signedIn(page, id) {
  await page.goto(page.context()._options.baseURL);
  await page.locator('#zorifi-startup').waitFor({ state: 'detached' });
  await page.evaluate(userId => {
    currentUser = { id: userId, name: 'Photo Tester', identifier: `${userId}@example.invalid`, email: `${userId}@example.invalid` };
    syncPhase10Stores(); termsAcceptance.accept(); betaProgramState.acknowledge(); state.view = 'home'; renderHome();
  }, id);
}

(async () => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = process.env.ZORIFI_PHOTOS_ENGINE === 'webkit' ? 'webkit' : 'chromium';
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, ...(engine === 'chromium' && fs.existsSync(edge) ? { executablePath: edge } : {}) });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const pictures = await Promise.all([fixture('red.png', '#e63641'), fixture('blue.png', '#2f62e8'), fixture('green.png', '#31b679'), fixture('gold.png', '#eab244'), fixture('pink.png', '#dc65b0')]);
    for (const [width, height] of sizes) {
      const context = await browser.newContext({ viewport: { width, height }, baseURL: origin, serviceWorkers: 'block', isMobile: width < 500 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await signedIn(page, `photos-${width}-${height}`);
      assert.equal(await page.locator('.quick-card[data-home-tool="collage"]').count(), 0);
      await page.locator('.quick-card[data-home-tool="photos"]').click();
      await page.locator('[data-view="photos"]').waitFor();
      await page.locator('[data-photos-mode="collage"]').click();
      await page.locator('[data-photos-input]').setInputFiles(pictures);
      await page.waitForFunction(() => ZorifiPhotos.state.items.length === 5);
      assert.equal(await page.locator('.photos-picker-item.selected').count(), 5);
      await page.locator('[data-photos-create]').click();
      await page.locator('[data-photos-canvas]').waitFor();
      await page.waitForFunction(() => document.querySelector('[data-photos-canvas]').width > 0);
      assert.equal(await page.locator('[data-view="editor"]').count(), 0, 'Collage opens a finished-image workspace, not the video timeline');
      await page.locator('[data-photos-layout="focus"]').click();
      await page.locator('[data-photos-tab="ratio"]').click();
      await page.locator('[data-photos-ratio="story"]').click();
      await page.waitForFunction(() => { const canvas = document.querySelector('[data-photos-canvas]'); return canvas && canvas.height > 0 && Math.abs(canvas.width / canvas.height - 9 / 16) < .01; });
      const dims = await page.locator('[data-photos-canvas]').evaluate(canvas => [canvas.width, canvas.height]);
      assert.ok(Math.abs(dims[0] / dims[1] - 9 / 16) < .01);
      const beforeBrightness = await page.evaluate(() => { const canvas = document.createElement('canvas'); ZorifiPhotos.paint(canvas, 400); return [...canvas.getContext('2d').getImageData(Math.floor(canvas.width * .25), Math.floor(canvas.height * .5), 1, 1).data]; });
      await page.locator('[data-photos-tab="adjust"]').click();
      await page.locator('[data-photos-range="brightness"]').fill('150');
      const afterBrightness = await page.evaluate(() => { const canvas = document.createElement('canvas'); ZorifiPhotos.paint(canvas, 400); return [...canvas.getContext('2d').getImageData(Math.floor(canvas.width * .25), Math.floor(canvas.height * .5), 1, 1).data]; });
      assert.ok(afterBrightness[1] > beforeBrightness[1] + 8, `Brightness must change rendered pixels: ${beforeBrightness} → ${afterBrightness}`);
      await page.locator('[data-photos-undo]').click();
      assert.equal(await page.evaluate(() => ZorifiPhotos.state.brightness), 100, 'Undo restores the previous adjustment');
      await page.locator('[data-photos-redo]').click();
      assert.equal(await page.evaluate(() => ZorifiPhotos.state.brightness), 150, 'Redo reapplies the adjustment');
      await page.locator('[data-photos-tab="text"]').click();
      await page.locator('[data-photos-text-input]').fill('A night to remember');
      await page.locator('[data-photos-add-text]').click();
      assert.equal(await page.evaluate(() => ZorifiPhotos.state.overlays.length), 1);
      await page.locator('[data-photos-text-tab="fonts"]').click();
      await page.locator('[data-photos-font="editorial"]').click();
      await page.locator('[data-photos-text-tab="styles"]').click();
      await page.locator('[data-photos-text-effect="outline"]').click();
      await page.locator('[data-photos-text-tab="bubbles"]').click();
      await page.locator('[data-photos-bubble="dark"]').click();
      assert.deepEqual(await page.evaluate(() => { const text = ZorifiPhotos.state.overlays[0]; return [text.font, text.effect, text.bubble]; }), ['editorial', 'outline', 'dark']);
      await page.locator('[data-photos-text-tab="templates"]').click();
      await page.locator('[data-photos-text-template="neon"]').click();
      assert.equal(await page.evaluate(() => ZorifiPhotos.state.overlays[0].effect), 'glow');
      await page.locator('[data-photos-text-tab="write"]').click();
      await page.locator('[data-photos-new-text]').click();
      await page.locator('[data-photos-text-input]').fill('A second caption');
      await page.locator('[data-photos-add-text]').click();
      assert.deepEqual(await page.evaluate(() => ZorifiPhotos.state.overlays.map(item => item.text)), ['A night to remember', 'A second caption']);
      await page.locator('[data-photos-tab="elements"]').click();
      await page.locator('[data-photos-sticker="spark-star"]').click();
      assert.equal(await page.evaluate(() => ZorifiPhotos.state.overlays.at(-1).stickerId), 'spark-star');
      const result = await page.evaluate(async () => ({ bytes: (await ZorifiPhotos.exportBlob()).size, type: (await ZorifiPhotos.exportBlob()).type }));
      assert.ok(result.bytes > 10000); assert.equal(result.type, 'image/png');
      const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, controls: (() => { const r = document.querySelector('.photos-controls').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })() }));
      assert.ok(layout.width <= width + 1 && layout.bodyWidth <= width + 1, `${width}x${height} has horizontal overflow: ${JSON.stringify(layout)}`);
      assert.ok(layout.controls.left >= -1 && layout.controls.right <= width + 1 && layout.controls.top >= 0 && layout.controls.bottom <= height + 1, `${width}x${height} controls do not fit`);
      if (width === 390) await page.screenshot({ path: path.join(root, 'artifacts', 'photos-mobile-preview.png') });
      if (width === 1440) await page.screenshot({ path: path.join(root, 'artifacts', 'photos-desktop-preview.png') });
      assert.deepEqual(errors, [], `${width}x${height} page errors`);
      await context.close();
    }
    const photoContext = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: origin, serviceWorkers: 'block', isMobile: true });
    const photoPage = await photoContext.newPage(), photoErrors = [];
    photoPage.on('pageerror', error => photoErrors.push(error.message));
    await signedIn(photoPage, 'single-photo-check');
    await photoPage.locator('.quick-card[data-home-tool="photos"]').click();
    const simpleSubject = await sharp({ create: { width: 320, height: 480, channels: 3, background: '#ffffff' } })
      .composite([{ input: Buffer.from('<svg width="220" height="320"><rect width="220" height="320" rx="25" fill="#e1293c"/></svg>'), left: 50, top: 80 }]).png().toBuffer();
    await photoPage.locator('[data-photos-input]').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: simpleSubject });
    await photoPage.waitForFunction(() => ZorifiPhotos.state.items.length === 1);
    await photoPage.locator('[data-photos-create]').click();
    await photoPage.locator('[data-photos-tab="ratio"]').click();
    await photoPage.locator('[data-photos-ratio="square"]').click();
    await photoPage.locator('[data-photos-tab="edit"]').click();
    await photoPage.locator('[data-photos-rotate="90"]').click();
    assert.equal(await photoPage.evaluate(() => ZorifiPhotos.state.transforms[ZorifiPhotos.state.activeId].rotation), 90);
    await photoPage.locator('[data-photos-range="rotation"]').fill('45');
    const rotated = Buffer.from(await photoPage.evaluate(async () => Array.from(new Uint8Array(await (await ZorifiPhotos.exportBlob()).arrayBuffer()))));
    const rotatedPixels = await sharp(rotated).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const [x, y] of [[.02, .02], [.98, .02], [.02, .98], [.98, .98]]) {
      const offset = (Math.floor(y * rotatedPixels.info.height) * rotatedPixels.info.width + Math.floor(x * rotatedPixels.info.width)) * 3;
      assert.ok(rotatedPixels.data[offset] > 120, 'Rotated crop must cover every image corner');
    }
    await photoPage.locator('[data-photos-reset-transform]').click();
    await photoPage.locator('[data-photos-tab="ratio"]').click();
    await photoPage.locator('[data-photos-ratio="original"]').click();
    await photoPage.locator('[data-photos-tab="background"]').click();
    await photoPage.locator('[data-photos-background-preset="aurora"]').click();
    assert.equal(await photoPage.evaluate(() => ZorifiPhotos.state.backgroundPreset), 'aurora');
    await photoPage.locator('[data-photos-background]').fill('#00ff00');
    assert.equal(await photoPage.evaluate(() => ZorifiPhotos.state.backgroundPreset), 'solid');
    await photoPage.locator('[data-photos-cutout]').click();
    await photoPage.waitForFunction(() => ZorifiPhotos.state.transforms[ZorifiPhotos.state.activeId].cutout === true);
    const cutoutBytes = Buffer.from(await photoPage.evaluate(async () => Array.from(new Uint8Array(await (await ZorifiPhotos.exportBlob()).arrayBuffer()))));
    const cutout = await sharp(cutoutBytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x, y) => [...cutout.data.subarray((Math.floor(y * cutout.info.height) * cutout.info.width + Math.floor(x * cutout.info.width)) * 3, (Math.floor(y * cutout.info.height) * cutout.info.width + Math.floor(x * cutout.info.width)) * 3 + 3)];
    const corner = at(.03, .03), center = at(.5, .5);
    assert.ok(corner[1] > corner[0] * 1.5 && corner[1] > corner[2] * 1.5, `Removed background should reveal green canvas, got ${corner}`);
    assert.ok(center[0] > center[1] * 1.5, `Red subject should remain, got ${center}`);
    await photoPage.locator('[data-photos-back]').click();
    const largePhoto = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: '#7949c7' } }).png().toBuffer();
    await photoPage.locator('[data-photos-input]').setInputFiles({ name: 'large-photo.png', mimeType: 'image/png', buffer: largePhoto });
    await photoPage.waitForFunction(() => ZorifiPhotos.state.items.length === 2);
    assert.ok(await photoPage.evaluate(() => Math.max(...ZorifiPhotos.state.items.map(item => item.width), ...ZorifiPhotos.state.items.map(item => item.height)) <= 2600), 'Large photos are downsampled for bounded mobile editing memory');
    await photoPage.evaluate(() => {
      const data = document.createElement('canvas'); data.width = data.height = 2;
      const url = data.toDataURL('image/png');
      ZorifiPhotos.start({ origin: 'home', items: Array.from({ length: 12 }, (_, index) => ({ type: 'image', name: `Project ${index}`, url })) });
      ZorifiPhotos.render(document.querySelector('#app'));
    });
    await photoPage.locator('[data-photos-input]').setInputFiles(await fixture('another.png', '#333333'));
    await photoPage.waitForFunction(() => ZorifiPhotos.state.items.length === 13);
    await photoPage.locator('[data-photos-back]').click();
    assert.equal(await photoPage.evaluate(() => ZorifiPhotos.state.items.length), 0, 'Leaving Photos releases decoded images and temporary URLs');
    assert.deepEqual(photoErrors, []);
    await photoContext.close();
    const editContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: origin, serviceWorkers: 'block' });
    const editPage = await editContext.newPage(), editErrors = [];
    editPage.on('pageerror', error => editErrors.push(error.message));
    await signedIn(editPage, 'photos-editor-route');
    const newProjectChooser = editPage.waitForEvent('filechooser');
    await editPage.locator('[data-open-project="new"]').first().click();
    await (await newProjectChooser).setFiles(pictures.slice(0, 2));
    await editPage.waitForFunction(() => state.view === 'editor' && state.mediaAssets.filter(item => item.type === 'image' && item.localFile).length === 2);
    await editPage.locator('[data-media-quick-filter="photo"]').click();
    await editPage.locator('[data-open-photos="collage"]').click();
    assert.equal(await editPage.locator('[data-view="photos"]').count(), 1, 'Photos tab opens the separate photo workspace');
    await editPage.locator('.photos-picker-item').first().click();
    await editPage.locator('.photos-picker-item').nth(1).click();
    await editPage.locator('[data-photos-create]').click();
    await editPage.locator('[data-photos-use-in-editor]').click();
    await editPage.waitForFunction(() => state.view === 'editor' && state.clips.some(clip => clip.name.startsWith('Zorifi-collage-')));
    const vanessaReply = await editPage.evaluate(() => executeVanessaAction('create_collage'));
    assert.match(vanessaReply, /Photos/);
    assert.equal(await editPage.locator('[data-view="photos"]').count(), 1, 'Vanessa opens the Photos collage flow');
    assert.deepEqual(editErrors, []);
    await editContext.close();
    console.log(`${engine}: Photos collage, single-photo cutout, nested tools, PNG export, editor handoff, and five screen sizes passed.`);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
