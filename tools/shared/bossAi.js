/**
 * Phase-15 boss state machines (Dodongo / Gohma / Digdogger / Ganon / Aquamentus).
 * Simplified from Z_04 Update* — enough for NES-like fights.
 */

import { DIR } from './collision.js';
import {
  BOSS,
  CHILD_DIGDOGGER,
  PATRA_CHILD,
  PATRA_CHILD_RED,
  isDodongo,
  isGleeok,
  isGohma,
  isPatra,
  isPatraChild,
  stepBoss,
} from './bosses.js';
import { gleeokHeadPos, initGleeok, stepGleeok } from './gleeok.js';
import { consumeQSpeedPixels } from './objQSpeed.js';
import { onTileBoundary, wandererDecideFacing } from './wandererAi.js';

const DIRS8 = Object.freeze([
  DIR.RIGHT,
  DIR.LEFT,
  DIR.DOWN,
  DIR.UP,
  DIR.RIGHT | DIR.DOWN,
  DIR.LEFT | DIR.DOWN,
  DIR.RIGHT | DIR.UP,
  DIR.LEFT | DIR.UP,
]);

export const GOHMA_EYE = Object.freeze({
  CLOSED: 0,
  OPENING: 1,
  OPEN: 3,
});

export const GANON_PHASE = Object.freeze({
  BLUE: 0,
  BROWN: 1,
});

export const DODONGO_STATE = Object.freeze({
  MOVE: 0,
  BLOATED: 1,
  STUNNED: 2,
});

/** DodongoBloatedWaitTimes — substates 0 / 1 / 2. */
const DODONGO_BLOATED_WAIT = Object.freeze([0x20, 0x40, 0x40]);

/**
 * Bloated substates (Dodongo_ObjBloatedSubstate):
 * 0 walk-wait, 1 swell sprites, 2 fade-wait (lethal only), 3 die, 4 end→move.
 */
export const DODONGO_BLOATED_SUB = Object.freeze({
  WAIT0: 0,
  SWELL: 1,
  FADE: 2,
  DIE: 3,
  END: 4,
});

/**
 * Initialize boss-specific fields on create.
 * @param {import('./enemies.js').Enemy} e
 */
export function initBossAi(e) {
  if (!e) return;
  const t = e.objType;
  if (isGohma(t)) {
    e.eyeState = GOHMA_EYE.CLOSED;
    e.eyeTimer = 0x40;
    e.sprintLeft = 0x20;
    e.y = e.y || 0x70;
    e.x = e.x || 0x80;
  } else if (isDodongo(t)) {
    e.bossState = DODONGO_STATE.MOVE;
    e.bombsEaten = 0;
    e.bloatedSubstate = 0;
    // InitDodongo: random left/right; room-default ObjQSpeedFrac $20.
    e.dir = (e.id & 1) === 0 ? DIR.RIGHT : DIR.LEFT;
    e.qSpeedFrac = 0x20;
    e.walkQSpeedFrac = 0x20;
    e.posFrac = 0;
    e.qSpeed = 0;
    e.turnRate = 0x20;
    e.turnTimer = 0;
    e.gridOffset = 0;
  } else if (t === BOSS.DIGDOGGER || t === BOSS.DIGDOGGER_1) {
    e.digBig = true;
    e.fluteSplit = false;
  } else if (t === BOSS.GANON) {
    e.ganonPhase = GANON_PHASE.BLUE;
    e.hp = Math.max(e.hp, 0xf0);
    e.brownTimer = 0;
    e.ganonVisTimer = 0;
  } else if (t === BOSS.AQUAMENTUS) {
    e.x = Math.max(0x88, Math.min(0xc7, e.x));
  } else if (t === BOSS.MANHANDLA) {
    e.mouthHp = [0x40, 0x40, 0x40, 0x40];
    e.speedWhole = 0;
    e.speedFrac = 0x80;
    e.dir = DIRS8[(e.id ?? 0) & 7];
    e.hp = 0x100; // body proxy; mouths gate death
  } else if (isGleeok(t)) {
    initGleeok(e);
  } else if (isPatra(t)) {
    e.x = 0x80;
    e.y = 0x70;
    e.dir = DIR.UP;
    e.hp = 0xb0;
    e.patraReady = false;
    e.flyerState = 2;
  } else if (t === BOSS.GLEEOK_HEAD) {
    e.immortal = true;
    e.flyerState = 2;
    e.hp = 0xff;
  } else if (isPatraChild(t)) {
    e.orbitAngle = 0;
    e.orbitRadius = t === PATRA_CHILD_RED ? 0x18 : 0x2c;
    e.hp = 0x60;
  }
}

