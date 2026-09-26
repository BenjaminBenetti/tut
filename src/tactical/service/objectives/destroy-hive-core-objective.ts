import { gridKey, isInBounds } from "../../../core/service/grid-math";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { ObjectiveRules } from "../../model/objective-rules";
import type {
  DestroyHiveCoreObjective,
  TacticalState,
} from "../../model/tactical-state";
import { spawnerFootprintTiles } from "../footprint-service";
import { plantCharges } from "./plant-charges";
import {
  wreckDestination,
  wreckMarker,
  wreckReachable,
  wreckTarget,
} from "./wreck-objectives";

// ===========================================
// Sighting
// ===========================================

/**
 * True once the squad has explored any tile the objective's hive core
 * stands on. The core sits at the back of an unlit cavern; the player
 * learns where it is by finding it, so its fog blip waits until then.
 *
 * @param objective - The hive core objective.
 * @param mission - The mission it belongs to.
 * @returns Whether TDF has ever seen a tile of the core.
 */
export function hiveCoreSeen(
  objective: DestroyHiveCoreObjective,
  mission: TacticalState,
): boolean {
  const core = wreckTarget(objective, mission);
  const explored = mission.vision.tdf?.explored;
  if (core === undefined || explored === undefined || explored.length === 0) {
    return false;
  }
  const keys = new Set(explored);
  const { width, depth } = mission.map;
  return spawnerFootprintTiles(core).some(
    (tile: TileCoord) =>
      isInBounds(tile, width, depth) && keys.has(gridKey(tile, width, depth)),
  );
}

// ===========================================
// Rules
// ===========================================

/**
 * `destroy-hive-core` (campaign arc §6.5): bring down the 3×3 hive core
 * at the back of the cavern and get out. A wreck objective like
 * `destroy-pod` — charges, gunfire, blasts and fire all count, through
 * `damageSpawner`, which sets the `complete` flag when the core falls —
 * but the objective is only done once someone is also aboard.
 *
 * ```
 *   complete      the flag (the core fell) AND at least one unit extracted
 *   failed        the mission was lost
 *   interaction   plantCharges, against the core's nearest face
 *   reachable     the core, while it stands, with its 3×3 footprint
 *   marker        the core's middle tile, once any of it has been seen
 *   destination   the core's middle tile, standing or not
 *   tally         1 / 1 once it fell, 0 / 1 otherwise
 *   resultFields  hiveCoreDestroyed
 * ```
 *
 * The stored flag is what the tracker counts, so the HUD says "board the
 * drop ship" the moment the core falls; the extraction half is what
 * `objectiveComplete` and so the outcome, the abandon summary and the
 * result row read.
 */
export const DESTROY_HIVE_CORE_OBJECTIVE: ObjectiveRules<"destroy-hive-core"> =
  {
    kind: "destroy-hive-core",
    /** Done once the core fell and someone got out. */
    complete(objective, mission) {
      return objective.complete && mission.extracted.length > 0;
    },
    /** Lost with the mission: a wiped or abandoned assault leaves the hive. */
    failed(_objective, mission) {
      return mission.outcome === "lost";
    },
    interaction: plantCharges,
    /** The core to plant charges on, until it falls. */
    reachable(objective, mission) {
      return wreckReachable(objective, mission);
    },
    /** The core's middle tile while it stands, once the squad has seen it. */
    marker(objective, mission) {
      return hiveCoreSeen(objective, mission)
        ? wreckMarker(objective, mission)
        : undefined;
    },
    /** Where the core is: its location is public intel, its health is not. */
    destination(objective, mission) {
      return wreckDestination(objective, mission);
    },
    /** One core, fallen or not. */
    tally(objective) {
      return { done: objective.complete ? 1 : 0, total: 1 };
    },
    /** Whether the core fell, for the debrief's tagline. */
    resultFields(objective) {
      return { hiveCoreDestroyed: objective.complete };
    },
  };
