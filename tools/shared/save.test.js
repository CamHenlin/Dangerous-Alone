import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInventory, SWORD } from './inventory.js';
import {
  SAVE_VERSION,
  applyInventorySnapshot,
  applyLoadedSave,
  restoreBombBag,
  closeBossApproachDoors,
  createSaveStore,
  hydrateDungeonProgress,
  resetGanonEncounter,
  resetGanonEncounterInStorage,
  resolveZeroHeartContinue,
  saveLooksLikeZeldaRescued,
  saveStartsSecondQuest,
  serializeDungeonProgress,
  serializeGameState,
  snapshotInventory,
  slotSummary,
} from './save.js';

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

test('snapshotInventory skips ephemeral combat fields', () => {
  const inv = createInventory();
  inv.sword = SWORD.WOOD;
  inv.invuln = 40;
  inv.dead = true;
  const snap = snapshotInventory(inv);
  assert.equal(snap.sword, SWORD.WOOD);
  assert.equal('invuln' in snap, false);
  assert.equal('dead' in snap, false);
});

test('serialize / hydrate dungeon progress round-trips', () => {
  const progress = new Map([
    [
      1,
      {
        cleared: new Set([0x73, 0x63]),
        taken: new Set([0x7f]),
        visited: new Set([0x73]),
        pushed: new Set(),
        doors: new Set(['0x73:north']),
        map: 1,
        compass: 1,
      },
    ],
  ]);
  const json = serializeDungeonProgress(progress);
  const back = hydrateDungeonProgress(json);
  assert.equal(back.get('1:1').map, 1);
  assert.ok(back.get('1:1').cleared.has(0x73));
  assert.ok(back.get('1:1').doors.has('0x73:north'));
});

test('createSaveStore persists three slots', () => {
  const store = createSaveStore(memoryStorage());
  const inv = createInventory();
  inv.sword = SWORD.WOOD;
  inv.triforce = 0x03;
  store.save(0, {
    name: 'link',
    inv,
    mode: 'overworld',
    roomId: 0x77,
    x: 0x40,
    y: 0x8d,
    dir: 1,
    owSecretsRevealed: new Set(['77:5:6']),
    caveTaken: new Set(['10:0']),
    owItemsTaken: new Set([0x5f]),
    dungeonProgress: new Map(),
  });
  const slots = store.listSlots();
  assert.equal(slots[0].name, 'LINK');
  assert.equal(slots[0].triforce, 2);
  assert.equal(slots[1], null);

  const loaded = store.load(0);
  assert.equal(loaded.version, SAVE_VERSION);
  assert.deepEqual(loaded.owItemsTaken, ['95']);
  const inv2 = createInventory();
  const bags = {
    inv: inv2,
    owSecretsRevealed: new Set(),
    caveTaken: new Set(),
    owItemsTaken: new Set(),
    dungeonProgress: new Map(),
  };
  const meta = applyLoadedSave(loaded, bags);
  assert.equal(inv2.sword, SWORD.WOOD);
  assert.ok(bags.owSecretsRevealed.has('77:5:6'));
  assert.ok(bags.owItemsTaken.has(0x5f));
  assert.equal(meta.position.roomId, 0x77);

  store.rename(0, 'zelda');
  assert.equal(store.listSlots()[0].name, 'ZELDA');
  assert.equal(store.load(0).inv.sword, SWORD.WOOD);

  store.erase(0);
  assert.equal(store.listSlots()[0], null);
});

test('serializeGameState keeps the stepladder object on the file', () => {
  const inv = createInventory();
  inv.ladder = 1;
  const payload = serializeGameState({
    name: 'LINK',
    inv,
    mode: 'overworld',
    roomId: 0x5f,
    x: 0xc0,
    y: 0x8d,
    dir: 2,
    ladder: { x: 0xb0, y: 0x90, dir: 2, state: 2 },
  });
  assert.deepEqual(payload.position.ladder, { x: 0xb0, y: 0x90, dir: 2, state: 2 });
  const bags = {
    inv: createInventory(),
    owSecretsRevealed: new Set(),
    caveTaken: new Set(),
    owItemsTaken: new Set(),
    dungeonProgress: new Map(),
  };
  const meta = applyLoadedSave(payload, bags);
  assert.deepEqual(meta.position.ladder, { x: 0xb0, y: 0x90, dir: 2, state: 2 });
});

test('bombBag survives a save round trip', () => {
  const inv = createInventory();
  inv.bombBag = 12;
  inv.maxBombs = 24;
  const snap = snapshotInventory(inv);
  assert.equal(snap.bombBag, 12);
  const back = createInventory();
  applyInventorySnapshot(back, snap);
  assert.equal(back.bombBag, 12);
  assert.equal(back.maxBombs, 24);
});