/**
 * @param {import('./enemies.js').Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {{ chase?: { x: number, y: number } | null, fluteJustUsed?: boolean, onDigdoggerSplit?: Function }} [opts]
 */
export function stepBossAi(e, bounds, opts = {}) {
  const t = e.objType;
  if (t === BOSS.AQUAMENTUS) {
    stepAquamentus(e, bounds);
    return;
  }
  if (isGohma(t)) {
    stepGohma(e, bounds);
    return;
  }
  if (isDodongo(t)) {
    stepDodongo(e, bounds, opts);
    return;
  }
  if (t === BOSS.DIGDOGGER || t === BOSS.DIGDOGGER_1) {
    stepDigdogger(e, bounds, opts);
    return;
  }
  if (t === BOSS.GANON) {
    stepGanon(e, bounds);
    return;
  }
  if (t === BOSS.MANHANDLA) {
    stepManhandla(e, bounds, opts);
    return;
  }
  if (isGleeok(t)) {
    stepGleeok(e, bounds, e.anim ?? 0);
    return;
  }
  if (t === BOSS.GLEEOK_HEAD) {
    stepGleeokHead(e, bounds, opts.chase ?? null);
    return;
  }
  if (isPatra(t)) {
    stepPatraParent(e, bounds, opts.chase ?? null);
    return;
  }
  if (isPatraChild(t)) {
    stepPatraChild(e, bounds, opts);
    return;
  }
  stepBoss(e, bounds);
}

function stepManhandla(e, bounds, opts) {
  e.timer = (e.timer ?? 0) - 1;
  if (e.timer <= 0) {
    e.timer = 0x10;
    // 50% turn toward Link, else random 8-way.
    if (opts.chase && ((e.anim + e.id) & 1) === 0) {
      const dx = opts.chase.x - e.x;
      const dy = opts.chase.y - e.y;
      let d = 0;
      if (Math.abs(dx) > 4) d |= dx > 0 ? DIR.RIGHT : DIR.LEFT;
      if (Math.abs(dy) > 4) d |= dy > 0 ? DIR.DOWN : DIR.UP;
      e.dir = d || DIRS8[e.anim & 7];
    } else {
      e.dir = DIRS8[(e.anim + e.id) & 7];
    }
  }
  // Fractional speed: whole + frac/256 px roughly via anim cadence.
  const pace = Math.max(1, (e.speedWhole ?? 0) + 1);
  if ((e.anim & 1) === 0) {
    for (let i = 0; i < pace; i += 1) {
      if (e.dir & DIR.LEFT) e.x -= 1;
      if (e.dir & DIR.RIGHT) e.x += 1;
      if (e.dir & DIR.UP) e.y -= 1;
      if (e.dir & DIR.DOWN) e.y += 1;
    }
  }
  if (e.x < bounds.minX + 16) e.dir = (e.dir & ~DIR.LEFT) | DIR.RIGHT;
  if (e.x > bounds.maxX - 32) e.dir = (e.dir & ~DIR.RIGHT) | DIR.LEFT;
  if (e.y < bounds.minY + 16) e.dir = (e.dir & ~DIR.UP) | DIR.DOWN;
  if (e.y > bounds.maxY - 32) e.dir = (e.dir & ~DIR.DOWN) | DIR.UP;
  e.x = Math.max(bounds.minX, Math.min(bounds.maxX - 16, e.x));
  e.y = Math.max(bounds.minY, Math.min(bounds.maxY - 16, e.y));
}

