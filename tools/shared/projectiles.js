import { DIR, dirsAreOpposite } from './collision.js';
import { damageHalfHeartsForType } from './damage.js';
import { OBJ } from './enemies.js';
import { throwEnemyBoomerang } from './boomerang.js';
import {
  FIREBALL_DELAY_FRAMES,
  aimFireball,
  stepFireballAxes,
} from './fireball.js';
import { objectTouchesLink } from './objectCollision.js';
import { rectsOverlap } from './sword.js';
import { isWizzrobeType, wizzrobeShouldShoot } from './wizzrobeAi.js';

export const PROJ = Object.freeze({
  ROCK: 0x53,
  FIREBALL: 0x55,
  FIREBALL_UNBLOCKABLE: 0x56,
  SWORD_SHOT: 0x57,
  MAGIC_SHOT: 0x59,
  ARROW: 0x5b,
  SILVER_ARROW: 0x5c,
});

export const SHIELD_RESULT = Object.freeze({
  HARM: 'harm',
  PARRY: 'parry',
  NONE: 'none',
});

let nextId = 1;

/**
 * @typedef {object} Projectile
 * @property {number} id
 * @property {number} kind
 * @property {number} x
 * @property {number} y
 * @property {number} dir
 * @property {number} speed
 * @property {number} damage
 * @property {number} life
 * @property {number} dy
 * @property {boolean} alive
 * @property {boolean} [bouncing]
 * @property {number} [arrowTier]
 * @property {boolean} [friendly] Link-fired (does not harm Link)
 * @property {boolean} [homing] NES fireball diagonal q-speeds
 * @property {number} [dirX]
 * @property {number} [dirY]
 * @property {number} [qSpeedX]
 * @property {number} [qSpeedY]
 * @property {number} [posFracX]
 * @property {number} [posFracY]
 * @property {number} [delay]
 * @property {number} [spreadDy] Aquamentus fireball vertical displacement
 * @property {number} [spreadAge] frames since launch, for the displacement parity
 */

/**
 * @param {object} opts
 * @returns {Projectile}
 */
export function createProjectile(opts) {
  const kind = opts.kind;
  return {
    id: nextId++,
    kind,
    x: opts.x,
    y: opts.y,
    dir: opts.dir ?? DIR.LEFT,
    speed: opts.speed ?? 2,
    damage: opts.damage ?? damageHalfHeartsForType(kind),
    life: opts.life ?? 180,
    dy: opts.dy ?? 0,
    alive: true,
    bouncing: false,
    arrowTier: opts.arrowTier ?? 0,
    friendly: Boolean(opts.friendly),
    weaponDamage: opts.weaponDamage ?? 0,
    homing: Boolean(opts.homing),
    dirX: opts.dirX ?? 0,
    dirY: opts.dirY ?? 0,
    qSpeedX: opts.qSpeedX ?? 0,
    qSpeedY: opts.qSpeedY ?? 0,
    posFracX: opts.posFracX ?? 0,
    posFracY: opts.posFracY ?? 0,
    delay: opts.delay ?? 0,
  };
}

/**
 * ShootFireball — spawn aimed at target (UpdateFireball state 0).
 * @param {number} kind PROJ.FIREBALL or FIREBALL_UNBLOCKABLE
 * @param {number} ox shooter X
 * @param {number} oy shooter Y
 * @param {number} tx target X
 * @param {number} ty target Y
 * @param {object} [opts]
 */
export function shootFireball(kind, ox, oy, tx, ty, opts = {}) {
  // NES: new object's X = shooter X + 4; Y unchanged.
  const x = (opts.x ?? ox + 4) & 0xff;
  const y = opts.y ?? oy;
  const aim = aimFireball(x, y, tx, ty);
  return createProjectile({
    kind,
    x,
    y,
    dir: aim.dir,
    speed: 0,
    dy: 0,
    life: opts.life ?? 200,
    damage: opts.damage,
    homing: true,
    dirX: aim.dirX,
    dirY: aim.dirY,
    qSpeedX: aim.qSpeedX,
    qSpeedY: aim.qSpeedY,
    delay: opts.delay ?? FIREBALL_DELAY_FRAMES,
  });
}

/**
 * CheckLinkCollision shield rules (wood vs magic).
 * @param {Projectile} p
 * @param {{ dir: number }} link
 * @param {{ magicShield?: number }} inv
 * @param {{ idle?: boolean }} [opts] idle = not mid-sword (high nibble)
 */
