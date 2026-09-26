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
 * Which pass list generates the map (ADR 0004 §7.3). A mission's type
 * picks it through its `MissionMapRule` (ADR 0013 §2.3).
 *
 * - `settlement`: a town or city on its terrain; every shipped mission
 *   type fights on one.
 * - `crash-site`: open ground with a terraced impact crater and a debris
 *   field (#447, #662), where a spore pod came down (campaign arc §6.3).
 *   It carries the `spore-pod` hook on the crater floor; the Crash Site
 *   mission type's rule selects it.
 * - `hive-cavern`: the Hive Assault board (#1179), an open-topped chain
 *   of chambers sunk into impassable rock, deployed at the mouth, with
 *   the hive core in the deepest chamber (`docs/design/mapgen-pipeline.md`).
 * - `spore-platform-hull`: the finale's first stage (#1179), a deck of
 *   terraced hull plates hanging in space, with the drop ship docked at
 *   its prow, the docking ring on one flank and the hatch down to the
 *   core at the far end.
 * - `spore-platform-core`: the finale's second stage (#1179), a round
 *   chamber of terraces reached along one narrow causeway, with the core
 *   seed behind the Sovereign's dais.
 */
export type MapArchetype =
  | "settlement"
  | "crash-site"
  | "hive-cavern"
  | "spore-platform-hull"
  | "spore-platform-core";

/**
 * Every archetype, in a fixed order: what the parameter resolver accepts
 * and what the preview harness offers.
 */
export const MAP_ARCHETYPES: readonly MapArchetype[] = [
  "settlement",
  "crash-site",
  "hive-cavern",
  "spore-platform-hull",
  "spore-platform-core",
];

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
  /** Whole infestation band, 0–10. Omitted recipes retain the clean baseline. */
  readonly infestation?: number;
  readonly archetype: MapArchetype;
  readonly biome: BiomeId;
  /** City-specific environment and art; absent preserves the biome defaults. */
  readonly placeProfile?: PlaceProfileId;
  readonly settlement: SettlementScale;
  readonly size: MapSize;
  /** From the mission type definition. */
  readonly hooks: readonly HookRequirement[];
  /**
   * A building kind the map must contain, raised on the lot nearest the
   * board's centre so it reads as the landmark (#1175). Hooks that gather
   * around a building, such as generators, look for it by kind. Must name
   * a registered building template; absent leaves the biome's weights to
   * decide every lot.
   */
  readonly landmark?: string;
  /** Registered authored site, reserved before ordinary settlement lots. */
  readonly site?: string;
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