test('restoreBombBag infers a coop-scaled cap and lifts a paid upgrade', () => {
  assert.equal(restoreBombBag({ maxBombs: 16, bombBag: 12 }, 2), 12);
  assert.equal(
    restoreBombBag({ maxBombs: 16 }, 2, { '1:5': { taken: ['23'] } }),
    12,
  );
  assert.equal(restoreBombBag({ maxBombs: 12 }, 1), 12);
});

test('legacy saves restore a paid bomb upgrade the bag forgot', () => {
  const inv = createInventory();
  inv.maxBombs = 16;
  const payload = serializeGameState({
    name: 'LINK',
    inv,
    party: [{ index: 0 }, { index: 1 }],
    dungeonProgress: new Map([
      [
        '1:5',
        {
          taken: new Set([0x17, 0x14]),
          cleared: new Set(),
          visited: new Set(),
          pushed: new Set(),
          doors: new Set(),
        },
      ],
    ]),
    roomId: 0x77,
    x: 0,
    y: 0,
    dir: 1,
  });
  delete payload.inv.bombBag;
  payload.inv.maxBombs = 16;
  const target = {
    inv: createInventory(),
    owSecretsRevealed: new Set(),
    caveTaken: new Set(),
    owItemsTaken: new Set(),
    hintMarks: new Set(),
    toldStory: new Set(),
    dungeonProgress: new Map(),
  };
  applyLoadedSave(payload, target);
  assert.equal(target.inv.bombBag, 12, 'L5 old man was paid; bag must come back');
});

test('applyInventorySnapshot clears ephemeral state', () => {
  const inv = createInventory();
  inv.dead = true;
  inv.invuln = 10;
  applyInventorySnapshot(inv, { sword: SWORD.WHITE, rupees: 50 });
  assert.equal(inv.sword, SWORD.WHITE);
  assert.equal(inv.rupees, 50);
  assert.equal(inv.dead, false);
  assert.equal(inv.invuln, 0);
});

test('slotSummary from serializeGameState', () => {
  const inv = createInventory();
  inv.maxHalfHearts = 10;
  inv.halfHearts = 7;
  const payload = serializeGameState({ name: 'Zelda', inv, roomId: 1, x: 0, y: 0, dir: 1 });
  const summary = slotSummary(payload);
  assert.equal(summary.name, 'ZELDA');
  assert.equal(summary.hearts, 4);
  assert.equal(summary.maxHearts, 5);
});

test('resolveZeroHeartContinue heals and sends OW saves to start', () => {
  const inv = createInventory();
  inv.maxHalfHearts = 10;
  inv.halfHearts = 0;
  const owStart = { roomId: 0x77, x: 0x40, y: 0x8d, dir: 8 };
  const out = resolveZeroHeartContinue(
    inv,
    { mode: 'overworld', roomId: 0x74, x: 10, y: 20, dir: 1 },
    owStart,
  );
  assert.equal(out.healed, true);
  // Continuing always restores three hearts, not the full container count.
  assert.equal(inv.halfHearts, 6);
  assert.equal(out.position.roomId, 0x77);
  assert.equal(out.position.x, 0x40);
  assert.equal(out.atDungeonEntrance, false);
});

test('resolveZeroHeartContinue resumes dungeon at entrance', () => {
  const inv = createInventory();
  inv.maxHalfHearts = 8;
  inv.halfHearts = 0;
  const owStart = { roomId: 0x77, x: 0x40, y: 0x8d, dir: 8 };
  const out = resolveZeroHeartContinue(
    inv,
    {
      mode: 'dungeon',
      roomId: 0x69,
      x: 100,
      y: 120,
      dir: 4,
      dungeon: { level: 3, fromRoomId: 0x74, roomId: 0x69 },
    },
    owStart,
  );
  assert.equal(out.healed, true);
  assert.equal(out.atDungeonEntrance, true);
  assert.equal(out.position.dungeon.level, 3);
  assert.equal(out.position.dungeon.fromRoomId, 0x74);
  assert.equal(out.position.dungeon.roomId, undefined);
  assert.equal(inv.halfHearts, 6);
});

test('resolveZeroHeartContinue is a no-op when hearts remain', () => {
  const inv = createInventory();
  inv.halfHearts = 3;
  const pos = { mode: 'overworld', roomId: 0x74, x: 10, y: 20, dir: 1 };
  const out = resolveZeroHeartContinue(inv, pos, {
    roomId: 0x77,
    x: 0x40,
    y: 0x8d,
    dir: 8,
  });
  assert.equal(out.healed, false);
  assert.equal(out.position, pos);
  assert.equal(inv.halfHearts, 3);
});

