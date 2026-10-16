const test = require('node:test');
const assert = require('node:assert/strict');
const Phase11 = require('../zorifi-phase11.js');

function coverage(cells) {
  for (let y = 0.5; y < 100; y++) {
    for (let x = 0.5; x < 100; x++) {
      const inside = cells.filter(cell => {
        const left = 50 + cell.x - cell.w / 2;
        const top = 50 + cell.y - cell.h / 2;
        return x >= left && x < left + cell.w && y >= top && y < top + cell.h;
      });
      assert.equal(inside.length, 1, `cell coverage at ${x},${y}`);
    }
  }
}

test('collage layouts cover the whole frame with two, three, and four media', () => {
  for (const count of [2, 3, 4]) {
    for (const ratio of ['16:9', '9:16']) {
      const cells = Phase11.collageLayout('grid', count, { aspectRatio: ratio });
      assert.equal(cells.length, count);
      coverage(cells);
    }
  }
  assert.deepEqual(Phase11.collageLayout('grid', 2, { aspectRatio: '9:16' }).map(cell => cell.y), [-25, 25]);
});

test('collage clips expose distinct editable tile bounds and preserve asset references', () => {
  const assets = [
    { id: 'video-a', name: 'A', type: 'video' },
    { id: 'photo-b', name: 'B', type: 'image' },
  ];
  const clips = Phase11.collageClips(assets, { start: 3, duration: 7, spacing: 2, rounding: 4 });
  assert.equal(clips.length, 2);
  assert.deepEqual(clips.map(clip => clip.mediaId), ['video-a', 'photo-b']);
  assert.deepEqual(clips.map(clip => clip.collage.cell), [
    { left: 1, top: 1, width: 48, height: 98 },
    { left: 51, top: 1, width: 48, height: 98 },
  ]);
  assert.ok(clips.every(clip => clip.start === 3 && clip.duration === 7 && clip.fit === 'cover'));
  assert.ok(clips.every(clip => clip.scale === 100 && clip.scaleX === 100 && clip.scaleY === 100));
  assert.ok(clips.every(clip => clip.positionX === 0 && clip.positionY === 0));
  assert.notEqual(clips[0].id, clips[1].id);
  assert.equal(clips[0].collage.id, clips[1].collage.id);
  assert.deepEqual(clips.map(clip => clip.cornerRadius), [4, 4]);
});

test('collage does not accept repeated or nonvisual assets', () => {
  const video = { id: 'same', type: 'video' };
  assert.throws(() => Phase11.collageClips([video, video]), /distinct photos or videos/);
  assert.throws(() => Phase11.collageClips([video, { id: 'audio', type: 'audio' }]), /distinct photos or videos/);
  assert.throws(() => Phase11.collageLayout('grid', 1), /two and four/);
});
