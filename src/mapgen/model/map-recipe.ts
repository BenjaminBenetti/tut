import type { PlaceProfileId } from "../../content/model/place-profile-id";
import type { BiomeId } from "../../content/model/biome-id";
import type { MapSizeId } from "../../content/model/map-size-id";
import { MAP_SIZE_IDS } from "../../content/model/map-size-id";
import type { SettlementScale } from "../../content/model/settlement-scale";
import type { HookKind, HookMeta } from "./hook";
import type { PassMask } from "./pass-mask";

// ===========================================
// Parameters
// ===========================================

/**
 * Which pass list generates the map (ADR 0004 §7.3). `settlement` is what
 * every mission generates today.
 *
 * `crash-site` is a **prototype**: no mission type asks for it and the
 * adapter cannot produce one, so it reaches the generator only from the
 * preview harness or a test. It exists to be looked at and measured
 * before M3 commits to the shape (#447). Hives and the space platform
 * follow the same route when their turn comes.
 */
export type MapArchetype = "settlement" | "crash-site";

/**
 * Named map sizes, resolved through `mapgen/data/map-sizes`. The union
 * itself is shared vocabulary in `content/model/map-size-id` (ADR 0002
 * §2.1) so the overworld's `Mission` can name a size without importing
 * `mapgen/`.
 */
export type MapSizePreset = MapSizeId;

/** Every size preset, smallest first. */
export const MAP_SIZE_PRESETS: readonly MapSizePreset[] = MAP_SIZE_IDS;

/** Explicit horizontal size in tiles. */
export interface MapDimensions {
  readonly width: number;
  readonly depth: number;
}

/** A preset name or explicit dimensions. */
export type MapSize = MapSizePreset | MapDimensions;

/**
 * What a mission type asks the generator to place. The hook pass resolves
 * `kind` to a placer; invariant I8 checks the result.
 */
export interface HookRequirement {
  readonly kind: HookKind;
  /** Exact number of hooks of this kind the placer must emit. */
  readonly count: number;
  /** Classes that must be able to reach each hook. */
  readonly requiredPass: PassMask;
  /** Minimum manhattan distance from any deploy zone tile. */
  readonly minDistanceFromDeploy?: number;
  /**
   * Manhattan distance from the deploy zone the nearest hook of this
   * kind starts within, when any candidate allows it. Keeps the first
   * shot inside a turn budget however large the map (ADR 0009, #829):
   * hooks drawn at random beyond a minimum drift outward with the board.
   */
  readonly maxNearestDistanceFromDeploy?: number;
  readonly meta?: HookMeta;
}

/** Everything except the seed that shapes a map. */
export interface MapGenParams {
  readonly archetype: MapArchetype;
  readonly biome: BiomeId;
  /** City-specific environment and art; absent preserves the biome defaults. */
  readonly placeProfile?: PlaceProfileId;
  readonly settlement: SettlementScale;
  readonly size: MapSize;
  /** From the mission type definition. */
  readonly hooks: readonly HookRequirement[];
  /**
   * Share of natural terrain edges that become walkable slopes rather
   * than cliffs, 0–1 (#799). Decided per connected run of edge tiles so a
   * corner is never left without its straights. Defaults to 1: every
   * natural edge is a hillside. Man-made edges are never slopes.
   */
  readonly slopeShare?: number;
}

/**
 * What a save stores instead of the map (ADR 0004 §4.7). Generating from
 * the same recipe yields a deep-equal `TacticalMap`.
 */
export interface MapRecipe {
  /** Free text; hashed to the RNG's numeric seed by core's `hashSeed`. */
  readonly seed: string;
  readonly params: MapGenParams;
}

/**
 * Returns true when the size is a preset name rather than explicit
 * dimensions.
 */
export function isMapSizePreset(size: MapSize): size is MapSizePreset {
  return typeof size === "string";
}
