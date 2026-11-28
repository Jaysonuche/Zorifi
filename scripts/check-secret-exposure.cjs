#!/usr/bin/env node
'use strict';

// Read-only, offline credential-shape audit. Never load environment files or auth stores.
// Findings contain locations, categories and one-way fingerprints, never matched content.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const TEXT_EXTENSIONS = /\.(?:[cm]?[jt]sx?|html?|css|json|ya?ml|toml|txt|md|log|rules|xml|webmanifest|ps1|cmd|bat|sh|py|sql|csv|map)$/i;
const BLOCKED_PARTS = /(?:^|\/)(?:node_modules|\.git|\.vercel|\.netlify|\.zorifi-private|\.ssh|\.aws|\.azure|gcloud|credentials?)(?:\/|$)/i;
const BLOCKED_NAMES = /(?:^|\/)(?:\.env(?:\..*)?|[^/]*(?:service[-_]?account|credentials?|auth[-_]?token)[^/]*\.json|id_rsa|id_ed25519)$/i;
const PATTERNS = Object.freeze([
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g],
  ['openai-key', /\bsk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{32,}\b/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ['stripe-secret', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/g],
  ['payment-secret', /\b(?:sk_live_|sk_test_)[A-Za-z0-9]{24,}\b/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{24,}\b/g],
  ['aws-access-id', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['google-api-key-review', /\bAIza[A-Za-z0-9_-]{35}\b/g]
]);
function normalizePath(value) { return String(value).replaceAll('\\', '/'); }
function disallowed(relative) { const value = normalizePath(relative); return BLOCKED_PARTS.test(value) || BLOCKED_NAMES.test(value); }
function textPath(relative) { return TEXT_EXTENSIONS.test(relative) || /(?:^|\/)(?:Dockerfile|Makefile|\.gitignore|\.npmrc)$/i.test(relative); }
function safePath(relative) {
  const value = normalizePath(relative);
  return PATTERNS.some(([, pattern]) => new RegExp(pattern.source).test(value)) ? '[redacted-path]' : value;
}
function scanText(source, location = {}) {
  const text = String(source), findings = [], occupied = [];
  for (const [category, original] of PATTERNS) {
    const pattern = new RegExp(original.source, 'g');
    let match;
    while ((match = pattern.exec(text))) {
      if (occupied.some(([start, end]) => match.index >= start && match.index < end)) continue;
      occupied.push([match.index, match.index + match[0].length]);
      findings.push({
        ...location, ...(location.path ? { path: safePath(location.path) } : {}),
        category, severity: category === 'google-api-key-review' ? 'review' : 'blocker',
        line: 1 + (text.slice(0, match.index).match(/\n/g) || []).length,
        fingerprint: crypto.createHash('sha256').update(match[0]).digest('hex').slice(0, 16),
        value: '[redacted]'
      });
    }
  }
  return findings;
}
function git(root, args, options = {}) {
  // Do not include child-process errors: their message can embed buffered source.
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...options }); }
  catch { throw new Error('Git audit command failed; source output was suppressed.'); }
}
function emptySection() { return { scanned: 0, bytes: 0, excludedPrivatePaths: 0, skippedBinaryOrLarge: 0, readErrors: 0, findings: [] }; }
function scanFiles(root, files, scope) {
  const section = emptySection();
  for (const relative of [...new Set(files)].sort()) {
    if (disallowed(relative)) { section.excludedPrivatePaths++; continue; }
    if (!textPath(relative)) { section.skippedBinaryOrLarge++; continue; }
    const absolute = path.resolve(root, relative);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) { section.readErrors++; continue; }
    try {
      const stat = fs.lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) { section.skippedBinaryOrLarge++; continue; }
      const data = fs.readFileSync(absolute);
      if (data.includes(0)) { section.skippedBinaryOrLarge++; continue; }
      section.scanned++; section.bytes += data.length;
      section.findings.push(...scanText(data.toString('utf8'), { scope, path: relative }));
    } catch { section.readErrors++; }
  }
  return section;
}
function buildFiles(root) {
  const files = [];
  const visit = (relative, depth = 0) => {
    if (depth > 10 || disallowed(relative)) return;
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = normalizePath(path.join(relative, entry.name));
      if (entry.isDirectory()) visit(child, depth + 1);
      else if (entry.isFile()) files.push(child);
    }
  };
  for (const directory of ['web-dist', 'artifacts', 'release', 'release-vanessa-local', 'installer-dist']) visit(directory);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) if (entry.isFile() && /\.log$/i.test(entry.name)) files.push(entry.name);
  return files;
}
async function scanHistory(root) {
  const section = emptySection();
  const candidates = new Map();
  for (const line of git(root, ['rev-list', '--objects', '--all']).trim().split('\n')) {
    const match = line.match(/^([a-f0-9]{40,64}) (.+)$/);
    if (!match) continue;
    const [, hash, relative] = match;
    if (disallowed(relative)) { section.excludedPrivatePaths++; continue; }
    if (!textPath(relative)) { section.skippedBinaryOrLarge++; continue; }
    candidates.set(hash, relative);
  }
  if (!candidates.size) return section;
  const hashes = [...candidates.keys()];
  const sizes = git(root, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], { input: hashes.join('\n') + '\n' });
  const selected = sizes.trim().split('\n').map(line => line.split(' ')).filter(([hash, type, size]) => {
    if (!candidates.has(hash) || type !== 'blob') return false;
    if (Number(size) > MAX_FILE_BYTES) { section.skippedBinaryOrLarge++; return false; }
    return true;
  }).map(([hash]) => hash);
  if (!selected.length) return section;
  // A single streaming process avoids loading all history into memory or exposing it on error.
  await new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', root, 'cat-file', '--batch'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let buffer = Buffer.alloc(0), expected = null, received = 0, stopped = false;
    const fail = () => { if (!stopped) { stopped = true; child.kill(); reject(new Error('Historical audit failed; all source output was suppressed.')); } };
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stdout.on('error', fail);
    child.stdout.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        if (!expected) {
          const newline = buffer.indexOf(10);
          if (newline < 0) break;
          const header = buffer.subarray(0, newline).toString('ascii').match(/^([a-f0-9]{40,64}) blob (\d+)$/);
          buffer = buffer.subarray(newline + 1);
          if (!header || !candidates.has(header[1]) || Number(header[2]) > MAX_FILE_BYTES) return fail();
          expected = { hash: header[1], size: Number(header[2]) };
        }
        if (buffer.length < expected.size + 1) break;
        const data = buffer.subarray(0, expected.size);
        buffer = buffer.subarray(expected.size + 1);
        if (data.includes(0)) section.skippedBinaryOrLarge++;
        else {
          section.scanned++; section.bytes += data.length;
          section.findings.push(...scanText(data.toString('utf8'), { scope: 'history', path: candidates.get(expected.hash), blob: expected.hash }));
        }
        received++; expected = null;
      }
    });
    child.on('close', code => {
      if (stopped) return;
      stopped = true;
      if (code !== 0 || expected || buffer.length || received !== selected.length) reject(new Error('Historical audit was incomplete; source output was suppressed.'));
      else resolve();
    });
    child.stdin.end(selected.join('\n') + '\n');
  });
  return section;
}
function scanCommitMessages(root) {
  const section = emptySection();
  const fields = git(root, ['log', '--all', '--format=%H%x00%B%x00']).split('\0');
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const commit = fields[index].trim(), message = fields[index + 1];
    if (!/^[a-f0-9]{40,64}$/.test(commit)) continue;
    section.scanned++; section.bytes += Buffer.byteLength(message);
    section.findings.push(...scanText(message, { scope: 'history-commit-message', path: '[commit-message]', commit }));
  }
  return section;
}
async function audit(root, { history = true, builds = true } = {}) {
  const absolute = path.resolve(root);
  const tracked = git(absolute, ['ls-files', '-z']).split('\0').filter(Boolean);
  const sections = { tracked: scanFiles(absolute, tracked, 'tracked') };
  const untracked = git(absolute, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  sections.untracked = scanFiles(absolute, untracked, 'untracked-source');
  if (history) { sections.history = await scanHistory(absolute); sections.commitMessages = scanCommitMessages(absolute); }
  if (builds) sections.builds = scanFiles(absolute, buildFiles(absolute), 'builds-and-logs');
  const findings = Object.values(sections).flatMap(item => item.findings);
  return {
    schema: 'zorifi.credential-shape-audit/1', time: new Date().toISOString(),
    commit: git(absolute, ['rev-parse', 'HEAD']).trim(), sections,
    summary: { blockers: findings.filter(item => item.severity === 'blocker').length, review: findings.filter(item => item.severity === 'review').length, readErrors: Object.values(sections).reduce((sum, item) => sum + item.readErrors, 0) },
    limits: ['Offline shape detection cannot determine whether a credential is active or revoked.', 'Private environment/auth files, dependencies, symlinks, binaries and files above 8 MiB are excluded.', 'Only reachable Git objects are scanned; external chats, cloud logs and removed/unreachable blobs require separate review.', 'Google API keys may be public Firebase web configuration; each finding requires a restrictions/usage review.']
  };
}
if (require.main === module) {
  const args = process.argv.slice(2), allowed = new Set(['--no-history', '--no-builds']);
  if (args.some(arg => !allowed.has(arg))) { process.stderr.write('Unsupported audit option.\n'); process.exitCode = 2; }
  else audit(path.resolve(__dirname, '..'), { history: !args.includes('--no-history'), builds: !args.includes('--no-builds') }).then(report => {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (report.summary.blockers || report.summary.readErrors) process.exitCode = 1;
  }).catch(() => { process.stderr.write('Credential audit could not complete; source and credential details were suppressed.\n'); process.exitCode = 2; });
}
module.exports = { scanText, scanFiles, scanHistory, scanCommitMessages, audit, disallowed, safePath, MAX_FILE_BYTES };
