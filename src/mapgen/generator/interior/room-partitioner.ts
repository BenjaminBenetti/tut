import type { Rect } from "../../../core/model/grid";
import type { Rng } from "../../../core/model/rng";
import { RoomKindIds } from "../../data/room-kind-ids";
import type { Room } from "../../model/building";
import type { InteriorPlan } from "../../model/building-template";
import type { MapDraft } from "../../model/map-draft";
import type { IntRange } from "../../model/settlement-definition";

// ===========================================
// Constants
// ===========================================

/** Chance to cut a room again when it already fits the target size. */
const SPLIT_CHANCE = 0.4;

/** Chance that two rooms side by side along a corridor share a door. */
const SUITE_DOOR_CHANCE = 0.25;

// ===========================================
// Floor plan
// ===========================================

/**
 * A building's layout, fixed once per building so every floor stacks the
 * same way and the stairs can land in the corridor above (#829).
 */
export interface FloorPlan {
  readonly roomSize: IntRange;
  /** The corridor inside the footprint, spanning its long axis, if any. */
  readonly corridor?: Rect;
}

/**
 * Lays the corridor for a footprint: the template's width along the long
 * axis, set so a room of at least `roomSize.min` fits on both sides.
 * Narrows the corridor a tile at a time when the footprint is too tight
 * and drops it when even one tile leaves no room for rooms.
 */
export function planFloor(
  footprint: Rect,
  plan: InteriorPlan,
  rng: Rng,
): FloorPlan {
  const { roomSize } = plan;
  const alongX = footprint.w >= footprint.d;
  const short = alongX ? footprint.d : footprint.w;
  for (let width = plan.corridorWidth; width >= 1; width--) {
    const spare = short - width - 2 * roomSize.min;
    if (spare < 0) {
      continue;
    }
    const offset = roomSize.min + rng.nextInt(0, spare);
    const corridor: Rect = alongX
      ? { x: footprint.x, z: footprint.z + offset, w: footprint.w, d: width }
      : { x: footprint.x + offset, z: footprint.z, w: width, d: footprint.d };
    return { roomSize, corridor };
  }
  return { roomSize };
}

// ===========================================
// Room partitioning
// ===========================================

/**
 * Cuts one floor of a building into rooms, writing the interior walls and
 * doors into the draft and tagging the floor's tiles with their room.
 *
 * With a corridor, each side of it is a strip of rooms `roomSize` long
 * along the corridor, every room with one door onto the corridor, and a
 * strip deep enough for two rooms is cut again behind its front room:
 *
 * ```
 *   +-----+-----+----+-----+
 *   |     |     |    |     |     back rooms, doors on the cut
 *   +--D--+--D--+--D-+--D--+
 *   |     |     |    |     |     front rooms
 *   +--D--+--D--+--D-+--D--+
 *   |       corridor        |
 *   +--D-----+--D----+--D---+
 *   |        |       |      |
 *   +--------+-------+------+
 * ```
 *
 * Without one, the footprint is split recursively, one door per cut,
 * while an edge is longer than `roomSize.max` and by chance after that.
 * Every room is reachable from every other through doors either way.
 */
