const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function signedInHome(browser, origin, id) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.locator('#zorifi-startup').waitFor({ state: 'detached' });
  await page.evaluate(userId => {
    currentUser = { id: userId, name: 'AutoCut Tester', identifier: `${userId}@example.invalid`, email: `${userId}@example.invalid` };
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([currentUser]));
    localStorage.setItem(SESSION_KEY, currentUser.id);
    syncPhase10Stores();
    termsAcceptance.accept();
    betaProgramState.acknowledge();
    createNewProject();
    state.currentProject = 'Existing project stays safe';
    state.clips.push({ id: 'keep-existing-caption', type: 'text', name: 'Keep my existing work', start: 0, duration: 3, track: 2, opacity: 100 });
    saveProject();
    state.view = 'home';
    renderHome();
    window.__autoCutEditorExposures = 0;
    window.__autoCutObserver = new MutationObserver(() => {
      if (document.querySelector('[data-view="editor"]')) window.__autoCutEditorExposures++;
    });
    window.__autoCutObserver.observe(document.querySelector('#app') || document.body, { childList: true, subtree: true });
  }, id);
  await page.locator('[data-view="home"]').waitFor();
  return { page, errors };
}

async function projectSnapshot(page) {
  return page.evaluate(() => ({
    id: state.projectId,
    name: state.currentProject,
    clips: JSON.stringify(state.clips),
    media: JSON.stringify(state.mediaAssets),
    ratio: state.ratio,
    saved: getSavedProjects().map(project => ({ id: project.id, name: project.name })).sort((a, b) => a.id.localeCompare(b.id)),
  }));
}

async function makeVideoFixture(page) {
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 72;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(15);
    const audio = new AudioContext();
    await audio.resume();
    const oscillator = audio.createOscillator();
    oscillator.frequency.value = 440;
    const gain = audio.createGain();
    gain.gain.value = .05;
    const output = audio.createMediaStreamDestination();
    oscillator.connect(gain).connect(output);
    oscillator.start();
    output.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    const mimeType = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp8,opus']
      .find(type => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 200000 });
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = event => reject(event.error || new Error('Fixture recording failed'));
    });
    const started = performance.now();
    const draw = () => {
      const elapsed = (performance.now() - started) / 1000;
      context.fillStyle = elapsed < 1 ? '#ec7936' : elapsed < 2 ? '#294dce' : '#d64d79';
      context.fillRect(0, 0, 128, 72);
      context.fillStyle = '#ffffff';
      context.fillRect(Math.round((elapsed * 23) % 90), 13, 24, 42);
    };
    draw();
    recorder.start();
    const timer = setInterval(draw, 60);
    await new Promise(resolve => setTimeout(resolve, 3150));
    clearInterval(timer);
    recorder.stop();
    await stopped;
    oscillator.stop();
    stream.getTracks().forEach(track => track.stop());
    await audio.close();
    const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
    return { mimeType: blob.type, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
  });
  return {
    name: result.mimeType === 'video/mp4' ? 'autocut-moving-source.mp4' : 'autocut-moving-source.webm',
    mimeType: result.mimeType,
    buffer: Buffer.from(result.bytes),
  };
}

async function makePhotoFixtures(page) {
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
    return Promise.all([make('red-photo.png', '#e5363e'), make('blue-photo.png', '#2a61e9')]);
  });
  return images.map(image => ({ name: image.name, mimeType: 'image/png', buffer: Buffer.from(image.bytes) }));
}

async function chooseAutoCutMedia(page, media, duration = 3) {
  await page.locator('.quick-card[data-home-tool="autocut"]').click();
  await page.locator('.autocut-studio[data-autocut-phase="select"]').waitFor();
  await page.locator('[data-autocut-method]').selectOption('local');
  await page.locator('[data-autocut-duration]').fill(String(duration));
  await page.locator('[data-autocut-files]').setInputFiles(media);
  await page.locator('.autocut-studio[data-autocut-phase="loading"]').waitFor();
}

