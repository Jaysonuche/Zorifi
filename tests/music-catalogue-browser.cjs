const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');

const artifacts = path.join(__dirname, '../artifacts');

async function decodeAudio(page, url) {
  return page.evaluate(async source => {
    const blob = await (await fetch(source)).blob();
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      const samples = buffer.getChannelData(0);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      return { duration: buffer.duration, rms: Math.sqrt(sum / samples.length), bytes: blob.size };
    } finally { await context.close(); }
  }, url);
}

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  fs.mkdirSync(artifacts, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#zorifi-startup').waitFor({ state: 'detached' });
    assert.equal(await page.locator('script[src^="zorifi-music-catalogue.js"]').count(), 1);
    assert.equal(await page.locator('link[href^="zorifi-music-catalogue.css"]').count(), 1);
    await page.evaluate(() => {
      currentUser = { id: 'music-catalogue-browser', name: 'Music creator' };
      syncPhase10Stores();
      termsAcceptance.accept();
      betaProgramState.acknowledge();
      state.view = 'home';
      render();
    });
    await page.locator('.quick-card[data-home-tool="autocut"]').click();
    await page.locator('[data-autocut-method]').selectOption('local');
    await page.locator('[data-autocut-duration]').fill('3');
    await page.locator('[data-autocut-soundtrack]').selectOption('builtin:golden-hour');
    assert.equal(await page.locator('[data-autocut-audio-files]').evaluate(input => input.files.length), 0);
    assert.equal(await page.locator('[data-autocut-soundtrack] optgroup[label^="Original Zorifi"] option').count(), 16);
    await page.locator('.music-trending-details summary').click();
    const catalogue = await page.locator('.music-inspiration-card').evaluateAll(cards => cards.map(card => ({
      title: card.querySelector('.music-inspiration-copy b').textContent,
      artist: card.querySelector('.music-inspiration-copy span').textContent,
      release: card.querySelector('.music-inspiration-copy small').textContent,
      listen: card.querySelector('.music-inspiration-actions a').href,
      trend: card.querySelector('.music-inspiration-copy a').href,
    })));
    assert(catalogue.length >= 2);
    assert(catalogue.every(track => track.title && track.artist && /Released 2026-\d{2}-\d{2}/.test(track.release) && /^https:\/\//.test(track.listen) && /^https:\/\//.test(track.trend)));
    assert.equal(await page.locator('.music-inspiration audio').count(), 0);
    await page.locator('.music-trending-details summary').click();
    await page.locator('[data-autocut-sound-preview]').click();
    const sound = page.locator('[data-autocut-sound-player]');
    await sound.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('[data-autocut-sound-player]').readyState >= 2);
    const preview = await decodeAudio(page, await sound.getAttribute('src'));
    assert(Math.abs(preview.duration - 3) < .01);
    assert(preview.rms > .03, `The original score must contain audible samples: ${JSON.stringify(preview)}`);
    const played = await sound.evaluate(async audio => {
      await audio.play();
      await new Promise(resolve => setTimeout(resolve, 350));
      audio.pause();
      return audio.currentTime;
    });
    assert(played > .15, 'The score preview must actually play');
    await page.screenshot({ path: path.join(artifacts, 'music-autocut-score.png') });

    // A silent photo proves the generated movie's audible samples come from
    // the selected original score, without requiring a user music import.
    const png = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#ce784d' } }).png().toBuffer();
    await page.locator('[data-autocut-files]').setInputFiles({ name: 'Quiet landscape.png', mimeType: 'image/png', buffer: png });
    await page.locator('.autocut-studio[data-autocut-phase="complete"]').waitFor({ timeout: 90000 });
    const movie = page.locator('[data-autocut-result]');
    await page.waitForFunction(() => document.querySelector('[data-autocut-result]').readyState >= 2);
    const rendered = await decodeAudio(page, await movie.getAttribute('src'));
    assert(rendered.duration >= 2.8 && rendered.duration <= 3.6, JSON.stringify(rendered));
    assert(rendered.rms > .01, `AutoCut must include the selected original score: ${JSON.stringify(rendered)}`);
    const moviePlayed = await movie.evaluate(async video => {
      await video.play();
      await new Promise(resolve => setTimeout(resolve, 400));
      video.pause();
      return video.currentTime;
    });
    assert(moviePlayed > .2, 'The finished movie with its original score must actually play');
    await page.screenshot({ path: path.join(artifacts, 'music-autocut-finished.png') });
    await page.locator('[data-autocut-edit]').click();
    await page.locator('.autocut-studio').waitFor({ state: 'detached' });
    const saved = await page.evaluate(() => {
      saveProject();
      const asset = state.mediaAssets.find(item => item.audioTrackId === 'golden-hour');
      return { id: state.projectId, asset, clip: state.clips.find(item => item.mediaId === asset?.id) };
    });
    assert(saved.asset?.builtin && saved.asset.persisted && saved.asset.localFile);
    assert.equal(saved.asset.name, 'Golden Hour · Zorifi original');
    assert.equal(saved.asset.builtinScoreDuration, 3);
    assert.equal(saved.asset.waveform.method, 'measured-pcm-peaks');
    assert.equal(saved.asset.waveform.peaks.length, 480);
    assert.equal(saved.clip?.type, 'audio');
    const reopened = await page.evaluate(async id => {
      const project = getSavedProjects().find(item => item.id === id);
      await loadProject(project);
      state.view = 'editor';
      render();
      return { asset: state.mediaAssets.find(item => item.audioTrackId === 'golden-hour'), missing: state.missingMedia };
    }, saved.id);
    assert.equal(reopened.missing, false);
    assert.equal(reopened.asset.builtinScoreDuration, 3);
    assert.equal(reopened.asset.waveform.method, 'measured-pcm-peaks');
    const restoredAudio = await decodeAudio(page, reopened.asset.url);
    assert(Math.abs(restoredAudio.duration - 3) < .01, 'Reload must preserve the generated score length');
    assert(restoredAudio.rms > .03);
    assert.deepEqual(errors, []);
    console.log('Music browser passed: sourced 2026 discovery metadata, 16 original scores, audible three-second preview, AutoCut movie with original score and no imported audio, and editable score/waveform persistence after reopening.');
    await page.close();
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
