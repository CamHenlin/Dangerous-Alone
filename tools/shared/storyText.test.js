import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { STORY } from '../../story/index.js';
import { unrenderableChars } from './nesCharset.js';
import { BOX_COLS, paginate } from './textBoxModel.js';
import {
  buildShopPitch,
  caveStory,
  levelCompletionStory,
  levelDossier,
  missedTreasures,
  normalizeEntry,
  personStory,
} from './storyText.js';
import { textIdForUnderworldPerson } from './personText.js';
import { levelEntranceScreens } from './mapMarks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OW_INDEX = path.join(ROOT, 'assets/extracted/overworld/overworld_index.json');
const DUNGEONS = path.join(ROOT, 'assets/extracted/dungeons');

/** Every string the pack can put on screen. */
function allStoryStrings() {
  /** @type {{ where: string, text: string }[]} */
  const out = [];
  const push = (where, entry) => {
    if (!entry) return;
    const pages = Array.isArray(entry)
      ? entry
      : [
          ...(entry.pages ?? []),
          ...(entry.repeatPages ?? []),
          ...(entry.missingPages ?? []),
          ...Object.values(entry.missingPagesByLevel ?? {}).flat(),
        ];
    for (const page of pages) out.push({ where, text: page });
  };
  for (const [id, entry] of Object.entries(STORY.caves.byCaveId)) push(`caves.byCaveId[${id}]`, entry);
  for (const [id, entry] of Object.entries(STORY.caves.byTextId)) push(`caves.byTextId[${id}]`, entry);
  for (const [id, line] of Object.entries(STORY.caves.shopItemBlurbs ?? {})) {
    out.push({ where: `caves.shopItemBlurbs[${id}]`, text: line });
  }
  for (const [id, line] of Object.entries(STORY.caves.shopPitchClosers ?? {})) {
    out.push({ where: `caves.shopPitchClosers[${id}]`, text: line });
  }
  for (const [id, entry] of Object.entries(STORY.persons.byLevelAndTextId)) {
    push(`persons.byLevelAndTextId[${id}]`, entry);
  }
  for (const [id, entry] of Object.entries(STORY.persons.byTextId)) push(`persons.byTextId[${id}]`, entry);
  for (const level of STORY.levels) {
    if (!level) continue;
    push(`levels[${level.level}].brief`, level.brief);
    push(`levels[${level.level}].onPiece`, level.onPiece);
  }
  for (const [id, line] of Object.entries(STORY.itemAdvice)) out.push({ where: `itemAdvice[${id}]`, text: line });
  out.push({ where: 'missedHeader', text: STORY.missedHeader });
  out.push({ where: 'missedFooter', text: STORY.missedFooter });
  return out;
}

test('every story string draws with the NES charset', () => {
  for (const { where, text } of allStoryStrings()) {
    const bad = unrenderableChars(text);
    assert.deepEqual(bad, [], `${where}: unrenderable ${JSON.stringify(bad)} in ${JSON.stringify(text)}`);
  }
});

test('no story page needs more than the box can show at once', () => {
  // A single authored string may wrap onto extra pages; that is fine, but a
  // 6+ page wall of text from one entry means the prose needs breaking up.
  for (const { where, text } of allStoryStrings()) {
    const pages = paginate(text, { cols: BOX_COLS });
    assert.ok(pages.length <= 2, `${where} wraps to ${pages.length} pages`);
  }
});

test('cave story prefers cave id, then text id, then the ROM line', () => {
  const white = caveStory({ caveId: 0x12, textId: 2, textLines: ['ROM LINE'] });
  assert.match(white.pages[0], /WHITE STEEL/);

  const generic = caveStory({ caveId: 0x99, textId: 2, textLines: ['ROM LINE'] });
  assert.match(generic.pages[0], /MASTER USING/);

  const fallback = caveStory({ caveId: 0x99, textId: 999, textLines: ['ROM', 'LINE'] });
  assert.deepEqual(fallback.pages, ['ROM LINE']);
});

test('each shopkeeper has a unique intro; pitch matches the shelf', () => {
  const arrowShop = caveStory(
    { caveId: 0x1d, textId: 28, kind: 'shop' },
    {
      wares: [
        { item: 0x1c, gone: false },
        { item: 0x00, gone: false },
        { item: 0x08, gone: false },
      ],
    },
  );
  const candleShop = caveStory(
    { caveId: 0x1e, textId: 28, kind: 'shop' },
    {
      wares: [
        { item: 0x1c, gone: false },
        { item: 0x19, gone: false },
        { item: 0x06, gone: false },
      ],
    },
  );
  assert.notEqual(arrowShop.pages[0], candleShop.pages[0]);
  assert.match(arrowShop.pages.join(' '), /ARROWS/);
  assert.doesNotMatch(arrowShop.pages.join(' '), /CANDLE/);
  assert.match(candleShop.pages.join(' '), /CANDLE/);
  assert.doesNotMatch(candleShop.pages.join(' '), /ARROWS/);

  // Owned arrows leave the shelf, so the pitch drops that blurb.
  const afterArrows = caveStory(
    { caveId: 0x1d, textId: 28, kind: 'shop' },
    {
      wares: [
        { item: 0x1c, gone: false },
        { item: 0x00, gone: false },
        { item: 0x08, gone: true },
      ],
    },
  );
  assert.doesNotMatch(afterArrows.pages.join(' '), /ARROWS/);
});

