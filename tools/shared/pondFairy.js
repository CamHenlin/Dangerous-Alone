/**
 * Pond fairy fountain — InitPondFairy / UpdatePondFairy / World_FillHearts (Z_04 / Z_05).
 *
 * ObjType $2F. Link at Y=$AD and X in [$70,$81) starts the heal sequence:
 * halt Link (ObjState $40), fill hearts (+$06 HeartPartial / frame), orbit hearts,
 * then hold $50 frames and unhalt.
 */

import { OBJ } from './enemies.js';

export const POND_FAIRY = OBJ.POND_FAIRY;

/** Link standing on the south lip of the pond. */
export const POND_EDGE_Y = 0xad;
export const POND_EDGE_X_MIN = 0x70;
/** Exclusive upper bound (CMP #$81 / BCS). */
export const POND_EDGE_X_MAX = 0x81;

/** After fill completes, keep showing orbit hearts this many frames. */
export const POND_POST_FILL_TIMER = 0x50;

/** Vertical offset of the first orbit heart above the fairy. */
export const POND_HEART_RADIUS = 0x1c;

/** PondHeartStartAngles — when first heart reaches these, spawn slots 3–9. */
export const POND_HEART_START_ANGLES = Object.freeze([
  0x14, 0x10, 0x0c, 0x08, 0x04, 0x00, 0x1c,
]);

/** PatraSines — used by RotateObjectLocation. */
const PATRA_SINES = Object.freeze([
  0x00, 0x18, 0x30, 0x47, 0x5a, 0x6a, 0x76, 0x7d,
  0x80, 0x7d, 0x76, 0x6a, 0x5a, 0x47, 0x30, 0x18,
]);

/** Default ObjQSpeedFrac for room objects. */
const QSPEED = 0x20;

/**
 * @param {{ x: number, y: number }} link
 */
export function linkAtPondEdge(link) {
  const x = link.x & 0xff;
  const y = link.y & 0xff;
  return y === POND_EDGE_Y && x >= POND_EDGE_X_MIN && x < POND_EDGE_X_MAX;
}

/**
 * Pack half-heart inventory into NES HeartValues low-nibble + HeartPartial.
 * @param {{ halfHearts?: number, maxHalfHearts?: number }} inv
 */
export function nesHeartsFromInv(inv) {
  const containers = Math.floor((inv.maxHalfHearts ?? 0) / 2);
  const hh = inv.halfHearts ?? 0;
  const maxHh = inv.maxHalfHearts ?? 0;
  if (containers <= 0) return { hearts: 0, partial: 0, containers: 0 };
  if (hh >= maxHh) return { hearts: containers, partial: 0xff, containers };
  // Half-heart HUD → HeartPartial in ($00,$80) so FormatHearts emits tile $65.
  if (hh % 2 === 1) {
    return { hearts: Math.floor(hh / 2) + 1, partial: 0x40, containers };
  }
  const full = hh / 2;
  return { hearts: full, partial: full > 0 ? 0xff : 0, containers };
}

/**
 * Sync inventory half-hearts from NES heart counters (HUD half-heart resolution).
 * @param {{ halfHearts?: number, maxHalfHearts?: number }} inv
 * @param {number} hearts low nibble of HeartValues
 * @param {number} partial HeartPartial
 */
export function applyNesHeartsToInv(inv, hearts, partial) {
  const containers = Math.floor((inv.maxHalfHearts ?? 0) / 2);
  const h = hearts & 0x0f;
  const p = partial & 0xff;
  if (containers <= 0) {
    inv.halfHearts = 0;
    return;
  }
  if (h >= containers && p === 0xff) {
    inv.halfHearts = containers * 2;
    return;
  }
  if (p === 0) {
    inv.halfHearts = Math.max(0, h > 0 ? (h - 1) * 2 : 0);
    return;
  }
  if (p >= 0x80) {
    inv.halfHearts = Math.min(containers * 2, h * 2);
    return;
  }
  inv.halfHearts = Math.min(containers * 2, Math.max(0, h * 2 - 1));
}

