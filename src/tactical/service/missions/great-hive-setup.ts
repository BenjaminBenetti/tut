import { isGreatHiveAssault } from "../../../overworld/model/hive-assault-spec";
import type {
  MissionSetupDeps,
  MissionSetupRule,
} from "../../model/mission-setup-rule";
import type { HiveBroodPlacement } from "./hive-assault-setup";
import { setUpHiveAssault } from "./hive-assault-setup";

// ===========================================
// Decorator
// ===========================================

/**
 * `ordinary` — the Hive Assault setup — with Great Hive assaults set up
 * oversized (campaign arc §6.9). A Great Hive's mission runs the same
 * `setUpHiveAssault` on its bigger cavern, but with the Great Hive's
 * tuning in place of the Hive Assault's:
 *
 * ```
 *   mission.hive.great ∧ deps.greatHive?
 *     no  ──► ordinary.setup(state, map, mission, deps)        (unchanged)
 *     yes ──► setUpHiveAssault(state, map, mission, deps', placeBroods)
 *               deps'.hiveAssault = greatHive.assault   core hp, guards
 *               deps'.broods.tuning = greatHive.broods  thinner broods
 * ```
 *
 * The map rule already gave the Great Hive its bigger cavern, its extra
 * chambers and its nests; this is what stands in them. Without
 * `deps.greatHive` (a start built before the Great Hives) the mission is
 * set up as an ordinary Hive Assault.
 */
export function withGreatHiveSetup(
  ordinary: MissionSetupRule,
  placeBroods: HiveBroodPlacement,
): MissionSetupRule {
  return {
    typeId: ordinary.typeId,

    /** The ordinary setup, or the oversized one for a Great Hive. */
    setup(state, map, mission, deps) {
      if (!isGreatHiveAssault(mission) || deps.greatHive === undefined) {
        return ordinary.setup(state, map, mission, deps);
      }
      return setUpHiveAssault(
        state,
        map,
        mission,
        greatHiveDeps(deps, deps.greatHive),
        placeBroods,
      );
    },
  };
}

// ===========================================
// Helpers
// ===========================================

/** `deps` with the Great Hive's assault and brood tuning in place of the ordinary ones. */
function greatHiveDeps(
  deps: MissionSetupDeps,
  great: NonNullable<MissionSetupDeps["greatHive"]>,
): MissionSetupDeps {
  return {
    ...deps,
    hiveAssault: great.assault,
    ...(deps.broods === undefined
      ? {}
      : { broods: { ...deps.broods, tuning: great.broods } }),
  };
}
