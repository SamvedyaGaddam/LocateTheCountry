import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScore } from '../server/utils/scoring.js';

test('perfect guess without hints receives 1000 points', () => {
  assert.equal(calculateScore(0, 0, true), 1000);
});

test('hints reduce the maximum score', () => {
  assert.equal(calculateScore(0, 1, true), 800);
  assert.equal(calculateScore(0, 2, true), 600);
});

test('distance reduces an incorrect guess score', () => {
  assert.ok(calculateScore(1000, 0, false) < 1000);
  assert.ok(calculateScore(2000, 0, false) < calculateScore(1000, 0, false));
});

test('invalid distance and hint count are rejected', () => {
  assert.throws(() => calculateScore(-1, 0, false));
  assert.throws(() => calculateScore(10, 3, false));
});
