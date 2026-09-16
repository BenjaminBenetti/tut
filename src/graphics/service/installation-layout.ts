import type { GroundPoint } from "./coastline-projection";

// ===========================================
// Types
// ===========================================

/** What the planner needs to know about the plane and the spacing. */
export interface InstallationLayoutOptions {
  /** Radius of the ring candidates are placed on around the anchor. */
  readonly ringRadius: number;
  /** Least distance a slot keeps from every obstacle and every other slot. */
  readonly clearance: number;
  /** Extent of the map plane; slots stay `clearance` inside it. */
  readonly bounds: { readonly width: number; readonly depth: number };
  /** Candidates per ring; defaults to `CANDIDATES_PER_RING`. */
  readonly candidatesPerRing?: number;
}

/** A candidate slot with how far it is from the nearest obstacle. */
interface Candidate {
  readonly point: GroundPoint;
  readonly room: number;
  readonly index: number;
}

// ===========================================
// Constants
// ===========================================

/** Candidates on each ring: every 30°, starting north and going clockwise. */
export const CANDIDATES_PER_RING = 12;

/** Each ring beyond the first is this much further out. */
const RING_GROWTH = 1.6;

/** Rings tried before giving up and stacking the rest on the last one. */
const MAX_RINGS = 4;

// ===========================================
// Planner
// ===========================================

/**
 * Where a region's installations stand (#1155): on a ring around the
 * region's layout anchor, each slot as far from the cities as the ring
 * allows and never closer than `clearance` to a city or another slot.
 * Deterministic: the same anchor, obstacles and count always give the
 * same slots in the same order, so a save reloads with its batteries
 * where they were and nothing on the map ever drifts.
 *
 * ```
 *        ·  ·  ·             candidates every 30° on the ring
 *     ·    [city]   ·        a city near the anchor blocks the slots by it
 *     ·      ●      ·        ● anchor
 *        ·  ·  ·             the roomiest free slots are taken first
 * ```
 *
 * When a ring cannot hold them all, the next ring out is tried, and
 * after `MAX_RINGS` the rest are stacked on the roomiest slots left,
 * clearance or not, so every installation is always drawn somewhere.
 *
 * @param anchor - The region's layout anchor in world units.
 * @param count - Slots wanted.
 * @param obstacles - Points to keep clear of: every city on the map.
 * @returns `count` slots, in the order they were chosen.
 */
export function planInstallationSlots(
  anchor: GroundPoint,
  count: number,
  obstacles: readonly GroundPoint[],
  options: InstallationLayoutOptions,
): GroundPoint[] {
  const chosen: GroundPoint[] = [];
  if (count <= 0) {
    return chosen;
  }
  const perRing = options.candidatesPerRing ?? CANDIDATES_PER_RING;
  const seen: Candidate[] = [];
  for (let ring = 0; ring < MAX_RINGS && chosen.length < count; ring++) {
    const radius = options.ringRadius * RING_GROWTH ** ring;
    const candidates = ringCandidates(
      anchor,
      radius,
      perRing,
      obstacles,
      options,
    ).sort(byRoomThenIndex);
    seen.push(...candidates);
    for (const candidate of candidates) {
      if (chosen.length >= count) {
        break;
      }
      if (
        candidate.room >= options.clearance &&
        clearOf(candidate.point, chosen, options.clearance)
      ) {
        chosen.push(candidate.point);
      }
    }
  }
  // Nowhere clear is left: stack the rest on the roomiest slots seen,
  // or on the anchor itself when no ring lay inside the plane at all.
  const fallback = seen
    .filter((candidate) => !chosen.includes(candidate.point))
    .sort(byRoomThenIndex);
  for (let i = 0; chosen.length < count; i++) {
    chosen.push(fallback[i % fallback.length]?.point ?? anchor);
  }
  return chosen;
}

// ===========================================
// Helpers
// ===========================================

/** The candidates on one ring that lie inside the plane, with their room from the obstacles. */
function ringCandidates(
  anchor: GroundPoint,
  radius: number,
  perRing: number,
  obstacles: readonly GroundPoint[],
  options: InstallationLayoutOptions,
): Candidate[] {
  const candidates: Candidate[] = [];
  const margin = options.clearance;
  for (let index = 0; index < perRing; index++) {
    // North first, then clockwise seen from above: on the map plane
    // north is −z and east is +x.
    const angle = (index / perRing) * 2 * Math.PI;
    const point: GroundPoint = {
      x: anchor.x + Math.sin(angle) * radius,
      z: anchor.z - Math.cos(angle) * radius,
    };
    if (
      point.x < margin ||
      point.z < margin ||
      point.x > options.bounds.width - margin ||
      point.z > options.bounds.depth - margin
    ) {
      continue;
    }
    candidates.push({ point, room: roomOf(point, obstacles), index });
  }
  return candidates;
}

/** Distance from a point to the nearest obstacle; infinite with none. */
function roomOf(point: GroundPoint, obstacles: readonly GroundPoint[]): number {
  let room = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles) {
    room = Math.min(
      room,
      Math.hypot(obstacle.x - point.x, obstacle.z - point.z),
    );
  }
  return room;
}

/** True when the point keeps `clearance` from every slot already chosen. */
function clearOf(
  point: GroundPoint,
  chosen: readonly GroundPoint[],
  clearance: number,
): boolean {
  return chosen.every(
    (slot) => Math.hypot(slot.x - point.x, slot.z - point.z) >= clearance,
  );
}

/** Roomiest first; ties by ring index so the order is stable. */
function byRoomThenIndex(a: Candidate, b: Candidate): number {
  return b.room - a.room || a.index - b.index;
}
