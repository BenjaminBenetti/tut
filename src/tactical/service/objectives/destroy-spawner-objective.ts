import { err, ok } from "../../../core/model/result";
import { manhattanDistance } from "../../../core/service/grid-math";
import type {
  ObjectiveInteraction,
  ObjectiveRules,
} from "../../model/objective-rules";
import type {
  DestroySpawnerObjective,
  Objective,
  SpawnerId,
  TacticalState,
} from "../../model/tactical-state";
import type { Spawner } from "../../model/tactical-state";
import { damageSpawner } from "../spawner-damage-service";

// ===========================================
// Interaction
// ===========================================

/**
 * `destroy-spawner`: the unit plants charges on the egg spawner the
 * objective tracks. The spawner loses `chargeDamage` hit points and, at
 * zero, is destroyed and its objective completed.
 *
 * ```
 *   target gone ──► objective-target-missing
 *   manhattan(unit, spawner) > interactRange ──► objective-out-of-reach
 *          │
 *          ▼
 *   spawner.hp − chargeDamage, SpawnerDamaged
 *   hp <= 0 ──► destroyed, objective complete, ObjectiveUpdated
 * ```
 */
export const plantCharges: ObjectiveInteraction = (
  mission,
  objective,
  unit,
  tuning,
) => {
  if (objective.kind !== "destroy-spawner") {
    return err({
      kind: "objective-not-interactive",
      objectiveId: objective.id,
    });
  }
  const spawner = mission.spawners.find(
    (candidate) => candidate.id === objective.targetId,
  );
  if (spawner === undefined || spawner.destroyed) {
    return err({
      kind: "objective-target-missing",
      objectiveId: objective.id,
      targetId: objective.targetId,
    });
  }
  const distance = manhattanDistance(unit.pos, spawner.pos);
  if (distance > tuning.interactRange) {
    return err({
      kind: "objective-out-of-reach",
      objectiveId: objective.id,
      distance,
      range: tuning.interactRange,
    });
  }

  return ok(damageSpawner(mission, spawner.id, tuning.chargeDamage, unit.id));
};

// ===========================================
// Completion by wrecking
// ===========================================

/**
 * The objectives that wrecking `spawnerId` completes: every open
 * `destroy-spawner` objective tracking it. `damageSpawner` asks this the
 * moment a spawner's hit points run out, whether charges, gunfire or a
 * fire did it, so the kind's completion lives with the kind.
 *
 * A failed objective stays failed: a pod wrecked after it matured is
 * still a wreck, but the job it was is lost, and the two flags are
 * never both set.
 *
 * `damageSpawner` and this module import each other; neither reads the
 * other while it loads, only when called, so either may load first.
 *
 * @param objectives - The mission's objectives, in order.
 * @param spawnerId - The spawner just destroyed.
 * @returns The objectives to mark complete, in objective order.
 */
export function spawnerObjectivesCleared(
  objectives: readonly Objective[],
  spawnerId: SpawnerId,
): readonly DestroySpawnerObjective[] {
  return objectives.filter(
    (objective): objective is DestroySpawnerObjective =>
      objective.kind === "destroy-spawner" &&
      objective.targetId === spawnerId &&
      !objective.complete &&
      objective.failed !== true,
  );
}

// ===========================================
// Rules
// ===========================================

/**
 * `destroy-spawner` (GDD §5.4): wreck one egg spawner. The clearance's
 * objective, and the shape pods and hive cores reuse: a destructible
 * thing on a tile, worked with charges or shot, blipped in the fog.
 *
 * ```
 *   complete      the flag, set when the spawner is wrecked
 *   failed        never, by its own rule (a deadline may still fail it)
 *   interaction   plantCharges
 *   reachable     the spawner, while it stands
 *   marker        the spawner's tile, while it stands with hit points
 *   destination   the spawner's tile, standing or not
 * ```
 */
export const DESTROY_SPAWNER_OBJECTIVE: ObjectiveRules<"destroy-spawner"> = {
  kind: "destroy-spawner",
  /** Done once its spawner was wrecked; `damageSpawner` sets the flag. */
  complete(objective) {
    return objective.complete;
  },
  /** A spawner can always be wrecked, so its own rule never gives up. */
  failed() {
    return false;
  },
  interaction: plantCharges,
  /** The spawner to plant charges on, until it is destroyed or gone. */
  reachable(objective, mission) {
    const spawner = trackedSpawner(objective, mission);
    return spawner === undefined || spawner.destroyed
      ? undefined
      : { id: spawner.id, pos: spawner.pos };
  },
  /** The nest's tile while it stands (#1173): location only, never its health. */
  marker(objective, mission) {
    const spawner = trackedSpawner(objective, mission);
    return spawner === undefined || spawner.destroyed || spawner.hp <= 0
      ? undefined
      : spawner.pos;
  },
  /** Where the nest is or was: its location is public intel, its health is not. */
  destination(objective, mission) {
    return { position: trackedSpawner(objective, mission)?.pos };
  },
};

// ===========================================
// Helpers
// ===========================================

/** The spawner the objective tracks, if it is on the map. */
function trackedSpawner(
  objective: DestroySpawnerObjective,
  mission: TacticalState,
): Spawner | undefined {
  return mission.spawners.find(
    (candidate) => candidate.id === objective.targetId,
  );
}
