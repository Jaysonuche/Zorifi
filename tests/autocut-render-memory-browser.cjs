const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { chromium } = require('playwright');

// Exercise real decoded originals while measuring decoder lifetime, rather
// than relying on a nondeterministic browser heap measurement or small images.
async function main() {
  const root = path.resolve(__dirname, '..');
  const photo = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: '#b648ef' } }).jpeg().toBuffer();
  const browser = await chromium.launch({
    executablePath: process.env.ZORIFI_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<h1>Large original render lifecycle test</h1>');
    await page.addScriptTag({ path: path.join(root, 'zorifi-autocut-renderer.js') });
    const result = await page.evaluate(async ({ jpeg, camera }) => {
      const stats = { active: 0, maxActive: 0, opening: 0, maxOpening: 0, opens: 0, releases: 0, bounds: [], events: [] };
      const photoBytes = Uint8Array.from(atob(jpeg), character => character.charCodeAt(0));
      const assets = Array.from({ length: 15 }, (_, index) => {
        const file = new File([photoBytes], `24-megapixel-${index}.jpg`, { type: 'image/jpeg' });
        return { id: `photo-${index}`, name: file.name, type: 'image', file, url: URL.createObjectURL(file) };
      });
      const cameraBytes = Uint8Array.from(atob(camera), character => character.charCodeAt(0));
      const file = new File([cameraBytes], '4k-camera-original.mp4', { type: 'video/mp4' });
      assets.push({ id: 'camera', name: file.name, type: 'video', file, url: URL.createObjectURL(file) });

      const samples = 22050 * 5, wav = new ArrayBuffer(44 + samples * 2), view = new DataView(wav);
      const write = (at, text) => [...text].forEach((letter, index) => view.setUint8(at + index, letter.charCodeAt(0)));
      write(0, 'RIFF'); view.setUint32(4, wav.byteLength - 8, true); write(8, 'WAVEfmt '); view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 22050, true); view.setUint32(28, 44100, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples * 2, true);
      for (let index = 0; index < samples; index++) view.setInt16(44 + index * 2, Math.sin(index / 22050 * Math.PI * 440) * 3000, true);
      const music = new File([wav], 'score.wav', { type: 'audio/wav' });
      assets.push({ id: 'score', name: music.name, type: 'audio', file: music, url: URL.createObjectURL(music) });
      const sourceUrls = assets.map(asset => asset.url), realCreate = URL.createObjectURL.bind(URL), realRevoke = URL.revokeObjectURL.bind(URL);
      const realElement = document.createElement.bind(document), audioElements = [];
      document.createElement = (...args) => { const element = realElement(...args); if (args[0] === 'audio') audioElements.push(element); return element; };
      let extraUrls = 0;
      URL.createObjectURL = value => { extraUrls++; return realCreate(value); };
      URL.revokeObjectURL = value => { if (sourceUrls.includes(value)) throw new Error('Renderer must not revoke caller-owned originals'); realRevoke(value); };
      const acquired = id => { stats.active++; stats.opens++; stats.maxActive = Math.max(stats.maxActive, stats.active); stats.events.push(`open:${id}`); };
      const released = id => { stats.active--; stats.releases++; stats.events.push(`close:${id}`); };
      const begin = () => { stats.opening++; stats.maxOpening = Math.max(stats.maxOpening, stats.opening); };
      // The media helper is instrumented here to isolate the renderer contract.
      // Browser decode, resizing, video/audio playback and recording are real.
      ZorifiAutoCutMedia = {
        async loadImage(asset, options) {
          begin();
          const ratio = Math.min(1, options.maxDimension / 6000, options.maxDimension / 4000, Math.sqrt(options.maxPixels / (6000 * 4000)));
          const image = await createImageBitmap(asset.file, { resizeWidth: Math.floor(6000 * ratio), resizeHeight: Math.floor(4000 * ratio) });
          stats.opening--; acquired(asset.id); stats.bounds.push([image.width, image.height]);
          return { image, width: 6000, height: 4000, dispose() { image.close(); released(asset.id); } };
        },
        async openVideo(asset) {
          begin(); const media = document.createElement('video'); media.muted = true; media.playsInline = true; media.preload = 'auto';
          await new Promise((resolve, reject) => { media.onloadeddata = resolve; media.onerror = () => reject(new Error(`4K fixture (${asset.file.size} bytes) could not decode: ${media.error?.code} ${media.error?.message}`)); media.src = asset.url; });
          if (media.videoWidth !== 3840 || media.videoHeight !== 2160) throw new Error('The camera fixture must really decode at 4K');
          stats.opening--; acquired(asset.id);
          return { media, width: media.videoWidth, height: media.videoHeight, duration: media.duration, dispose() { media.pause(); media.removeAttribute('src'); media.load(); released(asset.id); } };
        },
      };
      const clips = [], shot = (id, start, duration, track = 0, extra = {}) => ({ id: `${id}-${start}`, type: 'video', mediaId: id, start, duration, sourceStart: 0, track, volume: 0, opacity: 100, ...extra });
      const cell = track => ({ left: (track % 2) * 50, top: Math.floor(track / 2) * 50, width: 50, height: 50 });
      for (let track = 0; track < 4; track++) clips.push(shot(`photo-${track}`, 0, .5, track, { collage: { id: 'opening', cell: cell(track) } }));
      let time = .5;
      for (let index = 4; index < 15; index++) { clips.push(shot(`photo-${index}`, time, .14, 0, { autoCutStyle: { transition: 'dissolve' } })); time += .14; }
      for (let track = 0; track < 4; track++) clips.push(shot(track ? `photo-${track - 1}` : 'camera', time, .5, track, { sourceStart: track ? 0 : .2, collage: { id: 'closing', cell: cell(track) } }));
      time += .5;
      clips.push({ id: 'music', type: 'audio', mediaId: 'score', start: 0, duration: time, sourceStart: 0, track: 5, volume: 80 });
      const rendered = await ZorifiAutoCutRenderer.render({ plan: { clips }, assets, width: 640, height: 360 });
      const blobUrl = realCreate(rendered.blob), video = document.createElement('video'); video.muted = true;
      await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error(`Finished movie could not decode: ${video.error?.code} ${video.error?.message}`)); video.src = blobUrl; });
      const duration = video.duration;
      video.removeAttribute('src'); video.load(); realRevoke(blobUrl);
      const complete = { ...stats, bounds: stats.bounds.slice(), events: stats.events.slice() };
      const controller = new AbortController();
      let cancelled;
      try {
        await ZorifiAutoCutRenderer.render({ plan: { clips }, assets, width: 640, height: 360, signal: controller.signal, onProgress(update) { if (update.phase === 'rendering') controller.abort(); } });
      } catch (error) { cancelled = error.name; }
      const soundtrackReleased = audioElements.length === 2 && audioElements.every(element => !element.getAttribute('src') && element.paused);
      document.createElement = realElement; URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke; sourceUrls.forEach(realRevoke);
      return { complete, finalActive: stats.active, maxOpening: stats.maxOpening, extraUrls, cancelled, soundtrackReleased, bytes: rendered.blob.size, duration, planned: time };
    }, { jpeg: photo.toString('base64'), camera: fs.readFileSync(path.join(root, 'tests/fixtures/autocut-4k-render.mp4')).toString('base64') });
    assert.equal(result.complete.maxOpening, 1, 'Large source decodes must be serial');
    assert.equal(result.complete.maxActive, 4, 'Only the current scene’s four visual decoders may remain resident');
    assert.equal(result.complete.active, 0, 'All successful render resources must be disposed');
    assert.equal(result.complete.opens, result.complete.releases);
    assert.ok(result.complete.bounds.every(([width, height]) => width <= 1920 && height <= 1920 && width * height <= 2073600), 'Large photo render proxies must respect the pixel budget');
    assert.ok(result.complete.events.indexOf('close:photo-3') < result.complete.events.indexOf('open:photo-4'), 'Outgoing large decoders must be released before new ones open');
    assert.equal(result.extraUrls, 0, 'Existing source object URLs must be reused');
    assert.equal(result.cancelled, 'AbortError');
    assert.equal(result.finalActive, 0, 'Cancellation must dispose every current decoder');
    assert.equal(result.soundtrackReleased, true, 'The one soundtrack decoder must be released on success and cancellation');
    assert.ok(result.bytes > 2000 && Number.isFinite(result.duration) && Math.abs(result.duration - result.planned) < .8, `A real finite movie must retain its edit duration: ${JSON.stringify(result)}`);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ bytes: result.bytes, duration: result.duration, planned: result.planned, peakVisualDecoders: result.complete.maxActive, serialDecodes: result.complete.maxOpening, decoderOpens: result.complete.opens, releases: result.complete.releases, cancellation: result.cancelled }));
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
