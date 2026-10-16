const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const sharp = require('sharp');
const { createServer } = require('../scripts/dev-server.cjs');

const root = path.resolve(__dirname, '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function signedInHome(browser, origin, id) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.locator('#zorifi-startup').waitFor({ state: 'detached' });
  await page.evaluate(userId => {
    currentUser = { id: userId, name: 'Browser Editor', identifier: `${userId}@example.invalid`, email: `${userId}@example.invalid` };
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([currentUser]));
    localStorage.setItem(SESSION_KEY, currentUser.id);
    syncPhase10Stores();
    termsAcceptance.accept();
    betaProgramState.acknowledge();
    state.view = 'home';
    renderHome();
  }, id);
  await page.locator('[data-view="home"]').waitFor();
  return { page, errors };
}

async function makeImageFixtures(page) {
  const images = await page.evaluate(async () => {
    const make = async (name, color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      return { name, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
    };
    return Promise.all([make('red-source.png', '#e5363e'), make('blue-source.png', '#2a61e9')]);
  });
  return images.map(image => ({ name: image.name, mimeType: 'image/png', buffer: Buffer.from(image.bytes) }));
}

function pixelAt(data, info, x, y) {
  const at = (Math.floor(y) * info.width + Math.floor(x)) * info.channels;
  return Array.from(data.subarray(at, at + 3));
}

function assertRed(pixel, label) {
  assert.ok(pixel[0] > pixel[1] * 1.5 && pixel[0] > pixel[2] * 1.5,
    `${label} should be red, got ${pixel.join(',')}`);
}

function assertBlue(pixel, label) {
  assert.ok(pixel[2] > pixel[0] * 1.5 && pixel[2] > pixel[1] * 1.5,
    `${label} should be blue, got ${pixel.join(',')}`);
}

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
      ...(process.env.ZORIFI_BROWSER_EXECUTABLE
        ? { executablePath: process.env.ZORIFI_BROWSER_EXECUTABLE }
        : fs.existsSync(edge) ? { executablePath: edge } : {}),
    });
    const origin = `http://127.0.0.1:${server.address().port}`;

    const { page: autoPage, errors: autoErrors } = await signedInHome(browser, origin, 'autocut-browser');
    const homeNames = await autoPage.locator('.quick-card b,.creative-card strong').allInnerTexts();
    assert.ok(homeNames.includes('AutoCut') && homeNames.includes('Collage'), 'Both replacement tools should appear on Home');
    for (const oldName of ['Enhance', 'Motion Design Lab', 'Long video to shorts', 'Smart Video Studio']) {
      assert.ok(!homeNames.includes(oldName), `${oldName} should be removed from Home`);
    }
    assert.deepEqual(autoErrors, [], 'Home cards should have no page errors');
    await autoPage.close();

    const { page: collagePage, errors: collageErrors } = await signedInHome(browser, origin, 'collage-browser');
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    const colorImages = await makeImageFixtures(collagePage);
    const collageChooser = collagePage.waitForEvent('filechooser');
    await collagePage.locator('.quick-card[data-home-tool="collage"]').click();
    await (await collageChooser).setFiles(colorImages);
    await collagePage.locator('[data-collage-apply]').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await collagePage.locator('.collage-media-grid .selected').count(), 2,
      'Imported photos should be selected for the collage');
    await collagePage.locator('[data-collage-layout="split"]').click();
    await collagePage.locator('[data-collage-apply]').click();
    await collagePage.waitForFunction(() => state.clips.filter(clip => clip.collage?.cell).length === 2);
    const collage = await collagePage.evaluate(() => ({
      clips: state.clips.filter(clip => clip.collage?.cell).map(clip => ({ cell: clip.collage.cell, mediaId: clip.mediaId, start: clip.start, duration: clip.duration })),
      visualTiles: [...document.querySelectorAll('.preview-collage-cell')].map(element => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, visible: rect.width > 0 && rect.height > 0 };
      }),
    }));
    assert.equal(collage.clips.length, 2, 'Collage should create two separately editable clips');
    assert.equal(collage.visualTiles.length, 2, 'Both collage tiles should render in the editor preview');
    assert.ok(collage.visualTiles.every(tile => tile.visible), 'Collage tiles should have visible dimensions');
    assert.ok(collage.clips.every(clip => clip.cell.width > 40 && clip.cell.height > 90),
      `Split collage should occupy both halves of the frame: ${JSON.stringify(collage.clips)}`);
    const previewPng = await collagePage.locator('.preview').screenshot({ path: path.join(root, 'artifacts', 'collage-preview.png') });
    const previewRaw = await sharp(previewPng).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assertRed(pixelAt(previewRaw.data, previewRaw.info, previewRaw.info.width * .25, previewRaw.info.height * .5), 'Left preview tile');
    assertBlue(pixelAt(previewRaw.data, previewRaw.info, previewRaw.info.width * .75, previewRaw.info.height * .5), 'Right preview tile');
    const exportCanvasData = await collagePage.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 225;
      const context = canvas.getContext('2d');
      context.fillStyle = '#080910';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const layers = state.clips.filter(clip => clip.collage?.cell).sort((left, right) => left.track - right.track);
      for (const clip of layers) {
        const asset = state.mediaAssets.find(item => item.id === clip.mediaId);
        const image = new Image();
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = asset.url; });
        drawContainedMedia(context, image, clip, canvas.width, canvas.height, .5);
      }
      return canvas.toDataURL('image/png');
    });
    const exportPng = Buffer.from(exportCanvasData.split(',')[1], 'base64');
    fs.writeFileSync(path.join(root, 'artifacts', 'collage-export-canvas.png'), exportPng);
    const exportRaw = await sharp(exportPng).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assertRed(pixelAt(exportRaw.data, exportRaw.info, 100, 112), 'Left exported tile');
    assertBlue(pixelAt(exportRaw.data, exportRaw.info, 300, 112), 'Right exported tile');
    assert.deepEqual(collageErrors, [], 'Collage browser path should have no page errors');
    await collagePage.close();

    console.log('Home tool cards and Collage browser integration passed: import, editable layers, preview and export composition. AutoCut finished-video flow is covered by autocut-finished-browser.cjs.');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
