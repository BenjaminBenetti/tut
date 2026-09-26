import type { City } from "../../model/city";
import type { EvacuationSpec } from "../../model/evacuation-spec";
import type { Mission } from "../../model/mission";
import type {
  MissionOfferRule,
  MissionSite,
} from "../../model/mission-offer-rule";
import type { EvacuationTuning } from "../../model/mission-tuning";
import { getCity } from "../earth-map-query-service";
import { buildOffer, citiesWithOffers } from "./mission-offer-builder";

// ===========================================
// Evacuation: offer
// ===========================================

/**
 * How the director offers an evacuation (arc §5, §6.4).
 *
 * **Debut:** the third mission of Act I (`missionsInAct: 2`). The
 * director counts the missions resolved in the act (won, extracted or
 * lost; a lapsed offer does not count), so the type joins the pool on
 * the first tick after the second one resolves and its first offer can
 * be the third mission played.
 *
 * **Eligible:** every detected city with no offer at infestation 25 or
 * more. An undetected city hides who is trapped there, as it hides a
 * clearance.
 *
 * **Site weight:** bigger cities hold more people, so they are drawn
 * more often, on a log scale so a megacity leads without drowning the
 * rest (`evacuationSiteWeight`): a town of 80 000 weighs 1, a city of a
 * million 2, Tokyo's 37 million about 3.6.
 *
 * **Created:** the ordinary offer, with the groups frozen on it (3 at
 * d1–3, 4 at d4–6, 5 from d7) and the credits each group brought home
 * pays (`Mission.evacuation`).
 *
 * ```
 *   eligible  city.detected ∧ no offer ∧ infestation ≥ 25 ──► { cityId, weight: 1 + log10(pop / 100k) }
 *   create    buildOffer(city, "evacuation") ──► asEvacuationOffer ──► { evacuation: { groups, creditsPerGroup } }
 * ```
 */
export const EVACUATION_OFFER: MissionOfferRule = {
  kind: "offer",
  typeId: "evacuation",
  debut: { act: "act-1", missionsInAct: 2 },

  /** Detected, unoffered cities at 25 infestation or more, weighted by population. */
  eligible(state, ctx): readonly MissionSite[] {
    const tuning = ctx.tuning.evacuation;
    const occupied = citiesWithOffers(state);
    return state.map.cities
      .filter(
        (city) =>
          city.detected &&
          !occupied.has(city.id) &&
          city.infestation >= tuning.minInfestation,
      )
      .map((city) => ({
        cityId: city.id,
        weight: evacuationSiteWeight(city, tuning),
      }));
  },

  /** The evacuation at the site's city, carrying its groups. */
  create(state, site, ctx) {
    return asEvacuationOffer(
      buildOffer(state, getCity(state.map, site.cityId), "evacuation", ctx),
      ctx.tuning.evacuation,
    );
  },
};

// ===========================================
// Offer parts
// ===========================================

/**
 * How often the director draws `city` for an evacuation, against the
 * other eligible cities: one plus the decades of its population over
 * `populationWeightUnit`, never under one.
 *
 * ```
 *   weight = 1 + log10(max(1, population / unit))
 *     80 000 ─► 1     1 000 000 ─► 2     10 000 000 ─► 3     37 000 000 ─► 3.57
 * ```
 */
export function evacuationSiteWeight(
  city: City,
  tuning: EvacuationTuning,
): number {
  return (
    1 + Math.log10(Math.max(1, city.population / tuning.populationWeightUnit))
  );
}

/**
 * Civilian groups an evacuation at `difficulty` traps: `minGroups`, one
 * more every `difficultyPerGroup` steps, at most `maxGroups`.
 *
 * ```
 *   d   1 2 3 │ 4 5 6 │ 7 8 9 10
 *       3 3 3 │ 4 4 4 │ 5 5 5 5      (shipped tuning)
 * ```
 */
export function evacuationGroups(
  difficulty: number,
  tuning: EvacuationTuning,
): number {
  const grown =
    tuning.minGroups + Math.floor((difficulty - 1) / tuning.difficultyPerGroup);
  return Math.min(tuning.maxGroups, Math.max(tuning.minGroups, grown));
}

/**
 * The ordinary `offer` made an evacuation: its groups, from its
 * difficulty, and the credits each one brought home pays, frozen on it.
 */
export function asEvacuationOffer(
  offer: Mission,
  tuning: EvacuationTuning,
): Mission {
  const evacuation: EvacuationSpec = {
    groups: evacuationGroups(offer.difficulty, tuning),
    creditsPerGroup: tuning.creditsPerGroup,
  };
  return { ...offer, evacuation };
}
