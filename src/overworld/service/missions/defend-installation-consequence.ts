import type { MissionConsequenceRule } from "../../model/mission-consequence-rule";
import type { Mission } from "../../model/mission";
import type { MissionResult } from "../../model/mission-result";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";
import { addCityInfestation } from "../city-infestation-service";

// ===========================================
// Defend installation: consequences
// ===========================================

/**
 * What a defend-installation mission does to its host city (#1175).
 * Today's numbers: the resolver's `infestationDelta` on the city when
 * played, the frozen `ignorePenalty` when left to lapse. Whether the
 * generators held (`result.defence.held`) has no overworld effect yet:
 * the installation is never damaged.
 *
 * ```
 *   played  city + result.infestationDelta, clamped  ──► CityInfestationChanged
 *   lapsed  city + mission.ignorePenalty, clamped    ──► CityInfestationChanged
 * ```
 */
export const DEFEND_INSTALLATION_CONSEQUENCE: MissionConsequenceRule = {
  typeId: "defend-installation",

  /** The resolver's delta on the host city. */
  onResolved(
    state: OverworldState,
    mission: Mission,
    result: MissionResult,
  ): OverworldApplied<OverworldState> {
    return addCityInfestation(state, mission.cityId, result.infestationDelta);
  },

  /** The offer's frozen ignore penalty on its host city. */
  onExpired(
    state: OverworldState,
    mission: Mission,
  ): OverworldApplied<OverworldState> {
    return addCityInfestation(state, mission.cityId, mission.ignorePenalty);
  },
};
