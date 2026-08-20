import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlayerFocus } from './playerFocus.js';

/** A stand-in for main.js's closure variables. */
function harness() {
  const live = { roomId: -1, screen: null };
  const focus = createPlayerFocus({
    load: (p) => {
      live.roomId = p.world.roomId;
      live.screen = p.world.screen;
    },
    save: (p) => {
      p.world.roomId = live.roomId;
      p.world.screen = live.screen;
    },
  });
  return { live, focus };
}

const player = (index, roomId = 0, screen = null) => ({
  index,
  world: { roomId, screen },
});

test('adopting takes the world as it already is', () => {
  const { live, focus } = harness();
  // Booting sets the world up before anyone owns it.
  live.roomId = 0x77;
  live.screen = { mapIndex: 0x77 };
  const p = player(0);

  focus.adopt(p);

  assert.equal(focus.current, p);
  assert.equal(p.world.roomId, 0x77, 'the record took the live values');
  assert.equal(live.screen.mapIndex, 0x77, 'and the live world was left alone');
});

test('a frame for the player already in focus copies nothing', () => {
  const { live, focus } = harness();
  const p = player(0);
  live.roomId = 0x30;
  focus.adopt(p);

  // Between frames the world moves outside any frame at all — a cave entered
  // from an event handler, a room load that resolved late.
  live.roomId = 0x31;
  focus.on(p, () => {
    assert.equal(live.roomId, 0x31, 'out-of-frame changes survive');
  });
});

test('switching players swaps the world', () => {
  const { live, focus } = harness();
  const a = player(0, 0x30);
  const b = player(1, 0x77);
  live.roomId = 0x30;
  focus.adopt(a);

  focus.on(a, () => {
    live.roomId = 0x31;
  });
  focus.on(b, () => {
    assert.equal(live.roomId, 0x77, 'b is in its own room');
    live.roomId = 0x78;
  });
  focus.on(a, () => {
    assert.equal(live.roomId, 0x31, 'a picked up where it left off');
  });

  assert.equal(b.world.roomId, 0x78, 'b was saved on the way out');
});

test('current names the player an async continuation must re-enter with', () => {
  const { focus } = harness();
  const p = player(0);
  focus.adopt(p);
  const captured = focus.current;

  focus.on(player(1, 9), () => {});

  let resumedIn = null;
  focus.on(captured, () => {
    resumedIn = focus.current;
  });
  assert.equal(resumedIn, p);
});

test('handing the focus back saves the hero who had it', () => {
  const { live, focus } = harness();
  const a = player(0, 0x30);
  const b = player(1, 0x77);
  live.roomId = 0x30;
  focus.adopt(a);

  focus.on(b, () => {
    live.roomId = 0x78;
  });
  focus.to(a);

  assert.equal(b.world.roomId, 0x78, 'b kept the room it walked into');
  assert.equal(live.roomId, 0x30, 'and the view is back on a');
});

test('on returns what the frame returned', () => {
  const { focus } = harness();
  assert.equal(
    focus.on(player(0), () => 'done'),
    'done',
  );
});

test('the first frame of a never-adopted player loads its record', () => {
  const { live, focus } = harness();
  focus.on(player(0, 0x55), () => {
    assert.equal(live.roomId, 0x55);
  });
});