test('resetGanonEncounter clears TOP, lastBoss, boss room, and shutters', () => {
  const inv = createInventory();
  inv.triforceOfPower = 1;
  inv.triforce = 0xff;
  const payload = serializeGameState({
    name: 'LINK',
    inv,
    mode: 'dungeon',
    roomId: 0x52,
    x: 0x78,
    y: 0xb0,
    dir: 4,
    dungeon: { level: 9, fromRoomId: 5, roomId: 0x52 },
    dungeonProgress: new Map([
      [
        '1:9',
        {
          cleared: new Set([0x42, 0x52, 0x32]),
          taken: new Set([0x42, 0x11]),
          visited: new Set([0x42]),
          pushed: new Set(),
          doors: new Set(['66:north', '66:south', '50:south', '82:north', '1:east']),
          lastBoss: true,
          map: 1,
          compass: 1,
        },
      ],
    ]),
  });
  const { changed, bossRoom } = resetGanonEncounter(payload);
  assert.equal(changed, true);
  assert.equal(bossRoom, 0x42);
  assert.equal(payload.inv.triforceOfPower, 0);
  const d9 = payload.dungeons['1:9'];
  assert.equal(d9.lastBoss, false);
  assert.equal(d9.cleared.includes('66'), false);
  assert.equal(d9.cleared.includes('50'), false); // Zelda room $32
  assert.equal(d9.cleared.includes('82'), true); // approach room kept
  assert.equal(d9.taken.includes('66'), false);
  assert.equal(d9.taken.includes('17'), true);
  // Zelda-side sealed; south approach into Ganon stays open for re-entry.
  assert.equal(d9.doors.includes('66:north'), false);
  assert.equal(d9.doors.includes('50:south'), false);
  assert.equal(d9.doors.includes('66:south'), true);
  assert.equal(d9.doors.includes('82:north'), true);
  assert.equal(d9.doors.includes('1:east'), true);
  assert.equal(payload.position.roomId, 0x52);
  assert.equal(payload.position.dir, 8);
});

test('closeBossApproachDoors seals only the Zelda-side shutter pair', () => {
  const out = closeBossApproachDoors(
    ['66:north', '50:south', '66:south', '82:north', '3:west'],
    0x42,
    0x32,
  );
  assert.deepEqual(out, ['3:west', '66:south', '82:north']);
});

test('resetGanonEncounterInStorage rewrites matching slots', () => {
  const storage = memoryStorage();
  const store = createSaveStore(storage);
  const inv = createInventory();
  inv.triforceOfPower = 1;
  store.save(0, {
    name: 'LINK',
    inv,
    mode: 'dungeon',
    roomId: 0x52,
    dungeon: { level: 9, fromRoomId: 5, roomId: 0x52 },
    dungeonProgress: new Map([
      [
        '1:9',
        {
          cleared: new Set([0x42]),
          taken: new Set([0x42]),
          visited: new Set(),
          pushed: new Set(),
          doors: new Set(['66:north']),
          lastBoss: true,
          map: 0,
          compass: 0,
        },
      ],
    ]),
  });
  const result = resetGanonEncounterInStorage(storage);
  assert.deepEqual(result.slots, [0]);
  const loaded = store.load(0);
  assert.equal(loaded.inv.triforceOfPower, 0);
  assert.equal(loaded.dungeons['1:9'].lastBoss, false);
});

test('a version-1 file still loads after the party bump', () => {
  const storage = memoryStorage();
  const inv = createInventory();
  inv.sword = SWORD.WOOD;
  storage.setItem(
    'zelda_slot_0',
    JSON.stringify({
      version: 1,
      name: 'LINK',
      inv: snapshotInventory(inv),
      position: { mode: 'overworld', roomId: 0x77, x: 0x40, y: 0x8d, dir: 1 },
      owSecretsRevealed: [],
      caveTaken: [],
      dungeons: {},
    }),
  );
  const store = createSaveStore(storage);
  const loaded = store.load(0);
  assert.ok(loaded);
  assert.equal(loaded.version, 1);
  const bags = {
    inv: createInventory(),
    owSecretsRevealed: new Set(),
    caveTaken: new Set(),
    dungeonProgress: new Map(),
  };
  const meta = applyLoadedSave(loaded, bags);
  assert.equal(bags.inv.sword, SWORD.WOOD);
  assert.deepEqual(meta.party, []);
});

test('a new save records the party beside the usual single-hero fields', () => {
  const inv = createInventory();
  const payload = serializeGameState({
    name: 'LINK',
    inv,
    roomId: 0x77,
    x: 10,
    y: 20,
    dir: 1,
    party: [{ index: 1, halfHearts: 4, x: 30, y: 40, dir: 4, worldId: 'cave:29' }],
  });
  assert.equal(payload.version, SAVE_VERSION);
  assert.equal(payload.party[0].halfHearts, 4);
  assert.equal(payload.party[0].worldId, 'cave:29');
});

