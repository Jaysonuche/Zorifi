const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {createLocalMediaJobs, runtimePaths} = require('../scripts/local-media-jobs.cjs');

async function fakeRuntime() {
  const cacheRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zorifi-media-test-'));
  const paths = runtimePaths(cacheRoot);
  for (const runtime of Object.values(paths)) for (const file of [runtime.python, runtime.script, ...runtime.files]) {
    if (file === path.join(__dirname, '..', 'scripts', 'local-image-generate.py')) continue;
    await fs.promises.mkdir(path.dirname(file), {recursive: true});
    await fs.promises.writeFile(file, 'test');
  }
  return cacheRoot;
}

async function awaitJob(local, kind, requestId) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const result = await local.run(kind, {action: 'status', requestId});
    if (result.body.status !== 'running') return result;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Fake local job did not finish');
}

test('local providers run asynchronously, keep prompts as arguments, and return verified media', async t => {
  const cacheRoot = await fakeRuntime();
  t.after(() => fs.promises.rm(cacheRoot, {recursive: true, force: true}));
  const calls = [];
  const spawnProcess = (executable, args, options) => {
    calls.push({executable, args, options});
    const child = new EventEmitter();
    child.kill = () => {setImmediate(() => child.emit('close', 1)); return true;};
    setTimeout(async () => {
      const output = args[args.indexOf(args.includes('--output') ? '--output' : '--out') + 1];
      const data = args.includes('--output')
        ? Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(128)])
        : Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(128)]);
      await fs.promises.writeFile(output, data);
      child.emit('close', 0);
    }, 20);
    return child;
  };
  const env = {ZORIFI_IMAGE_PROVIDER: 'local', ZORIFI_MUSIC_PROVIDER: 'local', GEMINI_API_KEY: 'must-not-reach-child', PATH: process.env.PATH};
  const local = createLocalMediaJobs({cacheRoot, env, spawnProcess});
  assert.equal(local.configuration('image').configured, true);
  assert.equal(local.configuration('music').configured, true);
  const prompt = 'a blue sphere; $(echo unsafe)';
  const started = await local.run('image', {action: 'start', prompt, ratio: '1:1'});
  assert.equal(started.status, 200);
  assert.equal(started.body.status, 'running');
  assert.equal((await local.run('music', {action: 'start', prompt: 'piano', duration: 5})).status, 409);
  assert.equal(calls[0].args[calls[0].args.indexOf('--prompt') + 1], prompt);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.env.GEMINI_API_KEY, undefined);
  const image = await awaitJob(local, 'image', started.body.requestId);
  assert.equal(image.body.status, 'complete');
  assert.match(image.body.url, /^data:image\/png;base64,/);
  const musicStart = await local.run('music', {action: 'start', prompt: 'soft piano', duration: 5, vocals: 'instrumental'});
  assert.equal(musicStart.body.status, 'running');
  const music = await awaitJob(local, 'music', musicStart.body.requestId);
  assert.equal(music.body.status, 'complete');
  assert.match(music.body.url, /^data:audio\/wav;base64,/);
  assert.equal(music.body.duration, 5);
  assert.equal((await local.run('image', {action: 'start', prompt: 'a cat', mode: 'variation'})).status, 400);
  assert.equal((await local.run('music', {action: 'start', prompt: 'a song', duration: 60})).status, 400);
  local.dispose();
});

test('local selection never falls back to a hosted provider when runtime is missing', async t => {
  const cacheRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zorifi-media-missing-'));
  t.after(() => fs.promises.rm(cacheRoot, {recursive: true, force: true}));
  const local = createLocalMediaJobs({cacheRoot, env: {ZORIFI_IMAGE_PROVIDER: 'local', GEMINI_API_KEY: 'present'}});
  assert.equal(local.configuration('image').configured, false);
  const response = await local.run('image', {action: 'start', prompt: 'a blue sphere'});
  assert.equal(response.status, 503);
  assert.match(response.body.error, /not installed/);
});
