import { ACT_IDS } from "../../../content/model/act-id";
import type { City } from "../../model/city";
import { clampInfestation } from "../../model/city";
import type { RegionId } from "../../model/region";
import type { Mission } from "../../model/mission";
import type { MissionSite } from "../../model/mission-offer-rule";
import type { CrashSiteTuning } from "../../model/mission-tuning";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";
import { addCityInfestation } from "../city-infestation-service";
import { witnessCity } from "../infestation-detection-service";
import { citiesWithOffers } from "./mission-offer-builder";

// ===========================================
// Crash site landing
// ===========================================
//
// What every crash site shares, whoever offers it: the generic offer
// rule, and First Skyfall's story rule (arc §6.3, §6.9).
//
//   crashSiteSites     where a pod may come down today, weighted
//   landedCity         the city as the offer is built on: landing included
//   asCrashSiteOffer   stamps the landing spec and the ×1.5 tech points
//   landCrashSite      the landing itself, made when the offer is (onOffered)
//

/**
 * Every city a crash site could land beside today (arc §6.3): each city
 * without an offer in a region that holds at least one detected city.
 * The player has eyes on that region, so the pod is seen coming down.
 *
 * ```
 *   weight = 1
 *          × lowCityWeight        city.infestation < lowInfestationBelow (a clean or low city)
 *          × sensorArrayWeight    act ≥ sensorArrayFromAct and the region holds an
 *                                 online sensorArrayType installation
 * ```
 *
 * In map order. Pure; draws nothing.
 */
export function crashSiteSites(
  state: OverworldState,
  tuning: CrashSiteTuning,
): readonly MissionSite[] {
  const watched = new Set(
    state.map.cities
      .filter((city) => city.detected)
      .map((city) => city.regionId),
  );
  const sensed = sensedRegions(state, tuning);
  const occupied = citiesWithOffers(state);
  return state.map.cities
    .filter((city) => watched.has(city.regionId) && !occupied.has(city.id))
    .map((city) => ({
      cityId: city.id,
      weight:
        (city.infestation < tuning.lowInfestationBelow
          ? tuning.lowCityWeight
          : 1) * (sensed.has(city.regionId) ? tuning.sensorArrayWeight : 1),
    }));
}

/**
 * `city` as it stands once the landing is made: its infestation plus
 * `tuning.landingInfestation`, clamped. The offer is built on this city,
 * so its difficulty and its map's infestation level count the pod that
 * came down.
 */
export function landedCity(city: City, tuning: CrashSiteTuning): City {
  return {
    ...city,
    infestation: clampInfestation(city.infestation + tuning.landingInfestation),
  };
}

/**
 * `offer` as a crash site at `city`: the landing it will make recorded
 * as its `crashSite` spec (the city and its infestation now, before the
 * landing), and its tech points scaled by `tuning.techPointMultiplier`
 * and rounded (arc §6.3: high TP). Credits and any carcass are left as
 * they are.
 */
export function asCrashSiteOffer(
  offer: Mission,
  city: City,
  tuning: CrashSiteTuning,
): Mission {
  return {
    ...offer,
    rewards: {
      ...offer.rewards,
      techPoints: Math.round(
        offer.rewards.techPoints * tuning.techPointMultiplier,
      ),
    },
    crashSite: {
      landingCityId: city.id,
      preLandingInfestation: city.infestation,
    },
  };
}

/**
 * The landing a crash site offer makes (arc §6.3): the landing city
 * gains `tuning.landingInfestation` through `addCityInfestation`, and is
 * then witnessed, because the pod was seen coming down: a city that was
 * clean becomes detected with a `CityDetected`, where the thresholds
 * alone would have left it hidden. An offer without a `crashSite` spec
 * lands nothing.
 *
 * ```
 *   landingCityId + landingInfestation ──► CityInfestationChanged
 *   landingCityId not yet detected     ──► detected + CityDetected
 * ```
 */
export function landCrashSite(
  state: OverworldState,
  offer: Mission,
  tuning: CrashSiteTuning,
): OverworldApplied<OverworldState> {
  if (offer.crashSite === undefined) {
    return { state, events: [] };
  }
  const landed = addCityInfestation(
    state,
    offer.crashSite.landingCityId,
    tuning.landingInfestation,
  );
  const seen = witnessCity(landed.state.map, offer.crashSite.landingCityId);
  if (seen.state === landed.state.map) {
    return landed;
  }
  return {
    state: { ...landed.state, map: seen.state },
    events: [...landed.events, ...seen.events],
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The regions whose online sensor arrays pull landings towards them,
 * empty before `tuning.sensorArrayFromAct` (arc §6.3: from Act II).
 */
function sensedRegions(
  state: OverworldState,
  tuning: CrashSiteTuning,
): ReadonlySet<RegionId> {
  if (
    ACT_IDS.indexOf(state.progress.act) <
    ACT_IDS.indexOf(tuning.sensorArrayFromAct)
  ) {
    return new Set();
  }
  return new Set(
    state.deployables
      .filter(
        (deployable) =>
          deployable.online && deployable.typeId === tuning.sensorArrayType,
      )
      .map((deployable) => deployable.regionId),
  );
}
