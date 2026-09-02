import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import { SurfaceIds } from "../data/surfaces";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import { ValueNoise } from "../service/value-noise";

// ===========================================
// Constants
// ===========================================

/** Water covers this fraction of columns on average, before wobble. */
const BASE_FRACTION_MIN = 0.22;
const BASE_FRACTION_MAX = 0.3;

/** Per-column wobble of the shoreline as a fraction of the map. */
const WOBBLE_FRACTION = 0.05;

/** How many lattice cells the shoreline wobble spans along the edge. */
const WOBBLE_FREQUENCY = 0.08;

/** Columns of beach just inland of the water. */
const BEACH_WIDTH = 2;

// ===========================================
// WaterPass
// ===========================================

/**
 * Pass 2 of the settlement archetype (ADR 0004 §7.3). For biomes with a
 * shoreline, floods a band of columns along one randomly chosen map edge:
 * water columns drop to level 0 and become `water` (impassable); the next
 * few columns inland become sand. Other biomes are untouched.
 *
 * ```
 *   edge w:   ~~~~::""""""""      ~ water, : beach, " ground
 *             ~~~::"""""""""      depth wobbles with 1D noise along z
 *             ~~~~~::"""""""
 * ```
 */
export class WaterPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "water";
  readonly requires: readonly DraftCapability[] = ["heightmap"];
  readonly provides: readonly DraftCapability[] = ["water"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Carves the shoreline when the biome has one. */
  run(context: GenerationContext): void {
    const { draft, params, rng, diagnostics } = context;
    if (!params.biome.hasShoreline) {
      diagnostics.note("no shoreline for this biome");
      return;
    }
    const edge = rng.pick(DIRECTIONS);
    const baseFraction =
      BASE_FRACTION_MIN + rng.next() * (BASE_FRACTION_MAX - BASE_FRACTION_MIN);
    const noise = new ValueNoise(rng.fork("shore"));
    const flooded = floodEdge(draft, edge, baseFraction, noise);
    diagnostics.note(`shoreline on edge ${edge}: ${flooded} water columns`);
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Floods columns from the edge inward; returns how many became water.
 * Along the edge, `along` indexes the shoreline and `inward` the distance
 * from the edge.
 */
function floodEdge(
  draft: MapDraft,
  edge: Direction,
  baseFraction: number,
  noise: ValueNoise,
): number {
  const horizontal = edge === "e" || edge === "w";
  const alongLength = horizontal ? draft.depth : draft.width;
  const inwardLength = horizontal ? draft.width : draft.depth;
  let flooded = 0;
  for (let along = 0; along < alongLength; along++) {
    const wobble = (noise.sample(along * WOBBLE_FREQUENCY, 0) - 0.5) * 2;
    const fraction = baseFraction + wobble * WOBBLE_FRACTION;
    const waterDepth = Math.round(fraction * inwardLength);
    for (let inward = 0; inward < waterDepth + BEACH_WIDTH; inward++) {
      if (inward >= inwardLength) {
        break;
      }
      const { x, z } = toColumn(draft, edge, along, inward);
      if (inward < waterDepth) {
        draft.setGroundLevel(x, z, 0);
        draft.setGroundSurface(x, z, SurfaceIds.WATER);
        flooded++;
      } else {
        draft.setGroundSurface(x, z, SurfaceIds.SAND);
      }
    }
  }
  return flooded;
}

/** Maps (along, inward) from an edge to a map column. */
function toColumn(
  draft: MapDraft,
  edge: Direction,
  along: number,
  inward: number,
): { x: number; z: number } {
  switch (edge) {
    case "w":
      return { x: inward, z: along };
    case "e":
      return { x: draft.width - 1 - inward, z: along };
    case "n":
      return { x: along, z: inward };
    case "s":
      return { x: along, z: draft.depth - 1 - inward };
  }
}
