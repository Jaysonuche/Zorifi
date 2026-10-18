const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');

async function fixtures() {
  fs.mkdirSync(artifacts, { recursive: true });
  const photo = path.join(artifacts, 'autocut-48mp-photo.jpg');
  await sharp({ create: { width: 8000, height: 6000, channels: 3, background: '#d85438' } })
    .composite([{ input: Buffer.from('<svg width="8000" height="6000"><rect x="4000" width="4000" height="6000" fill="#355add"/><circle cx="4000" cy="3000" r="1200" fill="#f6d18a"/></svg>') }])
    .jpeg({ quality: 90 }).toFile(photo);

  // A real MP4 with a standards-compliant free atom. Its actual File.size is
  // large; we never replace File.size or hand an invalid zero-filled video to UI.
  // This isolates byte-size handling from codec workload, while the 48MP photo
  // independently exercises large decoded pixel dimensions.
  const movie = path.join(artifacts, 'autocut-large-source.mp4');
  const encoded = fs.readFileSync(path.join(root, 'assets/template-previews/cinematic-travel.mp4'));
  const paddingBytes = 288 * 1024 * 1024;
  const fd = fs.openSync(movie, 'w');
  try {
    fs.writeSync(fd, encoded);
    const header = Buffer.alloc(8);
    header.writeUInt32BE(paddingBytes, 0);
    header.write('free', 4, 'ascii');
    fs.writeSync(fd, header, 0, header.length, encoded.length);
    fs.ftruncateSync(fd, encoded.length + paddingBytes);
  } finally { fs.closeSync(fd); }
  assert.ok(fs.statSync(movie).size > 256 * 1024 * 1024);
  return { photo, movie };
}

