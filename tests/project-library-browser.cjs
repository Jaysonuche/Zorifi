const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');

const root = path.resolve(__dirname, '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function main() {
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => typeof createMusicProject === 'function');

    const ids = await page.evaluate(() => {
      currentUser = { id: 'project-library-browser', name: 'Project Library Tester', identifier: 'projects@example.invalid', email: 'projects@example.invalid' };
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([currentUser]));
      localStorage.setItem(SESSION_KEY, currentUser.id);
      syncPhase10Stores();
      termsAcceptance.accept();
      betaProgramState.acknowledge();
      createNewProject();
      state.projectId = 'edit-project-browser';
      state.currentProject = 'Edit browser check';
      saveProject();
      createMusicProject();
      state.currentProject = 'Music browser check';
      saveProject();
      const music = state.projectId;
      const projects = getSavedProjects();
      if (projects.length !== 2) throw new Error(`Expected two saved projects, got ${projects.length}`);
      state.view = 'home';
      renderHome();
      return { music };
    });

    const edit = page.locator('[data-open-project="edit-project-browser"]');
    const music = page.locator(`[data-open-project="${ids.music}"]`);
    if (await page.locator('[data-beta-acknowledge]').count()) await page.locator('[data-beta-acknowledge]').click();
    await page.locator('[data-project-workspace="video"]').click();
    assert.equal(await edit.count(), 1, 'Edit project should be on Edit projects page');
    assert.equal(await music.count(), 0, 'Music project should be hidden on Edit projects page');
    assert.equal(await page.locator('[data-project-workspace="video"]').getAttribute('aria-pressed'), 'true');
    assert.ok(await page.locator('[data-open-project="demo-city"]').count(), 'Edit demos should remain on Edit projects page');

    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    await page.locator('.project-library').screenshot({ path: path.join(root, 'artifacts', 'project-library-edits.png') });
    await page.locator('[data-project-workspace="music"]').click();
    assert.equal(await edit.count(), 0, 'Edit project should be hidden on Music projects page');
    assert.equal(await music.count(), 1, 'Music project should be on Music projects page');
    assert.equal(await page.locator('[data-open-project="demo-city"]').count(), 0, 'Edit demos should not appear on Music projects page');
    assert.equal(await page.locator('[data-project-workspace="music"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await music.locator('.project-thumb.music').count(), 1, 'Music should get a music cover');
    assert.equal(await music.locator('.project-ratio').innerText(), 'Audio');
    await page.locator('.project-library').screenshot({ path: path.join(root, 'artifacts', 'project-library-music.png') });

    const qualityBeforeSearch = await page.evaluate(() => state.previewQuality);
    await page.locator('[data-project-search]').fill('no matches');
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => state.previewQuality), qualityBeforeSearch, 'Project search must not trigger the editor preview-quality control');
    assert.equal(await music.count(), 0, 'Music search should filter music cards');
    await page.locator('[data-project-workspace="video"]').click();
    assert.equal(await edit.count(), 1, 'Edit search preference should be independent');
    await page.locator('[data-project-workspace="music"]').click();
    assert.equal(await page.locator('[data-project-search]').inputValue(), 'no matches', 'Music search should be remembered');
    await page.locator('[data-project-search]').fill('');
    await page.waitForTimeout(250);
    await music.click();
    await page.waitForFunction(() => document.querySelector('[data-view="music-editor"]'));
    assert.equal(await page.evaluate(() => state.creatorSettings.workspaceMode), 'music');
    assert.equal(await page.evaluate(() => state.currentProject), 'Music browser check');

    await page.evaluate(() => { state.view = 'home'; renderHome(); });
    await page.locator('[data-project-workspace="video"]').click();
    await edit.click();
    await page.waitForFunction(() => document.querySelector('[data-view="editor"]'));
    assert.equal(await page.evaluate(() => state.creatorSettings.workspaceMode), 'video');
    assert.equal(await page.evaluate(() => state.currentProject), 'Edit browser check');
    await page.locator('select[data-preview-quality]').selectOption('quarter');
    assert.equal(await page.evaluate(() => state.previewQuality), 'quarter', 'The actual preview-quality selector must still work');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { detectRuntimeMode(); state.view = 'home'; renderHome(); });
    const sizes = await page.locator('[data-project-workspace]').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }));
    assert.equal(sizes.length, 2);
    assert.ok(sizes.every(size => size.width >= 44 && size.height >= 44), `Project switches need 44px touch targets: ${JSON.stringify(sizes)}`);
    await page.locator('.project-library').screenshot({ path: path.join(root, 'artifacts', 'project-library-mobile.png') });
    assert.deepEqual(errors, [], 'No page errors while switching workspaces');
    console.log('Project library browser test passed: separate project pages, project opening, search state, music cover and mobile touch targets.');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
