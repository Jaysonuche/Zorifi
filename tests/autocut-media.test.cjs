const test = require('node:test');
const assert = require('node:assert/strict');
const media = require('../zorifi-autocut-media.js');

function jpeg({ width = 8000, height = 6000, rotation = 6, metadataSegments = 0 } = {}) {
  const exif = Buffer.alloc(32);
  exif.write('Exif\0\0', 0, 'binary');
  exif.write('II', 6, 'ascii'); exif.writeUInt16LE(42, 8); exif.writeUInt32LE(8, 10);
  exif.writeUInt16LE(1, 14); exif.writeUInt16LE(0x112, 16); exif.writeUInt16LE(3, 18);
  exif.writeUInt32LE(1, 20); exif.writeUInt16LE(rotation, 24);
  const app = Buffer.from([0xff, 0xe1, 0, exif.length + 2]);
  const metadata = Buffer.alloc(65537); metadata[0] = 0xff; metadata[1] = 0xe2; metadata.writeUInt16BE(65535, 2);
  const frame = Buffer.from([0xff, 0xc0, 0, 17, 8, 0, 0, 0, 0, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]);
  frame.writeUInt16BE(height, 5); frame.writeUInt16BE(width, 7);
  return new Blob([Buffer.from([0xff, 0xd8]), app, exif, ...Array.from({ length: metadataSegments }, () => metadata), frame, Buffer.from([0xff, 0xd9])], { type: 'image/jpeg' });
}

test('Large JPEG metadata is skipped by offsets and EXIF orientation preserves display dimensions', async () => {
  const blob = jpeg({ metadataSegments: 40 });
  const reads = [];
  const sliced = { size: blob.size, slice(start, end) { reads.push(end - start); return blob.slice(start, end); } };
  const info = await media.imageInfo(sliced);
  assert.deepEqual(info, { width: 6000, height: 8000, orientation: 6 });
  assert.ok(blob.size > 2 * 1024 * 1024);
  assert.ok(Math.max(...reads) <= 64, `Header probes must remain small: ${reads}`);
  assert.ok(reads.reduce((sum, bytes) => sum + bytes, 0) < 1024, 'Multi-megabyte JPEG metadata must not be copied to discover its dimensions');
});

test('Native decode sizes stay bounded for 48MP photos and extreme panoramas without changing orientation', () => {
  for (const [width, height] of [[8000, 6000], [6000, 8000], [60000, 2000], [1, 1000000]]) {
    const result = media.outputSize(width, height);
    assert.ok(result.width >= 1 && result.height >= 1);
    assert.ok(result.width <= 1920 && result.height <= 1920);
    assert.ok(result.width * result.height <= 2073600);
    if (width > 100 && height > 100) assert.ok(Math.abs(result.width / result.height - width / height) < .03);
  }
  assert.deepEqual(media.outputSize(640, 480), { width: 640, height: 480 });
  assert.deepEqual(media.outputSize(8000, 6000, { maxDimension: 240, maxPixels: 57600 }), { width: 240, height: 180 });
  assert.throws(() => media.outputSize(0, 8000), /readable dimensions/);
});

test('Media deadlines expand for large original files while retaining a finite cancellation bound', () => {
  const small = { size: 1024 }, large = { size: 2 * 1024 ** 3, width: 8000, height: 6000 };
  assert.ok(media.timeoutFor(large) > media.timeoutFor(small));
  assert.ok(media.timeoutFor(large, 'seek') > media.timeoutFor(small, 'seek'));
  assert.ok(media.timeoutFor(large) <= 120000);
  assert.ok(media.timeoutFor(large, 'seek') <= 90000);
  assert.ok(media.timeoutFor(large, 'seek') >= 45000);
});

test('An already cancelled header read never opens the source', async () => {
  const controller = new AbortController(); controller.abort();
  let reads = 0;
  await assert.rejects(media.imageInfo({ slice() { reads++; throw new Error('Should not read'); } }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(reads, 0);
});
