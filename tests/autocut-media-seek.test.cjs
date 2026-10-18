const test = require('node:test');
const assert = require('node:assert/strict');
const Media = require('../zorifi-autocut-media.js');

class FakeMedia extends EventTarget {
  constructor({ video = true } = {}) {
    super(); this.readyState = 4; this.seeking = false; this.duration = 5;
    this.videoWidth = video ? 128 : 0; this.position = 0; this.callbacks = new Map(); this.cancelled = []; this.requests = 0;
  }
  get currentTime() { return this.position; }
  set currentTime(time) { this.position = time; this.readyState = 1; this.seeking = true; }
  requestVideoFrameCallback(callback) { const id = ++this.requests; this.callbacks.set(id, callback); return id; }
  cancelVideoFrameCallback(id) { this.cancelled.push(id); this.callbacks.delete(id); }
  decode() { this.readyState = 4; this.seeking = false; this.dispatchEvent(new Event('seeked')); }
  present() { for (const callback of [...this.callbacks.values()]) callback(0, { mediaTime: this.position }); }
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('A short seek waits for its new decode event instead of accepting the old ready state', async () => {
  const media = new FakeMedia(); let done = false;
  const pending = Media.seek(media, .03, { timeout: 1000 }).then(() => { done = true; });
  await tick();
  assert.equal(media.currentTime, .03);
  assert.equal(media.readyState, 1);
  assert.equal(done, false, 'A .03-second move must not resolve against the old frame’s .05 tolerance');
  media.dispatchEvent(new Event('canplay')); await tick();
  assert.equal(done, false, 'Events without a decoded target must not complete the seek');
  media.decode(); await tick();
  assert.equal(done, false, 'Ready data must also have a presented video surface');
  assert.equal(media.callbacks.size, 1);
  media.present(); await pending;
  assert.equal(done, true); assert.equal(media.seeking, false);
});

test('Seeking an already selected first frame still waits for presentation once', async () => {
  const media = new FakeMedia(); let done = false;
  const pending = Media.seek(media, 0, { timeout: 1000 }).then(() => { done = true; });
  await tick(); assert.equal(done, false); assert.equal(media.requests, 1);
  media.present(); await pending;
  await Media.seek(media, 0, { timeout: 1000 });
  assert.equal(media.requests, 1, 'A paused surface that already presented must not wait for a nonexistent second first frame');
});

test('Aborting a first-surface wait cancels its pending video callback', async () => {
  const media = new FakeMedia(), controller = new AbortController();
  const pending = Media.waitPresented(media, { signal: controller.signal, timeout: 1000 });
  assert.equal(media.callbacks.size, 1); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(media.cancelled, [1]); assert.equal(media.callbacks.size, 0);
});

test('A later scene seek waits for its new presented surface even after the opening frame was ready', async () => {
  const media = new FakeMedia();
  const opening = Media.waitPresented(media, { timeout: 1000 });
  media.present(); await opening;
  let done = false;
  const pending = Media.seek(media, 1, { timeout: 1000 }).then(() => { done = true; });
  await tick(); assert.equal(done, false);
  media.decode(); await tick();
  assert.equal(done, false, 'A presented opening frame cannot stand in for the new scene’s decoded surface');
  assert.equal(media.requests, 2);
  media.present(); await pending;
  assert.equal(done, true);
});

test('Soundtrack seeks wait for decode without requesting video presentation', async () => {
  const media = new FakeMedia({ video: false }); let done = false;
  const pending = Media.seek(media, .03, { timeout: 1000 }).then(() => { done = true; });
  await tick(); assert.equal(done, false);
  media.decode(); await pending;
  assert.equal(done, true); assert.equal(media.requests, 0);
});
