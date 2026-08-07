import { Texture } from 'pixi.js';
import { ENEMY_COLOR, OBJ } from '@shared/enemies.js';
import {
  BAKED_SPRITE_PALETTE_RGB,
  enemySpritePalette,
  remapPaletteRgba,
  spritePaletteRowsFromSet,
} from '@shared/enemyPalette.js';
import {
  AQUAMENTUS_FRAMES,
  AQUAMENTUS_OFFSETS,
  PROJECTILE_TILE,
  aquamentusMouthOpen,
  enemyDrawFlags,
  enemyFrameIndex,
  enemyFrameTile,
  sheetForPpuTile,
} from '@shared/enemyAnim.js';
import {
  DIGDOGGER_BIG_PARTS,
  GANON_CORNERS,
  GLEEOK_BODY_OFFSETS,
  GOHMA_PARTS,
  MANHANDLA_PARTS,
  dodongoWalkDraw,
  enemyHalfSprite,
  hasBossComposer,
} from '@shared/bossSpriteLayouts.js';
import {
  GLEEOK_BODY_FRAMES,
  GLEEOK_CANVAS_H,
  GLEEOK_CANVAS_OX,
  GLEEOK_CANVAS_OY,
  GLEEOK_CANVAS_W,
  GLEEOK_HEAD_TILE,
  GLEEOK_NECK_TILE,
} from '@shared/gleeok.js';
import { BOSS } from '@shared/bosses.js';
import { ganonIsVisible } from '@shared/bossAi.js';
import { PROJ } from '@shared/projectiles.js';

const TILE = 8;
const SHEET_COLS = 16;

/**
 * @param {Record<string, Texture>} sheets
 * @param {{ rowsRgb?: number[][][] } | null} [initialPaletteSet]
 */
