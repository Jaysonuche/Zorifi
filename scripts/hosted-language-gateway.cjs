// Desktop language requests use the signed-in user's hosted account. Provider
// credentials remain on Vercel; neither the installer nor the local companion
// receives a Gemini key.
const HOSTED_ORIGIN = 'https://zorifi.vercel.app';
const LANGUAGE_SERVICES = new Set(['vanessa-creative-feedback', 'vanessa-chat', 'vanessa', 'vanessa-global', 'vanessa-language', 'vanessa-scenes', 'vanessa-autocut', 'vanessa-director-tools', 'vanessa-video', 'vanessa-background', 'vanessa-speech', 'vanessa-captions', 'vanessa-voice', 'vanessa-provider-test']);

function validFirebaseWebConfig(config) {
  return config && typeof config === 'object' && !Array.isArray(config) &&
    /^AIza[A-Za-z0-9_-]{25,}$/.test(config.apiKey || '') &&
    config.projectId === 'zorifi' && config.authDomain === 'zorifi.firebaseapp.com' &&
    /^1:\d+:web:[a-fA-F0-9]+$/.test(config.appId || '');
}

function parseHostedFirebaseWebConfig(html) {
  const match = String(html).match(/<script>\s*window\.__ZORIFI_FIREBASE_CONFIG__\s*=\s*([^<]*?)\s*;\s*<\/script>/i);
  if (!match) return null;
  try {
    const config = JSON.parse(match[1]);
    if (!validFirebaseWebConfig(config)) return null;
    return {...publicFirebaseWebConfig(config)};
  } catch { return null; }
}

async function hostedFirebaseWebConfig(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${HOSTED_ORIGIN}/`, {headers: {accept: 'text/html'}, redirect: 'error', signal: AbortSignal.timeout(5000)});
    return response.ok ? parseHostedFirebaseWebConfig(await response.text()) : null;
  } catch { return null; }
}

function publicFirebaseWebConfig(config) {
  return {apiKey:config.apiKey,projectId:config.projectId,authDomain:config.authDomain,appId:config.appId,
    googleClientId:/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId||'')?config.googleClientId:'',
    storageBucket:/^[a-z0-9.-]+\.(?:appspot\.com|firebasestorage\.app)$/.test(config.storageBucket||'')?config.storageBucket:'',socialMediaEnabled:config.socialMediaEnabled===true};
}
function firebaseConfigScript(config) {
  if (!validFirebaseWebConfig(config)) return '';
  const publicConfig = publicFirebaseWebConfig(config);
  return `<script>window.__ZORIFI_FIREBASE_CONFIG__=${JSON.stringify(publicConfig).replace(/</g, '\\u003c')};</script>`;
}

async function hostedLanguageConfiguration(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${HOSTED_ORIGIN}/api/ai-settings`, {headers: {accept: 'application/json'}, redirect: 'error', signal: AbortSignal.timeout(5000)});
    if (!response.ok) return null;
    const language = (await response.json()).configurations?.language;
    if (!language || !language.configured || typeof language.provider !== 'string') return null;
    return {...language, provider: `${language.provider} (Zorifi Cloud)`};
  } catch { return null; }
}

async function relayHostedLanguage({service, request, response, body, fetchImpl = fetch}) {
  if (!LANGUAGE_SERVICES.has(service)) throw new Error('Only language services can use the hosted relay.');
  if (request.method !== 'POST') {
    response.writeHead(405, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
    response.end(JSON.stringify({error: 'Method not allowed.'}));
    return;
  }
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !/^Bearer \S+$/i.test(authorization)) {
    response.writeHead(401, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
    response.end(JSON.stringify({error: 'Sign in to use Vanessa online.'}));
    return;
  }
  if (body.length > 4 * 1024 * 1024) {
    response.writeHead(413, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
    response.end(JSON.stringify({error: 'Split this request into smaller parts.'}));
    return;
  }
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 125000);
  const onClose = () => abort.abort();
  response.once('close', onClose);
  try {
    const upstream = await fetchImpl(`${HOSTED_ORIGIN}/api/vanessa-provider?service=${encodeURIComponent(service)}`, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': request.headers['content-type'] || 'application/json',
        accept: request.headers.accept || 'application/json'
      },
      body,
      redirect: 'error',
      signal: abort.signal
    });
    response.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    });
    if (upstream.body) for await (const chunk of upstream.body) {
      if (response.destroyed) break;
      response.write(chunk);
    }
    if (!response.destroyed) response.end();
  } catch {
    if (!response.headersSent) {
      response.writeHead(502, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
      response.end(JSON.stringify({error: 'Vanessa could not reach the online AI service. Please retry.'}));
    } else response.destroy();
  } finally {
    clearTimeout(timeout);
    response.off('close', onClose);
  }
}

module.exports = {HOSTED_ORIGIN, LANGUAGE_SERVICES, validFirebaseWebConfig, parseHostedFirebaseWebConfig, hostedFirebaseWebConfig, firebaseConfigScript, hostedLanguageConfiguration, relayHostedLanguage};