function stepGleeokHead(e, bounds, chase) {
  if (e.timer <= 0) {
    e.timer = 20;
    if (chase && ((e.anim + e.id) & 3) !== 0) {
      const dx = chase.x - e.x;
      const dy = chase.y - e.y;
      e.dir = 0;
      if (Math.abs(dx) > Math.abs(dy)) e.dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
      else e.dir = dy > 0 ? DIR.DOWN : DIR.UP;
    } else {
      e.dir = DIRS8[(e.anim + e.id) & 7];
    }
  }
  if ((e.anim & 1) === 0) {
    if (e.dir & DIR.LEFT) e.x -= 1;
    if (e.dir & DIR.RIGHT) e.x += 1;
    if (e.dir & DIR.UP) e.y -= 1;
    if (e.dir & DIR.DOWN) e.y += 1;
  }
  e.x = Math.max(bounds.minX, Math.min(bounds.maxX - 16, e.x));
  e.y = Math.max(bounds.minY, Math.min(bounds.maxY - 16, e.y));
}

function stepPatraParent(e, bounds, chase) {
  // Flyer-ish chase/wander.
  if (e.timer <= 0) {
    e.timer = 28;
    if (chase && ((e.anim + e.id) & 3) !== 0) {
      const dx = chase.x - e.x;
      const dy = chase.y - e.y;
      e.dir = 0;
      if (Math.abs(dx) > 2) e.dir |= dx > 0 ? DIR.RIGHT : DIR.LEFT;
      if (Math.abs(dy) > 2) e.dir |= dy > 0 ? DIR.DOWN : DIR.UP;
      if (!e.dir) e.dir = DIR.UP;
    } else {
      e.dir = DIRS8[(e.anim + e.id) & 7];
    }
  }
  e.lastDx = 0;
  e.lastDy = 0;
  if ((e.anim & 1) === 0) {
    const ox = e.x;
    const oy = e.y;
    if (e.dir & DIR.LEFT) e.x -= 1;
    if (e.dir & DIR.RIGHT) e.x += 1;
    if (e.dir & DIR.UP) e.y -= 1;
    if (e.dir & DIR.DOWN) e.y += 1;
    e.x = Math.max(bounds.minX + 24, Math.min(bounds.maxX - 24, e.x));
    e.y = Math.max(bounds.minY + 16, Math.min(bounds.maxY - 24, e.y));
    e.lastDx = e.x - ox;
    e.lastDy = e.y - oy;
  }
}

function stepPatraChild(e, _bounds, opts) {
  const parent = opts.patraParent;
  if (!parent?.alive) {
    e.alive = false;
    return;
  }
  // Inherit parent travel, then orbit.
  e.x = (e.x ?? 0) + (parent.lastDx ?? 0);
  e.y = (e.y ?? 0) + (parent.lastDy ?? 0);
  const step = e.objType === PATRA_CHILD_RED ? 0x60 : 0x70;
  e.orbitAngle = ((e.orbitAngle ?? 0) + step) & 0xffff;
  // Approximate rotate with 32-step circle using high bits of angle.
  const idx = (e.orbitAngle >> 11) & 31;
  const rad = e.orbitRadius ?? 0x2c;
  const cos = Math.cos((idx / 32) * Math.PI * 2);
  const sin = Math.sin((idx / 32) * Math.PI * 2);
  e.x = parent.x + Math.round(cos * rad);
  e.y = parent.y + Math.round(sin * rad);
}

function stepAquamentus(e, bounds) {
  if (e.timer <= 0) {
    e.dir = e.dir & DIR.LEFT ? DIR.RIGHT : DIR.LEFT;
    e.timer = 40;
  }
  // Aquamentus_Move: one px every 8 frames within $88–$C7.
  if ((e.anim & 7) === 0) {
    if (e.dir & DIR.LEFT) e.x -= 1;
    if (e.dir & DIR.RIGHT) e.x += 1;
  }
  if (e.x < 0x88) e.dir = DIR.RIGHT;
  if (e.x > 0xc7) e.dir = DIR.LEFT;
  e.x = Math.max(0x88, Math.min(0xc7, e.x));
  e.y = Math.max(bounds.minY, Math.min(bounds.maxY - 16, e.y));
}

