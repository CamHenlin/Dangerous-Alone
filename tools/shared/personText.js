/**
 * Underworld person tip text (InitUnderworldPersonA/B/C).
 * PersonTextSelector is a byte offset into PersonTextAddrs (= textId for linesForTextId).
 */

import { GRUMBLE, GRUMBLE_TEXT_SEL } from './grumble.js';
import { isPersonType, MONEY_OR_LIFE_PERSON } from './moneyOrLife.js';

/** Levels 1, 2, 5, 7 — indexed by (objType − $4B). */
export const UW_PERSON_TEXT_SEL_A = Object.freeze([
  0x28, 0x26, 0x2e, 0x30, 0x32, 0x3e, 0x3e, 0x34,
]);

/** Levels 3, 4, 6, 8. */
export const UW_PERSON_TEXT_SEL_B = Object.freeze([
  0x2a, 0x38, 0x3a, 0x2c, 0x40, 0x42, 0x42, 0x3c,
]);

/** Level 9 (first 4 person types only in NES table). */
export const UW_PERSON_TEXT_SEL_C = Object.freeze([0x44, 0x46, 0x48, 0x4a]);

/** Money-or-life person ($51) uses a fixed selector. */
export const MONEY_OR_LIFE_TEXT_SEL = 0x36;

export { GRUMBLE_TEXT_SEL };

/**
 * Which selector table CurLevel uses (InitUnderworldPerson_Full_JumpTable).
 * @param {number} level 1–9
 * @returns {'a' | 'b' | 'c' | null}
 */
export function personTextTableForLevel(level) {
  const n = level | 0;
  if (n === 9) return 'c';
  if (n === 3 || n === 4 || n === 6 || n === 8) return 'b';
  if (n >= 1 && n <= 7) return 'a';
  return null;
}

/**
 * PersonTextSelector / textId for an underworld person object.
 * @param {number} level
 * @param {number} objType
 * @returns {number | null}
 */
export function textIdForUnderworldPerson(level, objType) {
  if (objType === GRUMBLE) return GRUMBLE_TEXT_SEL;
  if (!isPersonType(objType)) return null;
  if (objType === MONEY_OR_LIFE_PERSON) return MONEY_OR_LIFE_TEXT_SEL;
  const idx = (objType - 0x4b) & 0xff;
  const table = personTextTableForLevel(level);
  if (table === 'a') return UW_PERSON_TEXT_SEL_A[idx] ?? null;
  if (table === 'b') return UW_PERSON_TEXT_SEL_B[idx] ?? null;
  if (table === 'c') return UW_PERSON_TEXT_SEL_C[idx] ?? null;
  return null;
}

/**
 * @param {Record<string | number, string[]> | null | undefined} textLines from caves.json
 * @param {number} level
 * @param {number} objType
 * @returns {string[]}
 */
export function linesForUnderworldPerson(textLines, level, objType) {
  const textId = textIdForUnderworldPerson(level, objType);
  if (textId == null || !textLines) return [];
  const lines = textLines[textId] ?? textLines[String(textId)];
  return Array.isArray(lines) ? lines.filter(Boolean) : [];
}