export function shotBlockedByShield(p, link, inv, opts = {}) {
  if (!p.alive) return SHIELD_RESULT.NONE;
  if (p.kind === PROJ.FIREBALL_UNBLOCKABLE) return SHIELD_RESULT.HARM;
  if (opts.idle === false) return SHIELD_RESULT.HARM;
  if (!dirsAreOpposite(link.dir, p.dir)) return SHIELD_RESULT.HARM;

  // CheckLinkCollision: types $55–$59 (fireball / sword beam / magic) need
  // the magical shield. Everything else facing the shield — rocks, booms,
  // arrows $5B/$5C — the wood shield parries.
  if (p.kind >= PROJ.FIREBALL && p.kind < 0x5a) {
    return inv.magicShield ? SHIELD_RESULT.PARRY : SHIELD_RESULT.HARM;
  }
  return SHIELD_RESULT.PARRY;
}

/**
 * @param {Projectile} p
 */
export function bounceProjectile(p) {
  p.bouncing = true;
  p.dir =
    p.dir & DIR.UP
      ? DIR.DOWN
      : p.dir & DIR.DOWN
        ? DIR.UP
        : p.dir & DIR.LEFT
          ? DIR.RIGHT
          : DIR.LEFT;
  p.dy = -p.dy;
  p.life = Math.min(p.life, 24);
  p.damage = 0;
}

/**
 * @param {import('./enemies.js').Enemy} e
 * @param {Projectile[]} out
 */
function pushShot(out, kind, e, opts = {}) {
  out.push(
    createProjectile({
      kind,
      x: e.x + 4,
      y: e.y + 4,
      dir: e.dir,
      speed: opts.speed ?? 2,
      life: opts.life ?? 180,
      dy: opts.dy ?? 0,
      damage: opts.damage,
    }),
  );
}

/**
 * `Aquamentus_ObjFireballOffset` values for the three shots. Each fireball is
 * aimed at Link by `ShootFireball`; the offsets then pull them apart vertically.
 */
export const AQUAMENTUS_FIREBALL_OFFSETS = Object.freeze([0, 1, -1]);

/**
 * `Aquamentus_Shoot` — three fireballs, all aimed at Link from the same spot,
 * each tagged with the vertical displacement that makes the trio fan out.
 * @param {import('./enemies.js').Enemy} e
 * @param {{ x: number, y: number } | null | undefined} target
 * @returns {Projectile[]}
 */
export function shootAquamentusFireballs(e, target) {
  const tx = target?.x ?? e.x - 0x40;
  const ty = target?.y ?? e.y;
  return AQUAMENTUS_FIREBALL_OFFSETS.map((spreadDy) => {
    const p = shootFireball(PROJ.FIREBALL, e.x, e.y + 8, tx, ty);
    p.spreadDy = spreadDy;
    p.spreadAge = 0;
    return p;
  });
}

/**
 * NES types that always enter _TryShootingNow (no Random >= $F8 gate):
 * $01 Lynel, $03 Moblin, $09/$0A blue octoroks.
 * @param {number} objType
 */
export function alwaysTriesShooting(objType) {
  return (
    objType === OBJ.RED_LYNEL
    || objType === OBJ.RED_MOBLIN
    || objType === OBJ.BLUE_OCTOROK_SLOW
    || objType === OBJ.BLUE_OCTOROK_FAST
  );
}

/**
 * NES _TryShooting — wind-up ($30), freeze while charging, fire at $10.
 * Used by Lynel (sword), Moblin (arrow), Octorok (rock).
 *
 * @param {import('./enemies.js').Enemy} e
 * @param {Projectile[]} out
 * @param {number} shotKind
 * @param {object} [opts]
 * @param {number} [opts.speed]
 * @param {() => number} [opts.rngByte]
 * @returns {boolean} true if this enemy type was handled
 */
export function tryCardinalShot(e, out, shotKind, opts = {}) {
  // Prefer ROM ObjQSpeedFrac; keep legacy whole-px walkSpeed for older callers.
  const walkFrac =
    e.walkQSpeedFrac ?? e.qSpeedFrac ?? (e.walkSpeed != null ? undefined : 0x20);
  const walkSpeed = e.walkSpeed ?? e.qSpeed ?? 1;
  if (e.walkSpeed == null && walkFrac == null) e.walkSpeed = walkSpeed;
  if (e.walkQSpeedFrac == null && walkFrac != null) e.walkQSpeedFrac = walkFrac;

  const rngByte = opts.rngByte ?? (() => (e.anim + e.id * 17) & 0xff);
  const shootTimer = e.shootTimer ?? 0;

  const restoreWalk = () => {
    if (e.walkQSpeedFrac != null) e.qSpeedFrac = e.walkQSpeedFrac;
    e.qSpeed = walkSpeed;
  };

  // Non-always types with timer 0 only start a sequence when Random >= $F8.
  if (!alwaysTriesShooting(e.objType) && shootTimer === 0) {
    if ((rngByte() & 0xff) < 0xf8) {
      restoreWalk();
      return true;
    }
  }

  let next = shootTimer;
  if ((e.invuln ?? 0) > 0) {
    next = 0;
  } else if (shootTimer > 0) {
    next = shootTimer - 1;
  } else if (e.wantsToShoot) {
    next = 0x30;
  }

  e.shootTimer = next;

  if (next === 0) {
    restoreWalk();
    return true;
  }

  // Charging / firing: freeze in place (ObjQSpeedFrac := 0).
  e.qSpeedFrac = 0;
  e.qSpeed = 0;

  if (next === 0x10 && e.wantsToShoot) {
    pushShot(out, shotKind, e, { speed: opts.speed ?? 2 });
    e.wantsToShoot = false;
    // Timer stays at $10 and counts down — freeze until 0 (NES _TryShooting).
  }
  return true;
}