function stepGohma(e, bounds) {
  e.eyeTimer = (e.eyeTimer ?? 0) - 1;
  if (e.eyeTimer <= 0) {
    if (e.eyeState === GOHMA_EYE.CLOSED) {
      e.eyeState = GOHMA_EYE.OPENING;
      e.eyeTimer = 0x20;
    } else if (e.eyeState === GOHMA_EYE.OPENING) {
      e.eyeState = GOHMA_EYE.OPEN;
      e.eyeTimer = 0x60; // open window ~$10–$70
    } else {
      e.eyeState = GOHMA_EYE.CLOSED;
      e.eyeTimer = 0xc0;
    }
  }

  e.sprintLeft = (e.sprintLeft ?? 0x20) - 1;
  if (e.sprintLeft <= 0) {
    e.dir = e.dir & DIR.LEFT ? DIR.RIGHT : DIR.LEFT;
    e.sprintLeft = 0x20;
  }
  if ((e.anim & 1) === 0) {
    if (e.dir & DIR.LEFT) e.x -= 1;
    if (e.dir & DIR.RIGHT) e.x += 1;
  }
  if (e.x < bounds.minX + 32) e.dir = DIR.RIGHT;
  if (e.x > bounds.maxX - 32) e.dir = DIR.LEFT;
  e.x = Math.max(bounds.minX, Math.min(bounds.maxX - 16, e.x));
}

/**
 * UpdateDodongoState0_Move — Wanderer_TargetPlayer + Walker_Move at ~½ px/frame.
 * Long body: when not facing left, temporarily shift X by $10 for collision.
 * @param {import('./enemies.js').Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {{
 *   chase?: { x: number, y: number } | null,
 *   moveEnemy?: (speed: number) => void,
 * }} [opts]
 */
function stepDodongo(e, bounds, opts = {}) {
  const st = e.bossState ?? DODONGO_STATE.MOVE;
  if (st === DODONGO_STATE.BLOATED) {
    stepDodongoBloated(e);
    return;
  }
  if (st === DODONGO_STATE.STUNNED) {
    if (e.timer <= 0) {
      e.bossState = DODONGO_STATE.MOVE;
      e.bloatedSubstate = 0;
      e.timer = 30;
    }
    return;
  }

  e.turnRate = 0x20;
  // NES: if facing ≠ left, X += $10 for the move, then restore.
  const bodyShift = e.dir & DIR.LEFT ? 0 : 0x10;
  if (bodyShift) e.x += bodyShift;

  if (onTileBoundary(e)) {
    const rnd = () => (e.anim + e.id * 17 + (e.turnTimer ?? 0)) & 0xff;
    wandererDecideFacing(e, opts.chase ?? null, rnd);
  }

  // ObjQSpeedFrac $20 via MoveObject (0.5 px/frame average).
  e.qSpeedFrac = e.qSpeedFrac ?? 0x20;
  const pixels = consumeQSpeedPixels(e);
  if (pixels > 0) {
    if (typeof opts.moveEnemy === 'function') {
      opts.moveEnemy(pixels);
    } else {
      if (e.dir & DIR.LEFT) e.x -= pixels;
      if (e.dir & DIR.RIGHT) e.x += pixels;
      if (e.dir & DIR.UP) e.y -= pixels;
      if (e.dir & DIR.DOWN) e.y += pixels;
      e.x = Math.max(bounds.minX, Math.min(bounds.maxX - 16, e.x));
      e.y = Math.max(bounds.minY, Math.min(bounds.maxY - 16, e.y));
      e.gridOffset = ((e.gridOffset ?? 0) + pixels) & 0xff;
    }
  }

  if (bodyShift) e.x -= bodyShift;

  // If X < $20, face right (NES).
  if (e.x < 0x20) e.dir = DIR.RIGHT;
  // Keep the long body inside the room when facing right.
  if (e.dir & DIR.RIGHT) {
    e.x = Math.min(e.x, bounds.maxX - 32);
  }
  e.x = Math.max(bounds.minX, Math.min(bounds.maxX - 16, e.x));
  e.y = Math.max(bounds.minY, Math.min(bounds.maxY - 16, e.y));
}

/**
 * UpdateDodongoState1_Bloated — wait → swell → (fade+die | resume).
 * @param {import('./enemies.js').Enemy} e
 */
