import type { Result } from "../../../core/model/result";
import { err, ok } from "../../../core/model/result";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { Mission } from "../../../overworld/model/mission";
import type { GreatPodSetupTuning } from "../../model/great-pod-setup-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import type { SpawnerVariant } from "../../model/spawner-variant";
import type { TacticalError } from "../../model/tactical-error";
import type {
  DestroyPodObjective,
  Spawner,
  TacticalState,
} from "../../model/tactical-state";
import {
  OBJECTIVE_ID_PREFIX,
  SPAWNER_ID_PREFIX,
} from "../../model/tactical-state";
import { placeCavernBroods } from "../brood-placement-service";
import { crashPodMaturityTurn } from "./crash-site-setup";
import { coordOf, firstTile, hatchRadiusOf } from "./map-placement";

// ===========================================
// Constants
// ===========================================

/** The spawner variant a great pod's core is. */
export const GREAT_POD_CORE_VARIANT: SpawnerVariant = "great-pod-core";

// ===========================================
// The great pod
// ===========================================

/**
 * Stands up a great pod (#1238) on a map the great-pod generator built:
 * the core sealed in its middle, the clock it ripens on, and the broods
 * asleep in its chambers. A reusable piece: First Skyfall's story setup
 * calls it, and any later mission fought on a great pod can.
 *
 * ```
 *   great-pod-core hook ──► the core: a 3×3 great-pod-core spawner on the
 *                           hook's square, anchored at its first tile,
 *                           coreHp + coreHpPerDifficulty × (d − 1) hp     id: spawner-*
 *                       ──► destroy-pod { targetId: the core, greatPod,    id: objective-*
 *                             deadlineTurn: crashPodMaturityTurn(d) + hullTurns }
 *   brood-chamber hooks ──► placeCavernBroods with tuning.broods           ids: unit-*
 * ```
 *
 * The objective is the crash site's own `destroy-pod`: wrecking the
 * core completes it and the force extracts; the deadline ripens the
 * core (`maturePod`), which bursts into its chamber (`podBurst`, within
 * the hook's hatch radius), fails the objective and leaves the force
 * only the walk home. Refuses with `map-recipe` on a map without the
 * core's hook, which the map's validator never lets through.
 *
 * @param state - The mission so far (a crash site's: its edge waves set).
 * @param map - The great pod's map.
 * @param mission - The offer; its difficulty sets the hit points and the clock.
 * @param deps - Ids, the spawn tuning, the crash site's clock and the brood species.
 * @param tuning - The core, the hull's turns and the broods.
 * @returns The mission with the core, its objective and the broods.
 */
export function placeGreatPod(
  state: TacticalState,
  map: TacticalMap,
  mission: Pick<Mission, "difficulty">,
  deps: MissionSetupDeps,
  tuning: GreatPodSetupTuning,
): Result<TacticalState, TacticalError> {
  const hook = map.hooks.objectives.find(
    (candidate) => candidate.kind === HookKinds.GREAT_POD_CORE,
  );
  if (hook === undefined) {
    return err({ kind: "map-recipe", reason: "the great pod has no core" });
  }
  const hp = greatPodCoreHp(mission.difficulty, tuning);
  const core: Spawner = {
    id: deps.ids.nextId(SPAWNER_ID_PREFIX),
    variant: GREAT_POD_CORE_VARIANT,
    pos: coordOf(firstTile(hook)),
    hatchRadius: hatchRadiusOf(hook),
    hp,
    maxHp: hp,
    timer: 0,
    destroyed: false,
  };
  const objective: DestroyPodObjective = {
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "destroy-pod",
    targetId: core.id,
    complete: false,
    deadlineTurn: greatPodRipenTurn(mission.difficulty, deps, tuning),
    greatPod: true,
  };
  const withCore: TacticalState = {
    ...state,
    spawners: [...state.spawners, core],
    objectives: [...state.objectives, objective],
  };
  return ok(
    placeCavernBroods(withCore, map, {
      ids: deps.ids,
      ...(deps.broods === undefined
        ? {}
        : { broods: { ...deps.broods, tuning: tuning.broods } }),
    }),
  );
}

/**
 * The core's hit points at `difficulty`: the base plus a step per
 * difficulty above 1, floored.
 *
 * @param difficulty - The offer's difficulty.
 * @param tuning - The core's base and step.
 */
export function greatPodCoreHp(
  difficulty: number,
  tuning: Pick<GreatPodSetupTuning, "coreHp" | "coreHpPerDifficulty">,
): number {
  return Math.floor(
    tuning.coreHp + Math.max(0, difficulty - 1) * tuning.coreHpPerDifficulty,
  );
}

/**
 * The turn whose end ripens the core: the crash site's pod clock at
 * `difficulty` with the hull's turns on top. The briefing reads it too.
 *
 * @param difficulty - The offer's difficulty.
 * @param deps - The shared pod clock and the crash site's own.
 * @param tuning - The hull's turns.
 */
export function greatPodRipenTurn(
  difficulty: number,
  deps: Pick<MissionSetupDeps, "spawnTuning" | "crashSite">,
  tuning: Pick<GreatPodSetupTuning, "hullTurns">,
): number {
  return (
    crashPodMaturityTurn(difficulty, deps.spawnTuning, deps.crashSite) +
    tuning.hullTurns
  );
}