test('buildShopPitch skips gone slots and picks a singular closer', () => {
  const one = buildShopPitch(
    [
      { item: 0x1c, gone: false },
      { item: 0x08, gone: true },
    ],
    STORY.caves.shopItemBlurbs,
    STORY.caves.shopPitchClosers,
  );
  assert.match(one, /SHIELD/);
  assert.doesNotMatch(one, /ARROWS/);
  assert.match(one, /CHEAPER THAN DYING/);
  assert.doesNotMatch(one, /ALL OF IT|BOTH ARE/);

  const two = buildShopPitch(
    [
      { item: 0x1c, gone: false },
      { item: 0x00, gone: false },
    ],
    STORY.caves.shopItemBlurbs,
    STORY.caves.shopPitchClosers,
  );
  assert.match(two, /BOTH ARE CHEAPER THAN DYING/);
});

test('cave story swaps to the short version once the gift is taken', () => {
  const first = caveStory({ caveId: 0x10, textId: 0 });
  const again = caveStory({ caveId: 0x10, textId: 0 }, { repeat: true });
  assert.ok(first.pages.length > again.pages.length);
  assert.match(again.pages[0], /THE SWORD IS YOURS/);
});

test('potion shop speaks a locked refusal before the letter is shown', () => {
  const locked = caveStory({ caveId: 0x1a, textId: 16, kind: 'potion' }, { locked: true });
  assert.match(locked.pages[0], /LETTER/);
  assert.doesNotMatch(locked.pages.join(' '), /BUY MEDICINE BEFORE YOU GO/);

  const open = caveStory({ caveId: 0x1a, textId: 16, kind: 'potion' });
  assert.match(open.pages[0], /MEDICINE, DEARIE/);
});

test('person story resolves through the ROM selector tables', () => {
  // Level 6 uses table B; objType $4D → $3A ($3A = 58, the Gohma hint).
  assert.equal(textIdForUnderworldPerson(6, 0x4d), 0x3a);
  const gohma = personStory(6, 0x4d);
  assert.equal(gohma.textId, 0x3a);
  assert.match(gohma.pages[0], /GOHMA/);

  // Level 1 shares table A and gets the generic entry for the same selector.
  const level1 = personStory(1, 0x4b);
  assert.match(level1.pages[0], /DODONGO/);
});

test('Digdogger tip warns when the recorder is missing', () => {
  // Table A index 3 → text $30 (Digdogger).
  assert.equal(textIdForUnderworldPerson(5, 0x4e), 0x30);
  const inLevel5 = personStory(5, 0x4e, { inv: { flute: 0 } });
  assert.ok(inLevel5.pages.some((p) => /PROPER ITEM/.test(p)));
  assert.ok(inLevel5.pages.some((p) => /MARKED ITS ROOM/.test(p)));
  assert.ok(inLevel5.marks.some((m) => m.dungeonLevel === 5 && m.itemType === 0x05));

  // Same tip in another labyrinth still points at level 5 on the overworld.
  const elsewhere = personStory(1, 0x4e, { inv: { flute: 0 } });
  assert.ok(elsewhere.pages.some((p) => /FIFTH LABYRINTH/.test(p)));

  const withFlute = personStory(5, 0x4e, { inv: { flute: 1 } });
  assert.ok(!withFlute.pages.some((p) => /PROPER ITEM/.test(p)));
  assert.deepEqual(withFlute.marks, []);
});

test('person story falls back to the ROM text for an unwritten selector', () => {
  const romTextLines = { 40: ['DODONGO DISLIKES', 'SMOKE'] };
  const story = { persons: { byLevelAndTextId: {}, byTextId: {} } };
  const res = personStory(1, 0x4b, { romTextLines, story });
  assert.deepEqual(res.pages, ['DODONGO DISLIKES SMOKE']);
});

test('non-person object types produce no dialogue', () => {
  assert.deepEqual(personStory(1, 0x12).pages, []);
});

test('Grumble uses the hungry-goriya story line', () => {
  const res = personStory(7, 0x36);
  assert.equal(res.textId, 0x24);
  assert.match(res.pages[0] ?? '', /GRUMBLE/);
  assert.match(res.pages[0] ?? '', /FEED ME/);
});

test('missedTreasures leads with the item that blocks progress', () => {
  const levelData = {
    rooms: [
      { roomId: 0x10, floorItem: { itemType: 0x16 } }, // compass
      { roomId: 0x11, floorItem: { itemType: 0x1a } }, // heart container
      { roomId: 0x12, floorItem: { itemType: 0x0c } }, // raft
      { roomId: 0x13, floorItem: { itemType: 0x0a } }, // bow
    ],
  };
  assert.deepEqual(
    missedTreasures(levelData, new Set()).map((m) => m.itemType),
    [0x0c, 0x0a, 0x1a, 0x16],
  );
});

