import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import type {
  DestroyPodObjective,
  Spawner,
  TacticalState,
} from "../../model/tactical-state";
import {
  OBJECTIVE_ID_PREFIX,
  SPAWNER_ID_PREFIX,
} from "../../model/tactical-state";
import { podHp } from "../spawn-service";
import { coordOf, firstTile, hatchRadiusOf } from "./map-placement";

// ===========================================
// Spore pods
// ===========================================

/**
 * Stands a spore pod on every `spore-pod` hook and gives each its own
 * `destroy-pod` objective (campaign arc §6.3), appended to whatever the
 * mission already has. A crash site has one; the Crash Site type's setup
 * calls this, and any later type with a pod to burn (the Intact Pod
 * story mission) can too.
 *
 * ```
 *   map.hooks.objectives (spore-pod), in hook order
 *     ──► spore-pod spawners, podHp(difficulty) hit points   ids: spawner-*
 *     ──► one destroy-pod objective per pod,                ids: objective-*
 *         deadlineTurn = spawnTuning.podMaturityTurn
 * ```
 *
 * The pod is a `Spawner` of variant `spore-pod`, so the one damage path
 * (`damageSpawner`: charges, gunfire, blasts, fire), targeting, picking,
 * fog blips and the scene entity all serve it as they serve a nest; it
 * never hatches, and its timer is left at zero. Every pod id is issued
 * before the first objective id, as `placeEggSpawners` does.
 *
 * @param state - The mission so far.
 * @param map - The generated map whose hooks the pods stand on.
 * @param mission - The offer; only its difficulty is read, which sets
 *   the pod's hit points, so a harness may pass `{ difficulty }` alone.
 * @param deps - Ids and the spawn tuning.
 * @returns The mission with the pods and their objectives; unchanged
 *   when the map has no spore-pod hook.
 */
export function placeSporePod(
  state: TacticalState,
  map: TacticalMap,
  mission: Pick<Mission, "difficulty">,
  deps: MissionSetupDeps,
): TacticalState {
  const pods = map.hooks.objectives
    .filter((hook) => hook.kind === HookKinds.SPORE_POD)
    .map((hook): Spawner => ({
      id: deps.ids.nextId(SPAWNER_ID_PREFIX),
      variant: "spore-pod",
      pos: coordOf(firstTile(hook)),
      hatchRadius: hatchRadiusOf(hook),
      hp: podHp(mission.difficulty, deps.spawnTuning),
      timer: 0,
      destroyed: false,
    }));
  const objectives = pods.map((pod): DestroyPodObjective => ({
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "destroy-pod",
    targetId: pod.id,
    complete: false,
    deadlineTurn: deps.spawnTuning.podMaturityTurn,
  }));
  return {
    ...state,
    objectives: [...state.objectives, ...objectives],
    spawners: [...state.spawners, ...pods],
  };
}
