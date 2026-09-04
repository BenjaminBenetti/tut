import type { Rng } from "../../core/model/rng";
import { SurfaceIds } from "../data/surfaces";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";

// ===========================================
// Constants
// ===========================================

/** Levels the floor of the bowl sits below the ground around it. */
const CRATER_DEPTH = 2;

/** Radius of the floor, as a share of the whole crater. */
const FLOOR_SHARE = 0.45;

/** Crater radius as a share of the shorter map side. */
const RADIUS_SHARE = { min: 0.22, max: 0.32 } as const;

/** Columns of untouched ground kept between the crater and the map edge. */
const EDGE_MARGIN = 6;

// ===========================================
// CraterPass
// ===========================================

/**
 * Stamps the impact bowl of a spore crash site (GDD §8, M3).
 *
 * **Prototype.** No mission type asks for this archetype; it exists so the
 * shape can be looked at and measured before M3 commits to it.
 *
 * ```
 *   ▁▁▁▂▂▃▃▃▃▃▂▂▁▁▁     one ring per level, so every step is climbable
 *   ▁▁▂▂▃▄▄▄▄▄▃▃▂▂▁     and the ramp pass can bridge the ones it needs
 *   ▁▂▂▃▄▄▅▅▅▄▄▃▂▂▁
 * ```
 *
 * The bowl is **terraced, not dug**: each ring steps down one level, so a
 * unit walks in from any side and the two-level cliff rule never bites.
 * A single deep hole would be a pit nothing could enter, which is the
 * mistake this shape exists to avoid.
 */
export class CraterPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "crater";
  readonly requires: readonly DraftCapability[] = ["heightmap", "water"];
  readonly provides: readonly DraftCapability[] = ["elevation"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Sinks one terraced bowl into the middle of the plat. */
  run(context: GenerationContext): void {
    const { draft, rng, diagnostics } = context;
    // The grid has no level below zero, so the plat rises by the depth of
    // the bowl before anything is dug. Levels are relative, so lifting
    // everything together changes nothing except where the floor can go.
    raiseAll(draft, CRATER_DEPTH);
    const shorter = Math.min(draft.width, draft.depth);
    const radius = Math.round(
      shorter *
        (RADIUS_SHARE.min + rng.next() * (RADIUS_SHARE.max - RADIUS_SHARE.min)),
    );
    const centre = pickCentre(draft, radius, rng);
    const floor = Math.max(1, Math.round(radius * FLOOR_SHARE));
    // Flatten first. The rings are one level apart by construction, but
    // the terrain under them is not, and the two relief patterns compound
    // into steps nothing can climb. An impact would level the ground it
    // lands on, so the bowl is carved into a flat disc.
    const rim = levelDisc(draft, centre, radius);
    let sunk = 0;

    for (let z = centre.z - radius; z <= centre.z + radius; z++) {
      for (let x = centre.x - radius; x <= centre.x + radius; x++) {
        if (!draft.inBounds(x, z)) {
          continue;
        }
        const distance = Math.hypot(x - centre.x, z - centre.z);
        if (distance > radius) {
          continue;
        }
        const step = ringDepth(distance, radius, floor);
        if (step === 0) {
          continue;
        }
        draft.setGroundLevel(x, z, rim - step);
        draft.setGroundSurface(
          x,
          z,
          step >= CRATER_DEPTH ? SurfaceIds.ROCK : SurfaceIds.DIRT,
        );
        sunk++;
      }
    }
    diagnostics.note(
      `crater r${radius} at ${centre.x},${centre.z}, ${sunk} columns sunk`,
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Flattens the disc to the level most of it already sits on, and returns
 * that level: the rim the bowl is measured down from.
 */
function levelDisc(
  draft: MapDraft,
  centre: { x: number; z: number },
  radius: number,
): number {
  const counts = new Map<number, number>();
  for (let z = centre.z - radius; z <= centre.z + radius; z++) {
    for (let x = centre.x - radius; x <= centre.x + radius; x++) {
      if (
        !draft.inBounds(x, z) ||
        Math.hypot(x - centre.x, z - centre.z) > radius
      ) {
        continue;
      }
      const level = draft.groundLevelAt(x, z);
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
  }
  let rim = 0;
  let best = 0;
  for (const [level, count] of counts) {
    if (count > best) {
      best = count;
      rim = level;
    }
  }
  for (let z = centre.z - radius; z <= centre.z + radius; z++) {
    for (let x = centre.x - radius; x <= centre.x + radius; x++) {
      if (
        !draft.inBounds(x, z) ||
        Math.hypot(x - centre.x, z - centre.z) > radius
      ) {
        continue;
      }
      draft.setGroundLevel(x, z, rim);
    }
  }
  return rim;
}

/** Lifts every column, so the bowl has somewhere to go. */
function raiseAll(draft: MapDraft, levels: number): void {
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      draft.setGroundLevel(x, z, draft.groundLevelAt(x, z) + levels);
    }
  }
}

/**
 * Levels below the surrounding ground at this distance from the centre:
 * the floor is `CRATER_DEPTH` down, and every ring outside it climbs one
 * level, so no step is ever more than one.
 */
function ringDepth(distance: number, radius: number, floor: number): number {
  if (distance <= floor) {
    return CRATER_DEPTH;
  }
  const band = (radius - floor) / CRATER_DEPTH;
  const out = Math.ceil((distance - floor) / Math.max(1, band));
  return Math.max(0, CRATER_DEPTH - out);
}

/** A centre far enough from the edge that the whole bowl lands on the map. */
function pickCentre(
  draft: MapDraft,
  radius: number,
  rng: Rng,
): { x: number; z: number } {
  const low = radius + EDGE_MARGIN;
  const highX = Math.max(low, draft.width - radius - EDGE_MARGIN);
  const highZ = Math.max(low, draft.depth - radius - EDGE_MARGIN);
  return { x: rng.nextInt(low, highX), z: rng.nextInt(low, highZ) };
}
