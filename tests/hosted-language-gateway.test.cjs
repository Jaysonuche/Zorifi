const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {HOSTED_ORIGIN, parseHostedFirebaseWebConfig, hostedFirebaseWebConfig, firebaseConfigScript, hostedLanguageConfiguration, relayHostedLanguage} = require('../scripts/hosted-language-gateway.cjs');

class Reply extends EventEmitter {
  constructor() { super(); this.status = 0; this.headers = {}; this.text = ''; this.headersSent = false; this.destroyed = false; }
  writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; }
  write(value) { this.text += Buffer.from(value).toString('utf8'); }
  end(value = '') { this.write(value); }
  destroy() { this.destroyed = true; }
}

test('desktop cloud metadata contains provider status but no credentials', async () => {
  const calls = [];
  const configuration = await hostedLanguageConfiguration(async (url, options) => {
    calls.push({url, options});
    return Response.json({configurations: {language: {provider: 'Gemini', model: 'gemini-2.5-flash', configured: true}}});
  });
  assert.deepEqual(configuration, {provider: 'Gemini (Zorifi Cloud)', model: 'gemini-2.5-flash', configured: true});
  assert.equal(calls[0].url, `${HOSTED_ORIGIN}/api/ai-settings`);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(await hostedLanguageConfiguration(async () => { throw new Error('offline'); }), null);
});

test('desktop loads only the public Firebase web config from the fixed site', async () => {
  const config = {apiKey: 'AIza' + 'a'.repeat(35), projectId: 'zorifi', authDomain: 'zorifi.firebaseapp.com', appId: '1:123:web:abcdef'};
  const html = `<html><head><script>window.__ZORIFI_FIREBASE_CONFIG__=${JSON.stringify(config)};</script></head></html>`;
  assert.deepEqual(parseHostedFirebaseWebConfig(html), config);
  assert.equal(parseHostedFirebaseWebConfig(html.replace('zorifi.firebaseapp.com', 'evil.example')), null);
  assert.equal(parseHostedFirebaseWebConfig('<html>missing config</html>'), null);
  const calls = [];
  const received = await hostedFirebaseWebConfig(async (url, options) => { calls.push({url, options}); return new Response(html); });
  assert.deepEqual(received, config);
  assert.equal(calls[0].url, `${HOSTED_ORIGIN}/`);
  assert.match(firebaseConfigScript(received), /window\.__ZORIFI_FIREBASE_CONFIG__/);
  assert.equal(firebaseConfigScript(null), '');
});

test('desktop cloud relay requires sign-in and rejects non-language services', async () => {
  const missingToken = new Reply();
  await relayHostedLanguage({service: 'vanessa-global', request: {method: 'POST', headers: {}}, response: missingToken, body: Buffer.from('{}'), fetchImpl: () => { throw new Error('Must not contact cloud'); }});
  assert.equal(missingToken.status, 401);
  assert.match(missingToken.text, /Sign in/);
  await assert.rejects(relayHostedLanguage({service: 'vanessa-music', request: {method: 'POST', headers: {}}, response: new Reply(), body: Buffer.from('{}')}), /Only language services/);
});

test('desktop cloud relay forwards only Firebase bearer and streams the full answer', async () => {
  const response = new Reply();
  const body = Buffer.from('{"message":"What is 2 x 4?","stream":true}');
  const token = 'Bearer firebase-user-id-token';
  let call;
  await relayHostedLanguage({
    service: 'vanessa-global',
    request: {method: 'POST', headers: {authorization: token, accept: 'text/event-stream', 'content-type': 'application/json', cookie: 'never-send-this'}},
    response,
    body,
    fetchImpl: async (url, options) => {
      call = {url, options};
      return new Response('data: {"text":"8"}\n\ndata: [DONE]\n\n', {status: 200, headers: {'content-type': 'text/event-stream'}});
    }
  });
  assert.equal(call.url, `${HOSTED_ORIGIN}/api/vanessa-provider?service=vanessa-global`);
  assert.equal(call.options.headers.authorization, token);
  assert.deepEqual(Object.keys(call.options.headers).sort(), ['accept', 'authorization', 'content-type']);
  assert.equal(call.options.body, body);
  assert.equal(call.options.redirect, 'error');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /text\/event-stream/);
  assert.match(response.text, /"text":"8"/);
  assert.match(response.text, /\[DONE\]/);
});

test('desktop cloud relay masks network failures and propagates hosted auth errors', async () => {
  const networkError = new Reply();
  await relayHostedLanguage({service: 'vanessa-global', request: {method: 'POST', headers: {authorization: 'Bearer user-token'}}, response: networkError, body: Buffer.from('{}'), fetchImpl: async () => { throw new Error('private provider details'); }});
  assert.equal(networkError.status, 502);
  assert(!networkError.text.includes('private provider details'));
  const hostedAuth = new Reply();
  await relayHostedLanguage({service: 'vanessa-global', request: {method: 'POST', headers: {authorization: 'Bearer expired-token'}}, response: hostedAuth, body: Buffer.from('{}'), fetchImpl: async () => Response.json({error: 'Sign in again.'}, {status: 401})});
  assert.equal(hostedAuth.status, 401);
  assert.match(hostedAuth.text, /Sign in again/);
});