function stepDodongoBloated(e) {
  const sub = e.bloatedSubstate ?? 0;
  if (sub === DODONGO_BLOATED_SUB.DIE) {
    e.alive = false;
    e.hp = 0;
    return;
  }
  if (sub === DODONGO_BLOATED_SUB.END) {
    e.bossState = DODONGO_STATE.MOVE;
    e.bloatedSubstate = 0;
    e.timer = 40;
    return;
  }
  if (e.timer > 0) return;

  // Timer expired: advance substate (DodongoBloatedWaitTimes pacing).
  let next = sub + 1;
  if (next >= DODONGO_BLOATED_SUB.FADE && (e.bombsEaten ?? 0) < 2) {
    // Non-lethal swallow: skip fade/die and return to walking.
    next = DODONGO_BLOATED_SUB.END;
  }
  e.bloatedSubstate = next;
  if (next === DODONGO_BLOATED_SUB.DIE || next === DODONGO_BLOATED_SUB.END) {
    // Act on the next frame (die / resume).
    e.timer = 0;
    return;
  }
  e.timer = DODONGO_BLOATED_WAIT[next] ?? 0x40;
}

/**
 * Dodongo draw gate for bloated fade (substates 2–3): skip every other pair of frames.
 * Collisions still run — same idea as ganonIsVisible.
 * @param {import('./enemies.js').Enemy} e
 */
export function dodongoIsVisible(e) {
  if (!isDodongo(e.objType)) return true;
  if ((e.bossState ?? 0) !== DODONGO_STATE.BLOATED) return true;
  const sub = e.bloatedSubstate ?? 0;
  if (sub !== DODONGO_BLOATED_SUB.FADE && sub !== DODONGO_BLOATED_SUB.DIE) return true;
  return ((e.anim ?? 0) & 2) !== 0;
}

/**
 * True while Dodongo should use bloated (swell) CHR instead of walk frames.
 * @param {import('./enemies.js').Enemy} e
 */
export function dodongoIsSwelling(e) {
  return (
    isDodongo(e.objType)
    && (e.bossState ?? 0) === DODONGO_STATE.BLOATED
    && (e.bloatedSubstate ?? 0) === DODONGO_BLOATED_SUB.SWELL
  );
}

function stepDigdogger(e, bounds, opts) {
  if (e.digBig && opts.fluteJustUsed && !e.fluteSplit) {
    e.fluteSplit = true;
    e.alive = false;
    e.hp = 0;
    if (typeof opts.onDigdoggerSplit === 'function') {
      opts.onDigdoggerSplit(e);
    }
    return;
  }
  // Big form / children: 8-way-ish pace.
  if (e.timer <= 0) {
    const dirs = [DIR.LEFT, DIR.RIGHT, DIR.UP, DIR.DOWN];
    e.dir = dirs[(e.anim + e.id) & 3];
    e.timer = 24;
  }
  if ((e.anim & 1) === 0) {
    if (e.dir & DIR.LEFT) e.x -= 1;
    if (e.dir & DIR.RIGHT) e.x += 1;
    if (e.dir & DIR.UP) e.y -= 1;
    if (e.dir & DIR.DOWN) e.y += 1;
  }
  e.x = Math.max(bounds.minX, Math.min(bounds.maxX - 16, e.x));
  e.y = Math.max(bounds.minY, Math.min(bounds.maxY - 16, e.y));
}

/** `Ganon_RandomizeLocation` — Y = $A0, X from `GanonStartXs`. */
export const GANON_START_XS = Object.freeze([0x30, 0xb0]);

/** Frames Ganon stays visible after a sword hit (`Ganon_CheckCollisions`). */
export const GANON_HIT_VISIBLE_FRAMES = 0x40;

/** Below this brown-phase timer Ganon flickers instead of staying opaque. */
export const GANON_BROWN_FLICKER_TIMER = 0x18;

/**
 * `Ganon_RandomizeLocation`.
 * @param {import('./enemies.js').Enemy} e
 */
export function ganonRandomizeLocation(e) {
  e.y = 0xa0;
  e.x = GANON_START_XS[(e.anim ?? 0) & 1];
}

/**
 * `Ganon_CheckCollisions` @CheckHarmed — a sword hit makes blue Ganon appear
 * for $40 frames. He is only harmable while that timer is 0.
 * @param {import('./enemies.js').Enemy} e
 */
