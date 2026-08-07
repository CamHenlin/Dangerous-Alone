/**
 * NES ObjQSpeedFrac values (Z_04 / Z_05 Init*).
 *
 * MoveObject applies the fraction 4× per frame → px/f = qSpeed / $40.
 * Room clear defaults every slot to $20 (0.5 px/f).
 */

/** Room-clear default (Z_05.asm “Set the default speed”). */
export const DEFAULT_OBJ_QSPEED_FRAC = 0x20;

/** Named ROM speeds used by Init and Update routines. */
export const QSPEED = Object.freeze({
  DEFAULT: 0x20, // 0.5 px/f
  ZOL: 0x18, // 0.375
  WALLMASTER: 0x18,
  BLUE_DARKNUT: 0x28, // 0.625
  FAST_OCTOROK: 0x30, // 0.75
  BUBBLE: 0x40, // 1.0
  GEL_ACTIVE: 0x40,
  ROPE_SLOW: 0x20,
  ROPE_RUSH: 0x60, // 1.5
  ARMOS_SLOW: 0x20,
  ARMOS_FAST: 0x60, // 1.5
  TRAP_RUSH: 0x70, // 1.75
  TRAP_RETURN: 0x20,
});

/** BlueLeeverStateQSpeeds / Zora burrower (states 0..5). */
export const BLUE_LEEVER_STATE_QSPEEDS = Object.freeze([
  0x08, 0x0a, 0x10, 0x20, 0x10, 0x0a,
]);

/** RedLeeverStateQSpeeds — only fully emerged state 3 moves. */
export const RED_LEEVER_STATE_QSPEEDS = Object.freeze([
  0x00, 0x00, 0x00, 0x20, 0x00, 0x00,
]);

/**
 * Types that move via Walker_Move / MoveObject (ObjQSpeedFrac).
 * Flyers, jumpers, and most bosses use other systems.
 * @param {number} objType
 */
export function usesObjQSpeed(objType) {
  if (objType >= 0x01 && objType <= 0x0c) return true; // lynel…darknut
  if (objType === 0x0f || objType === 0x10) return true; // leever
  if (objType === 0x11) return true; // zora (BlueLeeverStateQSpeeds)
  if (objType === 0x12 || objType === 0x13) return true; // vire, zol
  if (objType === 0x14 || objType === 0x15) return true; // gel
  if (objType === 0x17) return true; // like-like
  if (objType === 0x1e) return true; // armos (after wake)
  if (objType === 0x21) return true; // ghini
  if (objType === 0x27 || objType === 0x28) return true; // wallmaster, rope
  if (objType === 0x2a) return true; // stalfos
  if (objType >= 0x2b && objType <= 0x2d) return true; // bubble
  if (objType === 0x30) return true; // gibdo
  if (objType === 0x31 || objType === 0x32) return true; // dodongo
  if (objType === 0x49 || objType === 0x4a) return true; // trap generators / traps
  return false;
}

/**
 * Initial ObjQSpeedFrac for a type (Init* or room default).
 * Returns `undefined` when the type does not use ObjQSpeedFrac.
 * @param {number} objType
 * @returns {number | undefined}
 */
export function qSpeedFracForType(objType) {
  if (!usesObjQSpeed(objType)) return undefined;
  // Fast octoroks
  if (objType === 0x08 || objType === 0x0a) return QSPEED.FAST_OCTOROK;
  // Blue darknut
  if (objType === 0x0c) return QSPEED.BLUE_DARKNUT;
  // Zol wander
  if (objType === 0x13) return QSPEED.ZOL;
  // Gel (InitGel → state 2 → $40)
  if (objType === 0x14 || objType === 0x15) return QSPEED.GEL_ACTIVE;
  // Bubbles
  if (objType >= 0x2b && objType <= 0x2d) return QSPEED.BUBBLE;
  // Wallmaster emerge speed (idle until emerge still $18 once active)
  if (objType === 0x27) return QSPEED.WALLMASTER;
  // Traps wait until triggered
  if (objType === 0x49 || objType === 0x4a) return 0;
  // Zora / leevers: state tables override each frame; start at state0 speed
  if (objType === 0x11 || objType === 0x0f) return BLUE_LEEVER_STATE_QSPEEDS[0];
  if (objType === 0x10) return RED_LEEVER_STATE_QSPEEDS[0];
  return DEFAULT_OBJ_QSPEED_FRAC;
}

/**
 * MoveObject: apply ObjQSpeedFrac four times → whole pixels this frame.
 * @param {{ qSpeedFrac?: number, posFrac?: number }} e
 * @returns {number}
 */
export function consumeQSpeedPixels(e) {
  const q = e.qSpeedFrac ?? 0;
  if (q <= 0) return 0;
  let frac = e.posFrac ?? 0;
  let pixels = 0;
  for (let i = 0; i < 4; i += 1) {
    const sum = frac + q;
    frac = sum & 0xff;
    if (sum > 0xff) pixels += 1;
  }
  e.posFrac = frac;
  return pixels;
}

/**
 * Effective average px/frame for a QSpeed value (documentation / tests).
 * @param {number} qSpeedFrac
 */
export function qSpeedToPxPerFrame(qSpeedFrac) {
  return qSpeedFrac / 0x40;
}

/**
 * Armos fade-complete speed: $20 if random < $80, else $60.
 * @param {number} randomByte
 */
export function armosQSpeedFrac(randomByte) {
  return (randomByte & 0xff) < 0x80 ? QSPEED.ARMOS_SLOW : QSPEED.ARMOS_FAST;
}