async function main() {
  const files = await fixtures();
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    browser = await chromium.launch({
      headless: true,
      ...(process.env.ZORIFI_BROWSER_EXECUTABLE ? { executablePath: process.env.ZORIFI_BROWSER_EXECUTABLE } : fs.existsSync(edge) ? { executablePath: edge } : {}),
      args: ['--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__largeSourceCopies = [];
      window.__largeCanvasAllocations = [];
      window.__bitmapRequests = [];
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        if (this.width * this.height > 4_000_000) window.__largeCanvasAllocations.push({ width: this.width, height: this.height });
        return getContext.apply(this, args);
      };
      if (window.createImageBitmap) {
        const createImageBitmap = window.createImageBitmap.bind(window);
        window.createImageBitmap = function (source, ...args) {
          if (source instanceof Blob) window.__bitmapRequests.push({ name: source.name || '', size: source.size, options: args.at(-1) });
          return createImageBitmap(source, ...args);
        };
      }
      const arrayBuffer = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = function () {
        if (this.size > 64 * 1024 * 1024) {
          window.__largeSourceCopies.push({ method: 'arrayBuffer', size: this.size });
          throw new Error('Regression: the entire large source was copied into JavaScript memory.');
        }
        return arrayBuffer.call(this);
      };
      const readAsDataURL = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function (blob) {
        if (blob.size > 64 * 1024 * 1024 || blob.name === 'autocut-48mp-photo.jpg') {
          window.__largeSourceCopies.push({ method: 'dataURL', size: blob.size });
          throw new Error('Regression: AutoCut base64-encoded a complete selected source.');
        }
        return readAsDataURL.call(this, blob);
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#zorifi-startup').waitFor({ state: 'detached' });
    const originalProject = await page.evaluate(() => {
      currentUser = { id: 'autocut-large-import', name: 'Large media tester', email: 'large@example.invalid' };
      syncPhase10Stores(); termsAcceptance.accept(); betaProgramState.acknowledge();
      createNewProject(); state.currentProject = 'Preserve the existing project';
      state.clips.push({ id: 'existing-title', type: 'text', name: 'Keep this work', start: 0, duration: 3, track: 2 });
      saveProject(); state.view = 'home'; renderHome();
      return state.projectId;
    });
    await page.locator('.quick-card[data-home-tool="autocut"]').click();
    await page.locator('[data-autocut-method]').selectOption('local');
    await page.locator('[data-autocut-duration]').fill('4');
    await page.locator('[data-autocut-style]').selectOption('balanced');
    const importStarted = performance.now();
    await page.locator('[data-autocut-files]').setInputFiles([files.photo, files.movie]);
    await page.waitForFunction(() => ['complete', 'error'].includes(document.querySelector('.autocut-studio')?.dataset.autocutPhase), null, { timeout: 180000 });
    const importToReadySeconds = (performance.now() - importStarted) / 1000;
    assert.equal(await page.locator('.autocut-studio').getAttribute('data-autocut-phase'), 'complete', await page.locator('.autocut-studio-body').innerText());
    assert.equal(await page.evaluate(() => state.projectId), originalProject, 'Generating must preserve the existing project');
    const output = await page.locator('[data-autocut-result]').evaluate(async video => {
      if (video.readyState < 2) await new Promise((resolve, reject) => {
        video.addEventListener('loadeddata', resolve, { once: true });
        video.addEventListener('error', () => reject(new Error('Output could not decode')), { once: true });
      });
      await video.play(); await new Promise(resolve => setTimeout(resolve, 450)); video.pause();
      return { duration: video.duration, time: video.currentTime, width: video.videoWidth, height: video.videoHeight };
    });
    assert.ok(output.duration >= 3.9 && output.duration < 5, JSON.stringify(output));
    assert.ok(output.time > .25 && output.width >= 720 && output.height > 0, 'Finished output must really play');
    await page.locator('.autocut-studio').screenshot({ path: path.join(artifacts, 'autocut-large-import.png') });
    const saveStarted = performance.now();
    await page.locator('[data-autocut-edit]').click();
    await page.locator('[data-view="editor"]').waitFor({ timeout: 60000 });
    const persisted = await page.evaluate(async () => ({
      projectId: state.projectId,
      originalProjectPreserved: getSavedProjects().some(project => project.name === 'Preserve the existing project' && project.clips.some(clip => clip.id === 'existing-title')),
      assets: await Promise.all(state.mediaAssets.map(async asset => {
        const blob = await getProjectMedia(state.projectId, asset.id);
        return { name: asset.name, size: asset.size, width: asset.width, height: asset.height, storedBytes: blob?.size, restoredUrl: /^blob:/.test(asset.url || '') };
      })),
      fullCopies: window.__largeSourceCopies,
      bitmapRequests: window.__bitmapRequests,
      largeCanvases: window.__largeCanvasAllocations,
    }));
    fs.writeFileSync(path.join(artifacts, 'autocut-large-import-proof.json'), JSON.stringify({ output, timings: { importToReadySeconds, saveSeconds: (performance.now() - saveStarted) / 1000 }, ...persisted }, null, 2));
    assert.notEqual(persisted.projectId, originalProject);
    assert.equal(persisted.originalProjectPreserved, true);
    const photo = persisted.assets.find(asset => asset.name === path.basename(files.photo));
    const movie = persisted.assets.find(asset => asset.name === path.basename(files.movie));
    assert.ok(photo && movie, 'Both large sources must survive as editable media');
    assert.equal(photo.width, 8000); assert.equal(photo.height, 6000);
    assert.equal(photo.storedBytes, fs.statSync(files.photo).size, 'Original photo must be stored, not a destructive preview replacement');
    assert.equal(movie.storedBytes, fs.statSync(files.movie).size, 'Original video must be stored without a size cap');
    assert.ok(photo.restoredUrl && movie.restoredUrl);
    assert.deepEqual(persisted.fullCopies, [], 'Large original files must never be base64 encoded or decoded in one audio ArrayBuffer');
    assert.deepEqual(persisted.largeCanvases, [], 'Import, analysis and rendering must never allocate an original 48MP canvas');
    assert.ok(persisted.bitmapRequests.some(request => request.name === path.basename(files.photo) && request.options?.resizeWidth > 0 && request.options.resizeWidth <= 1920 && request.options?.resizeHeight > 0 && request.options.resizeHeight <= 1920), `Large photos must use a bounded native bitmap resize: ${JSON.stringify(persisted.bitmapRequests)}`);
    assert.deepEqual(errors, []);
    console.log('AutoCut large import passed: 48MP photo and real 288MiB MP4, bounded source reads, playable output, original media persistence and previous project preservation.');
  } finally {
    await browser?.close(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    // The very large size fixture is reproducible; keep only the compact proof.
    if (path.dirname(files.movie) === artifacts && fs.existsSync(files.movie)) fs.unlinkSync(files.movie);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
