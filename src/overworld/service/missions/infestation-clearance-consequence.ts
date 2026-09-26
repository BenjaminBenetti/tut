import type {
  MissionConsequenceRule,
  MissionConsequenceContext,
} from "../../model/mission-consequence-rule";
import type { Mission } from "../../model/mission";
import type { MissionResult } from "../../model/mission-result";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";
import { findCity } from "../earth-map-query-service";
import {
  addCityInfestation,
  setCityInfestation,
} from "../city-infestation-service";
import { clampInfestation } from "../../model/city";

// ===========================================
// Infestation clearance: consequences
// ===========================================

/**
 * What an infestation clearance does to its city (arc §5, §6.1).
 *
 * **Played:** the resolver's `infestationDelta` moves the city (a cut on
 * a win, the loss penalty on a loss, nothing on an extraction). A won
 * clearance that leaves the city under `tuning.clearance.mopUpBelow`
 * (15) purges it to 0 instead: the mop-up, so a city can be cleared at
 * all. The change is one `CityInfestationChanged`, from the city's
 * value before the mission to where it ends.
 *
 * **Lapsed:** the offer's frozen `ignorePenalty` is added to the city.
 *
 * ```
 *   played  to = clamp(city + result.infestationDelta)
 *           won ∧ to < mopUpBelow ──► to = 0                ──► CityInfestationChanged
 *   lapsed  city + mission.ignorePenalty, clamped            ──► CityInfestationChanged
 * ```
 */
export const INFESTATION_CLEARANCE_CONSEQUENCE: MissionConsequenceRule = {
  typeId: "infestation-clearance",

  /** The resolver's delta, and the mop-up on a win that leaves the city under the threshold. */
  onResolved(
    state: OverworldState,
    mission: Mission,
    result: MissionResult,
    ctx: MissionConsequenceContext,
  ): OverworldApplied<OverworldState> {
    const city = findCity(state.map, mission.cityId);
    if (city === undefined) {
      return { state, events: [] };
    }
    const to = clampInfestation(city.infestation + result.infestationDelta);
    const purged =
      result.outcome === "won" && to < ctx.tuning.clearance.mopUpBelow;
    return setCityInfestation(state, city.id, purged ? 0 : to);
  },

  /** The offer's frozen ignore penalty on its city. */
  onExpired(
    state: OverworldState,
    mission: Mission,
  ): OverworldApplied<OverworldState> {
    return addCityInfestation(state, mission.cityId, mission.ignorePenalty);
  },
};
