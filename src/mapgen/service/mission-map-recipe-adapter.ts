import type {
  MissionHookRequirement,
  MissionType,
} from "../../content/model/mission-type";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { Mission } from "../../overworld/model/mission";
import { HOOK_KIND_DEFAULTS } from "../data/hook-kind-defaults";
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
  const hooks: HookRequirement[] = [];
  for (const requirement of missionType.requiredHooks) {
    if (!registries.hookPlacers.has(requirement.kind)) {
      return err({ kind: "unknown-hook-kind", id: requirement.kind });
    }
    hooks.push(toHookRequirement(requirement, mission.difficulty));
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
): HookRequirement {
  const defaults = HOOK_KIND_DEFAULTS[requirement.kind];
  return {
    kind: requirement.kind,
    count: scaledHookCount(requirement, difficulty),
    requiredPass: defaults?.requiredPass ?? 1,
    ...(defaults?.minDistanceFromDeploy === undefined
      ? {}
      : { minDistanceFromDeploy: defaults.minDistanceFromDeploy }),
    ...(defaults?.meta === undefined ? {} : { meta: defaults.meta }),
  };
}