export function ganonRegisterSwordHit(e) {
  if (e.objType !== BOSS.GANON || e.ganonPhase === GANON_PHASE.BROWN) return;
  e.ganonVisTimer = GANON_HIT_VISIBLE_FRAMES;
}

/**
 * `Ganon_ScenePhase2` blue Ganon can only be hurt while invisible; once a hit
 * lands he is drawn (and invulnerable) until the timer runs out.
 * @param {import('./enemies.js').Enemy} e
 */
export function ganonAcceptsSwordHit(e) {
  if (e.objType !== BOSS.GANON) return true;
  if (e.ganonPhase === GANON_PHASE.BROWN) return false;
  return (e.ganonVisTimer ?? 0) === 0;
}

/**
 * Ganon's draw rule (`Ganon_ScenePhase2` / `Ganon_UpdateBrownState`).
 *
 * Blue Ganon runs `Ganon_MoveAndShoot`, which never draws, so he is invisible
 * except for the $40 frames after a sword hit. Brown Ganon is opaque while his
 * state is high and flickers on alternate frames as it drains.
 * @param {import('./enemies.js').Enemy} e
 */
export function ganonIsVisible(e) {
  if (e.ganonPhase === GANON_PHASE.BROWN) {
    if ((e.brownTimer ?? 0) >= GANON_BROWN_FLICKER_TIMER) return true;
    return ((e.anim ?? 0) & 1) === 1;
  }
  return (e.ganonVisTimer ?? 0) > 1;
}

function stepGanon(e, bounds) {
  if (e.ganonPhase === GANON_PHASE.BROWN) {
    // Stay brown while timer > 0 (tick here; not using ObjTimer).
    e.brownTimer = (e.brownTimer ?? 0x40) - 1;
    if (e.brownTimer <= 0) {
      e.ganonPhase = GANON_PHASE.BLUE;
      e.hp = 0xf0;
      e.ganonVisTimer = 0;
      ganonRandomizeLocation(e);
    }
    return; // brown: stationary target for silver arrow
  }

  // Visible window after a hit: at 1 he relocates for the next invisible run.
  const vis = e.ganonVisTimer ?? 0;
  if (vis > 0) {
    e.ganonVisTimer = vis - 1;
    if (vis === 1) ganonRandomizeLocation(e);
    return;
  }

  // Blue: wizzrobe-like hop pace.
  if (e.timer <= 0) {
    e.dir = e.dir & DIR.LEFT ? DIR.RIGHT : DIR.LEFT;
    e.timer = 28;
    e.y = Math.max(bounds.minY, Math.min(bounds.maxY - 32, e.y + ((e.anim & 2) ? 8 : -8)));
  }
  if ((e.anim & 1) === 0) {
    if (e.dir & DIR.LEFT) e.x -= 1;
    if (e.dir & DIR.RIGHT) e.x += 1;
  }
  if (e.x < bounds.minX + 16) e.dir = DIR.RIGHT;
  if (e.x > bounds.maxX - 32) e.dir = DIR.LEFT;
}

/**
 * Gohma: arrow only when eye fully open and shot from below (NES: facing up into eye).
 * @param {import('./enemies.js').Enemy} e
 * @param {{ dir: number }} arrow
 */
export function gohmaEyeVulnerable(e, arrow) {
  if (!isGohma(e.objType)) return true;
  if ((e.eyeState ?? 0) !== GOHMA_EYE.OPEN) return false;
  // NES: arrow direction must be UP ($08).
  return Boolean(arrow.dir & DIR.UP);
}

/**
 * Dodongo swallows a lit bomb near its mouth (fuse state $12) → bloated; 2 swallows kill.
 * @param {import('./enemies.js').Enemy} e
 * @param {{ x: number, y: number, phase?: string, eaten?: boolean }} bomb
 */
