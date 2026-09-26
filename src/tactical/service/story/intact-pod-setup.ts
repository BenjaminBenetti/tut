import { err, ok } from "../../../core/model/result";
import type { IdGenerator } from "../../../core/model/id-generator";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { IntactPodTuning } from "../../model/intact-pod-tuning";
import type { StorySetupRule } from "../../model/story-setup-rule";
import type {
  DestroyPodObjective,
  Objective,
  RecoverPodObjective,
  Spawner,
  TacticalState,
} from "../../model/tactical-state";
import type { UnitTemplate } from "../../model/unit-template";
import { podHp } from "../spawn-service";
import type { UnitBuild } from "../unit-factory";
import { generatorUnit, templateIdFor } from "../unit-factory";
import { coordOf, facingToward } from "../missions/map-placement";

// ===========================================
// Constants
// ===========================================

/**
 * `sourceId` of Intact Pod's pod (#1179): a `generator`-kind unit, but
 * not a generator, so it gets a template of its own
 * (`"generator:spore-pod"`) beside a defence's `"generator:generator"`.
 */
export const INTACT_POD_SOURCE_ID = "spore-pod";

// ===========================================
// Rule
// ===========================================

/**
 * Intact Pod (#1179, campaign arc §6.9) on top of its crash site: the
 * pod must survive to be recovered, so the crash site's pod to burn
 * becomes a pod to keep.
 *
 * ```
 *   the crash site's setup has run: a spore-pod spawner + destroy-pod,
 *   and edgeSpawn.totalWaves = podEdgeWaves
 *   for each destroy-pod objective, in order:
 *     its spawner          ──► gone: nothing to burn, nothing to mature
 *     a pod unit of ours   ──► kind generator, team tdf, on the spawner's tile,
 *                              podHp(difficulty) hit points          ids: unit-*
 *     the objective        ──► recover-pod, same id, deadlineTurn = recoveryTurn,
 *                              huntedAt = the pod's tile
 *   edgeSpawn.totalWaves += extraWaves
 *   no destroy-pod to replace ──► refused (map-recipe)
 * ```
 *
 * A `generator`-kind unit is what the swarm already hunts (#1175): the
 * lurker, brute, spitter and burrower keep every generator they see
 * among their marks, the swarmer takes the nearest enemy, and a bug
 * that sees nothing heads for the objective's `huntedAt` tile. The pod
 * is ours, so the turn engine, the mission end and the debrief treat it
 * as they treat a generator: autonomous, never the force, never a
 * casualty.
 *
 * @param tuning - The recovery turn, the extra waves and the pod's make.
 * @returns The rule, for `STORY_SETUP_RULES["intact-pod"]`.
 */
export function createIntactPodSetup(tuning: IntactPodTuning): StorySetupRule {
  return {
    storyId: "intact-pod",
    /** The pod to burn becomes the pod to keep, and the edges keep coming until the drop. */
    setup(state, map, mission, deps) {
      const burns = state.objectives.filter(
        (objective): objective is DestroyPodObjective =>
          objective.kind === "destroy-pod",
      );
      if (burns.length === 0) {
        return err({
          kind: "map-recipe",
          reason: "Intact Pod has no spore pod to recover",
        });
      }
      const hp = podHp(mission.difficulty, deps.spawnTuning);
      let next: TacticalState = state;
      for (const burn of burns) {
        next = keepPod(next, map, burn, hp, tuning, deps.ids);
      }
      const waves = next.edgeSpawn.totalWaves ?? deps.spawnTuning.podEdgeWaves;
      return ok({
        ...next,
        edgeSpawn: {
          ...next.edgeSpawn,
          totalWaves: waves + tuning.extraWaves,
        },
      });
    },
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * One crash-site pod made a pod to keep: its spawner removed, a pod
 * unit of ours on its tile, and its `destroy-pod` objective replaced in
 * place by a `recover-pod` of the same id. A burn whose spawner is
 * missing leaves the mission as it was.
 */
function keepPod(
  state: TacticalState,
  map: TacticalMap,
  burn: DestroyPodObjective,
  hp: number,
  tuning: IntactPodTuning,
  ids: IdGenerator,
): TacticalState {
  const spawner = state.spawners.find((s) => s.id === burn.targetId);
  if (spawner === undefined) {
    return state;
  }
  const built = podUnit(spawner, map, hp, tuning, ids);
  const recovery: RecoverPodObjective = {
    id: burn.id,
    kind: "recover-pod",
    targetId: built.unit.id,
    complete: false,
    failed: false,
    deadlineTurn: tuning.recoveryTurn,
    huntedAt: coordOf(spawner.pos),
  };
  return {
    ...state,
    spawners: state.spawners.filter((s) => s.id !== spawner.id),
    units: [...state.units, built.unit],
    templates: { ...state.templates, [built.template.id]: built.template },
    objectives: state.objectives.map((objective): Objective =>
      objective.id === burn.id ? recovery : objective,
    ),
  };
}

/**
 * The pod as a `generator`-kind unit of ours, built as a generator is
 * (no weapon, no movement, one id drawn) and then given its own source
 * and template, and an organic make, so a medkit mends it.
 */
function podUnit(
  spawner: Spawner,
  map: TacticalMap,
  hp: number,
  tuning: IntactPodTuning,
  ids: IdGenerator,
): UnitBuild {
  const pos = coordOf(spawner.pos);
  const built = generatorUnit(
    { ...tuning.pod, maxHp: hp },
    { pos, facing: facingToward(pos, map) },
    ids,
  );
  const template: UnitTemplate = {
    ...built.template,
    id: templateIdFor("generator", INTACT_POD_SOURCE_ID),
    construction: "organic",
  };
  return {
    template,
    unit: {
      ...built.unit,
      sourceId: INTACT_POD_SOURCE_ID,
      templateId: template.id,
    },
  };
}
