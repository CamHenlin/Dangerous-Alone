import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { OBJ } from './enemies.js';
import {
  createSession,
  hashSession,
  hold,
  holdEach,
  idle,
  runSession,
  stepSession,
  swing,
} from './goldenSession.js';

/**
 * Scripted sessions, by name. Each one is a scenario the plural-hero refactor
 * has to leave alone; `GOLDENS` below is the contract.
 *
 * Keep these definitions stable. Changing a script changes its hash for a
 * reason that has nothing to do with a regression, which is the one way a
 * golden test can start lying.
 */
export const SCENARIOS = Object.freeze({
  /** Walk east across open ground. */
  walk: () => ({ seed: 1, frames: hold(DIR.RIGHT, 40) }),

  /** Turn corners: the animation counter and grid offset have to survive. */
  turns: () => ({
    seed: 2,
    frames: [
      ...hold(DIR.RIGHT, 12),
      ...hold(DIR.DOWN, 12),
      ...hold(DIR.LEFT, 12),
      ...hold(DIR.UP, 12),
    ],
  }),

  /** Three swings kill a red Octorok standing one tile east. */
  swordKill: () => ({
    seed: 7,
    inv: { sword: 1, halfHearts: 6 },
    startX: 0x80,
    startY: 0x8d,
    startDir: DIR.RIGHT,
    enemies: [{ objType: OBJ.RED_OCTOROK_SLOW, x: 0x90, y: 0x8d }],
    frames: [
      ...swing(20),
      ...idle(10),
      ...swing(20),
      ...idle(10),
      ...swing(20),
      ...idle(20),
    ],
  }),

  /** Unarmed beside a foe: take contact damage, invuln, knockback. */
  contact: () => ({
    seed: 3,
    inv: { sword: 0, halfHearts: 6 },
    startX: 0x80,
    startY: 0x8d,
    enemies: [{ objType: OBJ.RED_OCTOROK_SLOW, x: 0x82, y: 0x8d }],
    frames: idle(60),
  }),

  /** Walk inside a bounded room rather than the clamped default. */
  roomBounds: () => ({
    seed: 5,
    roomId: 0x77,
    startX: 0x80,
    startY: 0x8d,
    frames: [...hold(DIR.UP, 30), ...hold(DIR.RIGHT, 30)],
  }),
});

/**
 * The contract: a rolling hash of every frame of every scenario, not just
 * where each one came to rest. A diff here is a behaviour change — either it
 * was intended and the assertions below should have moved with it, or it is
 * the regression this file exists to catch.
 */
const GOLDENS = Object.freeze({
  walk: '18ECFF0C',
  turns: '86B4AC2E',
  swordKill: '033C64D6',
  contact: 'BAF519D8',
  roomBounds: '06943AFC',
});

for (const [name, build] of Object.entries(SCENARIOS)) {
  test(`golden session: ${name}`, () => {
    assert.equal(runSession(build()).trace, GOLDENS[name]);
  });
}

test('golden sessions are reproducible across runs', () => {
  for (const [name, build] of Object.entries(SCENARIOS)) {
    const a = runSession(build());
    const b = runSession(build());
    assert.equal(a.trace, b.trace, name);
  }
});

// --- What each golden is actually asserting -------------------------------
//
// A hash on its own says "something moved" and nothing else. These pin the
// behaviour in readable terms, so a golden break can be triaged without
// reverse-engineering a CRC.

test('walk covers ground and faces the way it went', () => {
  const { state } = runSession(SCENARIOS.walk());
  assert.equal(state.link.dir, DIR.RIGHT);
  assert.ok(state.link.x > 0x80, 'moved east');
  assert.equal(state.link.y, 0x8d, 'stayed on its row');
  assert.equal(state.frame, 40);
});

test('sword kills the Octorok and Link takes nothing back', () => {
  const { state } = runSession(SCENARIOS.swordKill());
  const foe = state.enemies[0];
  assert.equal(foe.alive, false, 'three swings is lethal');
  assert.ok(foe.hp <= 0);
  assert.equal(state.inv.halfHearts, 6, 'never traded a hit for it');
});

