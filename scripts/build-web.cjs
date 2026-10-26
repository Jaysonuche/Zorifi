const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('./build-interface-catalog.cjs');
const output = path.join(root, 'web-dist');
const files = ['index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.webmanifest', '_redirects', 'ZorifiVanessaStudioCore.js', 'ZorifiVanessaStudioDirector.js', 'ZorifiVanessaTrueAudioAI.js', 'ZorifiAutoCaptions.js', 'ZorifiMulticamSyncEngine.js', ...fs.readdirSync(root).filter(name => /^zorifi-.*\.(js|json|css)$/.test(name))];
for (const name of files) if (!fs.existsSync(path.join(root, name))) throw new Error(`Missing web source: ${name}`);
fs.mkdirSync(output, {recursive: true});
for (const name of files) fs.copyFileSync(path.join(root, name), path.join(output, name));
for (const name of ['icons', 'assets']) fs.cpSync(path.join(root, name), path.join(output, name), {recursive: true});
const config = {apiKey: process.env.FIREBASE_WEB_API_KEY || '', projectId: process.env.FIREBASE_PROJECT_ID || '', authDomain: process.env.FIREBASE_AUTH_DOMAIN || '', appId: process.env.FIREBASE_APP_ID || '', googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '', storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '', socialMediaEnabled: process.env.ZORIFI_SOCIAL_MEDIA_ENABLED === 'true'};
// Only public Firebase web configuration is included; provider secrets stay server-side.
const injection = `<script>window.__ZORIFI_FIREBASE_CONFIG__=${JSON.stringify(config).replace(/</g, '\\u003c')};</script>`;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('<head>', `<head>\n    ${injection}`);
fs.writeFileSync(path.join(output, 'index.html'), html);
console.log(`Built ${files.length} web files plus assets into web-dist.`);
