const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const project = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ executablePath: process.env.ZORIFI_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<p>Native first-frame readiness</p>');
    await page.addScriptTag({ path: path.join(project, 'zorifi-autocut-media.js') });
    const result = await page.evaluate(async encoded => {
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const file = new File([bytes], '4k-first-frame.mp4', { type: 'video/mp4' });
      const url = URL.createObjectURL(file);
      const decoded = await ZorifiAutoCutMedia.openVideo({ file, url, name: file.name });
      try {
        const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 18;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const sample = () => { context.clearRect(0, 0, 32, 18); context.drawImage(decoded.media, 0, 0, 32, 18); return Array.from(context.getImageData(16, 9, 1, 1).data); };
        const opening = { pixel: sample(), currentTime: decoded.media.currentTime, readyState: decoded.media.readyState, paused: decoded.media.paused };
        await ZorifiAutoCutMedia.seek(decoded.media, .03);
        const shortSeek = { pixel: sample(), currentTime: decoded.media.currentTime, readyState: decoded.media.readyState, seeking: decoded.media.seeking };
        return { width: decoded.width, height: decoded.height, opening, shortSeek };
      } finally { decoded.dispose(); URL.revokeObjectURL(url); }
    }, fs.readFileSync(path.join(project, 'tests/fixtures/autocut-4k-render.mp4')).toString('base64'));
    assert.equal(result.width, 3840); assert.equal(result.height, 2160);
    assert.equal(result.opening.paused, true);
    assert.ok(result.opening.currentTime < .015, 'Preparation must retain the original source position');
    for (const frame of [result.opening, result.shortSeek]) {
      assert.equal(frame.pixel[3], 255, 'The first drawable surface must not be transparent despite HAVE_ENOUGH_DATA');
      assert.ok(frame.pixel[2] > 150 && frame.pixel[2] > frame.pixel[0] * 2, `The real blue source must be visible immediately: ${JSON.stringify(frame)}`);
      assert.ok(frame.readyState >= 2);
    }
    assert.equal(result.shortSeek.seeking, false);
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
