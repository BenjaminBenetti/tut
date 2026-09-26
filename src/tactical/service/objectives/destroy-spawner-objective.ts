import type { ObjectiveRules } from "../../model/objective-rules";
import { plantCharges } from "./plant-charges";
import {
  wreckDestination,
  wreckMarker,
  wreckReachable,
} from "./wreck-objectives";

// ===========================================
// Rules
// ===========================================

/**
 * `destroy-spawner` (GDD §5.4): wreck one egg spawner. The clearance's
 * objective, and the shape pods and hive cores reuse: a destructible
 * thing on a tile, worked with charges or shot, blipped in the fog. The
 * shared pieces live in `wreck-objectives.ts` and `plant-charges.ts`;
 * `damageSpawner` completes it through `spawnerObjectivesCleared`.
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
    return wreckReachable(objective, mission);
  },
  /** The nest's tile while it stands (#1173): location only, never its health. */
  marker(objective, mission) {
    return wreckMarker(objective, mission);
  },
  /** Where the nest is or was: its location is public intel, its health is not. */
  destination(objective, mission) {
    return wreckDestination(objective, mission);
  },
};
