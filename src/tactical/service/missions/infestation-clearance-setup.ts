import { ok } from "../../../core/model/result";
import type { IdGenerator } from "../../../core/model/id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { Mission } from "../../../overworld/model/mission";
import type {
  MissionSetupDeps,
  MissionSetupRule,
} from "../../model/mission-setup-rule";
import type { SpawnTuning } from "../../model/spawn-tuning";
import type {
  Objective,
  Spawner,
  TacticalState,
} from "../../model/tactical-state";
import {
  OBJECTIVE_ID_PREFIX,
  SPAWNER_ID_PREFIX,
} from "../../model/tactical-state";
import { hatchInterval } from "../spawn-service";
import { coordOf, firstTile, hatchRadiusOf } from "./map-placement";

// ===========================================
// Egg spawners
// ===========================================

/**
 * Stands one egg spawner on every egg-spawner hook and gives each its
 * own `destroy-spawner` objective (GDD §5.4), appended to whatever the
 * mission already has. The clearance is nothing else; a type that also
 * has nests to clear (a hive) calls this from its own setup.
 *
 * ```
 *   map.hooks.objectives (egg-spawner), in hook order
 *     ──► spawners, a full hatch interval from hatching   ids: spawner-*
 *     ──► one destroy-spawner objective per spawner       ids: objective-*
 * ```
 *
 * Every spawner id is issued before the first objective id, the order
 * the mission start always issued them in.
 *
 * @param state - The mission so far.
 * @param map - The generated map whose hooks the spawners stand on.
 * @param mission - The offer; its difficulty sets the hatch interval.
 * @param deps - Ids and the spawn tuning.
 */
export function placeEggSpawners(
  state: TacticalState,
  map: TacticalMap,
  mission: Mission,
  deps: MissionSetupDeps,
): TacticalState {
  const stood = standEggSpawners(state, map, mission, deps);
  const spawners = stood.spawners.slice(state.spawners.length);
  const objectives = spawners.map((spawner): Objective => ({
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "destroy-spawner",
    targetId: spawner.id,
    complete: false,
  }));
  return {
    ...stood,
    objectives: [...stood.objectives, ...objectives],
  };
}

/**
 * Stands one egg spawner on every egg-spawner hook, appended to the
 * mission's spawners, with no objective to destroy them: the nests are
 * the threat, not the job. A wreck recovery's (arc §6.6) and an
 * evacuation's (arc §6.4) bugs come from these; the clearance adds its
 * objectives on top.
 *
 * ```
 *   map.hooks.objectives (egg-spawner), in hook order
 *     ──► spawners, a full hatch interval from hatching   ids: spawner-*
 * ```
 *
 * @param state - The mission so far.
 * @param map - The generated map whose hooks the spawners stand on.
 * @param mission - The offer; its difficulty sets the hatch interval.
 * @param deps - Ids and the spawn tuning.
 */
export function standEggSpawners(
  state: TacticalState,
  map: TacticalMap,
  mission: Mission,
  deps: MissionSetupDeps,
): TacticalState {
  const spawners = eggSpawnersFrom(
    map,
    deps.ids,
    deps.spawnTuning,
    mission.difficulty,
  );
  return { ...state, spawners: [...state.spawners, ...spawners] };
}

// ===========================================
// Rule
// ===========================================

/** `infestation-clearance` (GDD §5.4): destroy every egg spawner, then board the drop ship. */
export const INFESTATION_CLEARANCE_SETUP: MissionSetupRule = {
  typeId: "infestation-clearance",
  /** The nests and one objective each; nothing else is the clearance's own. */
  setup(state, map, mission, deps) {
    return ok(placeEggSpawners(state, map, mission, deps));
  },
};

// ===========================================
// Helpers
// ===========================================

/**
 * One egg spawner per egg-spawner objective hook, on the hook's first
 * tile, a full hatch interval from hatching; no objectives.
 * `standEggSpawners` appends them for the clearance, which gives each
 * one, and for a wreck recovery; the Hive Assault's chamber nests stand
 * from here too, with a bounty and no objective.
 *
 * @param map - The map whose egg-spawner hooks the nests stand on.
 * @param ids - Issues one spawner id per nest, in hook order.
 * @param tuning - Spawner hit points and hatch interval.
 * @param difficulty - The offer's difficulty, which shortens the interval.
 */
export function eggSpawnersFrom(
  map: TacticalMap,
  ids: IdGenerator,
  tuning: SpawnTuning,
  difficulty: number,
): Spawner[] {
  return map.hooks.objectives
    .filter((hook) => hook.kind === HookKinds.EGG_SPAWNER)
    .map((hook): Spawner => ({
      id: ids.nextId(SPAWNER_ID_PREFIX),
      pos: coordOf(firstTile(hook)),
      hatchRadius: hatchRadiusOf(hook),
      hp: tuning.spawnerHp,
      timer: hatchInterval(difficulty, tuning),
      destroyed: false,
    }));
}
