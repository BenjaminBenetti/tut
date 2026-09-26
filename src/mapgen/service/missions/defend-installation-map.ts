import { INSTALLATION_SITES } from "../../../content/data/installation-sites";
import type { Mission } from "../../../overworld/model/mission";
import { HookKinds } from "../../model/hook";
import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";

// ===========================================
// Defend Installation map rule
// ===========================================

/**
 * A defence (#1175) is fought around the installation under attack: the
 * settlement pipeline with the installation's composed site reserved,
 * and one generator hook per generator it runs. Both come from the
 * offer's `Mission.defence`; a mission without one (an older save) gets
 * a plain settlement map, as it did before the rule existed.
 *
 * The site is the installation's authored compound: a built
 * installation's own, and for a story facility (Uplink's tracking array,
 * Launch Window's launch site, campaign arc §6.9) the compound it
 * borrows (`INSTALLATION_SITES[installation].compound`).
 *
 * ```
 *   mission.defence { installation, generators }
 *        ├─ site: compound of installation (MISSION_SITES reserves it)
 *        └─ extraHooks: generator × generators
 * ```
 */
export const DEFEND_INSTALLATION_MAP_RULE: MissionMapRule = {
  typeId: "defend-installation",

  /** The installation's site and its generators, when the offer has them. */
  recipe(mission: Mission): MissionMapPlan {
    const defence = mission.defence;
    if (defence === undefined) {
      return { archetype: "settlement", extraHooks: [] };
    }
    return {
      archetype: "settlement",
      extraHooks: [{ kind: HookKinds.GENERATOR, count: defence.generators }],
      site: INSTALLATION_SITES[defence.installation].compound,
    };
  },
};
