const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');

const root = path.resolve(__dirname, '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function openMusic(page, port) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('.zorifi-opening').waitFor({ state: 'detached' });
  await page.waitForFunction(() => typeof createMusicProject === 'function');
  await page.evaluate(() => {
    currentUser = { id: 'music-layout-browser', name: 'Music Layout Tester', identifier: 'music@example.invalid', email: 'music@example.invalid' };
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([currentUser]));
    localStorage.setItem(SESSION_KEY, currentUser.id);
    syncPhase10Stores();
    termsAcceptance.accept();
    betaProgramState.acknowledge();
    createMusicProject();
  });
  await page.waitForSelector('[data-view="music-editor"]');
  await page.locator('[data-view="music-editor"]').waitFor({ state: 'visible' });
  await page.addStyleTag({ path: path.join(root, 'zorifi-music-future.css') });
  return errors;
}

function box(page, selector) { return page.locator(selector).boundingBox(); }

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.ZORIFI_BROWSER_EXECUTABLE
        ? { executablePath: process.env.ZORIFI_BROWSER_EXECUTABLE }
        : fs.existsSync(edge) ? { executablePath: edge } : {}),
    });
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const desktopErrors = await openMusic(desktop, server.address().port);
    const [prompt, workspace, timeline] = await Promise.all([
      box(desktop, '.music-prompt-bar'),
      box(desktop, '.music-workspace'),
      box(desktop, '.music-editor-screen > .timeline-area'),
    ]);
    assert(prompt && workspace && timeline, 'Music editor sections should render');
    assert(prompt.height >= 180 && prompt.height <= 260, `Prompt size should preserve the workspace: ${prompt.height}`);
    assert(workspace.height >= 190, `Workspace should remain usable: ${workspace.height}`);
    assert(timeline.height >= 210 && timeline.y + timeline.height <= 902, 'Timeline should fit the screen');
    assert(await desktop.locator('.music-library').isVisible());
    assert(await desktop.locator('.music-monitor').isVisible());
    assert(await desktop.locator('.music-mixer').isVisible());
    await desktop.locator('.music-prompt-main input').focus();
    const focus = await desktop.locator('.music-prompt-main input').evaluate(el => getComputedStyle(el).outlineStyle);
    assert.equal(focus, 'solid', 'Keyboard focus should be visible');
    await desktop.screenshot({ path: path.join(root, 'artifacts', 'music-future-desktop.png') });
    assert.deepEqual(desktopErrors, []);

    const mobile = await browser.newPage({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const mobileErrors = await openMusic(mobile, server.address().port);
    const mobilePrompt = await box(mobile, '.music-prompt-bar');
    const mobileTimeline = await box(mobile, '.music-editor-screen > .timeline-area');
    assert(mobilePrompt && mobileTimeline);
    assert(mobilePrompt.height <= 245, `Prompt cannot consume the whole phone: ${mobilePrompt.height}`);
    assert(mobileTimeline.y + mobileTimeline.height <= 846, 'Phone timeline should fit viewport');
    assert.equal(await mobile.locator('[data-music-mobile-panel]').count(), 3);
    await mobile.locator('[data-music-mobile-panel="mixer"]').click();
    assert.equal(await mobile.locator('[data-music-mobile-panel="mixer"]').getAttribute('class'), 'active');
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390, 'No page-wide horizontal overflow');
    await mobile.screenshot({ path: path.join(root, 'artifacts', 'music-future-mobile.png') });
    assert.deepEqual(mobileErrors, []);
    console.log('Music future layout passed: desktop hierarchy, mobile workspace/timeline, touch tabs, focus and overflow.');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