/**
 * @param {import('./enemies.js').Enemy} e
 * @param {Projectile[]} out
 * @param {import('./boomerang.js').Boomerang[]} [boomOut] Goriya throws land here
 * @param {{ target?: { x: number, y: number } | null, rngByte?: () => number }} [opts]
 * @returns {string | null} SFX name when a cue should fire (Wizzrobe magic only)
 */
export function tryEnemyShoot(e, out, boomOut, opts = {}) {
  if (!e.alive || e.edgePending || (e.stunTimer ?? 0) > 0) return null;
  if (e.armosStatue) return null;
  if (e.objType === OBJ.ZORA && (e.zoraState ?? 0) !== 3) return null;

  const target = opts.target ?? null;

  if (
    e.objType === OBJ.RED_OCTOROK_SLOW
    || e.objType === OBJ.RED_OCTOROK_FAST
    || e.objType === OBJ.BLUE_OCTOROK_SLOW
    || e.objType === OBJ.BLUE_OCTOROK_FAST
  ) {
    tryCardinalShot(e, out, PROJ.ROCK, { speed: 2, rngByte: opts.rngByte });
    return null;
  }

  if (e.objType === OBJ.RED_MOBLIN || e.objType === OBJ.BLUE_MOBLIN) {
    tryCardinalShot(e, out, PROJ.ARROW, { speed: 3, rngByte: opts.rngByte });
    return null;
  }

  if (e.objType === OBJ.RED_LYNEL || e.objType === OBJ.BLUE_LYNEL) {
    tryCardinalShot(e, out, PROJ.SWORD_SHOT, { speed: 3, rngByte: opts.rngByte });
    return null;
  }

  e.shootTimer = (e.shootTimer ?? 0) - 1;

  if (e.objType === OBJ.RED_GORIYA || e.objType === OBJ.BLUE_GORIYA) {
    // NES $05 (our RED) always checks; $06 (our BLUE) needs Random $23/$77.
    if (e.shootTimer > 0) return null;
    if (!e.wantsToShoot) return null;
    const roll = (opts.rngByte?.() ?? (e.anim + e.id * 19)) & 0xff;
    if (e.objType === OBJ.BLUE_GORIYA && roll !== 0x23 && roll !== 0x77) return null;
    e.shootTimer = 0x40;
    e.wantsToShoot = false;
    if (boomOut) {
      boomOut.push(throwEnemyBoomerang(e.x, e.y, e.dir, e.id));
    } else {
      pushShot(out, PROJ.ROCK, e, { speed: 2, damage: 1 });
    }
    return null;
  }

  if (e.objType === OBJ.ZORA) {
    if (e.shootTimer > 0) return null;
    // NES: one shot at state 3 / timer $FD; then ObjTimer := $20 (burrower).
    e.shootTimer = 0xff;
    const tx = target?.x ?? e.x;
    const ty = target?.y ?? e.y - 0x20;
    out.push(shootFireball(PROJ.FIREBALL, e.x, e.y, tx, ty));
    return null;
  }

  // Wizzrobes fire straight from their own state machines, not a shoot timer:
  // red at ObjState $B0 (UpdateRedWizzrobe_2), blue on the row/column test
  // (BlueWizzrobe_TryShooting). ShootMagicShot → Tune0 `$04`.
  if (isWizzrobeType(e.objType)) {
    if (!wizzrobeShouldShoot(e, target)) return null;
    pushShot(out, PROJ.MAGIC_SHOT, e, { speed: 2 });
    return 'magic_shot';
  }

  if (e.objType === OBJ.AQUAMENTUS) {
    if (e.shootTimer > 0) return null;
    e.shootTimer = 0x70 + (e.anim & 0x1f);
    e.timer = 0x18;
    out.push(...shootAquamentusFireballs(e, target));
    return null;
  }

  // Gohma / Ganon / Manhandla / Gleeok(+head): unblockable fireball `$56`.
  if (
    e.objType === OBJ.GOHMA
    || e.objType === OBJ.GOHMA_RED
    || e.objType === OBJ.GANON
    || e.objType === OBJ.MANHANDLA
    || e.objType === OBJ.GLEEOK_2
    || e.objType === OBJ.GLEEOK_3
    || e.objType === OBJ.GLEEOK_4
    || e.objType === OBJ.GLEEOK_HEAD
  ) {
    if (e.objType === OBJ.GANON && e.ganonPhase === 1) return null; // brown: no shots
    if (e.shootTimer > 0) return null;
    e.shootTimer =
      e.objType === OBJ.MANHANDLA
        ? 0x50
        : e.objType === OBJ.GANON
          ? 0x40
          : 0x41;
    // Manhandla: sparse (~1/8) like NES Random>=$E0.
    if (e.objType === OBJ.MANHANDLA && (e.anim & 0x07) !== 0) return null;
    const tx = target?.x ?? e.x;
    const ty = target?.y ?? e.y - 0x20;
    out.push(shootFireball(PROJ.FIREBALL_UNBLOCKABLE, e.x, e.y, tx, ty));
  }
  return null;
}

