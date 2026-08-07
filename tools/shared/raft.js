import { DIR } from './collision.js';
import { TRANSITION_SPAWN, neighborRoomId } from './world.js';

/** Overworld dock screens for the raft (Level 4 entry path). */
export const RAFT_DOCK_ROOMS = Object.freeze([0x3f, 0x55]);

export const RAFT_STATE = Object.freeze({
  IDLE: 0,
  /** Entering from north edge — scroll down to dock. */
  DOWN: 1,
  /** Leaving dock — scroll up to north edge. */
  UP: 2,
});

/**
 * @param {number} roomId
 */
export function isRaftDockRoom(roomId) {
  return RAFT_DOCK_ROOMS.includes(roomId & 0xff);
}

/** Dock X: $80 in room $55, $60 in $3F. */
export function raftDockX(roomId) {
  return (roomId & 0xff) === 0x55 ? 0x80 : 0x60;
}

/**
 * @returns {{ active: boolean, state: number, x: number, y: number }}
 */
export function createRaftRide() {
  return { active: false, state: RAFT_STATE.IDLE, x: 0, y: 0 };
}

/**
 * Soft-align Link to dock X/Y when within 2px (QSpeed makes exact rare).
 * NES UpdateDock uses exact $60/$80 and $3D/$7D; we snap when close.
 * @param {{ x: number, y: number, dir: number, gridOffset?: number, posFrac?: number, moving?: boolean }} link
 * @param {number} roomId
 * @param {{ raft?: number }} inv
 * @param {ReturnType<typeof createRaftRide>} ride
 * @returns {boolean} started
 */
export function tryStartRaftRide(link, roomId, inv, ride) {
  if (!inv?.raft || !isRaftDockRoom(roomId) || ride.active) return false;
  const dockX = raftDockX(roomId);
  if (Math.abs(link.x - dockX) > 2) return false;
  link.x = dockX;

  /** @param {number} state */
  const begin = (state) => {
    ride.active = true;
    ride.state = state;
    ride.x = dockX;
    ride.y = link.y + 6;
    link.dir = state === RAFT_STATE.DOWN ? DIR.DOWN : DIR.UP;
    // NES: halt Link (ObjState=$40) for the scroll.
    link.gridOffset = 0;
    link.posFrac = 0;
    link.moving = false;
    return true;
  };

  // Top edge — arriving from the north screen.
  if (Math.abs(link.y - 0x3d) <= 2) {
    link.y = 0x3d;
    return begin(RAFT_STATE.DOWN);
  }
  // Dock lip facing water (up).
  if (Math.abs(link.y - 0x7d) <= 2 && (link.dir & DIR.UP)) {
    link.y = 0x7d;
    return begin(RAFT_STATE.UP);
  }
  return false;
}

/**
 * Scroll Link+raft 1px/frame (UpdateDock states 1/2).
 * @param {{ x: number, y: number, dir: number }} link
 * @param {ReturnType<typeof createRaftRide>} ride
 * @param {number} roomId
 * @returns {{ leave?: { nextRoomId: number, x: number, y: number, dir: number }, landed?: boolean, scrolling?: boolean } | null}
 */
export function stepRaftRide(link, ride, roomId) {
  if (!ride.active) return null;

  if (ride.state === RAFT_STATE.UP) {
    link.y -= 1;
    ride.y -= 1;
    if (link.y <= 0x3d) {
      link.y = 0x3d;
      ride.active = false;
      ride.state = RAFT_STATE.IDLE;
      const next = neighborRoomId(roomId, DIR.UP);
      if (next == null) return { landed: true };
      return {
        leave: {
          nextRoomId: next,
          x: link.x,
          // Same south-edge spawn as normal OW north transitions ($CD, Y≡$D).
          // $D0 desyncs the walk grid so Link stops on the L4 mouth at Y=$80
          // and never satisfies checkCaveEntry's Y≡$D gate.
          y: TRANSITION_SPAWN[DIR.UP].y,
          dir: DIR.UP,
        },
      };
    }
    return { scrolling: true };
  }

  if (ride.state === RAFT_STATE.DOWN) {
    link.y += 1;
    ride.y += 1;
    if (link.y >= 0x7f) {
      link.y = 0x7f;
      ride.active = false;
      ride.state = RAFT_STATE.IDLE;
      return { landed: true };
    }
    return { scrolling: true };
  }

  return null;
}

/**
 * Legacy helper — prefer tryStartRaftRide + stepRaftRide.
 * Kept for tests that expect an immediate cross result.
 * @param {{ x: number, y: number, dir: number }} link
 * @param {number} roomId
 * @param {{ raft?: number }} inv
 */
export function tryRaftCrossing(link, roomId, inv) {
  if (!inv?.raft || !isRaftDockRoom(roomId)) return null;
  const dockX = raftDockX(roomId);
  if (Math.abs(link.x - dockX) > 2) return null;
  if (roomId === 0x3f && (link.dir & DIR.UP) && link.y <= 0x7d) {
    const next = neighborRoomId(0x3f, DIR.UP);
    if (next == null) return null;
    return { nextRoomId: next, x: dockX, y: TRANSITION_SPAWN[DIR.UP].y, dir: DIR.UP };
  }
  if (roomId === 0x55 && (link.dir & DIR.UP) && link.y <= 0x7d) {
    const next = neighborRoomId(0x55, DIR.UP);
    if (next == null) return null;
    return { nextRoomId: next, x: dockX, y: TRANSITION_SPAWN[DIR.UP].y, dir: DIR.UP };
  }
  return null;
}
