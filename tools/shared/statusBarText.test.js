import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatMagicKeyCount, formatStatusCount } from './statusBarText.js';

test('formatStatusCount matches NES FormatDecimalCountByte', () => {
  assert.equal(formatStatusCount(0), 'X0 ');
  assert.equal(formatStatusCount(3), 'X3 ');
  assert.equal(formatStatusCount(23), 'X23');
  assert.equal(formatStatusCount(34), 'X34');
  assert.equal(formatStatusCount(100), '100');
  assert.equal(formatStatusCount(236), '236');
  assert.equal(formatStatusCount(255), '255');
});

test('formatMagicKeyCount is XA space', () => {
  assert.equal(formatMagicKeyCount(), 'XA ');
});
