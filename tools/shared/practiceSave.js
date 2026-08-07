/**
 * Practice savestates — separate from the 3 battery file slots.
 * Optional QoL (F5 / F9); never writes zelda_slot_*.
 */

import { applyLoadedSave, serializeGameState } from './save.js';

export const PRACTICE_KEY = 'zelda_practice';

/**
 * @param {Storage | { getItem(k:string): string|null, setItem(k:string,v:string): void, removeItem(k:string): void }} [storage]
 */
export function createPracticeStore(storage = globalThis.localStorage) {
  return {
    /**
     * @param {object} state runtime fields for serializeGameState
     */
    save(state) {
      const payload = serializeGameState({
        ...state,
        name: state.name ?? 'PRACTICE',
      });
      payload.practice = true;
      storage.setItem(PRACTICE_KEY, JSON.stringify(payload));
      return payload;
    },
    load() {
      try {
        const raw = storage.getItem(PRACTICE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    clear() {
      storage.removeItem(PRACTICE_KEY);
    },
    /**
     * @param {object} target bags for applyLoadedSave
     */
    hydrateInto(target) {
      const payload = this.load();
      if (!payload) return null;
      return applyLoadedSave(payload, target);
    },
  };
}
