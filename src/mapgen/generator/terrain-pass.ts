import type { WeightedSurface } from "../model/biome-definition";
import type { MapDraft } from "../model/map-draft";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { SurfaceId } from "../model/surface";
import { ValueNoise } from "../service/value-noise";

// ===========================================
// Constants
// ===========================================

/**
 * Surface patches are smaller than hills: at the height frequency one
 * lattice cell spans a whole small map and every column lands in the same
 * band, so patches sample at a multiple of it.
 */
const SURFACE_FREQUENCY_SCALE = 2;

/**
 * Fractal value noise clusters around 0.5; stretching it about the middle
 * before quantising spreads columns across every level instead of piling
 * them on the middle one.
 */
const CONTRAST = 2.2;

// ===========================================
// TerrainPass
// ===========================================

/**
 * Pass 1 of the settlement archetype (ADR 0004 §7.3). Samples fractal
 * value noise at the biome's frequency, quantises it to integer levels
 * up to `amplitudeLayers`, and paints ground surfaces in contiguous
 * patches by thresholding a second, slower noise field against the
 * biome's surface weights.
 *
 * ```
 *   height noise ──► floor(h · (amplitude + 1)) ──► ground level
 *   patch  noise ──► cumulative weight bands   ──► ground surface
 * ```
 */
export class TerrainPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "terrain";
  readonly requires: readonly DraftCapability[] = [];
  readonly provides: readonly DraftCapability[] = ["heightmap"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Writes a ground level and surface for every column. */
  run(context: GenerationContext): void {
    const { draft, params, rng } = context;
    const { terrain, groundSurfaces } = params.biome;
    const heightNoise = new ValueNoise(rng.fork("height"));
    const patchNoise = new ValueNoise(rng.fork("patches"));
    const bands = surfaceBands(groundSurfaces);
    const patchFrequency = terrain.frequency * SURFACE_FREQUENCY_SCALE;

    let highest = 0;
    for (let z = 0; z < draft.depth; z++) {
      for (let x = 0; x < draft.width; x++) {
        const h = heightNoise.fbm(
          x * terrain.frequency,
          z * terrain.frequency,
          terrain.octaves,
          terrain.roughness,
        );
        // Quantised in layers (ADR 0008 §2.5): a hill climbs by half
        // storeys, and smoothing below keeps every natural step to one.
        const level = Math.min(
          terrain.amplitudeLayers,
          Math.floor(stretch(h) * (terrain.amplitudeLayers + 1)),
        );
        draft.setGroundLevel(x, z, level);
        highest = Math.max(highest, level);

        const p = patchNoise.fbm(
          x * patchFrequency,
          z * patchFrequency,
          Math.max(1, terrain.octaves - 1),
          terrain.roughness,
        );
        draft.setGroundSurface(x, z, surfaceFor(bands, stretch(p)));
      }
    }
    const smoothed = smoothToOneLayerSteps(draft);
    // Remembered so a later pass can tell a natural step from a graded
    // one; only natural steps become slopes (#799). Recorded after
    // smoothing, so the natural level is the one that obeys I11.
    for (let z = 0; z < draft.depth; z++) {
      for (let x = 0; x < draft.width; x++) {
        draft.setNaturalLevel(x, z, draft.groundLevelAt(x, z));
      }
    }
    context.diagnostics.note(
      `terrain up to layer ${String(highest)} of ${String(terrain.amplitudeLayers)}, ` +
        `${String(bands.length)} surface bands, ${String(smoothed)} columns lowered ` +
        `for I11 (max natural step ${String(maxStep(draft))})`,
    );
  }
}

// ===========================================
// Smoothing (I11)
// ===========================================

/**
 * Invariant I11 (ADR 0008 §2.5): no two orthogonally adjacent columns
 * differ by more than one layer. Relaxes by lowering the higher column of
 * any offending pair to one layer above the lower, repeating until stable.
 * Lowering only, so a valley is never filled and the pass converges in at
 * most `amplitude` sweeps; peaks flatten into terraces, which is the look
 * the Executive Director asked for. Returns how many columns moved.
 */
function smoothToOneLayerSteps(draft: MapDraft): number {
  let moved = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let z = 0; z < draft.depth; z++) {
      for (let x = 0; x < draft.width; x++) {
        const here = draft.groundLevelAt(x, z);
        for (const [dx, dz] of [
          [1, 0],
          [0, 1],
        ] as const) {
          const nx = x + dx;
          const nz = z + dz;
          if (!draft.inBounds(nx, nz)) continue;
          const there = draft.groundLevelAt(nx, nz);
          if (there - here > 1) {
            draft.setGroundLevel(nx, nz, here + 1);
            moved++;
            changed = true;
          } else if (here - there > 1) {
            draft.setGroundLevel(x, z, there + 1);
            moved++;
            changed = true;
          }
        }
      }
    }
  }
  return moved;
}

/** The largest level difference between any two orthogonal neighbours. */
function maxStep(draft: MapDraft): number {
  let max = 0;
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      const here = draft.groundLevelAt(x, z);
      if (x + 1 < draft.width) {
        max = Math.max(max, Math.abs(draft.groundLevelAt(x + 1, z) - here));
      }
      if (z + 1 < draft.depth) {
        max = Math.max(max, Math.abs(draft.groundLevelAt(x, z + 1) - here));
      }
    }
  }
  return max;
}

// ===========================================
// Helpers
// ===========================================

/** A surface with the upper bound of its noise band in [0, 1]. */
interface SurfaceBand {
  readonly surface: SurfaceId;
  readonly upTo: number;
}

/**
 * Turns weighted surfaces into cumulative bands over [0, 1], heaviest
 * first so the dominant surface takes the middle of the noise range.
 */
function surfaceBands(surfaces: readonly WeightedSurface[]): SurfaceBand[] {
  const sorted = [...surfaces].sort((a, b) => b.weight - a.weight);
  const total = sorted.reduce((sum, entry) => sum + entry.weight, 0);
  let cumulative = 0;
  return sorted.map((entry) => {
    cumulative += entry.weight / total;
    return { surface: entry.surface, upTo: cumulative };
  });
}

/** Stretches noise about 0.5 by `CONTRAST`, clamped to [0, 1). */
function stretch(value: number): number {
  const stretched = (value - 0.5) * CONTRAST + 0.5;
  return Math.min(0.999999, Math.max(0, stretched));
}

/** Picks the band a noise value falls in. */
function surfaceFor(bands: readonly SurfaceBand[], value: number): SurfaceId {
  for (const band of bands) {
    if (value < band.upTo) {
      return band.surface;
    }
  }
  return bands[bands.length - 1]?.surface ?? "";
}