test('a swing needs a sword', () => {
  const unarmed = createSession({
    inv: { sword: 0 },
    enemies: [{ objType: OBJ.RED_OCTOROK_SLOW, x: 0x90, y: 0x8d }],
  });
  for (const f of swing(20)) stepSession(unarmed, f);
  assert.equal(unarmed.sword.phase, 0, 'no swing started');
  assert.equal(unarmed.enemies[0].alive, true);
});

test('contact costs hearts, grants invulnerability and knocks Link back', () => {
  const { state } = runSession(SCENARIOS.contact());
  assert.ok(state.inv.halfHearts < 6, 'took a hit');
  assert.ok(state.inv.invuln > 0, 'still flashing at the end of the script');
  assert.equal(state.inv.dead, false);
});

test('invulnerability stops the second hit landing on the same frames', () => {
  const s = createSession({
    seed: 3,
    inv: { sword: 0, halfHearts: 6 },
    enemies: [{ objType: OBJ.RED_OCTOROK_SLOW, x: 0x82, y: 0x8d }],
  });
  for (const f of idle(2)) stepSession(s, f);
  const afterFirst = s.inv.halfHearts;
  assert.ok(afterFirst < 6, 'the first touch landed');
  for (const f of idle(4)) stepSession(s, f);
  assert.equal(s.inv.halfHearts, afterFirst, 'invuln held the follow-ups off');
});

test('the trace pins the route, not just the destination', () => {
  // Both walk 20 frames east and stand still for 10, so they come to rest in
  // exactly the same state — but they get there in a different order. A
  // golden that only hashed the final state would call these identical, and
  // would sleep through a swing or a hit landing one frame late.
  const early = runSession({ seed: 1, frames: [...idle(5), ...hold(DIR.RIGHT, 20), ...idle(5)] });
  const late = runSession({ seed: 1, frames: [...hold(DIR.RIGHT, 20), ...idle(10)] });
  assert.equal(early.hash, late.hash, 'same resting state');
  assert.notEqual(early.trace, late.trace, 'different route');
});

// --- Sensitivity ----------------------------------------------------------
//
// A golden that cannot fail is worse than no golden. These prove the hash
// actually reads the state the refactor is going to move.

test('the hash notices the seed', () => {
  const base = SCENARIOS.swordKill();
  const a = runSession(base);
  const b = runSession({ ...base, seed: base.seed + 1 });
  assert.notEqual(a.hash, b.hash);
});

test('the hash notices hearts, position and the enemy set', () => {
  const base = () => createSession({ enemies: [{ objType: OBJ.RED_OCTOROK_SLOW, x: 0x90, y: 0x8d }] });
  const ref = hashSession(base());

  const hurt = base();
  hurt.inv.halfHearts -= 1;
  assert.notEqual(hashSession(hurt), ref, 'hearts');

  const moved = base();
  moved.link.x += 1;
  assert.notEqual(hashSession(moved), ref, 'position');

  const killed = base();
  killed.enemies[0].alive = false;
  assert.notEqual(hashSession(killed), ref, 'enemy liveness');

  const rich = base();
  rich.inv.rupees += 1;
  assert.notEqual(hashSession(rich), ref, 'rupees');
});

test('room bounds change where a walk ends up', () => {
  const base = SCENARIOS.roomBounds();
  const bounded = runSession(base);
  const unbounded = runSession({ ...base, roomId: null });
  assert.notEqual(bounded.hash, unbounded.hash);
});

test('N masks move each hero without touching the solo goldens', () => {
  const party = runSession({
    heroes: 2,
    frames: holdEach([DIR.RIGHT, DIR.LEFT], 12),
  });
  assert.equal(party.state.heroes.length, 2);
  assert.ok(party.state.heroes[0].link.x > 0x80, 'player one walked east');
  assert.ok(party.state.heroes[1].link.x < 0x90, 'player two walked west');
  const solo = runSession(SCENARIOS.walk());
  assert.equal(solo.trace, GOLDENS.walk);
});