test('a continue still knows which world each hero was standing in', () => {
  const inv = createInventory();
  const payload = serializeGameState({
    name: 'LINK',
    inv,
    mode: 'cave',
    roomId: 0x77,
    x: 0x78,
    y: 0xb8,
    dir: 8,
    party: [
      { index: 0, halfHearts: 6, x: 0x78, y: 0xb8, dir: 8, worldId: 'cave:29' },
      { index: 1, halfHearts: 4, x: 0x40, y: 0x8d, dir: 1, worldId: 'overworld' },
    ],
  });
  const target = {
    inv: createInventory(),
    owSecretsRevealed: new Set(),
    caveTaken: new Set(),
    owItemsTaken: new Set(),
    hintMarks: new Set(),
    toldStory: new Set(),
    dungeonProgress: new Map(),
  };
  const meta = applyLoadedSave(payload, target);
  assert.equal(meta.position.mode, 'cave');
  assert.equal(meta.party[0].worldId, 'cave:29');
  assert.equal(meta.party[1].worldId, 'overworld');
});

test('quest 1 Zelda rescue is persisted and continue starts quest 2', () => {
  const inv = createInventory();
  inv.quest = 1;
  inv.triforceOfPower = 1;
  const payload = serializeGameState({
    name: 'LINK',
    inv,
    mode: 'dungeon',
    roomId: 0x32,
    x: 0x80,
    y: 0x80,
    dir: 1,
    dungeon: { level: 9, fromRoomId: 0x3b, roomId: 0x32 },
    questCompleted: 1,
  });
  assert.equal(payload.questCompleted, 1);
  assert.equal(saveStartsSecondQuest(payload), true);

  const target = {
    inv: createInventory(),
    owSecretsRevealed: new Set(),
    caveTaken: new Set(),
    owItemsTaken: new Set(),
    hintMarks: new Set(),
    toldStory: new Set(),
    dungeonProgress: new Map(),
  };
  const meta = applyLoadedSave(payload, target);
  assert.equal(meta.questCompleted, 1);
  assert.equal(saveStartsSecondQuest({ inv: target.inv, questCompleted: meta.questCompleted }), true);
});

test('quest 2 files and unfinished Q1 files do not auto-start the second quest', () => {
  const q1 = serializeGameState({
    inv: createInventory(),
    questCompleted: 0,
  });
  assert.equal(saveStartsSecondQuest(q1), false);

  const q1DoneOnQ2 = serializeGameState({
    inv: { ...createInventory(), quest: 2 },
    questCompleted: 1,
  });
  assert.equal(saveStartsSecondQuest(q1DoneOnQ2), false);

  const q2Clear = serializeGameState({
    inv: { ...createInventory(), quest: 2 },
    questCompleted: 2,
  });
  assert.equal(saveStartsSecondQuest(q2Clear), false);
  assert.equal(q2Clear.questCompleted, 2);
});

test('legacy Q1 saves in Zelda\'s cell start the second quest without the flag', () => {
  const inv = createInventory();
  inv.triforceOfPower = 1;
  const inCell = serializeGameState({
    name: 'LINK',
    inv,
    mode: 'dungeon',
    roomId: 0x32,
    x: 0x80,
    y: 0x80,
    dir: 1,
    dungeon: { level: 9, fromRoomId: 0x3b, roomId: 0x32 },
  });
  assert.equal(inCell.questCompleted, 0);
  assert.equal(saveLooksLikeZeldaRescued(inCell), true);
  assert.equal(saveStartsSecondQuest(inCell), true);

  const visitedCell = serializeGameState({
    name: 'LINK',
    inv,
    mode: 'dungeon',
    roomId: 0x73,
    dungeon: { level: 9, fromRoomId: 0x3b, roomId: 0x73 },
    dungeonProgress: new Map([
      [
        '1:9',
        {
          cleared: new Set(),
          taken: new Set(),
          visited: new Set([0x32, 0x42]),
          pushed: new Set(),
          doors: new Set(),
          lastBoss: true,
          map: 1,
          compass: 1,
        },
      ],
    ]),
  });
  assert.equal(saveStartsSecondQuest(visitedCell), true);

  const ganonOnly = serializeGameState({
    name: 'LINK',
    inv,
    mode: 'dungeon',
    roomId: 0x52,
    dungeon: { level: 9, fromRoomId: 0x3b, roomId: 0x52 },
    dungeonProgress: new Map([
      [
        '1:9',
        {
          cleared: new Set([0x42]),
          taken: new Set(),
          visited: new Set([0x42, 0x52]),
          pushed: new Set(),
          doors: new Set(),
          lastBoss: true,
          map: 1,
          compass: 1,
        },
      ],
    ]),
  });
  assert.equal(saveStartsSecondQuest(ganonOnly), false, 'still south of Ganon');
});
