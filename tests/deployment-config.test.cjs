const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

test('Vercel function include patterns stay within the hosted schema limit', () => {
  for (const [name, settings] of Object.entries(config.functions)) {
    assert.equal(typeof settings.includeFiles, 'string', name);
    assert.ok(settings.includeFiles.length <= 256, `${name}: includeFiles exceeds 256 characters`);
  }
});

test('both chat entry points package the native planner and local runtime dependencies', () => {
  const dependencies = new Set(['zorifi-interface-catalog.json', 'zorifi-creative-strategies.json']);
  const visit = file => {
    if (dependencies.has(file)) return;
    dependencies.add(file);
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*['"](\.[^'"]+)['"]/g)) {
      const resolved = path.resolve(root, path.dirname(file), match[1]);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;
      const relative = path.relative(root, resolved).replaceAll('\\', '/');
      if (/\.(?:mjs|cjs|js)$/.test(relative)) visit(relative);
      else dependencies.add(relative);
    }
  };
  for (const name of ['professional-planner', 'creative-feedback', 'vanessa-router', 'services']) {
    visit(`netlify/functions/_shared/${name}.mjs`);
  }
  for (const entry of ['api/vanessa-provider.js', 'api/vanessa/chat.js']) {
    for (const file of dependencies) {
      assert.ok(path.matchesGlob(file, config.functions[entry].includeFiles), `${entry} omits ${file}`);
    }
  }
});
