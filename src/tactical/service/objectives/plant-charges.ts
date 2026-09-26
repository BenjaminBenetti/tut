import { err, ok } from "../../../core/model/result";
import { manhattanDistance } from "../../../core/service/grid-math";
import type { ObjectiveInteraction } from "../../model/objective-rules";
import { nearestSpawnerTile } from "../footprint-service";
import { damageSpawner } from "../spawner-damage-service";
import { isWreckObjective, wreckTarget } from "./wreck-objectives";

// ===========================================
// Interaction
// ===========================================

/**
 * A wreck objective's interaction (`destroy-spawner`, `destroy-pod`):
 * the unit plants charges on the spawner or pod the objective tracks.
 * It loses `chargeDamage` hit points and, at zero, is destroyed and its
 * objective completed.
 *
 * ```
 *   not a wreck objective ──► objective-not-interactive
 *   target gone (wrecked, matured) ──► objective-target-missing
 *   manhattan(unit, nearest target tile) > interactRange ──► objective-out-of-reach
 *          │
 *          ▼
 *   target.hp − chargeDamage, SpawnerDamaged
 *   hp <= 0 ──► destroyed, objective complete, ObjectiveUpdated
 * ```
 */
export const plantCharges: ObjectiveInteraction = (
  mission,
  objective,
  unit,
  tuning,
) => {
  if (!isWreckObjective(objective)) {
    return err({
      kind: "objective-not-interactive",
      objectiveId: objective.id,
    });
  }
  const spawner = wreckTarget(objective, mission);
  if (spawner === undefined || spawner.destroyed) {
    return err({
      kind: "objective-target-missing",
      objectiveId: objective.id,
      targetId: objective.targetId,
    });
  }
  // The nearest tile of the target, so any face of the 3×3 hive core
  // takes charges; a nest or a pod is its own single tile.
  const distance = manhattanDistance(
    unit.pos,
    nearestSpawnerTile(spawner, unit.pos),
  );
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
