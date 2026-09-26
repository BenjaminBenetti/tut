import type {
  MissionConsequenceContext,
  MissionConsequenceRule,
} from "../../model/mission-consequence-rule";
import type { Mission } from "../../model/mission";
import type { MissionResult } from "../../model/mission-result";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";
import {
  addCityInfestation,
  setCityInfestation,
} from "../city-infestation-service";
import { findCity } from "../earth-map-query-service";
import { setCampaignFlag } from "../story-service";
import { landCrashSite } from "./crash-site-landing";

// ===========================================
// Crash site: consequences
// ===========================================

/**
 * What a crash site does to its landing city (arc §4, §6.3).
 *
 * **Offered:** the landing: +10 at the landing city, which is seen
 * (`landCrashSite`).
 *
 * **Played:** the pod decides. A wrecked pod erases the landing: the
 * landing city goes back to its infestation before the landing, or
 * stays where it is if it has fallen lower since. A pod left standing
 * (matured, or abandoned by an early extraction) takes root: the offer's
 * frozen `ignorePenalty` (+15) on the landing city. A won crash site
 * also recovers a spore sample: the flag is set on the first win only,
 * and it reveals Intel I (arc §4). The resolver's `infestationDelta` is
 * not applied: the landing is what the mission was about.
 *
 * **Lapsed:** the landing takes root, the same +15.
 *
 * ```
 *   offered  landCrashSite                                      ──► CityInfestationChanged (+ CityDetected)
 *   played   pod wrecked ──► landing city = min(preLanding, now) ──► CityInfestationChanged
 *            otherwise   ──► landing city + ignorePenalty       ──► CityInfestationChanged
 *            won         ──► setCampaignFlag("spore-sample")    ──► CampaignFlagSet, first time only
 *   lapsed   landing city + ignorePenalty                        ──► CityInfestationChanged
 * ```
 *
 * The pod is read generically, without the tactical layer's types:
 * `result.podDestroyed` when the resolver reported it, otherwise every
 * reported objective complete, otherwise (auto-resolved) a won outcome.
 * An offer without a `crashSite` spec landed nothing, so a wrecked pod
 * erases nothing and a standing one takes root at the offer's city.
 */
export const CRASH_SITE_CONSEQUENCE: MissionConsequenceRule = {
  typeId: "crash-site",

  /** The landing: +10 at the landing city, and the city seen. */
  onOffered(
    state: OverworldState,
    mission: Mission,
    ctx: MissionConsequenceContext,
  ): OverworldApplied<OverworldState> {
    return landCrashSite(state, mission, ctx.tuning.crashSite);
  },

  /** The landing erased by a wrecked pod or rooted by a standing one; a win's spore sample. */
  onResolved(
    state: OverworldState,
    mission: Mission,
    result: MissionResult,
  ): OverworldApplied<OverworldState> {
    const landing = podWrecked(result)
      ? eraseLanding(state, mission)
      : takeRoot(state, mission);
    if (result.outcome !== "won") {
      return landing;
    }
    const sampled = setCampaignFlag(landing.state, "spore-sample");
    return {
      state: sampled.state,
      events: [...landing.events, ...sampled.events],
    };
  },

  /** The landing takes root: the frozen ignore penalty on the landing city. */
  onExpired(
    state: OverworldState,
    mission: Mission,
  ): OverworldApplied<OverworldState> {
    return takeRoot(state, mission);
  },
};

// ===========================================
// Helpers
// ===========================================

/**
 * Whether the squad wrecked the pod: the resolver's `podDestroyed`, or
 * failing that every reported objective complete, or failing that (no
 * objectives reported: auto-resolved) a won outcome.
 */
export function podWrecked(result: MissionResult): boolean {
  if (result.podDestroyed !== undefined) {
    return result.podDestroyed;
  }
  if (result.objectives !== undefined && result.objectives.length > 0) {
    return result.objectives.every((objective) => objective.complete);
  }
  return result.outcome === "won";
}

/**
 * The landing city back to its pre-landing infestation, or left where it
 * is if lower. Nothing without a `crashSite` spec: no landing was made.
 */
function eraseLanding(
  state: OverworldState,
  mission: Mission,
): OverworldApplied<OverworldState> {
  const spec = mission.crashSite;
  const city =
    spec === undefined ? undefined : findCity(state.map, spec.landingCityId);
  if (spec === undefined || city === undefined) {
    return { state, events: [] };
  }
  return setCityInfestation(
    state,
    city.id,
    Math.min(spec.preLandingInfestation, city.infestation),
  );
}

/** The frozen ignore penalty on the landing city, or on the offer's city without a spec. */
function takeRoot(
  state: OverworldState,
  mission: Mission,
): OverworldApplied<OverworldState> {
  return addCityInfestation(
    state,
    mission.crashSite?.landingCityId ?? mission.cityId,
    mission.ignorePenalty,
  );
}
