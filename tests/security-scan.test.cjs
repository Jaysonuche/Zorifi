'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scanText, scanFiles, scanCommitMessages, audit, disallowed, safePath, MAX_FILE_BYTES } = require('../scripts/check-secret-exposure.cjs');

const fixtureKey = () => 'sk-' + 'proj-' + 'aB7x9Q_'.repeat(12);
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { windowsHide: true, stdio: 'pipe', encoding: 'utf8' });

test('credential audit returns a one-way fingerprint and location, never matched content', () => {
  const secret = fixtureKey(), source = `const benign = true;\nconst value = '${secret}';`;
  const findings = scanText(source, { path: 'app.js', scope: 'tracked' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, 'openai-key');
  assert.equal(findings[0].line, 2);
  assert.match(findings[0].fingerprint, /^[a-f0-9]{16}$/);
  assert.equal(findings[0].value, '[redacted]');
  assert(!JSON.stringify(findings).includes(secret));
  assert.equal(scanText(source)[0].fingerprint, findings[0].fingerprint);
});

test('credentials embedded in a filename are redacted too', () => {
  const secret = fixtureKey();
  assert.equal(safePath(`artifacts/${secret}.log`), '[redacted-path]');
  assert.equal(scanText(secret, { path: `artifacts/${secret}.log` })[0].path, '[redacted-path]');
});

test('private auth stores and environment files are excluded without reading', () => {
  for (const name of ['.env', '.env.production', 'folder/.env.local', '.vercel/auth.json', '.zorifi-private/test.txt', 'keys/service-account.json', 'node_modules/package/test.js']) assert(disallowed(name), name);
  assert(!disallowed('tests/auth-regression.test.cjs'));
  assert(!disallowed('netlify/functions/_shared/secure-auth.mjs'));
});

test('public Google API key shapes are a review finding, not proof of a secret leak', () => {
  const key = 'AI' + 'za' + 'b'.repeat(35), findings = scanText(key);
  assert.equal(findings[0].category, 'google-api-key-review');
  assert.equal(findings[0].severity, 'review');
  assert(!JSON.stringify(findings).includes(key));
});

test('overlapping Anthropic/OpenAI patterns produce one classified finding', () => {
  const findings = scanText('sk-' + 'ant-' + 'aBcD9'.repeat(10));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, 'anthropic-key');
});

test('file audit rejects traversal, binaries and oversized files and never loads excluded .env', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zorifi-secret-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'good.js'), '// no credentials');
  fs.writeFileSync(path.join(root, '.env'), fixtureKey());
  fs.writeFileSync(path.join(root, 'binary.js'), Buffer.from([1, 0, 2]));
  fs.writeFileSync(path.join(root, 'large.js'), Buffer.alloc(MAX_FILE_BYTES + 1, 32));
  const result = scanFiles(root, ['good.js', '.env', 'binary.js', 'large.js', '../outside.js'], 'test');
  assert.equal(result.scanned, 1);
  assert.equal(result.excludedPrivatePaths, 1);
  assert.equal(result.skippedBinaryOrLarge, 2);
  assert.equal(result.readErrors, 1);
  assert.equal(result.findings.length, 0);
});

test('reachable Git history is scanned even after a token is removed from current source', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zorifi-secret-history-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Zorifi audit test');
  git(root, 'config', 'user.email', 'audit-test@example.invalid');
  const secret = fixtureKey();
  fs.writeFileSync(path.join(root, 'sample.js'), `const token='${secret}';\n`);
  git(root, 'add', 'sample.js'); git(root, 'commit', '--quiet', '-m', 'Synthetic audit fixture');
  fs.writeFileSync(path.join(root, 'sample.js'), '// credential removed\n');
  git(root, 'add', 'sample.js'); git(root, 'commit', '--quiet', '-m', 'Remove synthetic fixture');
  fs.mkdirSync(path.join(root, 'web-dist'));
  fs.writeFileSync(path.join(root, 'web-dist', 'bundle.js'), `let token='${secret}';`);
  fs.writeFileSync(path.join(root, '.env'), secret);
  fs.writeFileSync(path.join(root, '.gitignore'), 'web-dist/\n.env\n');
  const report = await audit(root);
  assert.equal(report.sections.tracked.findings.length, 0);
  assert.equal(report.sections.history.findings.length, 1);
  assert.equal(report.sections.builds.findings.length, 1);
  assert.equal(report.summary.blockers, 2);
  assert(!JSON.stringify(report).includes(secret));
  assert.equal(report.sections.history.findings[0].path, 'sample.js');
});

test('commit-message leaks are detected without printing the commit message or token', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zorifi-commit-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Zorifi audit test');
  git(root, 'config', 'user.email', 'audit-test@example.invalid');
  const secret = fixtureKey();
  git(root, 'commit', '--allow-empty', '--quiet', '-m', `Synthetic fixture ${secret}`);
  const section = scanCommitMessages(root);
  assert.equal(section.scanned, 1);
  assert.equal(section.findings.length, 1);
  assert.equal(section.findings[0].scope, 'history-commit-message');
  assert(!JSON.stringify(section).includes(secret));
});
