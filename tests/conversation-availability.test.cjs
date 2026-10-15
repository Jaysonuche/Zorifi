const test = require('node:test');
const assert = require('node:assert/strict');
const Router = require('../zorifi-vanessa-router.js');
const VanessaCore = require('../zorifi-vanessa-core.js');

const history = [
  {role: 'user', text: 'I want to discuss my creative project.'},
  {role: 'assistant', text: 'What would you like to explore next?'}
];

test('conversation payload includes only a bounded signed-in display name', () => {
  const payload = Router.conversationPayload('What is my name?', {
    profile: {displayName: '  Jayson\n  Uche  ', email: 'private@example.com'}
  });
  assert.deepEqual(payload.input.profile, {displayName: 'Jayson Uche'});
  assert(!JSON.stringify(payload).includes('private@example.com'));
  assert.equal(Router.conversationPayload('Hello').input.profile, undefined);
  assert.equal(Router.conversationPayload('Hello', {profile: {displayName: 'x'.repeat(100)}}).input.profile.displayName.length, 40);
});

test('short chat messages after a question receive the online provider answer', async () => {
  for (const message of ['hey', 'Hello', 'editing', 'zorifi']) {
    let remoteCalls = 0, fallbackCalls = 0;
    const answer = `Provider answer specifically for ${message}.`;
    const conversation = new VanessaCore.ConversationEngine({
      router: Router,
      isOnline: () => true,
      transport: async payload => {
        remoteCalls++;
        assert.equal(payload.input.message, message);
        assert.deepEqual(payload.input.history, history);
        return {ok: true, status: 200, data: {text: answer, metadata: {provider: 'gemini'}}, error: null};
      },
      fallback: () => { fallbackCalls++; return 'Got it. What would you like to explore next?'; }
    });
    const core = new VanessaCore.Core({router: Router, conversation, editor: new VanessaCore.EditorBridge({contextProvider: () => null})});
    const result = await core.converse(message, {history});
    assert.equal(remoteCalls, 1);
    assert.equal(fallbackCalls, 0);
    assert.equal(result.status, VanessaCore.STATUS.SUCCESS);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.text, answer);
  }
});

test('failed online requests report unavailable service without manufacturing a conversation reply', async () => {
  for (const status of [401, 403, 503]) {
    let fallbackCalls = 0;
    const code = `UPSTREAM_${status}`;
    const conversation = new VanessaCore.ConversationEngine({
      router: Router,
      isOnline: () => true,
      transport: async () => ({ok: false, status, data: null, error: {kind: 'service', code, message: 'SECRET_UPSTREAM_TOKEN'}}),
      fallback: () => { fallbackCalls++; return 'Got it—Hello. I’ll keep that connected to what we were discussing.'; }
    });
    const result = await conversation.respond({message: 'Hello', history});
    assert.equal(fallbackCalls, 0);
    assert.equal(result.status, VanessaCore.STATUS.FAILED);
    assert.equal(result.provider, 'unavailable');
    assert.equal(result.error.kind, 'service');
    assert.equal(result.error.code, code);
    assert(result.text.trim());
    assert(!result.text.includes('SECRET_UPSTREAM_TOKEN'));
    assert(!result.text.includes('keep that connected'));
  }
});

test('an empty successful online response is a failure rather than a local answer', async () => {
  let fallbackCalls = 0;
  const conversation = new VanessaCore.ConversationEngine({
    router: Router,
    isOnline: () => true,
    transport: async () => ({ok: true, status: 200, data: {text: ''}, error: null}),
    fallback: () => { fallbackCalls++; return 'Made-up answer'; }
  });
  const result = await conversation.respond({message: 'Explain the water cycle.', history});
  assert.equal(result.status, VanessaCore.STATUS.FAILED);
  assert.equal(result.provider, 'unavailable');
  assert.equal(fallbackCalls, 0);
});

test('genuinely offline conversation retains its explicit local fallback', async () => {
  let remoteCalls = 0, fallbackCalls = 0;
  const conversation = new VanessaCore.ConversationEngine({
    router: Router,
    isOnline: () => false,
    transport: async () => { remoteCalls++; throw Error('Offline mode must not send a provider request'); },
    fallback: (message, request) => {
      fallbackCalls++;
      assert.equal(message, 'Hello');
      assert.deepEqual(request.contextHistory, history);
      return 'Offline greeting';
    }
  });
  const result = await conversation.respond({message: 'Hello', history});
  assert.equal(remoteCalls, 0);
  assert.equal(fallbackCalls, 1);
  assert.equal(result.status, VanessaCore.STATUS.FALLBACK);
  assert.equal(result.provider, 'offline');
  assert.equal(result.text, 'Offline greeting');
});

test('a false browser connectivity hint does not bypass a reachable Vanessa gateway', async () => {
  assert.equal(Router.remoteAvailable({protocol: 'https:', online: false}), true);
  assert.equal(Router.remoteAvailable({protocol: 'http:', online: false}), true);
  assert.equal(Router.remoteAvailable({protocol: 'file:', online: true}), false);
  let remoteCalls = 0;
  const conversation = new VanessaCore.ConversationEngine({
    router: Router,
    isOnline: () => Router.remoteAvailable({protocol: 'http:', online: false}),
    transport: async payload => {
      remoteCalls++;
      assert.equal(payload.input.message, 'What is 2 x 4?');
      return {ok: true, status: 200, data: {text: '2 × 4 = 8.'}, error: null};
    },
    fallback: () => {throw Error('Connectivity hint incorrectly selected canned offline reply');}
  });
  const result = await conversation.respond({message: 'What is 2 x 4?'});
  assert.equal(remoteCalls, 1);
  assert.equal(result.status, VanessaCore.STATUS.SUCCESS);
  assert.equal(result.text, '2 × 4 = 8.');
});

test('cancelled online requests do not invoke the fallback', async () => {
  let fallbackCalls = 0;
  const conversation = new VanessaCore.ConversationEngine({
    router: Router,
    isOnline: () => true,
    transport: async () => ({ok: false, status: 0, data: null, error: {kind: 'cancelled', message: 'Conversation changed'}}),
    fallback: () => { fallbackCalls++; return 'Unexpected fallback'; }
  });
  const result = await conversation.respond({message: 'Hello', history});
  assert.equal(result.status, VanessaCore.STATUS.FAILED);
  assert.equal(result.provider, 'cancelled');
  assert.equal(fallbackCalls, 0);
});

test('thrown privacy consent failures preserve their code and show a safe actionable message', async () => {
  let fallbackCalls = 0;
  const failures = [];
  const conversation = new VanessaCore.ConversationEngine({
    router: Router,
    isOnline: () => true,
    transport: async () => { throw Object.assign(Error('PRIVATE_ERROR_DETAIL'), {code: 'PRIVACY_CONSENT_REQUIRED'}); },
    fallback: () => { fallbackCalls++; return 'Unexpected fallback'; },
    onInternalError: error => failures.push(error)
  });
  const result = await conversation.respond({message: 'Hello', history});
  assert.equal(result.status, VanessaCore.STATUS.FAILED);
  assert.equal(result.provider, 'unavailable');
  assert.equal(result.error.code, 'PRIVACY_CONSENT_REQUIRED');
  assert.equal(fallbackCalls, 0);
  assert.equal(failures.length, 1);
  assert.match(result.text, /privacy|optional AI|AI processing/i);
  assert(!result.text.includes('PRIVATE_ERROR_DETAIL'));
});