async function inspectFinishedVideo(page) {
  await page.locator('.autocut-studio[data-autocut-phase="complete"]').waitFor({ timeout: 60000 });
  const result = await page.locator('[data-autocut-result]').evaluate(async video => {
    video.pause();
    if (video.readyState < 2) await new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error('Finished movie failed to decode')), { once: true });
    });
    const blob = await (await fetch(video.src)).blob();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 36;
    const context = canvas.getContext('2d');
    const frames = [];
    for (const fraction of [.1, .5, .85]) {
      const time = Math.min(video.duration - .05, Math.max(.05, video.duration * fraction));
      await new Promise(resolve => {
        if (Math.abs(video.currentTime - time) < .01) return resolve();
        video.addEventListener('seeked', resolve, { once: true });
        video.currentTime = time;
      });
      context.drawImage(video, 0, 0, 64, 36);
      const pixels = context.getImageData(0, 0, 64, 36).data;
      const total = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 4) {
        total[0] += pixels[i]; total[1] += pixels[i + 1]; total[2] += pixels[i + 2];
      }
      frames.push(total.map(value => Math.round(value / (64 * 36))));
    }
    let audioRms=0;
    if(video.mozHasAudio||video.webkitAudioDecodedByteCount>0||video.audioTracks?.length){
      const audio=new AudioContext();
      try{const decoded=await audio.decodeAudioData(await blob.arrayBuffer()),samples=decoded.getChannelData(0);audioRms=Math.sqrt(samples.reduce((sum,sample)=>sum+sample*sample,0)/samples.length);}finally{await audio.close();}
    }
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, bytes: blob.size, mime: blob.type, frames, audioRms, source: video.src };
  });
  assert.ok(Number.isFinite(result.duration) && result.duration > 1, `A finished video must have a finite playback duration: ${JSON.stringify(result)}`);
  assert.ok(result.width > 0 && result.height > 0 && result.bytes > 1000, 'Result must contain real encoded video');
  assert.ok(result.frames.every(frame => frame.some(channel => channel > 15)), `Rendered source frames must not be black: ${JSON.stringify(result.frames)}`);
  assert.match(result.mime, /^video\//);
  const played=await page.locator('[data-autocut-result]').evaluate(async video=>{
    video.currentTime=0;await video.play();
    await new Promise(resolve=>setTimeout(resolve,650));
    const time=video.currentTime;video.pause();return time;
  });
  assert.ok(played>.3, `Finished movie must actually play, not just expose a Blob URL: ${played}`);
  return result;
}

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  fs.mkdirSync(artifacts, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'],
      ...(process.env.ZORIFI_BROWSER_EXECUTABLE ? { executablePath: process.env.ZORIFI_BROWSER_EXECUTABLE } : fs.existsSync(edge) ? { executablePath: edge } : {}),
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const { page, errors } = await signedInHome(browser, origin, 'autocut-finished-browser');
    const baseline = await projectSnapshot(page);
    const media = await makeVideoFixture(page);
    await chooseAutoCutMedia(page, media);
    assert.deepEqual(await projectSnapshot(page), baseline, 'Automatic rendering must not mutate the existing project');
    await page.locator('.autocut-studio').screenshot({ path: path.join(artifacts, 'autocut-generating.png') });
    const finished = await inspectFinishedVideo(page);
    assert.ok(finished.audioRms>.005, `Original audio must remain audible in the generated file: ${finished.audioRms}`);
    assert.ok(finished.duration <= 3.6, `Selected three-second duration should be respected: ${finished.duration}`);
    assert.deepEqual(await projectSnapshot(page), baseline, 'Finishing a movie must preserve the project until Edit further');
    assert.equal(await page.evaluate(() => window.__autoCutEditorExposures), 0, 'AutoCut must never expose the editor before Edit further');
    await page.locator('.autocut-studio').screenshot({ path: path.join(artifacts, 'autocut-finished.png') });
    const downloadReady = page.waitForEvent('download');
    await page.locator('[data-autocut-download]').click();
    const download = await downloadReady;
    assert.match(download.suggestedFilename(), finished.mime.includes('mp4') ? /\.mp4$/i : /\.webm$/i, 'Download extension must match the actual recording format');
    await download.saveAs(path.join(artifacts, `autocut-finished${path.extname(download.suggestedFilename())}`));
    assert.equal(await download.failure(), null, 'Finished movie download should succeed');
    await page.evaluate(() => window.__autoCutObserver.disconnect());
    await page.locator('[data-autocut-edit]').click();
    await page.locator('[data-view="editor"]').waitFor({ timeout: 30000 });
    const edited = await page.evaluate(() => ({
      id: state.projectId,
      clips: state.clips.filter(clip => clip.autoCutEvidence).map(clip => ({ sourceStart: clip.sourceStart, duration: clip.duration, sourceDuration: state.mediaAssets.find(asset => asset.id === clip.mediaId)?.duration })),
      preserved: getSavedProjects().find(project => project.name === 'Existing project stays safe')?.clips?.some(clip => clip.id === 'keep-existing-caption'),
    }));
    assert.notEqual(edited.id, baseline.id, 'Edit further must create a separate project');
    assert.ok(edited.preserved, 'The previous saved project must survive Edit further');
    assert.ok(edited.clips.length > 0, 'Edit further should expose actual editable AutoCut shots');
    assert.ok(edited.clips.every(clip => Number.isFinite(clip.sourceStart) && clip.sourceStart >= 0 && clip.sourceStart + clip.duration <= clip.sourceDuration + .1), `Editable shots must retain valid source ranges: ${JSON.stringify(edited.clips)}`);
    assert.deepEqual(errors, [], 'Finished movie path should have no browser errors');
    await page.close();

    const { page: cancelPage, errors: cancelErrors } = await signedInHome(browser, origin, 'autocut-cancel-browser');
    const cancelBaseline = await projectSnapshot(cancelPage);
    const photos = await makePhotoFixtures(cancelPage);
    await chooseAutoCutMedia(cancelPage, photos, 4);
    await cancelPage.locator('.autocut-studio[data-autocut-stage="rendering"]').waitFor({ timeout: 30000 });
    await cancelPage.locator('[data-autocut-close]').click();
    await cancelPage.locator('.autocut-studio').waitFor({ state: 'detached' });
    await cancelPage.waitForTimeout(4500);
    assert.deepEqual(await projectSnapshot(cancelPage), cancelBaseline, 'Cancelling during rendering must preserve the current and saved projects');
    assert.equal(await cancelPage.locator('.autocut-studio').count(), 0, 'Cancelled rendering must not reopen a result later');
    assert.equal(await cancelPage.evaluate(() => window.__autoCutEditorExposures), 0, 'Cancellation must not open the editor');
    await chooseAutoCutMedia(cancelPage, photos, 4);
    const photoResult = await inspectFinishedVideo(cancelPage);
    assert.ok(Math.max(...photoResult.frames.map(frame => frame[0])) > 60 && Math.max(...photoResult.frames.map(frame => frame[2])) > 60, 'Photo montage should include visible source colour');
    assert.notDeepEqual(photoResult.frames[0], photoResult.frames[2], 'A multiple-photo edit must progress across the selected sources');
    await cancelPage.setViewportSize({ width: 390, height: 844 });
    await cancelPage.locator('.autocut-studio').screenshot({ path: path.join(artifacts, 'autocut-finished-mobile.png') });
    const bounds = await cancelPage.locator('.autocut-studio').boundingBox();
    assert.ok(bounds.width <= 390 && bounds.x >= 0, 'AutoCut must fit the phone viewport');
    await cancelPage.locator('[data-autocut-close]').click();
    assert.deepEqual(await projectSnapshot(cancelPage), cancelBaseline, 'Closing the finished preview must leave the existing project intact');
    assert.deepEqual(cancelErrors, [], 'Cancellation and photo montage must have no browser errors');
    await cancelPage.close();
    console.log('AutoCut finished-video flow passed: automatic rendering, encoded playable preview, download, optional editing, cancellation, prior-project preservation and mobile layout.');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
