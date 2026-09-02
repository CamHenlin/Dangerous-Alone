import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base64ToBytes, bytesToAscii, bytesToBase64, bytesToHex, copyBytes } from './bytes.js';

test('copyBytes copies a range', () => {
  const src = Uint8Array.from([1, 2, 3, 4]);
  const slice = copyBytes(src, 1, 3);
  assert.deepEqual([...slice], [2, 3]);
  slice[0] = 9;
  assert.equal(src[1], 2);
});

test('ascii / hex / base64 round-trip', () => {
  const bytes = Uint8Array.from([0x4e, 0x45, 0x53, 0x1a]);
  assert.equal(bytesToAscii(bytes), 'NES\u001a');
  assert.equal(bytesToHex(bytes), '4e45531a');
  const b64 = bytesToBase64(bytes);
  assert.deepEqual([...base64ToBytes(b64)], [0x4e, 0x45, 0x53, 0x1a]);
});