/**
 * @param {Projectile} p
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 */
export function stepProjectile(p, bounds) {
  if (!p.alive) return;
  p.life -= 1;
  if (p.life <= 0) {
    p.alive = false;
    return;
  }
  if (p.homing) {
    if ((p.delay ?? 0) > 0) {
      p.delay -= 1;
    } else {
      stepFireballAxes(p, p.dirX ?? 0, p.dirY ?? 0, p.qSpeedX ?? 0, p.qSpeedY ?? 0);
    }
  } else {
    if (p.dir & DIR.RIGHT) p.x += p.speed;
    if (p.dir & DIR.LEFT) p.x -= p.speed;
    if (p.dir & DIR.DOWN) p.y += p.speed;
    if (p.dir & DIR.UP) p.y -= p.speed;
    p.y += p.dy;
  }
  // Aquamentus_Shoot @SpreadOutFireballs: every other frame nudge the shot by
  // its assigned displacement so the trio spreads apart as it crosses the room.
  if (p.spreadDy) {
    p.spreadAge = (p.spreadAge ?? 0) + 1;
    if ((p.spreadAge & 1) === 0) p.y += p.spreadDy;
  }
  if (p.x < bounds.minX - 16 || p.x > bounds.maxX + 16 || p.y < bounds.minY - 16 || p.y > bounds.maxY + 16) {
    p.alive = false;
  }
}

/**
 * @param {Projectile} p
 * @param {number} linkX
 * @param {number} linkY
 */
export function projectileTouchesLink(p, linkX, linkY) {
  if (!p.alive || p.bouncing || p.friendly) return false;
  // Shots use the same CheckLinkCollision path; thin sprites → half-width center.
  return objectTouchesLink(p.x, p.y, linkX, linkY, { halfWidth: true });
}

/**
 * Fire a bow arrow from Link.
 * @param {number} linkX
 * @param {number} linkY
 * @param {number} dir
 * @param {number} arrowTier 1 wood / 2 silver
 */
export function shootArrow(linkX, linkY, dir, arrowTier = 1) {
  return createProjectile({
    kind: arrowTier >= 2 ? PROJ.SILVER_ARROW : PROJ.ARROW,
    x: linkX + 4,
    y: linkY + 6,
    dir,
    speed: 4,
    damage: 0,
    life: 90,
    arrowTier,
    friendly: true,
  });
}

/** Link sword beam ($57) — full hearts only. Q-speed ~$C0. */
export function shootSwordBeam(linkX, linkY, dir, swordTier = 1) {
  const dmg = swordTier >= 3 ? 0x40 : swordTier >= 2 ? 0x20 : 0x10;
  return createProjectile({
    kind: PROJ.SWORD_SHOT,
    x: linkX + 4,
    y: linkY + 6,
    dir,
    speed: 3,
    damage: dmg,
    life: 70,
    friendly: true,
    weaponDamage: dmg,
  });
}

/** Magical rod shot ($59) — fixed $20 magic damage. */
export function shootMagicRod(linkX, linkY, dir) {
  return createProjectile({
    kind: PROJ.MAGIC_SHOT,
    x: linkX + 4,
    y: linkY + 6,
    dir,
    speed: 2,
    damage: 0x20,
    life: 80,
    friendly: true,
    weaponDamage: 0x20,
  });
}