/**
 * One frame of World_FillHearts.
 * @param {{ hearts: number, partial: number, containers: number }} nes
 * @returns {{ filling: boolean, playTune: boolean }}
 */
export function stepWorldFillHearts(nes) {
  if (nes.containers <= 0) return { filling: false, playTune: false };
  // Tune0Request ← $10 every filling frame.
  const playTune = true;
  if ((nes.partial & 0xff) < 0xf8) {
    nes.partial = ((nes.partial & 0xff) + 0x06) & 0xff;
    return { filling: true, playTune };
  }
  nes.partial = 0;
  if ((nes.hearts & 0x0f) !== (nes.containers & 0x0f)) {
    nes.hearts = ((nes.hearts & 0x0f) + 1) & 0x0f;
    return { filling: true, playTune };
  }
  // Full: HeartPartial $FF, clear SwordBlocked / stop filling.
  nes.partial = 0xff;
  return { filling: false, playTune };
}

/**
 * @typedef {object} PondOrbitHeart
 * @property {number} state 0 = waiting, 1 = orbiting
 * @property {number} x
 * @property {number} y
 * @property {number} angleWhole
 * @property {number} angleFrac
 * @property {number} xFrac
 * @property {number} yFrac
 */

/**
 * @returns {PondOrbitHeart[]}
 */
export function createPondOrbitHearts() {
  return Array.from({ length: 8 }, () => ({
    state: 0,
    x: 0,
    y: 0,
    angleWhole: 0,
    angleFrac: 0,
    xFrac: 0,
    yFrac: 0,
  }));
}

/**
 * Attach pond-fairy runtime fields (idempotent).
 * @param {import('./enemies.js').Enemy} e
 */
export function ensurePondFairyRuntime(e) {
  if (e.pondState != null) return e;
  e.pondState = 0;
  e.pondTimer = 0;
  e.fillingHearts = 0;
  e.nesHearts = null;
  e.pondHearts = createPondOrbitHearts();
  e.pondVisitor = /** @type {number | null} */ (null);
  return e;
}

/**
 * ShiftMultiply — high `bits` of multiplier × multiplicand → 16-bit product.
 * @param {number} multiplicand
 * @param {number} multiplier
 * @param {number} bits
 */
function shiftMultiply(multiplicand, multiplier, bits) {
  let m = multiplier & 0xff;
  let lo = 0;
  let hi = 0;
  const addend = multiplicand & 0xff;
  for (let i = 0; i < bits; i += 1) {
    lo <<= 1;
    hi = (hi << 1) | (lo > 0xff ? 1 : 0);
    lo &= 0xff;
    const bit = (m & 0x80) !== 0;
    m = (m << 1) & 0xff;
    if (bit) {
      const sum = lo + addend;
      lo = sum & 0xff;
      if (sum > 0xff) hi = (hi + 1) & 0xff;
    }
  }
  return { lo, hi };
}

/**
 * DecreaseObjectAngle by $00.60.
 * @param {PondOrbitHeart} h
 */
function decreaseHeartAngle(h) {
  let frac = (h.angleFrac & 0xff) - 0x60;
  let whole = h.angleWhole & 0x1f;
  if (frac < 0) {
    frac &= 0xff;
    whole = (whole - 1) & 0x1f;
  }
  h.angleFrac = frac;
  h.angleWhole = whole;
}

/**
 * RotateObjectLocation with 6 sine/cosine bits and q-speed $20.
 * @param {PondOrbitHeart} h
 */
