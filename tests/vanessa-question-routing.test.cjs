const test = require('node:test');
const assert = require('node:assert/strict');
const intent = require('../zorifi-vanessa-intent.js');
const router = require('../zorifi-vanessa-router.js');

test('knowledge questions containing editing words remain conversations', () => {
  for (const message of [
    'In one sentence, why does a prism split white light into colors?',
    'Why does a prism split white light?',
    'How does a diamond cut light into colors?'
  ]) {
    const context = intent.buildIntentContext(message);
    assert.equal(context.primaryIntent, intent.INTENTS.QUESTION, message);
    assert.equal(context.editorIntent, false, message);
    assert.equal(router.route(message, {intentContext: context}).commandPipeline, false, message);
  }
});

test('an explicit request to split a clip still enters the editor pipeline', () => {
  for (const message of ['Split the selected clip at the playhead.', 'Can you split the selected clip?']) {
    const context = intent.buildIntentContext(message);
    assert.equal(context.primaryIntent, intent.INTENTS.ACTION_REQUEST, message);
    assert.equal(context.editorIntent, true, message);
    assert.equal(router.route(message, {intentContext: context}).commandPipeline, true, message);
  }
});
