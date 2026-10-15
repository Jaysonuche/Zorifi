const test = require('node:test');
const assert = require('node:assert/strict');

const fakeConfig = {
  GEMINI_API_KEY: 'mock-stream-recovery-key',
  GEMINI_MODEL: 'gemini-primary-test',
  GEMINI_FALLBACK_MODEL: 'gemini-fallback-test'
};
const frames = values => values.map(value => `data: ${JSON.stringify(value)}\n\n`).join('');
const successfulChunk = text => ({candidates: [{finishReason: 'STOP', content: {parts: [{text}]}}]});
const modelFrom = url => {
  const match = String(url).match(/\/models\/([^/:?]+):streamGenerateContent/);
  assert(match, 'Recovery must still use the Gemini streaming API');
  return match[1];
};

async function withMockedProvider(mockFetch, run, config = fakeConfig) {
  const previousFetch = global.fetch, previousNetlify = global.Netlify;
  global.Netlify = {env: {get: key => config[key] || ''}};
  global.fetch = mockFetch;
  try {
    const {languageStreamResponse} = await import('../netlify/functions/_shared/provider.mjs');
    await run(languageStreamResponse);
  } finally {
    global.fetch = previousFetch;
    global.Netlify = previousNetlify;
  }
}

test('pasted whitespace in Gemini model names is ignored for settings and streaming', async () => {
  const config = {
    GEMINI_API_KEY: fakeConfig.GEMINI_API_KEY,
    GEMINI_MODEL: ' gemini-primary-test\n',
    GEMINI_FALLBACK_MODEL: '\tgemini-fallback-test\r\n'
  };
  const requestedModels = [];
  await withMockedProvider(async url => {
    requestedModels.push(modelFrom(url));
    return new Response(frames([successfulChunk('2 × 4 = 8.')]), {headers: {'content-type': 'text/event-stream'}});
  }, async languageStreamResponse => {
    const {configuration} = await import('../netlify/functions/_shared/provider.mjs');
    assert.equal(configuration().language.model, 'gemini-primary-test');
    const body = await languageStreamResponse('What is 2 times 4?').text();
    assert.deepEqual(requestedModels, ['gemini-primary-test']);
    assert(body.includes('2 × 4 = 8.'));
    assert(body.includes('data: [DONE]'));
  }, config);
});

test('a Gemini capacity failure before any text tries the configured fallback model', async () => {
  const requestedModels = [];
  await withMockedProvider(async (url, options) => {
    const model = modelFrom(url);
    requestedModels.push(model);
    assert.equal(new Headers(options.headers).get('x-goog-api-key'), fakeConfig.GEMINI_API_KEY);
    if (model === fakeConfig.GEMINI_MODEL) return Response.json({error: {message: 'PRIVATE_UPSTREAM_CAPACITY_DETAIL'}}, {status: 503});
    assert.equal(model, fakeConfig.GEMINI_FALLBACK_MODEL);
    return new Response(frames([successfulChunk('Your name is Jayson.')]), {headers: {'content-type': 'text/event-stream'}});
  }, async languageStreamResponse => {
    const response = languageStreamResponse('What is my name?');
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.deepEqual(requestedModels, [fakeConfig.GEMINI_MODEL, fakeConfig.GEMINI_FALLBACK_MODEL]);
    assert(body.includes('Your name is Jayson.'));
    assert(body.includes('data: [DONE]'));
    assert(!body.includes('STREAM_FAILED'));
    assert(!body.includes('PRIVATE_UPSTREAM_CAPACITY_DETAIL'));
    assert(!body.includes(fakeConfig.GEMINI_API_KEY));
  });
});

test('capacity failures from both Gemini models report busy without claiming completion', async () => {
  const requestedModels = [];
  await withMockedProvider(async url => {
    requestedModels.push(modelFrom(url));
    return Response.json({error: {message: 'PRIVATE_UPSTREAM_CAPACITY_DETAIL'}}, {status: 503});
  }, async languageStreamResponse => {
    const body = await languageStreamResponse('What is my name?').text();
    assert.deepEqual(requestedModels, [fakeConfig.GEMINI_MODEL, fakeConfig.GEMINI_FALLBACK_MODEL]);
    const event = body.split('\n').find(line => line.startsWith('data: '));
    assert(event, 'The client must receive a structured SSE failure');
    const payload = JSON.parse(event.slice(6));
    assert.equal(payload.code, 'PROVIDER_BUSY');
    assert.equal(typeof payload.error, 'string');
    assert(payload.error.trim());
    assert(!body.includes('data: [DONE]'));
    assert(!body.includes('PRIVATE_UPSTREAM_CAPACITY_DETAIL'));
    assert(!body.includes(fakeConfig.GEMINI_API_KEY));
  });
});

test('an unspecified nonterminal finish reason can stream text before the final STOP chunk', async () => {
  const requestedModels = [];
  await withMockedProvider(async url => {
    requestedModels.push(modelFrom(url));
    return new Response(frames([
      {candidates: [{finishReason: 'FINISH_REASON_UNSPECIFIED', content: {parts: [{text: 'Your name '}]}}]},
      successfulChunk('is Jayson.')
    ]), {headers: {'content-type': 'text/event-stream'}});
  }, async languageStreamResponse => {
    const body = await languageStreamResponse('What is my name?').text();
    assert.deepEqual(requestedModels, [fakeConfig.GEMINI_MODEL]);
    const textEvents = body.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));
    assert.equal(textEvents.map(event => event.text || '').join(''), 'Your name is Jayson.');
    assert(body.includes('data: [DONE]'));
    assert(!body.includes('STREAM_FAILED'));
  });
});