test('a briefing caps how many misses it lectures about', () => {
  const levelData = {
    rooms: [0x0c, 0x0a, 0x1a, 0x16, 0x17].map((itemType, i) => ({
      roomId: 0x10 + i,
      floorItem: { itemType },
    })),
  };
  const res = levelCompletionStory(1, { levelData, takenRooms: new Set() });
  assert.equal(res.missed.length, 5);
  const warnings = res.pages.filter((p) => Object.values(STORY.itemAdvice).includes(p));
  assert.equal(warnings.length, STORY.missedMax);
  assert.match(warnings[0], /RAFT/);
});

test('missedTreasures only reports items the player walked past', () => {
  const levelData = {
    rooms: [
      { roomId: 0x10, floorItem: { itemType: 0x0a } }, // bow
      { roomId: 0x11, floorItem: { itemType: 0x19 } }, // key — not worth a page
      { roomId: 0x12, floorItem: { itemType: 0x17 } }, // map
      { roomId: 0x13, floorItem: { itemType: 0x03 } }, // nothing
      { roomId: 0x14, floorItem: { itemType: 0x1b } }, // the shard itself
    ],
  };
  const missed = missedTreasures(levelData, new Set([0x12]));
  assert.deepEqual(missed.map((m) => m.itemType), [0x0a]);
  assert.match(missed[0].advice, /BOW/);

  assert.deepEqual(missedTreasures(levelData, new Set([0x10, 0x12])), []);
});

test('level completion reads shard story, then the next dungeon, then warnings', () => {
  const levelData = { rooms: [{ roomId: 0x44, floorItem: { itemType: 0x1d } }] };
  const res = levelCompletionStory(1, { levelData, takenRooms: new Set() });
  assert.equal(res.nextLevel, 2);
  assert.match(res.pages[0], /1 OF 8/);
  assert.ok(res.pages.some((p) => /SECOND LABYRINTH/.test(p)));
  assert.ok(res.pages.some((p) => /BOOMERANG/.test(p)));
  assert.equal(res.pages.at(-1), STORY.missedFooter);
  assert.deepEqual(res.marks, [{ caveId: 0x12, clears: 'whiteSword', label: 'WHITE SWORD' }]);
});

test('a clean run gets no warning pages', () => {
  const levelData = { rooms: [{ roomId: 0x44, floorItem: { itemType: 0x1d } }] };
  const res = levelCompletionStory(1, { levelData, takenRooms: new Set([0x44]) });
  assert.deepEqual(res.missed, []);
  assert.ok(!res.pages.includes(STORY.missedHeader));
});

test('level 8 briefs Death Mountain and level 9 has no follow-on', () => {
  const eight = levelCompletionStory(8);
  assert.equal(eight.nextLevel, 9);
  assert.ok(eight.pages.some((p) => /SILVER ARROW/.test(p)));
  assert.equal(levelCompletionStory(9).nextLevel, null);
});

test('normalizeEntry accepts a bare page array', () => {
  assert.deepEqual(normalizeEntry(['A']), { pages: ['A'], marks: [] });
  assert.equal(normalizeEntry([]), null);
  assert.equal(normalizeEntry({ pages: [] }), null);
});

test('every dossier entrance matches the extracted overworld table', () => {
  const ow = JSON.parse(fs.readFileSync(OW_INDEX, 'utf8'));
  const entrances = levelEntranceScreens(ow.screens, 1);
  for (let level = 1; level <= 9; level += 1) {
    const dossier = levelDossier(level);
    assert.equal(
      dossier.entrance.screen,
      entrances.get(level),
      `level ${level} entrance $${dossier.entrance.screen.toString(16)} is not the quest-1 screen`,
    );
  }
});

test('every dossier names the treasure that is actually on the floor', () => {
  /** Level → item types the dossier promises. */
  const promised = {
    1: [0x0a], // bow
    2: [0x1e], // magical boomerang
    3: [0x0c], // raft
    4: [0x0d], // stepladder
    5: [0x05], // recorder
    6: [0x10], // magical rod
    7: [0x07], // red candle
    8: [0x0b, 0x11], // magical key + book
    9: [0x09], // silver arrow
  };
  for (let level = 1; level <= 9; level += 1) {
    const pack = JSON.parse(
      fs.readFileSync(path.join(DUNGEONS, `q1/level_${level}/level.json`), 'utf8'),
    );
    const onFloor = new Set(pack.rooms.map((r) => r.floorItem?.itemType));
    for (const itemType of promised[level]) {
      assert.ok(
        onFloor.has(itemType),
        `level ${level} dossier promises $${itemType.toString(16)} but no room holds it`,
      );
    }
  }
});
