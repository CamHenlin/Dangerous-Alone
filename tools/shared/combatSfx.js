/**
 * Combat SFX name helpers — mirrors ROM DealDamage / PlayParryTune /
 * PlayBossHitCryIfNeeded / ShootMagicShot request bits.
 *
 * Cue data lives in assets/schema/audio.json; play sites call these to decide
 * which names to hand to `audio.playSfx`.
 */

/** Weapon helpers return this when a hit connects but deals no damage. */
export const WEAPON_PARRY = 'parry';

/**
 * @typedef {true | false | typeof WEAPON_PARRY} WeaponHitResult
 */

/**
 * SFX names for a weapon-vs-monster result.
 *
 * - `'parry'` → Tune0 `$01` (`shield`) — PlayParryTune
 * - damage / boom stun → Tune0 `$02` (`enemy_die`) — DealDamage
 * - boss that actually took a hit → Sample `$02` (`boss_hit`) — PlayBossHitCryIfNeeded
 *
 * Dodongo bomb eat/stun returns `true` without arming invuln or stunTimer;
 * those are filtered out so they stay silent.
 *
 * @param {WeaponHitResult} result
 * @param {{ alive?: boolean, invuln?: number, stunTimer?: number }} enemy
 * @param {{ isBoss?: boolean }} [opts]
 * @returns {string[]}
 */
export function sfxNamesForWeaponHit(result, enemy, opts = {}) {
  if (result === WEAPON_PARRY) return ['shield'];
  if (result !== true) return [];

  const harmed =
    (enemy.invuln ?? 0) > 0
    || enemy.alive === false
    || (enemy.stunTimer ?? 0) > 0;
  if (!harmed) return [];

  /** @type {string[]} */
  const names = ['enemy_die'];
  if (opts.isBoss) names.push('boss_hit');
  return names;
}