export function partitionFloor(
  draft: MapDraft,
  buildingId: string,
  floorIndex: number,
  y: number,
  footprint: Rect,
  plan: FloorPlan,
  rng: Rng,
): Room[] {
  const rooms: Room[] = [];
  const { roomSize, corridor } = plan;
  if (corridor === undefined) {
    split(footprint);
    return rooms;
  }
  rooms.push(makeRoom(corridor, RoomKindIds.CORRIDOR));
  const alongX = corridor.w >= corridor.d;
  const strips: { rect: Rect; corridorSide: "n" | "s" | "e" | "w" }[] = alongX
    ? [
        {
          rect: {
            x: footprint.x,
            z: footprint.z,
            w: footprint.w,
            d: corridor.z - footprint.z,
          },
          corridorSide: "n",
        },
        {
          rect: {
            x: footprint.x,
            z: corridor.z + corridor.d,
            w: footprint.w,
            d: footprint.z + footprint.d - corridor.z - corridor.d,
          },
          corridorSide: "s",
        },
      ]
    : [
        {
          rect: {
            x: footprint.x,
            z: footprint.z,
            w: corridor.x - footprint.x,
            d: footprint.d,
          },
          corridorSide: "w",
        },
        {
          rect: {
            x: corridor.x + corridor.w,
            z: footprint.z,
            w: footprint.x + footprint.w - corridor.x - corridor.w,
            d: footprint.d,
          },
          corridorSide: "e",
        },
      ];
  for (const strip of strips) {
    if (strip.rect.w <= 0 || strip.rect.d <= 0) {
      continue;
    }
    wallStrip(strip.rect, strip.corridorSide);
  }
  return rooms;

  /**
   * Cuts a strip beside the corridor into rooms along it, walls them off
   * from each other (a door between neighbours by chance) and opens one
   * door from each onto the corridor.
   */
  function wallStrip(strip: Rect, corridorSide: "n" | "s" | "e" | "w"): void {
    const alongStrip = corridorSide === "n" || corridorSide === "s";
    const start = alongStrip ? strip.x : strip.z;
    const length = alongStrip ? strip.w : strip.d;
    const depth = alongStrip ? strip.d : strip.w;
    // The corridor's wall along this strip, before doors are cut in it.
    for (let i = 0; i < length; i++) {
      const edge = alongStrip
        ? { x: strip.x + i, y, z: corridorEdge(corridorSide) }
        : { x: corridorEdge(corridorSide), y, z: strip.z + i };
      draft.setWall(
        edge,
        corridorSide === "n"
          ? "n"
          : corridorSide === "s"
            ? "s"
            : corridorSide === "w"
              ? "w"
              : "e",
        "solid",
      );
    }
    let previousEnd: number | undefined;
    for (const segment of segments(start, length, roomSize, rng)) {
      const rect: Rect = alongStrip
        ? { x: segment.start, z: strip.z, w: segment.length, d: depth }
        : { x: strip.x, z: segment.start, w: depth, d: segment.length };
      if (previousEnd !== undefined) {
        const doorAt = rng.chance(SUITE_DOOR_CHANCE)
          ? rng.nextInt(0, depth - 1)
          : -1;
        for (let j = 0; j < depth; j++) {
          const tile = alongStrip
            ? { x: previousEnd - 1, y, z: strip.z + j }
            : { x: strip.x + j, y, z: previousEnd - 1 };
          draft.setWall(
            tile,
            alongStrip ? "e" : "s",
            j === doorAt ? "door" : "solid",
          );
        }
      }
      previousEnd = segment.start + segment.length;
      const doorAlong = rng.nextInt(segment.start, previousEnd - 1);
      const doorTile = alongStrip
        ? { x: doorAlong, y, z: corridorEdge(corridorSide) }
        : { x: corridorEdge(corridorSide), y, z: doorAlong };
      draft.setWall(doorTile, corridorSide, "door");
      if (depth >= 2 * roomSize.min) {
        split(rect);
      } else {
        rooms.push(makeRoom(rect));
      }
    }
  }

  /** The corridor coordinate on the side facing a strip. */
  function corridorEdge(side: "n" | "s" | "e" | "w"): number {
    if (corridor === undefined) {
      return 0;
    }
    switch (side) {
      case "n":
        return corridor.z;
      case "s":
        return corridor.z + corridor.d - 1;
      case "w":
        return corridor.x;
      case "e":
        return corridor.x + corridor.w - 1;
    }
  }

  /**
   * Recursive split with one door per cut. Cuts while an edge exceeds
   * `roomSize.max`, then by chance while both halves would still be at
   * least `roomSize.min`.
   */
  function split(rect: Rect): void {
    const { min, max } = roomSize;
    const canSplitX = rect.w >= 2 * min;
    const canSplitZ = rect.d >= 2 * min;
    const must = (rect.w > max && canSplitX) || (rect.d > max && canSplitZ);
    if ((!canSplitX && !canSplitZ) || (!must && !rng.chance(SPLIT_CHANCE))) {
      rooms.push(makeRoom(rect));
      return;
    }
    const preferX =
      canSplitX &&
      (!canSplitZ ||
        (rect.w > max && rect.d <= max) ||
        (rect.w >= rect.d && !(rect.d > max && rect.w <= max)));
    if (preferX) {
      const cut = rng.nextInt(rect.x + min, rect.x + rect.w - min);
      const doorZ = rng.nextInt(rect.z, rect.z + rect.d - 1);
      for (let z = rect.z; z < rect.z + rect.d; z++) {
        draft.setWall(
          { x: cut - 1, y, z },
          "e",
          z === doorZ ? "door" : "solid",
        );
      }
      split({ x: rect.x, z: rect.z, w: cut - rect.x, d: rect.d });
      split({ x: cut, z: rect.z, w: rect.x + rect.w - cut, d: rect.d });
    } else {
      const cut = rng.nextInt(rect.z + min, rect.z + rect.d - min);
      const doorX = rng.nextInt(rect.x, rect.x + rect.w - 1);
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        draft.setWall(
          { x, y, z: cut - 1 },
          "s",
          x === doorX ? "door" : "solid",
        );
      }
      split({ x: rect.x, z: rect.z, w: rect.w, d: cut - rect.z });
      split({ x: rect.x, z: cut, w: rect.w, d: rect.z + rect.d - cut });
    }
  }

  /** Registers a room and tags its tiles. */
  function makeRoom(rect: Rect, kind?: string): Room {
    const id = draft.ids.nextId("room");
    for (let z = rect.z; z < rect.z + rect.d; z++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const tile = draft.getTile({ x, y, z });
        if (tile?.buildingId === buildingId) {
          tile.roomId = id;
        }
      }
    }
    return kind === undefined
      ? { id, floorIndex, rect }
      : { id, floorIndex, rect, kind };
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Cuts a length into segments of `roomSize`, absorbing a remainder that
 * would be shorter than `min` into the last segment or the one before it.
 */
function segments(
  start: number,
  length: number,
  roomSize: IntRange,
  rng: Rng,
): { start: number; length: number }[] {
  const out: { start: number; length: number }[] = [];
  let at = start;
  let left = length;
  while (left > 0) {
    let size = Math.min(left, rng.nextInt(roomSize.min, roomSize.max));
    if (left - size < roomSize.min) {
      size = left >= 2 * roomSize.min ? left - roomSize.min : left;
    }
    out.push({ start: at, length: size });
    at += size;
    left -= size;
  }
  return out;
}