function rotateHeartLocation(h) {
  const ang = h.angleWhole & 0x1f;
  const sine = PATRA_SINES[ang & 0x0f];
  const { lo: xLo, hi: xHi } = shiftMultiply(QSPEED, sine, 6);
    if ((ang & 0x18) >= 0x10) {
    let f = (h.xFrac & 0xff) - xLo;
    let x = h.x - xHi;
    if (f < 0) {
      f &= 0xff;
      x -= 1;
    }
    h.xFrac = f;
    h.x = x;
  } else {
    let f = (h.xFrac & 0xff) + xLo;
    let x = h.x + xHi;
    if (f > 0xff) {
      f &= 0xff;
      x += 1;
    }
    h.xFrac = f;
    h.x = x;
  }

  const cosIdx = (ang + 8) & 0x0f;
  const cosine = PATRA_SINES[cosIdx];
  const { lo: yLo, hi: yHi } = shiftMultiply(QSPEED, cosine, 6);
  const yQuad = (ang - 8) & 0x1f;
  if ((yQuad & 0x18) >= 0x10) {
    let f = (h.yFrac & 0xff) - yLo;
    let y = h.y - yHi;
    if (f < 0) {
      f &= 0xff;
      y -= 1;
    }
    h.yFrac = f;
    h.y = y;
  } else {
    let f = (h.yFrac & 0xff) + yLo;
    let y = h.y + yHi;
    if (f > 0xff) {
      f &= 0xff;
      y += 1;
    }
    h.yFrac = f;
    h.y = y;
  }
}

/**
 * PondFairy_MoveHearts — update / spawn orbiting hearts around the fairy.
 * @param {import('./enemies.js').Enemy} fairy
 */
export function stepPondOrbitHearts(fairy) {
  const hearts = fairy.pondHearts;
  if (!hearts) return;
  const first = hearts[0];

  for (let i = 0; i < hearts.length; i += 1) {
    const h = hearts[i];
    if (h.state === 0) {
      if (i === 0) {
        // First heart appears immediately.
      } else {
        if (first.state === 0) continue;
        const need = POND_HEART_START_ANGLES[i - 1];
        if ((first.angleWhole & 0x1f) !== need) continue;
      }
      h.state = 1;
      h.angleWhole = 0x18;
      h.angleFrac = 0;
      h.xFrac = 0;
      h.yFrac = 0;
      // World coords, not 8-bit room-local: masking parked the ring on
      // every camera's (0x78, $7D) and it looked like it orbited every hero.
      h.x = fairy.x;
      h.y = fairy.y - POND_HEART_RADIUS;
    }

    decreaseHeartAngle(h);
    rotateHeartLocation(h);
  }
}

/**
 * Visible orbiting hearts (state ≠ 0).
 * @param {import('./enemies.js').Enemy} fairy
 * @returns {PondOrbitHeart[]}
 */
export function visiblePondHearts(fairy) {
  return (fairy.pondHearts ?? []).filter((h) => h.state !== 0);
}

/**
 * True while UpdatePondFairy is drawing the ring.
 * @param {import('./enemies.js').Enemy | null | undefined} fairy
 */
export function pondFairyOrbiting(fairy) {
  const state = fairy?.pondState ?? 0;
  return state === 1 || state === 2;
}

/**
 * ObjState $40: the visitor is halted and must not take hits. An ally in
 * the same world keeps fighting — knocking the visitor off Y=$AD used to
 * leave the orbit hearts stranded on screen.
 * @param {import('./enemies.js').Enemy | null | undefined} fairy
 * @param {number | null | undefined} playerIndex
 */
export function pondFairyProtectsVisitor(fairy, playerIndex) {
  if (!pondFairyOrbiting(fairy)) return false;
  if (playerIndex == null) return true;
  return (fairy.pondVisitor ?? 0) === (playerIndex | 0);
}

/**
 * Foes in the fountain room freeze for the ceremony so they cannot walk
 * into the visitor. An ally fighting elsewhere in Hyrule is unaffected —
 * a world-wide clock freeze would stall their screen too.
 * @param {import('./enemies.js').Enemy | null | undefined} fairy
 * @param {import('./enemies.js').Enemy | null | undefined} enemy
 */
export function pondFairyFreezesEnemy(fairy, enemy) {
  if (!pondFairyOrbiting(fairy) || !enemy) return false;
  if (enemy.objType === POND_FAIRY) return false;
  if (fairy.homeRoomId == null) return false;
  return ((enemy.homeRoomId ?? fairy.homeRoomId) & 0xff) === (fairy.homeRoomId & 0xff);
}

