import type {
  MissionHookRequirement,
  MissionType,
} from "../../content/model/mission-type";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { Mission } from "../../overworld/model/mission";
import { HOOK_KIND_DEFAULTS } from "../data/hook-kind-defaults";
import type { MapDimensions } from "../model/map-recipe";
import type { HookRequirement, MapRecipe } from "../model/map-recipe";
import type { MapGenRegistries } from "../model/registries";
import { createDefaultRegistries } from "./default-registries";

// ===========================================
// Types
// ===========================================

/** Why a mission could not be turned into a recipe. Plain, serializable. */
export interface MapRecipeError {
  readonly kind:
    | "unknown-biome"
    | "unknown-settlement"
    | "unknown-size"
    | "unknown-hook-kind";
  /** The id that was not recognised. */
  readonly id: string;
}

/** The registries the adapter validates against. */
export type AdapterRegistries = Pick<
  MapGenRegistries,
  "biomes" | "settlements" | "mapSizes" | "hookPlacers"
>;

// ===========================================
// Constants
// ===========================================

/**
 * Tiles kept in hand when fitting a hook distance to a small map, so the
 * placers still have a ring of board to choose from rather than the last
 * legal column. Worth one failure in 480 at 16×16 (#465).
 */
const MAP_EDGE_MARGIN = 2;

// ===========================================
// Adapter
// ===========================================

/**
 * Turns an overworld `Mission` and its `MissionType` into a `MapRecipe`
 * (ADR 0004 §4.7): the mission's map seed, biome, settlement and size
 * pass straight through, and each of the type's hook requirements is
 * scaled by difficulty and completed with the kind's pass mask, distance
 * and metadata. Deterministic. Ids the registries do not know come back
 * as typed errors rather than throws, so overworld code can report them.
 *
 * ```
 *   Mission.mapParams { biome, settlement, size, seed }
 *   MissionType.requiredHooks [{ kind, count, countPerDifficulty }]
 *          │  × difficulty, + HOOK_KIND_DEFAULTS[kind]
 *          ▼
 *   MapRecipe { seed, params: { archetype, biome, settlement, size, hooks } }
 * ```
 */
export function missionToMapRecipe(
  mission: Mission,
  missionType: MissionType,
  registries: AdapterRegistries = createDefaultRegistries(),
): Result<MapRecipe, MapRecipeError> {
  const { biome, settlement, size, seed } = mission.mapParams;
  if (!registries.biomes.has(biome)) {
    return err({ kind: "unknown-biome", id: biome });
  }
  if (!registries.settlements.has(settlement)) {
    return err({ kind: "unknown-settlement", id: settlement });
  }
  if (!registries.mapSizes.has(size)) {
    return err({ kind: "unknown-size", id: size });
  }
  const dimensions = registries.mapSizes.get(size);
  const hooks: HookRequirement[] = [];
  for (const requirement of missionType.requiredHooks) {
    if (!registries.hookPlacers.has(requirement.kind)) {
      return err({ kind: "unknown-hook-kind", id: requirement.kind });
    }
    hooks.push(toHookRequirement(requirement, mission.difficulty, dimensions));
  }
  return ok({
    seed,
    params: { archetype: "settlement", biome, settlement, size, hooks },
  });
}

/**
 * Hooks of a kind at a difficulty: `count + floor(perDifficulty × (d − 1))`,
 * never negative.
 */
export function scaledHookCount(
  requirement: MissionHookRequirement,
  difficulty: number,
): number {
  const extra = Math.floor(
    (requirement.countPerDifficulty ?? 0) * Math.max(0, difficulty - 1),
  );
  return Math.max(0, requirement.count + extra);
}

// ===========================================
// Helpers
// ===========================================

/** Completes a content requirement with the kind's mapgen defaults. */
function toHookRequirement(
  requirement: MissionHookRequirement,
  difficulty: number,
  size: MapDimensions,
): HookRequirement {
  const defaults = HOOK_KIND_DEFAULTS[requirement.kind];
  const distance = fitDistanceToMap(defaults?.minDistanceFromDeploy, size);
  return {
    kind: requirement.kind,
    count: scaledHookCount(requirement, difficulty),
    requiredPass: defaults?.requiredPass ?? 1,
    ...(distance === undefined ? {} : { minDistanceFromDeploy: distance }),
    ...(defaults?.meta === undefined ? {} : { meta: defaults.meta }),
  };
}

/**
 * The kind's distance from deploy, fitted to the board (#465). A deploy
 * zone sits in an edge band and takes sixteen tiles, so on a small map
 * "at least 12 away" can leave nothing but rock, road and sidewalk for a
 * placer to stand on; the placer finds no candidate and the map dies on
 * I8 — which the invariant is right to do, because the recipe asked for
 * something the board cannot hold. Measured at 16×16 over 480 maps: 6
 * failures at distance 12, 1 at 8, none at 6 or below.
 *
 * The limit follows `width + depth` because the distance is manhattan and
 * a manhattan span is bounded by the two sides together — a long thin map
 * has room a rule about its shorter side would deny it — less a margin so
 * the placers keep a ring of board to choose from rather than the last
 * legal column.
 *
 * ```
 *   16×16 ──► 6     20×20 ──► 8     16×40 ──► 12, the shipped value
 *   32×32 ──► 14 and 16×256 ──► 66, so every preset passes untouched
 * ```
 */
function fitDistanceToMap(
  distance: number | undefined,
  size: MapDimensions,
): number | undefined {
  if (distance === undefined) {
    return undefined;
  }
  const room = Math.floor((size.width + size.depth) / 4) - MAP_EDGE_MARGIN;
  return Math.min(distance, Math.max(0, room));
}