export function tryDodongoEatBomb(e, bomb) {
  if (!isDodongo(e.objType) || !e.alive) return false;
  if ((e.bossState ?? 0) !== DODONGO_STATE.MOVE) return false;
  if (bomb.phase !== 'fuse' || bomb.eaten) return false;
  const dx = Math.abs((bomb.x ?? 0) - e.x);
  const dy = Math.abs((bomb.y ?? 0) - (e.y + 8));
  if (dx > 20 || dy > 16) return false;
  bomb.eaten = true;
  bomb.phase = 'done';
  bomb.timer = 0;
  e.bombsEaten = (e.bombsEaten ?? 0) + 1;
  e.bossState = DODONGO_STATE.BLOATED;
  e.bloatedSubstate = DODONGO_BLOATED_SUB.WAIT0;
  e.timer = DODONGO_BLOATED_WAIT[0];
  return true;
}

/**
 * Explosion dust near Dodongo → stunned (sword-vulnerable briefly).
 * @param {import('./enemies.js').Enemy} e
 * @param {{ x: number, y: number, phase?: string }} bomb
 */
export function tryDodongoStunBomb(e, bomb) {
  if (!isDodongo(e.objType) || !e.alive) return false;
  if ((e.bossState ?? 0) !== DODONGO_STATE.MOVE) return false;
  if (bomb.phase !== 'explode') return false;
  const dx = Math.abs((bomb.x ?? 0) - e.x);
  const dy = Math.abs((bomb.y ?? 0) - (e.y + 8));
  if (dx > 24 || dy > 20) return false;
  e.bossState = DODONGO_STATE.STUNNED;
  e.timer = 0x40;
  return true;
}

/**
 * Per-frame Dodongo ↔ bomb (fuse eat or explode stun).
 * @param {import('./enemies.js').Enemy} e
 * @param {{ x: number, y: number, phase?: string, eaten?: boolean }} bomb
 */
export function tryDodongoBombInteract(e, bomb) {
  if (tryDodongoEatBomb(e, bomb)) return true;
  return tryDodongoStunBomb(e, bomb);
}

/**
 * Sword hit on Ganon in blue: when HP depleted → brown phase (not dead).
 * @param {import('./enemies.js').Enemy} e
 * @returns {boolean} true if hit was absorbed into brown transition
 */
export function ganonSwordKoToBrown(e) {
  if (e.objType !== BOSS.GANON || e.ganonPhase === GANON_PHASE.BROWN) return false;
  if (e.hp > 0) return false;
  e.hp = 0xf0;
  e.alive = true;
  e.ganonPhase = GANON_PHASE.BROWN;
  e.brownTimer = 0x40;
  return true;
}

export { CHILD_DIGDOGGER, PATRA_CHILD, PATRA_CHILD_RED };

/**
 * @param {import('./enemies.js').Enemy} parent
 * @param {(spawn: object) => import('./enemies.js').Enemy | null} createEnemy
 * @returns {import('./enemies.js').Enemy[]}
 */
export function spawnDigdoggerChildren(parent, createEnemy) {
  const n = parent.objType === BOSS.DIGDOGGER_1 ? 1 : 3;
  /** @type {import('./enemies.js').Enemy[]} */
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const c = createEnemy({
      objType: CHILD_DIGDOGGER,
      x: parent.x + (i - 1) * 12,
      y: parent.y + 8,
      slotIndex: parent.slotIndex,
    });
    if (c) {
      c.digBig = false;
      out.push(c);
    }
  }
  return out;
}

/**
 * Damage one Manhandla mouth; accelerate; die when all mouths gone.
 * @param {import('./enemies.js').Enemy} e
 * @param {number} dmg
 */
export function damageManhandla(e, dmg) {
  if (e.objType !== BOSS.MANHANDLA || !e.alive) return false;
  const mouths = e.mouthHp ?? [0x40, 0x40, 0x40, 0x40];
  const i = mouths.findIndex((h) => h > 0);
  if (i < 0) {
    e.alive = false;
    e.hp = 0;
    return true;
  }
  mouths[i] = Math.max(0, mouths[i] - dmg);
  e.mouthHp = mouths;
  if (mouths[i] <= 0) {
    e.speedFrac = (e.speedFrac ?? 0x80) + 0x80;
    if (e.speedFrac > 0xff) {
      e.speedFrac &= 0xff;
      e.speedWhole = (e.speedWhole ?? 0) + 1;
    }
  }
  if (mouths.every((h) => h <= 0)) {
    e.alive = false;
    e.hp = 0;
  }
  return true;
}