/**
 * @typedef {object} PondFairyStepResult
 * @property {boolean} haltLink
 * @property {boolean} playHeartTune
 * @property {boolean} showOrbitHearts
 * @property {PondOrbitHeart[]} hearts
 */

/**
 * UpdatePondFairy (plus World_FillHearts while the flag is set).
 * @param {import('./enemies.js').Enemy} e
 * @param {{ halfHearts?: number, maxHalfHearts?: number, swordBlocked?: number }} inv
 * @param {{ x: number, y: number }} link
 * @param {{ roomId?: number | null, playerIndex?: number }} [opts]
 * @returns {PondFairyStepResult}
 */
export function stepPondFairy(e, inv, link, opts = {}) {
  ensurePondFairyRuntime(e);
  /** @type {PondFairyStepResult} */
  const out = {
    haltLink: false,
    playHeartTune: false,
    showOrbitHearts: false,
    hearts: [],
  };

  // Continuous OW: Link Y=$AD is a normal south walk line on every screen.
  // Only the fairy's home fountain room may start / continue the heal.
  if (
    opts.roomId != null
    && e.homeRoomId != null
    && (e.homeRoomId & 0xff) !== (opts.roomId & 0xff)
  ) {
    return out;
  }

  const playerIndex = opts.playerIndex;
  if (e.pondState === 0) {
    if (!linkAtPondEdge(link)) return out;
    e.pondState = 1;
    e.pondVisitor = playerIndex ?? 0;
    e.fillingHearts = 0x40;
    e.nesHearts = nesHeartsFromInv(inv);
    // Fall through — World_FillHearts runs same frame after the flag is set.
  } else if (
    playerIndex != null
    && e.pondVisitor != null
    && playerIndex !== e.pondVisitor
  ) {
    // An ally in the same world must not be filled, halted, or used to hide
    // the ring — but they also must not steal the visitor's step.
    if (pondFairyOrbiting(e)) {
      out.showOrbitHearts = true;
      out.hearts = visiblePondHearts(e);
    }
    return out;
  }

  if (e.fillingHearts && e.nesHearts) {
    const fill = stepWorldFillHearts(e.nesHearts);
    applyNesHeartsToInv(inv, e.nesHearts.hearts, e.nesHearts.partial);
    out.playHeartTune = fill.playTune;
    if (!fill.filling) {
      e.fillingHearts = 0;
      inv.swordBlocked = 0;
    }
  }

  if (e.pondState === 1) {
    if (e.fillingHearts) {
      stepPondOrbitHearts(e);
      out.haltLink = true;
      out.showOrbitHearts = true;
      out.hearts = visiblePondHearts(e);
      return out;
    }
    // Fill done → state 2, timer $50. ROM falls through with A=$50 and skips draw.
    e.pondState = 2;
    e.pondTimer = POND_POST_FILL_TIMER;
    out.haltLink = true;
    return out;
  }

  if (e.pondState === 2) {
    if (e.pondTimer > 0) e.pondTimer -= 1;
    if (e.pondTimer !== 0) {
      stepPondOrbitHearts(e);
      out.haltLink = true;
      out.showOrbitHearts = true;
      out.hearts = visiblePondHearts(e);
      return out;
    }
    e.pondState = 3;
    out.haltLink = false;
    return out;
  }

  // State 3: idle fairy; sequence already finished this visit.
  return out;
}

/**
 * @param {import('./enemies.js').Enemy[]} enemies
 * @param {number | null} [roomId] when set, only the fairy whose home is this
 *   room (continuous OW can stream a neighbor fountain while Link is elsewhere)
 * @returns {import('./enemies.js').Enemy | null}
 */
export function findPondFairy(enemies, roomId = null) {
  const want = roomId == null ? null : roomId & 0xff;
  return (
    enemies.find((e) => {
      if (!e?.alive || e.objType !== POND_FAIRY) return false;
      if (want == null) return true;
      return (e.homeRoomId ?? want) === want;
    }) ?? null
  );
}
