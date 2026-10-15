const test = require('node:test');
const assert = require('node:assert/strict');
const {GenerationManager} = require('../zorifi-ai-platform.js');

test('large local media stays in the live result but not browser generation history', async () => {
  const media = {status: 'complete', url: `data:audio/wav;base64,${'A'.repeat(6_000_000)}`, mimeType: 'audio/wav', duration: 30};
  const manager = new GenerationManager();
  const job = manager.create({type: 'music', provider: 'Local CPU', model: 'Stable Audio 3', prompt: 'gentle piano', run: async () => media});
  const result = await manager.start(job.id);
  assert.equal(result.url.length, media.url.length);
  assert.equal(manager.history[0].stage, 'completed');
  assert.equal(manager.history[0].result, null);
  assert.equal(manager.jobs.has(job.id), false);
  assert.ok(JSON.stringify(manager.history).length < 2000);
  const restored = new GenerationManager();
  restored.restore([{...manager.history[0], result: media}]);
  assert.equal(restored.history[0].result, null);
});
