import type { ObjectiveRules } from "../../model/objective-rules";
import type {
  DestroyPlatformCoreObjective,
  TacticalState,
} from "../../model/tactical-state";
import { plantCharges } from "./plant-charges";
import {
  wreckDestination,
  wreckMarker,
  wreckReachable,
  wreckTarget,
} from "./wreck-objectives";

// ===========================================
// Reading the core
// ===========================================

/**
 * The platform core's hit points now, for the tracker: its spawner's,
 * never below 0, or 0 once it is gone from the map.
 *
 * @param objective - The core stage's objective.
 * @param mission - The mission it belongs to.
 */
export function platformCoreHp(
  objective: DestroyPlatformCoreObjective,
  mission: TacticalState,
): number {
  const core = wreckTarget(objective, mission);
  return core === undefined || core.destroyed ? 0 : Math.max(0, core.hp);
}

// ===========================================
// Rules
// ===========================================

/**
 * `destroy-platform-core` (campaign arc §6.9): destroy the seed the
 * Spore Platform grows around. A wreck objective like `destroy-spawner`
 * — charges, gunfire, blasts and fire all count, through
 * `damageSpawner` — on a hardened `platform-core` spawner; the core
 * stage ends on its objectives, so the moment it falls the finale is
 * won, with nobody needing to get out.
 *
 * ```
 *   complete      the flag, set when the core is wrecked
 *   failed        never, by its own rule: the core can always be brought down
 *   interaction   plantCharges
 *   reachable     the core, while it stands
 *   marker        the core's tile, while it stands with hit points
 *   destination   the core's tile, standing or not
 *   tally         1 / 1 wrecked, 0 / 1 otherwise
 * ```
 *
 * The Sovereign is not an objective: killing her is not required, only
 * getting past her to the core.
 */
export const DESTROY_PLATFORM_CORE_OBJECTIVE: ObjectiveRules<"destroy-platform-core"> =
  {
    kind: "destroy-platform-core",
    /** Done once the core was wrecked; `damageSpawner` sets the flag. */
    complete(objective) {
      return objective.complete;
    },
    /** The core can always be brought down, so its own rule never gives up. */
    failed() {
      return false;
    },
    interaction: plantCharges,
    /** The core to plant charges on, until it is destroyed. */
    reachable(objective, mission) {
      return wreckReachable(objective, mission);
    },
    /** The core's tile while it stands (#1173): location only, never its health. */
    marker(objective, mission) {
      return wreckMarker(objective, mission);
    },
    /** Where the core is: every bug on the platform knows what it guards. */
    destination(objective, mission) {
      return wreckDestination(objective, mission);
    },
    /** One core, wrecked or not. */
    tally(objective) {
      return { done: objective.complete ? 1 : 0, total: 1 };
    },
  };
