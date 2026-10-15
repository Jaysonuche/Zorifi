// Local CPU media generation for the loopback development server only.
// Model runtimes and weights live in the user's cache, never in the web build.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {spawn} = require('node:child_process');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const JOB_TTL_MS = 30 * 60 * 1000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function runtimePaths(cacheRoot = path.join(os.homedir(), '.cache', 'zorifi-local')) {
  const python = folder => path.join(folder, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const image = path.join(cacheRoot, 'image');
  const music = path.join(cacheRoot, 'music');
  const musicRoot = path.join(music, 'stable-audio-3', 'optimized', 'tflite');
  return {
    image: {
      python: python(path.join(image, 'venv')),
      script: path.join(__dirname, 'local-image-generate.py'),
      files: [path.join(image, 'model', 'model_index.json'), path.join(image, 'model', 'unet', 'openvino_model.xml')],
      model: 'LCM DreamShaper v7 INT8 (OpenVINO)',
      supported: ['text-to-image', '512×512 PNG', 'CPU'],
    },
    music: {
      python: python(path.join(music, '.venv')),
      script: path.join(musicRoot, 'scripts', 'sa3_tflite.py'),
      files: [
        path.join(musicRoot, 'models', 'tokenizer.model'),
        path.join(musicRoot, 'models', 'tflite', 't5gemma', 'encoder_fp16.tflite'),
        path.join(musicRoot, 'models', 'tflite', 'sa3-sm-music', 'dit_w8a8.tflite'),
        path.join(musicRoot, 'models', 'tflite', 'same-s', 'dec_w8a8.tflite'),
      ],
      model: 'Stable Audio 3 small music (LiteRT CPU)',
      supported: ['text-to-music', '5–30 second WAV', 'CPU'],
    },
  };
}

function childEnvironment(env) {
  const kept = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA'];
  const result = Object.fromEntries(kept.filter(key => env[key]).map(key => [key, env[key]]));
  result.HF_HUB_OFFLINE = '1';
  result.TRANSFORMERS_OFFLINE = '1';
  return result;
}

