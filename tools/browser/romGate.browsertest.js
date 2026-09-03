/**
 * ROM dropzone: no stored ROM means a gate, not a silent fetch of Nintendo files.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { ROOT } from '../shared/paths.js';
import { startGameServer } from './gameServer.js';

const ROM_PATH = join(ROOT, 'zelda.nes');

describe('ROM dropzone', () => {
  /** @type {Awaited<ReturnType<typeof startGameServer>>} */
  let server;
  /** @type {import('playwright').Browser} */
  let browser;

  before(async () => {
    server = await startGameServer();
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  test('shows a dropzone when no ROM is stored', async () => {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      localStorage.removeItem('zelda_rom_v1');
    });
    await page.goto(`${server.url}play.html?resetRom=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForSelector('#rom-gate:not([hidden]) h2', { timeout: 120000 });
    const copy = await page.locator('#rom-gate h2').innerText();
    assert.match(copy, /Drop a NES Zelda ROM/);
    await page.close();
  });

  test('stored ROM extracts and reaches play', {
    skip: !existsSync(ROM_PATH),
  }, async () => {
    const page = await browser.newPage();
    const pageErrors = [];
    const logs = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.text().startsWith('extract:')) {
        logs.push(`${msg.type()}: ${msg.text()}`);
      }
    });
    const b64 = readFileSync(ROM_PATH).toString('base64');
    await page.addInitScript((payload) => {
      localStorage.setItem('zelda_rom_v1', payload);
    }, JSON.stringify({ v: 1, b64 }));
    await page.goto(`${server.url}play.html?debug=1&pause=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    try {
      await page.waitForFunction(
        () => Boolean(window.zeldaDebug?.state?.()?.playing),
        null,
        { timeout: 120000 },
      );
    } catch (err) {
      const snap = await page.evaluate(() => ({
        status: document.getElementById('status')?.textContent ?? '',
        gate: document.querySelector('#rom-gate .rom-status')?.textContent ?? '',
        gateHidden: document.getElementById('rom-gate')?.hidden ?? 'no-gate',
        debug: Boolean(window.zeldaDebug),
        playing: window.zeldaDebug?.state?.()?.playing ?? null,
      }));
      throw new Error(
        `${err.message}\nsnap=${JSON.stringify(snap)}\npageErrors=${pageErrors.join(' | ')}\nlogs=${logs.join(' | ')}`,
      );
    }
    await page.close();
  });
});
