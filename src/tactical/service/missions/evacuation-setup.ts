import { err, ok } from "../../../core/model/result";
import type { MissionSetupRule } from "../../model/mission-setup-rule";
import { placeCivilians } from "./civilian-setup";
import { standEggSpawners } from "./infestation-clearance-setup";

// ===========================================
// Rule
// ===========================================

/**
 * `evacuation` (campaign arc §6.4): civilians are trapped in the city's
 * buildings. The squad frees each group (a unit beside it uses
 * Interact), walks at least half of them to the drop ship, and
 * extracts. The groups are the pressure: bugs hunt them as prey.
 *
 * ```
 *   egg-spawner hooks ──► nests with no objective      ids: spawner-*
 *   civilian hooks    ──► trapped groups               ids: unit-*
 *                     ──► one rescue-civilians          ids: objective-*
 *                         (won at ⌈groups / 2⌉ aboard)
 *   edges             ──► waves on the clearance's open schedule
 * ```
 *
 * The nests are the clearance's, a modest count (one, two from
 * difficulty 6), and hatch on its clock, but clearing them is not asked
 * of the squad: wrecking one only stops it. The extraction is the
 * clearance's, where the freed groups board.
 *
 * Refuses a map with no civilian hooks: an evacuation with nobody to
 * evacuate could only be won by walking home, and the map rule always
 * asks for at least three.
 */
export const EVACUATION_SETUP: MissionSetupRule = {
  typeId: "evacuation",
  /** The nests, then the trapped groups and their rescue. */
  setup(state, map, mission, deps) {
    const nested = standEggSpawners(state, map, mission, deps);
    const placed = placeCivilians(nested, map, deps);
    if (!placed.objectives.some((o) => o.kind === "rescue-civilians")) {
      return err({
        kind: "map-recipe",
        reason: "an evacuation map has no civilian groups to rescue",
      });
    }
    return ok(placed);
  },
};
