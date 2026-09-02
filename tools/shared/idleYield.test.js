import { test } from 'node:test';
import { yieldToPaint } from './idleYield.js';

test('yieldToPaint resolves', async () => {
  await yieldToPaint();
});
