const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Firebase default transport preserves the browser receiver for account and cloud requests', async () => {
  const context = vm.createContext({Headers,AbortSignal});
  vm.runInContext(`
    globalThis.calls = [];
    globalThis.fetch = function(url) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      calls.push(url);
      return Promise.resolve({ok:true,json:async()=>({
        idToken:'test-token',localId:'test-user',email:'user@example.test',
        fields:{title:{stringValue:'Project'}}
      })});
    };
  `, context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../zorifi-firebase.js'), 'utf8'), context);
  const { FirebaseGateway, ZorifiCloudSyncEngine } = context.ZorifiFirebase;
  const gateway = new FirebaseGateway({apiKey:'test-key',projectId:'test-project'});
  await gateway.signUp('user@example.test','test-password');
  await gateway.signIn('user@example.test','test-password');
  assert.equal((await gateway.document('projects/test')).title, 'Project');
  const sync = new ZorifiCloudSyncEngine();
  await sync.transport('/api/teamspace/sync');
  assert.equal(context.calls.length, 4);
});

test('Firebase keeps injected transports usable', async () => {
  const {FirebaseGateway} = require('../zorifi-firebase.js');
  let calls = 0;
  const gateway = new FirebaseGateway({apiKey:'test-key',projectId:'test-project'}, async () => {
    calls++;
    return {ok:true,json:async()=>({idToken:'test-token',localId:'test-user'})};
  });
  await gateway.signIn('user@example.test','test-password');
  assert.equal(calls,1);
});
