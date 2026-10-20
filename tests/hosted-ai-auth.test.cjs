const test = require('node:test');
const assert = require('node:assert/strict');

test('hosted AI requires a verified Firebase ID token while loopback preview remains local', async () => {
  const {authorize} = await import('../netlify/functions/_shared/provider.mjs');
  const previousFetch = global.fetch;
  const previousKey = process.env.FIREBASE_WEB_API_KEY;
  const previousProject = process.env.FIREBASE_PROJECT_ID;
  const requests = [];
  process.env.FIREBASE_WEB_API_KEY = 'public-test-key';
  process.env.FIREBASE_PROJECT_ID = 'test-project';
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://firestore.googleapis.com/')) return new Response('', {status: 404});
    requests.push({url, token: JSON.parse(options.body).idToken});
    return Response.json({users: [{localId: 'verified-user'}]});
  };
  try {
    await assert.rejects(authorize(new Request('https://zorifi.vercel.app/api/vanessa-provider')), error => error.status === 401 && error.code === 'AUTH_REQUIRED');
    assert.equal(requests.length, 0, 'Missing bearer must not contact Firebase.');

    const authenticated = new Request('https://zorifi.vercel.app/api/vanessa-provider', {headers: {authorization: 'Bearer firebase-id-token'}});
    await authorize(authenticated);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].token, 'firebase-id-token');
    assert.match(requests[0].url, /^https:\/\/identitytoolkit\.googleapis\.com\/v1\/accounts:lookup\?/);

    global.fetch = async () => Response.json({error: {message: 'INVALID_ID_TOKEN'}}, {status: 400});
    await assert.rejects(authorize(new Request(authenticated)), error => error.status === 401 && error.code === 'AUTH_REQUIRED');

    await authorize(new Request('http://127.0.0.1:4173/api/vanessa-provider'));
    await assert.rejects(authorize(new Request('http://127.0.0.1:4173/api/vanessa-provider', {headers: {origin: 'https://untrusted.example'}})), error => error.status === 403);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.FIREBASE_WEB_API_KEY;
    else process.env.FIREBASE_WEB_API_KEY = previousKey;
    if (previousProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = previousProject;
  }
});
