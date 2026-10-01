import type { City } from "../../model/city";
import type { Mission } from "../../model/mission";
import type { MissionPinContext } from "../../model/mission-pin-trigger";
import type { OverworldState } from "../../model/overworld-state";
import type { RegionId } from "../../model/region";
import type { StoryMissionRule } from "../../model/story-mission-rule";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import {
  asCrashSiteOffer,
  landedCity,
  sensedRegions,
} from "../missions/crash-site-landing";
import { pickStoryCity } from "./story-city";
import type { StoryCityPreference } from "./story-city";
import { buildStoryOffer } from "./story-offer-builder";

// ===========================================
// Constants
// ===========================================

/**
 * Intact Pod's fixed difficulty (arc §3: story missions use fixed
 * difficulties; Act II's band is d3–7).
 *
 * d6, near the band's top: it is the act's ending and a stand, not a
 * raid. At d6 the edges send a wave every second turn (turns 3, 5, 7
 * and 9 before the drop at the end of turn 10), seven or eight bugs
 * each before Intact Pod's surge (`INTACT_POD_TUNING`), and the pod has
 * a crash site's d6 hit points (65). d7 would cap the waves at eight
 * from the first and leave no step between the ending and the Act III
 * missions that follow it.
 */
export const INTACT_POD_DIFFICULTY = 6;

// ===========================================
// Rule
// ===========================================

/**
 * Intact Pod (campaign arc §3, §4, §6.9): Act II's ending. A Crash Site
 * where the pod must survive: hold it until the recovery drop.
 *
 * ```
 *   pinned   act-2, once `pod-telemetry` is set (Intel II, Pod Telemetry,
 *            sets it), so it pins the day after the research; never expires,
 *            outside the board cap
 *   city     a detected city, through pickStoryCity: free cities first,
 *            then one holding an ordinary offer (withdrawn). Among those,
 *            the ones in a region an online sensor array watches if any,
 *            else all of them; then the least infested, ties in map order.
 *            None today: asked again tomorrow
 *   offer    a crash site at d6, pinned, stamped act-2, carrying the landing
 *            (+10 at the city, seen) and the crash site's ×1.5 tech points
 *   map      the crash site's crater
 *   setup    the pod made a unit of ours to keep; recover-pod decides, the
 *            drop comes as turn 10 ends (tactical STORY_SETUP_RULES)
 *   won      the crash site's consequences (the pod gone: the landing is
 *            erased), then advance-act: Act III if its ending (Launch
 *            Window) is built, otherwise the campaign is won
 *   lost     the pod destroyed, or the force out or down before the drop:
 *            the landing takes root (+15), pinned again 5 days on
 * ```
 *
 * Why this city (arc §6.3 weights sensor-array regions ×2 for crash
 * sites): the telemetry tracks the pod down, so it comes down where an
 * array can watch it. The least-infested city is where a pod lands
 * clear of the swarm, which is what makes it recoverable, and it is the
 * crash site's own taste (its low-infestation weight). The choice is
 * deterministic, so the pin draws nothing.
 */
export const INTACT_POD: StoryMissionRule = {
  id: "intact-pod",
  act: "act-2",
  pinWhen: ["pod-telemetry"],

  /** The pinned d6 crash site at the least-infested watched city (`pickStoryCity`). */
  create(state: OverworldState, ctx: MissionPinContext): Mission | undefined {
    const tuning = ctx.tuning.crashSite;
    const city = pickStoryCity(
      state,
      ctx,
      state.map.cities.filter((candidate) => candidate.detected),
      watchedFirst(sensedRegions(state, tuning)),
    );
    if (city === undefined) {
      return undefined;
    }
    return asCrashSiteOffer(
      buildStoryOffer(
        state,
        landedCity(city, tuning),
        {
          storyId: "intact-pod",
          typeId: "crash-site",
          difficulty: INTACT_POD_DIFFICULTY,
          act: "act-2",
        },
        ctx,
      ),
      city,
      tuning,
    );
  },

  onWon: [{ kind: "advance-act" }],
  onLost: { kind: "retry", delayDays: STORY_RETRY_DAYS },
};

// ===========================================
// Helpers
// ===========================================

/**
 * Intact Pod's taste in cities: among `cities`, those in a `sensed`
 * region when there are any, else all of them; then the least infested,
 * the first in their order on a tie.
 *
 * @param sensed - The regions an online sensor array watches.
 */
export function watchedFirst(
  sensed: ReadonlySet<RegionId>,
): StoryCityPreference {
  return (cities) => {
    const watched = cities.filter((city) => sensed.has(city.regionId));
    return leastInfested(watched.length > 0 ? watched : cities);
  };
}

/** The city with the least infestation among `cities`, the first on a tie. */
function leastInfested(cities: readonly City[]): City | undefined {
  let found: City | undefined;
  for (const city of cities) {
    if (found === undefined || city.infestation < found.infestation) {
      found = city;
    }
  }
  return found;
}
