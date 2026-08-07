import { OBJ } from './enemies.js';

/**
 * NES sprite palette slot (0–3) per object type.
 * Matches Character Palette Assignments / ObjAnimAttrHeap low bits.
 * Sheets are extracted with SP0 (Link green); runtime remaps to this slot.
 */
const SPRITE_PAL = Object.freeze({
  [OBJ.RED_LYNEL]: 1,
  [OBJ.BLUE_LYNEL]: 2,
  [OBJ.RED_MOBLIN]: 3,
  [OBJ.BLUE_MOBLIN]: 2,
  [OBJ.RED_GORIYA]: 1,
  [OBJ.BLUE_GORIYA]: 1,
  [OBJ.RED_OCTOROK_SLOW]: 2,
  [OBJ.RED_OCTOROK_FAST]: 2,
  [OBJ.BLUE_OCTOROK_SLOW]: 1,
  [OBJ.BLUE_OCTOROK_FAST]: 1,
  [OBJ.RED_DARKNUT]: 2,
  [OBJ.BLUE_DARKNUT]: 1,
  [OBJ.BLUE_TEKTITE]: 1,
  [OBJ.RED_TEKTITE]: 2,
  [OBJ.BLUE_LEEVER]: 1,
  [OBJ.RED_LEEVER]: 2,
  [OBJ.ZORA]: 3,
  [OBJ.VIRE]: 1,
  [OBJ.ZOL]: 3,
  [OBJ.GEL]: 3,
  [OBJ.GEL2]: 3,
  [OBJ.POLS_VOICE]: 0,
  [OBJ.LIKE_LIKE]: 2,
  [OBJ.PEAHAT]: 2,
  [OBJ.BLUE_KEESE]: 1,
  [OBJ.RED_KEESE]: 2,
  [OBJ.BLACK_KEESE]: 3,
  [OBJ.ARMOS]: 2,
  [OBJ.BOULDER]: 3,
  [OBJ.GHINI]: 1,
  [OBJ.FLYING_GHINI]: 1,
  [OBJ.BLUE_WIZZROBE]: 1,
  [OBJ.RED_WIZZROBE]: 2,
  [OBJ.WALLMASTER]: 2,
  [OBJ.ROPE]: 2,
  [OBJ.STALFOS]: 2,
  [OBJ.BUBBLE]: 0, // cycles in renderer
  [OBJ.BUBBLE_BLUE]: 1,
  [OBJ.BUBBLE_RED]: 2,
  // Anim_SetSpriteDescriptorRedPaletteRow → SP2.
  [OBJ.POND_FAIRY]: 2,
  [OBJ.GIBDO]: 1,
  [OBJ.TRAP]: 1,
  [OBJ.TRAP2]: 1,
  // ObjAnimAttrHeap person → sprite palette 2 (old man / red).
  [0x4b]: 2,
  [0x4c]: 2,
  [0x4d]: 2,
  [0x4e]: 2,
  [0x4f]: 2,
  [0x50]: 2,
  [0x51]: 2,
  [0x52]: 2,
  [OBJ.AQUAMENTUS]: 0,
  [OBJ.DODONGO]: 2,
  [OBJ.DODONGO_1]: 2,
  [OBJ.GOHMA]: 1,
  [OBJ.GOHMA_RED]: 2,
  [OBJ.DIGDOGGER]: 2,
  [OBJ.DIGDOGGER_1]: 2,
  [OBJ.MANHANDLA]: 1,
  [OBJ.GANON]: 2,
  [OBJ.ZELDA]: 0,
  [OBJ.GLEEOK_2]: 1,
  [OBJ.GLEEOK_3]: 1,
  [OBJ.GLEEOK_4]: 1,
  [OBJ.GLEEOK_HEAD]: 1,
  [OBJ.PATRA]: 1,
  [OBJ.PATRA_RED]: 2,
  [OBJ.PATRA_CHILD]: 1,
  [OBJ.PATRA_CHILD_RED]: 2,
  [OBJ.GRUMBLE]: 1,
  [OBJ.MOLDORM]: 2,
  [OBJ.RED_LAMNOLA]: 2,
  [OBJ.BLUE_LAMNOLA]: 1,
  [0x18]: 2, // CHILD_DIGDOGGER
});
/** Extract always bakes sprite sheets with overworld LevelInfo row 4 (SP0). */
export const BAKED_SPRITE_PALETTE_RGB = Object.freeze([
  [0, 0, 0],
  [184, 248, 24],
  [252, 160, 68],
  [228, 92, 16],
]);

/**
 * @param {number} objType
 * @param {number} [anim] used for flashing bubble ($2B)
 * @returns {number} sprite palette 0–3
 */
export function enemySpritePalette(objType, anim = 0) {
  if (objType === OBJ.BUBBLE) return anim & 3;
  return SPRITE_PAL[objType] ?? 0;
}

/**
 * LevelInfo row index for a sprite palette slot (BG 0–3, SP 4–7).
 * @param {number} spritePal 0–3
 */
export function levelInfoRowForSpritePal(spritePal) {
  return 4 + (spritePal & 3);
}

/**
 * Remap pixels drawn with `srcRgb` (4 NES colors) to `dstRgb`.
 * Color 0 / alpha 0 stays transparent.
 *
 * @param {Uint8ClampedArray} rgba
 * @param {readonly (readonly number[])[]} srcRgb
 * @param {readonly (readonly number[])[]} dstRgb
 */
export function remapPaletteRgba(rgba, srcRgb, dstRgb) {
  const lut = new Map();
  for (let i = 1; i < 4; i += 1) {
    const [sr, sg, sb] = srcRgb[i];
    lut.set(`${sr},${sg},${sb}`, dstRgb[i]);
  }
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const key = `${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`;
    const dst = lut.get(key);
    if (!dst) continue;
    rgba[i] = dst[0];
    rgba[i + 1] = dst[1];
    rgba[i + 2] = dst[2];
  }
}

/**
 * Pick sprite palette RGB rows [SP0..SP3] from a LevelInfo palette set.
 * @param {{ rowsRgb?: number[][][], rows?: number[][] } | null | undefined} paletteSet
 * @returns {(readonly number[])[][]} four palettes × four RGB triples
 */
export function spritePaletteRowsFromSet(paletteSet) {
  const rows = paletteSet?.rowsRgb;
  if (!rows || rows.length < 8) {
    return [
      BAKED_SPRITE_PALETTE_RGB,
      BAKED_SPRITE_PALETTE_RGB,
      BAKED_SPRITE_PALETTE_RGB,
      BAKED_SPRITE_PALETTE_RGB,
    ];
  }
  return [rows[4], rows[5], rows[6], rows[7]];
}