export function createEnemySprites(sheets, initialPaletteSet = null) {
  /** @type {Map<string, CanvasImageSource>} */
  const images = new Map();
  for (const [id, tex] of Object.entries(sheets)) {
    images.set(id, /** @type {CanvasImageSource} */ (tex.source.resource));
  }
  /** @type {Map<string, Texture>} */
  const cache = new Map();

  /** @type {(readonly number[])[][]} */
  let spriteRows = spritePaletteRowsFromSet(initialPaletteSet);
  /** @type {{ rowsRgb?: number[][][] } | null | undefined} */
  let activePaletteSet = initialPaletteSet;
  /** Dungeon level 1–9 selects UW special / boss CHR sheets. */
  let dungeonLevel = 1;

  function clearCache() {
    for (const tex of cache.values()) {
      tex.destroy(true);
    }
    cache.clear();
  }

  /**
   * Swap LevelInfo palette set (OW vs dungeon). Clears texture cache.
   * @param {{ rowsRgb?: number[][][] } | null} paletteSet
   */
  function setPaletteSet(paletteSet) {
    // Same set → keep live textures (cave NPC/fire still reference them).
    if (paletteSet === activePaletteSet) return;
    activePaletteSet = paletteSet;
    spriteRows = spritePaletteRowsFromSet(paletteSet);
    clearCache();
  }

  /**
   * Select level-specific UW special ($9E) / boss ($C0) sheets.
   * @param {number} level 1–9
   */
  function setDungeonLevel(level) {
    const next = Math.max(1, Math.min(9, level | 0));
    if (next === dungeonLevel) return;
    dungeonLevel = next;
    clearCache();
  }

  function sheetImage(sheetId) {
    const img = images.get(sheetId);
    if (!img) throw new Error(`Missing enemy sheet ${sheetId}`);
    return img;
  }

  function drawTile(ctx, sheetId, tileIndex, dx, dy) {
    const sx = (tileIndex % SHEET_COLS) * TILE;
    const sy = Math.floor(tileIndex / SHEET_COLS) * TILE;
    ctx.drawImage(sheetImage(sheetId), sx, sy, TILE, TILE, dx, dy, TILE, TILE);
  }

  /**
   * Remap baked SP0 colors on a canvas to the target sprite palette.
   * @param {HTMLCanvasElement} canvas
   * @param {number} spritePal 0–3
   */
  function applySpritePalette(canvas, spritePal) {
    const src = BAKED_SPRITE_PALETTE_RGB;
    const dst = spriteRows[spritePal & 3] ?? src;
    let same = true;
    for (let i = 1; i < 4; i += 1) {
      if (dst[i][0] !== src[i][0] || dst[i][1] !== src[i][1] || dst[i][2] !== src[i][2]) {
        same = false;
        break;
      }
    }
    if (same) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    remapPaletteRgba(img.data, src, dst);
    ctx.putImageData(img, 0, 0);
  }

  /**
   * Build 16×16 from NES 8×16 sprite pairs.
   * @param {string} sheetId
   * @param {number} localTile
   * @param {{ mirror?: boolean, flipH?: boolean, flipV?: boolean }} flags
   * @param {number} spritePal
   */
  function compose16(sheetId, localTile, flags = {}, spritePal = 0) {
    const { mirror = false, flipH = false, flipV = false } = flags;
    const key = `16:${sheetId}:${localTile}:${mirror ? 1 : 0}:${flipH ? 1 : 0}:${flipV ? 1 : 0}:p${spritePal}`;
    let tex = cache.get(key);
    if (tex) return tex;

    const base = document.createElement('canvas');
    base.width = 16;
    base.height = 16;
    const bctx = base.getContext('2d');
    if (!bctx) throw new Error('2d context unavailable');
    bctx.imageSmoothingEnabled = false;

    drawTile(bctx, sheetId, localTile, 0, 0);
    drawTile(bctx, sheetId, localTile + 1, 0, 8);

    if (mirror) {
      bctx.save();
      bctx.translate(16, 0);
      bctx.scale(-1, 1);
      drawTile(bctx, sheetId, localTile, 0, 0);
      drawTile(bctx, sheetId, localTile + 1, 0, 8);
      bctx.restore();
    } else {
      drawTile(bctx, sheetId, localTile + 2, 8, 0);
      drawTile(bctx, sheetId, localTile + 3, 8, 8);
    }

    let src = base;
    if (flipH || flipV) {
      const out = document.createElement('canvas');
      out.width = 16;
      out.height = 16;
      const octx = out.getContext('2d');
      if (!octx) throw new Error('2d context unavailable');
      octx.imageSmoothingEnabled = false;
      octx.translate(flipH ? 16 : 0, flipV ? 16 : 0);
      octx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      octx.drawImage(base, 0, 0);
      src = out;
    }

    applySpritePalette(src, spritePal);
    tex = Texture.from(src);
    tex.source.scaleMode = 'nearest';
    cache.set(key, tex);
    return tex;
  }

  /**
   * @param {string} sheetId
   * @param {number} localTile
   * @param {number} spritePal
   */
  function compose8x16(sheetId, localTile, spritePal = 0) {
    const key = `8x16:${sheetId}:${localTile}:p${spritePal}`;
    let tex = cache.get(key);
    if (tex) return tex;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.imageSmoothingEnabled = false;
    drawTile(ctx, sheetId, localTile, 0, 0);
    drawTile(ctx, sheetId, localTile + 1, 0, 8);
    applySpritePalette(canvas, spritePal);
    tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    cache.set(key, tex);
    return tex;
  }

  /**
   * @param {number} ppuTile
   * @param {'overworld' | 'dungeon'} mode
   * @param {{ mirror?: boolean, flipH?: boolean, flipV?: boolean, half?: boolean, spritePal?: number }} [flags]
   */
  function textureFromPpu(ppuTile, mode, flags = {}) {
    const level = mode === 'dungeon' ? dungeonLevel : 1;
    const { sheet, index } = sheetForPpuTile(ppuTile, mode, level);
    const spritePal = flags.spritePal ?? 0;
    if (flags.half) return compose8x16(sheet, index, spritePal);
    return compose16(sheet, index, flags, spritePal);
  }

  /**
   * @param {import('@shared/enemies.js').Enemy} e
   * @param {'overworld' | 'dungeon'} mode
   */
  function textureForEnemy(e, mode) {
    // BoulderSet is an invisible spawner — never color-stub it.
    if (e.objType === OBJ.BOULDER_SET) return null;
    const spritePal = enemySpritePalette(e.objType, e.anim);
    if (e.objType === OBJ.AQUAMENTUS) {
      return aquamentusTexture(e, spritePal);
    }
    if (hasBossComposer(e.objType)) {
      return bossComposerTexture(e, spritePal);
    }
    const frame = enemyFrameIndex(e.objType, e.dir, e.anim, {
      leeverPhase: e.leeverPhase,
      timer: e.timer,
      wormHead: e.wormHead,
    });
    const ppu = enemyFrameTile(e.objType, frame);
    if (ppu == null) return colorStubTexture(e);
    const flags = enemyDrawFlags(e.objType, e.dir, frame);
    const half = enemyHalfSprite(e.objType);
    return textureFromPpu(ppu, mode, { ...flags, half, spritePal });
  }

  /**
   * Draw one 8×16 NES sprite pair (top = tile, bottom = tile+1) at (dx,dy).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} ppuTile
   * @param {number} dx
   * @param {number} dy
   * @param {{ flipH?: boolean, flipV?: boolean, mirror?: boolean }} [flags]
   */
  function blitPpu16(ctx, ppuTile, dx, dy, flags = {}) {
    const { sheet, index } = sheetForPpuTile(ppuTile, 'dungeon', dungeonLevel);
    const { flipH = false, flipV = false, mirror = false } = flags;
    const tmp = document.createElement('canvas');
    tmp.width = 16;
    tmp.height = 16;
    const tctx = tmp.getContext('2d');
    if (!tctx) return;
    tctx.imageSmoothingEnabled = false;
    drawTile(tctx, sheet, index, 0, 0);
    drawTile(tctx, sheet, index + 1, 0, 8);
    if (mirror) {
      tctx.save();
      tctx.translate(16, 0);
      tctx.scale(-1, 1);
      drawTile(tctx, sheet, index, 0, 0);
      drawTile(tctx, sheet, index + 1, 0, 8);
      tctx.restore();
    } else {
      drawTile(tctx, sheet, index + 2, 8, 0);
      drawTile(tctx, sheet, index + 3, 8, 8);
    }
    if (flipH || flipV) {
      const out = document.createElement('canvas');
      out.width = 16;
      out.height = 16;
      const octx = out.getContext('2d');
      if (!octx) return;
      octx.imageSmoothingEnabled = false;
      octx.translate(flipH ? 16 : 0, flipV ? 16 : 0);
      octx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      octx.drawImage(tmp, 0, 0);
      ctx.drawImage(out, dx, dy);
      return;
    }
    ctx.drawImage(tmp, dx, dy);
  }

  /**
   * @param {import('@shared/enemies.js').Enemy} e
   * @param {number} spritePal
   */
  function bossComposerTexture(e, spritePal) {
    const t = e.objType;
    if (t === BOSS.MANHANDLA) return manhandlaTexture(e, spritePal);
    if (t === BOSS.DIGDOGGER || t === BOSS.DIGDOGGER_1) return digdoggerTexture(spritePal);
    if (t === BOSS.GOHMA || t === BOSS.GOHMA_RED) return gohmaTexture(e, spritePal);
    if (t === BOSS.DODONGO || t === BOSS.DODONGO_1) return dodongoTexture(e, spritePal);
    if (t === BOSS.GLEEOK_2 || t === BOSS.GLEEOK_3 || t === BOSS.GLEEOK_4) {
      return gleeokTexture(e, spritePal);
    }
    if (t === BOSS.GANON) return ganonTexture(spritePal, ganonIsVisible(e));
    return colorStubTexture(e);
  }

  function manhandlaTexture(e, spritePal) {
    const mouths = e.mouthHp ?? [0x40, 0x40, 0x40, 0x40];
    const anim = (e.anim >> 4) & 1;
    const mouthBits = mouths.map((h) => (h > 0 ? 1 : 0)).join('');
    const key = `manh:${mouthBits}:${anim}:p${spritePal}:L${dungeonLevel}`;
    let tex = cache.get(key);
    if (tex) return tex;
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.imageSmoothingEnabled = false;
    for (const part of MANHANDLA_PARTS) {
      if (part.mouth >= 0 && !(mouths[part.mouth] > 0)) continue;
      let tile = part.tile;
      if (part.mouth >= 0 && anim) {
        tile = part.tile === 0xe8 ? 0xea : part.tile === 0xe0 ? 0xe4 : part.tile;
      }
      blitPpu16(ctx, tile, part.x, part.y, {
        mirror: part.mirror,
        flipH: part.flipH,
        flipV: part.flipV,
      });
    }
    applySpritePalette(canvas, spritePal);
    tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    cache.set(key, tex);
    return tex;
  }

  function digdoggerTexture(spritePal) {
    const key = `digdog:p${spritePal}:L${dungeonLevel}`;
    let tex = cache.get(key);
    if (tex) return tex;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.imageSmoothingEnabled = false;
    for (const part of DIGDOGGER_BIG_PARTS) {
      blitPpu16(ctx, part.tile, part.x, part.y, { mirror: true, flipH: part.flipH, flipV: part.flipV });
    }
    applySpritePalette(canvas, spritePal);
    tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    cache.set(key, tex);
    return tex;
  }

  function gohmaTexture(e, spritePal) {
    // Eye: closed $F4/$F6 (walk), open $FE when shoot window.
    const open = (e.gohmaEyeOpen ?? false) || ((e.anim & 0x20) !== 0 && (e.timer ?? 0) < 0x10);
    const eyeTile = open ? 0xfe : ((e.anim >> 3) & 1) ? 0xf6 : 0xf4;
    const legTile = (e.anim >> 3) & 1 ? 0xf8 : 0xf0;
    const key = `gohma:${eyeTile.toString(16)}:${legTile.toString(16)}:p${spritePal}:L${dungeonLevel}`;
    let tex = cache.get(key);
    if (tex) return tex;
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.imageSmoothingEnabled = false;
    for (const part of GOHMA_PARTS) {
      const tile = part.key === 'eye' ? eyeTile : legTile;
      blitPpu16(ctx, tile, part.x, part.y, { mirror: part.mirror, flipH: part.flipH });
    }
    applySpritePalette(canvas, spritePal);
    tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    cache.set(key, tex);
    return tex;
  }

  function dodongoTexture(e, spritePal) {
    // Dodongo_Draw: every 8 frames switch walk halves; LEFT swaps + HFlip.
    const anim = (e.anim >> 3) & 1;
    const draw = dodongoWalkDraw(e.dir, anim);
    const key = `dodo:${draw.leftTile.toString(16)}:${draw.rightTile?.toString(16) ?? '-'}:${draw.flipH ? 1 : 0}:p${spritePal}:L${dungeonLevel}`;
    let tex = cache.get(key);
    if (tex) return tex;
    const canvas = document.createElement('canvas');
    canvas.width = draw.side ? 32 : 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.imageSmoothingEnabled = false;
    if (draw.side && draw.rightTile != null) {
      blitPpu16(ctx, draw.leftTile, 0, 0, { mirror: false, flipH: draw.flipH });
      blitPpu16(ctx, draw.rightTile, 16, 0, { mirror: false, flipH: draw.flipH });
    } else {
      blitPpu16(ctx, draw.leftTile, 0, 0, { mirror: Boolean(draw.mirror) });
    }
    applySpritePalette(canvas, spritePal);
    tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    cache.set(key, tex);
    return tex;
  }

  /** Scratch for animated Gleeok (body + necks); one live boss at a time. */
  const gleeokScratch = { canvas: null, ctx: null, tex: null };

  /**
   * Full Gleeok: pinned body + stretched necks (tiles $DA / $DC).
   * @param {import('@shared/enemies.js').Enemy} e
   * @param {number} spritePal
   */
  function gleeokTexture(e, spritePal) {
    if (!gleeokScratch.canvas) {
      gleeokScratch.canvas = document.createElement('canvas');
      gleeokScratch.canvas.width = GLEEOK_CANVAS_W;
      gleeokScratch.canvas.height = GLEEOK_CANVAS_H;
      gleeokScratch.ctx = gleeokScratch.canvas.getContext('2d');
      if (!gleeokScratch.ctx) throw new Error('2d context unavailable');
      gleeokScratch.ctx.imageSmoothingEnabled = false;
      gleeokScratch.tex = Texture.from(gleeokScratch.canvas);
      gleeokScratch.tex.source.scaleMode = 'nearest';
    }
    const { canvas, ctx, tex } = gleeokScratch;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const tiles = GLEEOK_BODY_FRAMES[(e.bodyAnimFrame ?? 0) & 3];
    const bodyDx = e.x - GLEEOK_CANVAS_OX;
    const bodyDy = e.y - GLEEOK_CANVAS_OY;
    for (let i = 0; i < 6; i += 1) {
      const { sheet, index } = sheetForPpuTile(tiles[i], 'dungeon', dungeonLevel);
      const off = GLEEOK_BODY_OFFSETS[i];
      drawTile(ctx, sheet, index, bodyDx + off.x, bodyDy + off.y);
      drawTile(ctx, sheet, index + 1, bodyDx + off.x, bodyDy + off.y + 8);
    }

    // Neck / head segments are NES 8×16 (not mirrored 16×16).
    const necks = e.necks ?? [];
    const hps = e.headHp ?? [];
    for (let n = 0; n < necks.length; n += 1) {
      if (!(hps[n] > 0)) continue;
      const segs = necks[n].segs ?? [];
      for (let s = 0; s < segs.length; s += 1) {
        const tile = s === segs.length - 1 ? GLEEOK_HEAD_TILE : GLEEOK_NECK_TILE;
        const { sheet, index } = sheetForPpuTile(tile, 'dungeon', dungeonLevel);
        const dx = segs[s].x - GLEEOK_CANVAS_OX;
        const dy = segs[s].y - GLEEOK_CANVAS_OY;
        drawTile(ctx, sheet, index, dx, dy);
        drawTile(ctx, sheet, index + 1, dx, dy + 8);
      }
    }
    applySpritePalette(canvas, spritePal);
    tex.source.update();
    return tex;
  }

  /**
   * Ganon_ScenePhase2 / Ganon_UpdateBrownState draw him only some frames, so the
   * invisible frames resolve to a transparent texture.
   * @param {number} spritePal
   * @param {boolean} visible
   */
  function ganonTexture(spritePal, visible) {
    const key = `ganon:p${spritePal}:L${dungeonLevel}:${visible ? 'on' : 'off'}`;
    let tex = cache.get(key);
    if (tex) return tex;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.imageSmoothingEnabled = false;
    if (visible) {
      for (const part of GANON_CORNERS) {
        blitPpu16(ctx, part.tile, part.x, part.y, { mirror: false, flipH: part.flipH });
      }
      applySpritePalette(canvas, spritePal);
    }
    tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    cache.set(key, tex);
    return tex;
  }

  /** Solid-color fallback for bosses without frame tables yet. */
  function colorStubTexture(e) {
    const key = `stub:${e.objType}`;
    let tex = cache.get(key);
    if (tex) return tex;
    const w = e.objType === OBJ.GEL || e.objType === OBJ.GEL2 ? 8 : 32;
    const h = e.objType === 0x37 /* Zelda */ ? 16 : 32;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    const color = (ENEMY_COLOR[e.objType] ?? 0xff00ff) >>> 0;
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, w, h);
    tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    cache.set(key, tex);
    return tex;
  }

  /**
   * @param {import('@shared/enemies.js').Enemy} e
   * @param {number} spritePal
   */
  function aquamentusTexture(e, spritePal) {
    const walk = (e.anim >> 4) & 1;
    const mouth = aquamentusMouthOpen(e) ? 1 : 0;
    const key = `aqua:${walk}:${mouth}:p${spritePal}`;
    let tex = cache.get(key);
    if (tex) return tex;
    const tiles = AQUAMENTUS_FRAMES[walk].slice();
    if (mouth) tiles[0] = 0xc0; // open mouth
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < 6; i += 1) {
      const { sheet, index } = sheetForPpuTile(tiles[i], 'dungeon', dungeonLevel);
      const off = AQUAMENTUS_OFFSETS[i];
      drawTile(ctx, sheet, index, off.x, off.y);
      drawTile(ctx, sheet, index + 1, off.x, off.y + 8);
    }
    applySpritePalette(canvas, spritePal);
    tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    cache.set(key, tex);
    return tex;
  }

  /**
   * Enemy rocks / fireballs. Sword beams, arrows, and magic shots are drawn
   * via itemSprites (directional Anim_ItemFrameTiles) in play/main.js.
   * @param {import('@shared/projectiles.js').Projectile} p
   * @param {'overworld' | 'dungeon'} mode
   */
  function textureForProjectile(p, mode) {
    if (p.kind === PROJ.FIREBALL || p.kind === PROJ.FIREBALL_UNBLOCKABLE) {
      return textureFromPpu(PROJECTILE_TILE.FIREBALL, mode, { half: true, spritePal: 2 });
    }
    // Octorok rock — red/brown sprite palette.
    return textureFromPpu(PROJECTILE_TILE.ROCK, mode, { half: true, spritePal: 2 });
  }

  /**
   * Cave dweller / bonfire CHR (OW sheet; DrawCavePerson / type-$40 fire).
   * @param {number} ppuTile
   * @param {{ mirror?: boolean, spritePal?: number, half?: boolean }} [flags]
   */
  function textureForCaveSprite(ppuTile, flags = {}) {
    return textureFromPpu(ppuTile, 'overworld', flags);
  }

  return {
    textureForEnemy,
    textureForProjectile,
    textureForCaveSprite,
    setPaletteSet,
    setDungeonLevel,
  };
}
