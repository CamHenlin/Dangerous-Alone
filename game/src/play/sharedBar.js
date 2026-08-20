import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { SHARED_BAR_H, SHARED_BAR_W, formatPartyCount } from '@shared/sharedBar.js';
import { formatMagicKeyCount } from '@shared/statusBarText.js';
import { drawDungeonMinimap, drawOverworldMinimap } from './minimap.js';
import { nesText, statusCounterIconTexture } from './nesFont.js';

const COL = 0xfcfcfc;

const LAYOUT = Object.freeze({
  mapX: 16,
  mapY: 16,
  iconX: 0xb0,
  rupeeX: 0xb8,
  keyX: 0x100,
  bombX: 0x148,
  rowY: 0x18,
});

/**
 * The 512×64 strip under a co-op frame.
 * @param {{
 *   commonBg?: import('pixi.js').Texture | null,
 *   misc?: import('pixi.js').Texture | null,
 * }} [deps]
 */
export function createSharedBar(deps = {}) {
  const bgImg = deps.commonBg
    ? /** @type {CanvasImageSource} */ (deps.commonBg.source.resource)
    : null;
  const miscImg = deps.misc
    ? /** @type {CanvasImageSource} */ (deps.misc.source.resource)
    : null;

  const root = new Container();
  const bg = new Graphics().rect(0, 0, SHARED_BAR_W, SHARED_BAR_H).fill(0x000000);
  root.addChild(bg);
  const mapGfx = new Graphics();
  root.addChild(mapGfx);
  const dynamic = new Container();
  root.addChild(dynamic);
  root.visible = false;

  function placeIcon(kind, x, y) {
    const tex = statusCounterIconTexture(kind, bgImg, miscImg);
    if (tex === Texture.EMPTY) return;
    const spr = new Sprite(tex);
    spr.x = x;
    spr.y = y;
    dynamic.addChild(spr);
  }

  function placeText(text, x, y) {
    if (!bgImg) return;
    dynamic.addChild(nesText(bgImg, text, x, y, COL));
  }

  /**
   * @param {object} s
   * @param {object} [s.inv]
   * @param {number} [s.rupeesShown]
   * @param {string} [s.mode]
   * @param {number} [s.roomId]
   * @param {object | null} [s.dungeon]
   * @param {{ roomId: number, kind: string }[]} [s.mapMarks]
   * @param {{ roomId: number, kind: string }[]} [s.dungeonMarks]
   * @param {number} [s.frame]
   */
  function update(s = {}) {
    const inv = s.inv;
    dynamic.removeChildren().forEach((c) =>
      c.destroy({ texture: false, textureSource: false }),
    );
    mapGfx.clear();
    if (!inv) return;

    placeIcon('rupee', LAYOUT.iconX, LAYOUT.rowY);
    placeText(formatPartyCount(s.rupeesShown ?? inv.rupees, 4), LAYOUT.rupeeX, LAYOUT.rowY);

    placeIcon('key', LAYOUT.keyX, LAYOUT.rowY);
    placeText(
      inv.magicKey ? formatMagicKeyCount() : formatPartyCount(inv.keys, 3),
      LAYOUT.keyX + 8,
      LAYOUT.rowY,
    );

    placeIcon('bomb', LAYOUT.bombX, LAYOUT.rowY);
    placeText(formatPartyCount(inv.bombs, 3), LAYOUT.bombX + 8, LAYOUT.rowY);

    const mode = s.mode ?? 'overworld';
    if (mode === 'dungeon' && s.dungeon?.levelData) {
      drawDungeonMinimap(mapGfx, s.dungeon.levelData, {
        visited: s.dungeon.visitedRooms,
        currentRoomId: s.dungeon.room?.roomId ?? s.roomId,
        hasMap: Boolean(inv.map),
        hasCompass: Boolean(inv.compass),
        x: LAYOUT.mapX,
        y: LAYOUT.mapY,
        cellW: 4,
        cellH: 3,
        compact: true,
        marks: s.dungeonMarks ?? [],
        frame: s.frame ?? 0,
      });
    } else if (mode === 'overworld' || mode === 'cave') {
      drawOverworldMinimap(mapGfx, s.roomId ?? null, {
        x: LAYOUT.mapX,
        y: LAYOUT.mapY,
        cellW: 4,
        cellH: 3,
        marks: s.mapMarks ?? [],
        frame: s.frame ?? 0,
      });
    }
  }

  return {
    root,
    update,
    show(visible) {
      root.visible = Boolean(visible);
    },
  };
}
