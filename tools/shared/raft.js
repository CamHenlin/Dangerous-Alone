import { DIR, OW_BOUNDS } from './collision.js';
import { PLAY_H, occupyingRoom } from './continuousCamera.js';
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
 * Soft-align window for dock X/Y.
 * Continuous camera lands a southbound seam cross at Y=$40 (HUD+0), which is
 * 3px from NES `$3D` — the old ±2 window missed it entirely.
 */
export const RAFT_ALIGN_PX = 4;

/**
 * Dock-lip UP trigger: soft-align around NES `$7D`, but never `$7F` or south.
 * DOWN lands at `$7F` (and may stride further south); those must not re-fire UP.
 * Walk north from the landing spot onto `$7E`/`$7D` to board.
 */
export const RAFT_DOCK_Y_MIN = 0x7d - RAFT_ALIGN_PX;
export const RAFT_DOCK_Y_MAX = 0x7f; // exclusive

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
 * @returns {{ active: boolean, state: number, x: number, y: number, crossed: boolean }}
 */
export function createRaftRide() {
  return { active: false, state: RAFT_STATE.IDLE, x: 0, y: 0, crossed: false };
}

/**
 * Soft-align Link to dock X/Y when close (QSpeed makes exact rare).
 * NES UpdateDock uses exact `$60`/`$80` and `$3D`/`$7D` and does **not**
 * require a facing bit — it forces ObjDir from the raft state.
 *
 * @param {{ x: number, y: number, dir: number, gridOffset?: number, posFrac?: number, moving?: boolean }} link
 * @param {number} roomId
 * @param {{ raft?: number }} inv
 * @param {ReturnType<typeof createRaftRide>} ride
 * @returns {boolean} started
 */
export function tryStartRaftRide(link, roomId, inv, ride) {
  if (!inv?.raft || !isRaftDockRoom(roomId) || ride.active) return false;
  const dockX = raftDockX(roomId);
  if (Math.abs(link.x - dockX) > RAFT_ALIGN_PX) return false;

  /** @param {number} state @param {number} y */
  const begin = (state, y) => {
    // Soft-align only when the ride actually starts. Snapping X on a failed
    // Y check ran every OW frame in `$3F`/`$55` and pinned Link to the dock
    // column — UD worked, LR looked broken, until he left the dock room.
    link.x = dockX;
    link.y = y;
    ride.active = true;
    ride.state = state;
    ride.crossed = false;
    ride.x = dockX;
    ride.y = link.y + 6;
    link.dir = state === RAFT_STATE.DOWN ? DIR.DOWN : DIR.UP;
    // NES: halt Link (ObjState=$40) for the scroll.
    link.gridOffset = 0;
    link.posFrac = 0;
    link.moving = false;
    return true;
  };

  // Top edge — arriving from the north screen (UpdateDock state 1).
  if (Math.abs(link.y - 0x3d) <= RAFT_ALIGN_PX) {
    return begin(RAFT_STATE.DOWN, 0x3d);
  }
  // Dock lip (UpdateDock state 2). NES tests Y=$7D exactly. Soft-align only
  // north of the `$7F` landing spot so DOWN→land cannot immediately re-fire UP.
  if (link.y >= RAFT_DOCK_Y_MIN && link.y < RAFT_DOCK_Y_MAX) {
    return begin(RAFT_STATE.UP, 0x7d);
  }
  return false;
}

/**
 * Continuous camera: water in the dock room blocks south look-ahead while Link
 * is still on the northern shore, so `detectRoomCross` never fires and NES
 * UpdateDock (Y=$3D in the dock room) cannot start.
 *
 * When Link reaches the classic south lip of the room *north* of a dock screen
 * with the raft and dock X, force the same entry NES gets after a screen scroll.
 *
 * @param {{ x: number, y: number, dir?: number }} link
 * @param {number} roomId current anchor room
 * @param {{ raft?: number }} inv
 * @returns {{ nextRoomId: number, x: number, y: number, dir: number } | null}
 */
export function planRaftNorthApproach(link, roomId, inv) {
  if (!inv?.raft || !link) return null;
  // Must be walking south. Raft UP leave spawns on this lip facing UP at Y=$CD;
  // without a facing check we immediately bounce back into the dock room.
  if (!(link.dir & DIR.DOWN)) return null;
  const south = neighborRoomId(roomId, DIR.DOWN);
  if (south == null || !isRaftDockRoom(south)) return null;
  // Already in the dock room — tryStartRaftRide handles Y=$3D / dock lip.
  if (isRaftDockRoom(roomId)) return null;
  const dockX = raftDockX(south);
  if (Math.abs(link.x - dockX) > RAFT_ALIGN_PX) return null;
  // NES south edge is OW_BOUNDS.bottom ($CD). Continuous look-ahead into dock
  // water freezes Link around here before playY can cross the seam.
  if (link.y < OW_BOUNDS.bottom - RAFT_ALIGN_PX) return null;
  return {
    nextRoomId: south,
    x: dockX,
    y: 0x3d,
    dir: DIR.DOWN,
  };
}

