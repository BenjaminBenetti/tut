import type {
  MissionOfferRule,
  MissionSite,
} from "../../model/mission-offer-rule";
import { getCity } from "../earth-map-query-service";
import { buildOffer, citiesWithOffers } from "./mission-offer-builder";

// ===========================================
// Infestation clearance: offer
// ===========================================

/**
 * How the director offers an infestation clearance (arc §5, §6.1). There
 * from the first day of the campaign.
 *
 * **Eligible:** every detected city with no offer whose infestation is
 * at least the act's threshold (`tuning.clearance.minInfestationByAct`:
 * 10 in Act I, 20 after). An undetected infestation is one the player
 * has not found, so it cannot be answered (GDD §5.3).
 *
 * **Site weight:** the city's infestation, so the director leans towards
 * the worse cities without ever shutting out a small landing: a city at
 * 80 is drawn four times as often as one at 20.
 *
 * ```
 *   eligible  city.detected ∧ no offer ∧ infestation ≥ min[act] ──► { cityId, weight: infestation }
 *   create    buildOffer(city, "infestation-clearance")
 * ```
 */
export const INFESTATION_CLEARANCE_OFFER: MissionOfferRule = {
  kind: "offer",
  typeId: "infestation-clearance",
  debut: { act: "act-1", missionsInAct: 0 },

  /** Detected, unoffered cities at the act's threshold, weighted by infestation. */
  eligible(state, ctx): readonly MissionSite[] {
    const threshold =
      ctx.tuning.clearance.minInfestationByAct[state.progress.act];
    const occupied = citiesWithOffers(state);
    return state.map.cities
      .filter(
        (city) =>
          city.detected &&
          !occupied.has(city.id) &&
          city.infestation > 0 &&
          city.infestation >= threshold,
      )
      .map((city) => ({ cityId: city.id, weight: city.infestation }));
  },

  /** The clearance at the site's city. */
  create(state, site, ctx) {
    return buildOffer(
      state,
      getCity(state.map, site.cityId),
      "infestation-clearance",
      ctx,
    );
  },
};