/**
 * Damage one Gleeok head; may spawn a flying head via callback.
 * @param {import('./enemies.js').Enemy} e
 * @param {number} dmg
 * @param {(head: import('./enemies.js').Enemy) => void} [onHeadDetach]
 */
export function damageGleeok(e, dmg, onHeadDetach) {
  if (!isGleeok(e.objType) || !e.alive) return false;
  const heads = e.headHp ?? [];
  const i = heads.findIndex((h) => h > 0);
  if (i < 0) {
    e.alive = false;
    e.hp = 0;
    return true;
  }
  heads[i] = Math.max(0, heads[i] - dmg);
  e.headHp = heads;
  e.hp = heads.reduce((a, b) => a + Math.max(0, b), 0);
  e.writhing = 6;
  e.bodyAnimTimer = 6;
  if (heads[i] <= 0) {
    e.headsAlive = heads.filter((h) => h > 0).length;
    e.detachNeckIndex = i;
    if (typeof onHeadDetach === 'function') onHeadDetach(e);
    if (e.headsAlive <= 0) {
      e.alive = false;
      e.hp = 0;
    }
  }
  return true;
}

/**
 * Parent Patra is invulnerable while any child remains.
 * @param {import('./enemies.js').Enemy} e
 * @param {import('./enemies.js').Enemy[]} enemies
 */
export function patraParentVulnerable(e, enemies) {
  if (!isPatra(e.objType)) return true;
  return !enemies.some((o) => o.alive && isPatraChild(o.objType) && o.patraParentId === e.id);
}

/**
 * Spawn 8 Patra children around parent.
 * @param {import('./enemies.js').Enemy} parent
 * @param {(spawn: object) => import('./enemies.js').Enemy | null} createEnemy
 */
export function spawnPatraChildren(parent, createEnemy) {
  const childType = parent.objType === BOSS.PATRA_RED ? PATRA_CHILD_RED : PATRA_CHILD;
  const radius = childType === PATRA_CHILD_RED ? 0x18 : 0x2c;
  /** @type {import('./enemies.js').Enemy[]} */
  const out = [];
  for (let i = 0; i < 8; i += 1) {
    const ang = (i / 8) * Math.PI * 2;
    const c = createEnemy({
      objType: childType,
      x: parent.x + Math.round(Math.cos(ang) * radius),
      y: parent.y + Math.round(Math.sin(ang) * radius),
      slotIndex: (parent.slotIndex ?? 1) + 1 + i,
    });
    if (c) {
      c.patraParentId = parent.id;
      c.orbitAngle = (i * 0x2000) & 0xffff;
      c.orbitRadius = radius;
      out.push(c);
    }
  }
  parent.patraReady = true;
  return out;
}

/**
 * Flying head at body position when a neck dies.
 * @param {import('./enemies.js').Enemy} body
 * @param {(spawn: object) => import('./enemies.js').Enemy | null} createEnemy
 */
export function spawnGleeokHead(body, createEnemy) {
  const neckIndex = body.detachNeckIndex ?? 0;
  const pos = gleeokHeadPos(body, neckIndex);
  const c = createEnemy({
    objType: BOSS.GLEEOK_HEAD,
    x: pos.x,
    y: pos.y,
    slotIndex: (body.slotIndex ?? 1) + 7,
  });
  if (c) {
    c.immortal = true;
    c.gleeokBodyId = body.id;
  }
  return c;
}

/**
 * After Gleeok body dies, kill immortal flying heads.
 * @param {number} bodyId
 * @param {import('./enemies.js').Enemy[]} enemies
 */
export function clearGleeokHeads(bodyId, enemies) {
  for (const e of enemies) {
    if (e.objType === BOSS.GLEEOK_HEAD && e.gleeokBodyId === bodyId) {
      e.alive = false;
      e.hp = 0;
    }
  }
}

/**
 * Expand bosses that need children at spawn (Patra).
 * @param {import('./enemies.js').Enemy} e
 * @param {(spawn: object) => import('./enemies.js').Enemy | null} createEnemy
 */
export function expandBossFamily(e, createEnemy) {
  if (isPatra(e.objType)) return spawnPatraChildren(e, createEnemy);
  return [];
}