/**
 * Same plan, but `roomId` is the streaming *anchor* and Link's x/y are
 * anchor-local. A leftover hero on `$45` while the stream is still `$77`
 * (ally walked back to the sword cave) lives outside that cell — planning
 * against the anchor never sees the island dock, and they freeze on the
 * water.
 *
 * @param {{ x: number, y: number, dir?: number }} link
 * @param {number} anchorRoomId
 * @param {{ raft?: number }} inv
 */
export function planRaftNorthApproachFromAnchor(link, anchorRoomId, inv) {
  if (!inv?.raft || !link) return null;
  const occ = occupyingRoom(anchorRoomId, link.x, link.y);
  return planRaftNorthApproach(
    { ...link, x: occ.x, y: occ.y },
    occ.roomId,
    inv,
  );
}

/**
 * After a continuous southbound room cross into a dock screen, snap onto the
 * NES north-edge trigger so UpdateDock can fire this frame.
 *
 * @param {{ x: number, y: number }} link
 * @param {number} roomId newly current room
 * @param {number} fromDir DIR bit of the cross (exit dir from previous room)
 * @returns {boolean} snapped
 */
export function snapRaftNorthEntry(link, roomId, fromDir) {
  if (!(fromDir & DIR.DOWN) || !isRaftDockRoom(roomId)) return false;
  const dockX = raftDockX(roomId);
  if (Math.abs(link.x - dockX) > 16) return false;
  link.x = dockX;
  link.y = 0x3d;
  return true;
}

/**
 * End an active ride and halt Link.
 * @param {{ x: number, y: number, dir: number, gridOffset?: number, posFrac?: number, moving?: boolean }} link
 * @param {ReturnType<typeof createRaftRide>} ride
 */
function endRide(link, ride) {
  ride.active = false;
  ride.state = RAFT_STATE.IDLE;
  ride.crossed = false;
  link.gridOffset = 0;
  link.posFrac = 0;
  link.moving = false;
}

/**
 * Scroll Link+raft 1px/frame (UpdateDock states 1/2).
 *
 * UP rides soft-cross into the northern room at the water seam, then keep
 * scrolling to the NES shore spawn (`$CD`) so Link lands on walkable tiles
 * (caves / fairies / room enemies) without a hard reload or a `$ED` seam park.
 *
 * @param {{ x: number, y: number, dir: number }} link
 * @param {ReturnType<typeof createRaftRide>} ride
 * @param {number} roomId
 * @returns {{ cross?: { nextRoomId: number, x: number, y: number, dir: number }, landed?: boolean, scrolling?: boolean } | null}
 */
export function stepRaftRide(link, ride, roomId) {
  if (!ride.active) return null;

  if (ride.state === RAFT_STATE.UP) {
    link.y -= 1;
    ride.y -= 1;

    if (!ride.crossed) {
      if (link.y > 0x3d) return { scrolling: true };
      link.y = 0x3d;
      ride.y = link.y + 6;
      const next = neighborRoomId(roomId, DIR.UP);
      if (next == null) {
        endRide(link, ride);
        return { landed: true };
      }
      // Main rebases into the north room at continuous Y ($3D+PLAY_H = $ED),
      // sets ride.crossed, then we keep scrolling to the shore.
      return {
        cross: {
          nextRoomId: next,
          x: link.x,
          y: link.y + PLAY_H,
          dir: DIR.UP,
        },
      };
    }

    // Post-cross shore approach — NES south-edge spawn (walk grid Y≡$D).
    const shoreY = TRANSITION_SPAWN[DIR.UP].y;
    if (link.y <= shoreY) {
      link.y = shoreY;
      ride.y = link.y + 6;
      link.dir = DIR.UP;
      endRide(link, ride);
      return { landed: true };
    }
    return { scrolling: true };
  }

  if (ride.state === RAFT_STATE.DOWN) {
    link.y += 1;
    ride.y += 1;
    if (link.y >= 0x7f) {
      // NES UpdateDock stops the scroll at Y=$7F with ObjGridOffset=$02
      // ($7F-$7D) so Link finishes the southbound 8px cell onto sand at
      // $85 — the first row where the pier opens and LEFT/RIGHT are free.
      //
      // Applying only gridOffset=$02 still leaves a one-frame pier park:
      // pressing LEFT/RIGHT mid-cell (absOff<4) flips facing north, walks
      // onto Y=$7D, and immediately re-boards the raft. Commit the completed
      // cell instead so shore control matches the NES end state.
      link.y = 0x85;
      link.dir = DIR.DOWN;
      endRide(link, ride);
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
  if (Math.abs(link.x - dockX) > RAFT_ALIGN_PX) return null;
  if (roomId === 0x3f && link.y <= 0x7d + RAFT_ALIGN_PX) {
    const next = neighborRoomId(0x3f, DIR.UP);
    if (next == null) return null;
    return { nextRoomId: next, x: dockX, y: TRANSITION_SPAWN[DIR.UP].y, dir: DIR.UP };
  }
  if (roomId === 0x55 && link.y <= 0x7d + RAFT_ALIGN_PX) {
    const next = neighborRoomId(0x55, DIR.UP);
    if (next == null) return null;
    return { nextRoomId: next, x: dockX, y: TRANSITION_SPAWN[DIR.UP].y, dir: DIR.UP };
  }
  return null;
}
