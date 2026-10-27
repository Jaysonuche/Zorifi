const assert = require('node:assert/strict');
const {pbkdf2Sync} = require('node:crypto');
const fs = require('node:fs');
const {chromium} = require('playwright');
const {createServer} = require('../scripts/dev-server.cjs');

const HOSTED_ORIGIN = 'https://zorifi.test';
const TEST_CONFIG = {apiKey: 'public-test-key', projectId: 'browser-auth-test'};
const TEST_EMAIL = 'creator@example.test';
const TEST_PASSWORD = 'test-password-only';
const TEST_UID = 'firebase-test-uid';

async function waitForAuth(page) {
  try { await page.locator('.auth-screen').waitFor({timeout: 12000}); }
  catch (error) {
    const detail = await page.locator('body').innerText().catch(() => '[body unavailable]');
    const auth = await page.evaluate(() => ({config: window.__ZORIFI_FIREBASE_CONFIG__, configured: firebaseGateway.configured(), session: Boolean(firebaseGateway.session), user: currentUser?.id || null})).catch(() => ({}));
    throw new Error(`Expected hosted sign-in screen at ${page.url()}: ${JSON.stringify(auth)} ${detail.slice(0, 500)}`, {cause: error});
  }
}

function routeHostedAssets(context, localOrigin, seen) {
  return Promise.all([
    context.route(`${HOSTED_ORIGIN}/**`, async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/vanessa/chat') {
        seen.vanessa.push({authorization: request.headers().authorization || '', body: request.postDataJSON()});
        const input=request.postDataJSON();return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({sessionId:input.sessionId,requestId:input.requestId,sequence:input.sequence,reply:'8',text:'8',actions:[]})});
      }
      const response = await route.fetch({url: `${localOrigin}${url.pathname}${url.search}`});
      return route.fulfill({response});
    }),
    context.route('https://identitytoolkit.googleapis.com/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith('/accounts:signInWithPassword')) {
        const input = request.postDataJSON();
        seen.signIns.push({email: input.email, password: input.password});
        return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({localId: TEST_UID, email: TEST_EMAIL, idToken: 'test-id-token', refreshToken: 'test-refresh-token', expiresIn: '3600'})});
      }
      if (url.pathname.endsWith('/accounts:signUp')) {
        const input = request.postDataJSON();
        (seen.signUps ||= []).push({email: input.email, password: input.password});
        return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({localId: TEST_UID, email: TEST_EMAIL, idToken: 'test-id-token', refreshToken: 'test-refresh-token', expiresIn: '3600'})});
      }
      if (url.pathname.endsWith('/accounts:lookup')) {
        return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({users: [{localId: TEST_UID, email: TEST_EMAIL}]})});
      }
      throw new Error(`Unexpected Firebase request: ${url.pathname}`);
    }),
    context.route('https://securetoken.googleapis.com/**', route => {
      seen.refreshes++;
      if (seen.rejectRefresh) return route.fulfill({status: 400, contentType: 'application/json', body: JSON.stringify({error: {message: 'INVALID_REFRESH_TOKEN'}})});
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({user_id: TEST_UID, id_token: 'restored-id-token', refresh_token: 'restored-refresh-token', expires_in: '3600'})});
    })
  ]);
}

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const localOrigin = `http://127.0.0.1:${server.address().port}`;
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  let browser;
  try {
    browser = await chromium.launch({headless: true, ...(process.env.ZORIFI_BROWSER_EXECUTABLE ? {executablePath: process.env.ZORIFI_BROWSER_EXECUTABLE} : fs.existsSync(edge) ? {executablePath: edge} : {})});

    // A local account from an older build must not make a hosted page appear
    // cloud-authenticated when there is no matching Firebase session.
    const staleContext = await browser.newContext({serviceWorkers: 'block'});
    const staleSeen = {vanessa: [], signIns: [], refreshes: 0};
    await routeHostedAssets(staleContext, localOrigin, staleSeen);
    const oldSalt = 'legacy-test-salt';
    const oldHash = pbkdf2Sync(TEST_PASSWORD, oldSalt, 120000, 32, 'sha256').toString('hex');
    await staleContext.addInitScript(({config, oldSalt, oldHash}) => {
      window.__ZORIFI_FIREBASE_CONFIG__ = config;
      localStorage.setItem('zorifi-accounts-v1', JSON.stringify([{
        id: 'old-local-account', name: 'Old Creator', identifier: 'creator@example.test',
        email: 'creator@example.test', salt: oldSalt, passwordHash: oldHash
      }]));
      localStorage.setItem('zorifi-session-v1', 'old-local-account');
    }, {config: TEST_CONFIG, oldSalt, oldHash});
    const stalePage = await staleContext.newPage();
    await stalePage.goto(HOSTED_ORIGIN);
    await waitForAuth(stalePage);
    assert.match(await stalePage.locator('.auth-screen').innerText(), /reconnect|sign in/i);
    assert.equal(await stalePage.evaluate(() => JSON.parse(localStorage.getItem('zorifi-accounts-v1')).length), 1, 'The old local profile must remain recoverable.');
    assert.equal(await stalePage.evaluate(() => Boolean(firebaseGateway.session)), false);
    await stalePage.locator('[data-auth-form] [name="identifier"]').fill(TEST_EMAIL);
    await stalePage.locator('[data-auth-form] [name="password"]').fill(TEST_PASSWORD);
    await stalePage.locator('[data-auth-form] .auth-submit').click();
    await stalePage.waitForFunction(() => Boolean(document.querySelector('[data-terms-agreement]')) || Boolean(currentUser?.cloudUid));
    if (await stalePage.locator('[data-terms-agreement]').isVisible()) {
      await stalePage.locator('[data-terms-agreement]').check();
      await stalePage.locator('[data-terms-continue]').click();
    }
    await stalePage.waitForFunction(() => currentUser?.cloudUid === 'firebase-test-uid');
    assert.equal(await stalePage.evaluate(() => currentUser.id), 'old-local-account', 'Linking a legacy account must preserve its local project scope.');
    await staleContext.close();

    // A phone-only local account can be linked to a new email-based Firebase
    // identity without moving its project storage to a different account ID.
    const phoneContext = await browser.newContext({serviceWorkers: 'block'});
    const phoneSeen = {vanessa: [], signIns: [], signUps: [], refreshes: 0};
    await routeHostedAssets(phoneContext, localOrigin, phoneSeen);
    const phoneProject = [{id: 'phone-project', name: 'Phone Project', duration: 5, updatedAt: '2026-10-01T00:00:00.000Z'}];
    await phoneContext.addInitScript(({config, oldSalt, oldHash, phoneProject}) => {
      window.__ZORIFI_FIREBASE_CONFIG__ = config;
      localStorage.setItem('zorifi-accounts-v1', JSON.stringify([{
        id: 'old-phone-account', name: 'Phone Creator', identifier: '+447700900123',
        email: '', phone: '+447700900123', salt: oldSalt, passwordHash: oldHash
      }]));
      localStorage.setItem('zorifi-session-v1', 'old-phone-account');
      localStorage.setItem('zorifi-projects-v1:old-phone-account', JSON.stringify(phoneProject));
    }, {config: TEST_CONFIG, oldSalt, oldHash, phoneProject});
    const phonePage = await phoneContext.newPage();
    await phonePage.goto(HOSTED_ORIGIN);
    await waitForAuth(phonePage);
    await phonePage.locator('[data-auth-mode="signup"]').click();
    await phonePage.locator('[data-auth-form] [name="name"]').fill('Phone Creator');
    await phonePage.locator('[data-auth-form] [name="identifier"]').fill(TEST_EMAIL);
    await phonePage.locator('[data-auth-form] [name="password"]').fill(TEST_PASSWORD);
    await phonePage.locator('[data-auth-form] [name="confirm"]').fill(TEST_PASSWORD);
    await phonePage.locator('[data-auth-form] .auth-submit').click();
    await phonePage.waitForFunction(() => Boolean(document.querySelector('[data-terms-agreement]')) || Boolean(currentUser?.cloudUid));
    if (await phonePage.locator('[data-terms-agreement]').isVisible()) {
      await phonePage.locator('[data-terms-agreement]').check();
      await phonePage.locator('[data-terms-continue]').click();
    }
    await phonePage.waitForFunction(() => currentUser?.cloudUid === 'firebase-test-uid');
    assert.deepEqual(phoneSeen.signUps, [{email: TEST_EMAIL, password: TEST_PASSWORD}]);
    const linkedPhone = await phonePage.evaluate(() => ({id: currentUser.id, uid: currentUser.cloudUid, saved: getSavedProjects(), raw: localStorage.getItem('zorifi-projects-v1:old-phone-account')}));
    assert.equal(linkedPhone.id, 'old-phone-account');
    assert.equal(linkedPhone.uid, TEST_UID);
    assert.equal(linkedPhone.saved[0]?.id, 'phone-project');
    assert.deepEqual(JSON.parse(linkedPhone.raw), phoneProject);
    await phoneContext.close();

    const wrongAccountContext = await browser.newContext({serviceWorkers: 'block'});
    const wrongSeen = {vanessa: [], signIns: [], refreshes: 0};
    await routeHostedAssets(wrongAccountContext, localOrigin, wrongSeen);
    await wrongAccountContext.addInitScript(config => {
      window.__ZORIFI_FIREBASE_CONFIG__ = config;
      localStorage.setItem('zorifi-accounts-v1', JSON.stringify([{
        id: 'firebase-other-user', cloudUid: 'other-user', name: 'Other Creator',
        identifier: 'other@example.test', email: 'other@example.test'
      }]));
      localStorage.setItem('zorifi-session-v1', 'firebase-other-user');
      localStorage.setItem('zorifi-firebase-session:browser-auth-test', JSON.stringify({
        uid: 'firebase-test-uid', email: TEST_EMAIL, idToken: 'wrong-account-token',
        refreshToken: 'wrong-account-refresh', expiresAt: Date.now() + 3600000
      }));
    }, TEST_CONFIG);
    const wrongPage = await wrongAccountContext.newPage();
    await wrongPage.goto(HOSTED_ORIGIN);
    await waitForAuth(wrongPage);
    assert.equal(await wrongPage.evaluate(() => currentUser), null, 'A Firebase session for another UID must not open the saved profile.');
    await wrongAccountContext.close();

    // A second browser starts with no Zorifi local account. A successful
    // Firebase login must create its device-local profile and unlock Vanessa.
    const freshContext = await browser.newContext({serviceWorkers: 'block'});
    const freshSeen = {vanessa: [], signIns: [], refreshes: 0};
    await routeHostedAssets(freshContext, localOrigin, freshSeen);
    await freshContext.addInitScript(config => { window.__ZORIFI_FIREBASE_CONFIG__ = config; }, TEST_CONFIG);
    const page = await freshContext.newPage();
    await page.goto(HOSTED_ORIGIN);
    await waitForAuth(page);
    await page.locator('[data-auth-form] [name="identifier"]').fill(TEST_EMAIL);
    await page.locator('[data-auth-form] [name="password"]').fill(TEST_PASSWORD);
    await page.locator('[data-auth-form] .auth-submit').click();
    await page.waitForFunction(() => Boolean(document.querySelector('[data-terms-agreement]')) || Boolean(currentUser && firebaseGateway.session?.uid === 'firebase-test-uid'));
    if (await page.locator('[data-terms-agreement]').isVisible()) {
      await page.locator('[data-terms-agreement]').check();
      await page.locator('[data-terms-continue]').click();
    }
    await page.waitForFunction(() => currentUser && firebaseGateway.session?.uid === 'firebase-test-uid');
    assert.deepEqual(freshSeen.signIns, [{email: TEST_EMAIL, password: TEST_PASSWORD}]);
    const identity = await page.evaluate(() => ({account: currentUser, stored: JSON.parse(localStorage.getItem('zorifi-accounts-v1')), sessionId: localStorage.getItem('zorifi-session-v1')}));
    assert.equal(identity.stored.length, 1);
    assert.equal(identity.stored[0].id, identity.sessionId);
    assert.equal(identity.stored[0].email, TEST_EMAIL);
    assert.equal(identity.stored[0].cloudUid, TEST_UID, 'The device-local profile must be tied to the Firebase UID.');
    const answer = await page.evaluate(async () => {
      ZorifiPrivacy.setConsent(localStorage, currentUser.id, true);
      const response = await safeVanessaRequest('vanessa-global', {message:'What is 2 x 4?'});
      return {status: response.status, data: response.data};
    });
    assert.equal(answer.status, 200);
    assert.equal(answer.data.reply, '8');
    assert.equal(freshSeen.vanessa.at(-1)?.authorization, 'Bearer test-id-token');

    await page.reload();
    await page.waitForFunction(() => currentUser && firebaseGateway.session?.uid === 'firebase-test-uid' && firebaseGateway.session.idToken === 'restored-id-token');
    assert.equal(await page.locator('.auth-screen').count(), 0, 'A valid cloud session should survive a reload.');
    assert.ok(freshSeen.refreshes >= 1, 'Reload should refresh the stored Firebase token.');
    assert.equal(await page.evaluate(() => firebaseGateway.getIdToken()), 'restored-id-token');
    freshSeen.rejectRefresh = true;
    await page.evaluate(() => firebaseGateway.getIdToken(true).catch(() => {}));
    await waitForAuth(page);
    assert.deepEqual(await page.evaluate(() => ({session: firebaseGateway.session, user: currentUser, accounts: JSON.parse(localStorage.getItem('zorifi-accounts-v1'))})), {
      session: null, user: null, accounts: identity.stored
    }, 'Revoked refresh must return to sign-in while preserving the local profile.');
    assert.equal(freshSeen.vanessa.length, 1, 'The app must not silently send more Vanessa requests after a revoked session.');
    await freshContext.close();
    console.log('Hosted auth browser regression passed: session guards, email and phone legacy migration, cross-device sign-in, Vanessa bearer, reload and revoked-token recovery.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