function createLocalMediaJobs({cacheRoot, env = process.env, spawnProcess = spawn} = {}) {
  const paths = runtimePaths(cacheRoot);
  const jobs = new Map();
  let activeId = null;
  const enabled = kind => env[`ZORIFI_${kind.toUpperCase()}_PROVIDER`] === 'local';
  const ready = kind => {
    const runtime = paths[kind];
    return Boolean(runtime && [runtime.python, runtime.script, ...runtime.files].every(file => {
      try { return fs.statSync(file).isFile() && fs.statSync(file).size > 0; } catch { return false; }
    }));
  };
  const configuration = kind => ({provider: 'Local CPU', model: paths[kind].model, configured: ready(kind), supported: paths[kind].supported});
  const configured = kind => enabled(kind) && ready(kind);

  async function run(kind, input) {
    if (!paths[kind] || !enabled(kind)) return {status: 404, body: {error: 'Local provider is not selected.'}};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {status: 400, body: {error: 'A JSON object is required.'}};
    const action = input?.action || 'start';
    if (action === 'status' || action === 'cancel') {
      const id = typeof input.requestId === 'string' ? input.requestId : '';
      const job = jobs.get(id);
      if (!job || job.kind !== kind) return {status: 404, body: {error: 'Local generation job not found.'}};
      if (action === 'cancel' && job.status === 'running') {
        job.status = 'cancelled';
        job.child?.kill();
      }
      if (job.status !== 'complete') return {status: 200, body: {status: job.status, requestId: id, ...(job.error ? {error: job.error} : {})}};
      let data;
      try { data = await fs.promises.readFile(job.output); } catch { return {status: 500, body: {error: 'The local output file is missing.'}}; }
      const valid = kind === 'image' ? data.subarray(0, 8).equals(PNG_SIGNATURE) : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE';
      if (!valid || data.length < 100 || data.length > (kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES)) return {status: 500, body: {error: 'The local generator returned an invalid or oversized media file.'}};
      const mimeType = kind === 'image' ? 'image/png' : 'audio/wav';
      return {status: 200, body: {status: 'complete', requestId: id, url: `data:${mimeType};base64,${data.toString('base64')}`, mimeType, ...(kind === 'music' ? {duration: job.duration} : {}), metadata: {provider: 'Local CPU', model: paths[kind].model}}};
    }
    if (action !== 'start') return {status: 400, body: {error: 'Unsupported local generation action.'}};
    if (!ready(kind)) return {status: 503, body: {error: `Local ${kind} model is not installed on this computer.`}};
    if (activeId) return {status: 409, body: {error: 'A local image or music render is already running. Wait for it to finish or cancel it.'}};
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
    if (prompt.length < 3 || prompt.length > 1500) return {status: 400, body: {error: 'Describe what to generate in 3 to 1500 characters.'}};
    if (input.mode && input.mode !== 'text') return {status: 400, body: {error: 'This local model currently supports prompt generation only.'}};
    if (kind === 'image' && input.reference) return {status: 400, body: {error: 'Local image generation does not support reference images.'}};
    if (kind === 'image' && input.ratio && input.ratio !== '1:1') return {status: 400, body: {error: 'Local image generation currently supports square images only.'}};
    let duration = 0;
    if (kind === 'music') {
      duration = Number(input.duration || 10);
      if (!Number.isFinite(duration) || duration < 5 || duration > 30) return {status: 400, body: {error: 'Local music duration must be between 5 and 30 seconds.'}};
    }
    const id = randomUUID();
    const directory = path.join(cacheRoot || path.join(os.homedir(), '.cache', 'zorifi-local'), 'jobs', id);
    const output = path.join(directory, kind === 'image' ? 'result.png' : 'result.wav');
    await fs.promises.mkdir(directory, {recursive: true});
    const runtime = paths[kind];
    const imagePrompt = [prompt, typeof input.style === 'string' ? `Style: ${input.style.slice(0, 40)}` : ''].filter(Boolean).join('. ');
    const musicPrompt = [prompt, input.genre, input.mood, input.instrumentation, Number.isFinite(Number(input.tempo)) ? `${Math.max(40, Math.min(200, Math.round(Number(input.tempo))))} BPM` : '', input.vocals === 'instrumental' ? 'instrumental, no vocals' : ''].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim().slice(0, 200)).join(', ');
    const args = kind === 'image'
      ? [runtime.script, '--model', path.join(cacheRoot || path.join(os.homedir(), '.cache', 'zorifi-local'), 'image', 'model'), '--prompt', imagePrompt, '--output', output, '--width', '512', '--height', '512', '--steps', '4']
      : [runtime.script, '--prompt', musicPrompt, '--dit', 'sm-music', '--decoder', 'same-s', '--seconds', String(duration), '--steps', '8', '--cfg', '1', '--threads', '4', '--out', output];
    const job = {id, kind, status: 'running', output, directory, duration, child: null, error: ''};
    jobs.set(id, job);
    activeId = id;
    const expiry = setTimeout(() => {
      jobs.delete(id);
      fs.promises.rm(directory, {recursive: true, force: true}).catch(() => {});
    }, JOB_TTL_MS);
    expiry.unref?.();
    try {
      const child = spawnProcess(runtime.python, args, {cwd: kind === 'music' ? path.dirname(path.dirname(runtime.script)) : path.dirname(runtime.script), env: childEnvironment(env), shell: false, windowsHide: true, stdio: 'ignore'});
      job.child = child;
      const deadline = setTimeout(() => { if (job.status === 'running') {job.status = 'failed'; job.error = 'Local generation exceeded the time limit.'; child.kill();} }, kind === 'image' ? 15 * 60 * 1000 : 5 * 60 * 1000);
      deadline.unref?.();
      child.once('error', () => { if (job.status === 'running') {job.status = 'failed'; job.error = 'The local generator could not start.';} if (activeId === id) activeId = null; clearTimeout(deadline); });
      child.once('close', async code => {
        clearTimeout(deadline);
        if (job.status !== 'running') {if (activeId === id) activeId = null; return;}
        if (code !== 0) {job.status = 'failed'; job.error = 'The local generator stopped before producing media.'; if (activeId === id) activeId = null; return;}
        try {
          const file = await fs.promises.stat(output);
          if (!file.isFile() || file.size < 100 || file.size > (kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES)) throw new Error('invalid output');
          job.status = 'complete';
        } catch {job.status = 'failed'; job.error = 'The local generator did not produce a usable media file.';}
        if (activeId === id) activeId = null;
      });
    } catch {
      activeId = null;
      job.status = 'failed';
      job.error = 'The local generator could not start.';
    }
    return {status: 200, body: {status: job.status, requestId: id, ...(job.error ? {error: job.error} : {})}};
  }

  function dispose() {
    for (const job of jobs.values()) if (job.status === 'running') job.child?.kill();
  }
  return {enabled, ready, configured, configuration, run, dispose};
}

module.exports = {createLocalMediaJobs, runtimePaths};
