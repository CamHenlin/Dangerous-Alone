/**
 * The sound the simulation asks for, separated from the device that makes it.
 *
 * Step code used to call `audio?.playSfx(...)` directly, which is harmless
 * headless (the optional chain swallows it) but silent — a test could not see
 * that a bomb went off. The bus keeps the same method names so call sites read
 * the same, and lets a headless run record what was asked for instead.
 */

export const AUDIO_BUS_METHODS = Object.freeze([
  'playSfx',
  'playFanfare',
  'playMusic',
  'stopMusic',
  'stopSfx',
  'unlock',
]);

/**
 * Methods the caller awaits. These always hand back a promise, device or not,
 * so `bus.unlock().then(...)` is safe on a silent build. The device's own
 * `audio?.unlock().then(...)` was only safe because optional chaining
 * short-circuits the whole chain — a trap for anything routed through here.
 */
const ASYNC_METHODS = new Set(['unlock']);

/**
 * Route sim sound at whatever device is loaded right now. The device arrives
 * asynchronously and can be absent entirely, so it is resolved per call.
 *
 * Methods hand back whatever the device returned, except the async ones, which
 * always give a promise so callers can chain without guarding.
 * @param {() => object | null | undefined} resolveDevice
 */
export function createAudioBus(resolveDevice) {
  /** @type {Record<string, (...args: unknown[]) => unknown>} */
  const bus = {};
  for (const method of AUDIO_BUS_METHODS) {
    bus[method] = ASYNC_METHODS.has(method)
      ? (...args) => Promise.resolve(resolveDevice()?.[method]?.(...args))
      : (...args) => resolveDevice()?.[method]?.(...args);
  }
  return bus;
}

/**
 * A bus that makes no sound and remembers everything, for headless runs.
 * @returns {ReturnType<typeof createAudioBus> & {
 *   calls: { method: string, args: unknown[] }[],
 *   drain: () => { method: string, args: unknown[] }[],
 *   names: () => string[],
 * }}
 */
export function createRecordingAudio() {
  /** @type {{ method: string, args: unknown[] }[]} */
  const calls = [];
  /** @type {Record<string, unknown>} */
  const bus = {};
  for (const method of AUDIO_BUS_METHODS) {
    bus[method] = (...args) => {
      calls.push({ method, args });
      return ASYNC_METHODS.has(method) ? Promise.resolve() : undefined;
    };
  }
  bus.calls = calls;
  bus.drain = () => calls.splice(0, calls.length);
  /** Sound names in order — the shape a golden test asserts on. */
  bus.names = () => calls.map((c) => String(c.args[0] ?? ''));
  return /** @type {never} */ (bus);
}
