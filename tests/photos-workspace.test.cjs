const test = require('node:test');
const assert = require('node:assert/strict');
const Photos = require('../zorifi-photos.js');

test('collage layouts cover the canvas for one through nine images', () => {
  for (let count = 1; count <= 9; count++) for (const layout of Photos.LAYOUTS) {
    const cells = Photos.layoutCells(count, layout);
    assert.equal(cells.length, count);
    const area = cells.reduce((sum, cell) => sum + cell.w * cell.h, 0);
    assert.ok(Math.abs(area - 1) < .0001, `${layout} with ${count} images leaves a gap`);
    assert.ok(cells.every(cell => cell.x >= 0 && cell.y >= 0 && cell.w > 0 && cell.h > 0 && cell.x + cell.w <= 1.00001 && cell.y + cell.h <= 1.00001));
    for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) {
      const overlapX = Math.min(cells[a].x + cells[a].w, cells[b].x + cells[b].w) - Math.max(cells[a].x, cells[b].x);
      const overlapY = Math.min(cells[a].y + cells[a].h, cells[b].y + cells[b].h) - Math.max(cells[a].y, cells[b].y);
      assert.ok(overlapX < .00001 || overlapY < .00001, `${layout} with ${count} images overlaps`);
    }
  }
});

test('invalid image counts are rejected', () => {
  for (const count of [0, 10, -1, 2.5]) assert.throws(() => Photos.layoutCells(count), /one to nine/);
});
