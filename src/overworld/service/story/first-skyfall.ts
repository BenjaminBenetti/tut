import type { Mission } from "../../model/mission";
import type {
  MissionOfferContext,
  MissionSite,
} from "../../model/mission-offer-rule";
import type { OverworldState } from "../../model/overworld-state";
import type { StoryMissionRule } from "../../model/story-mission-rule";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import { getCity } from "../earth-map-query-service";
import {
  asCrashSiteOffer,
  crashSiteSites,
  landedCity,
} from "../missions/crash-site-landing";
import { citiesWithOffers } from "../missions/mission-offer-builder";
import { buildStoryOffer } from "./story-offer-builder";

// ===========================================
// Constants
// ===========================================

/** First Skyfall's fixed difficulty (arc §6.9: d1). */
export const FIRST_SKYFALL_DIFFICULTY = 1;

/**
 * Missions the campaign must have played before First Skyfall is pinned:
 * it is the second mission of every campaign (arc §3, §6.9).
 */
export const FIRST_SKYFALL_AFTER_MISSIONS = 1;

// ===========================================
// Rule
// ===========================================

/**
 * First Skyfall (campaign arc §3, §6.9): the scripted first Crash Site,
 * the second mission of every campaign, at d1.
 *
 * ```
 *   pinned   act-1, no flags, once missionsPlayed ≥ 1
 *            city: drawn like any crash site (crashSiteSites), or from
 *                  every free city if no region is watched yet
 *            offer: crash-site at d1, pinned, never expires, carries the landing
 *   offered  the crash-site consequence rule lands the pod (+10, seen)
 *   map      the crash-site map rule brings the pod in close to deploy
 *   won      the crash-site rule erases the landing and, on this first
 *            win, sets spore-sample; the story layer records the win
 *   lost     the landing takes root (+15), and it is pinned again 5 days on
 * ```
 *
 * `pinWhen` is empty: the pin is timed by the mission count, which no
 * flag records, so `create` returns `undefined` until mission 1 is
 * played. The story pin trigger asks again every day. The city draw
 * uses the rule's own stream, so it never shifts the board's.
 */
export const FIRST_SKYFALL: StoryMissionRule = {
  id: "first-skyfall",
  act: "act-1",
  pinWhen: [],

  /** The pinned d1 crash site, once the first mission has been played. */
  create(state: OverworldState, ctx: MissionOfferContext): Mission | undefined {
    if (state.progress.missionsPlayed < FIRST_SKYFALL_AFTER_MISSIONS) {
      return undefined;
    }
    const sites = landingSites(state, ctx);
    if (sites.length === 0) {
      return undefined;
    }
    const tuning = ctx.tuning.crashSite;
    const city = getCity(
      state.map,
      ctx.rng.pickWeighted(sites, (site) => site.weight).cityId,
    );
    return asCrashSiteOffer(
      buildStoryOffer(
        state,
        landedCity(city, tuning),
        {
          storyId: "first-skyfall",
          typeId: "crash-site",
          difficulty: FIRST_SKYFALL_DIFFICULTY,
          act: "act-1",
        },
        ctx,
      ),
      city,
      tuning,
    );
  },

  onWon: [],
  onLost: { kind: "retry", delayDays: STORY_RETRY_DAYS },
};

// ===========================================
// Helpers
// ===========================================

/**
 * Where the scripted pod may come down: wherever a crash site could
 * (`crashSiteSites`), or, when the player has eyes on no region at all,
 * any city without an offer, so the story is never stalled by a clean
 * map.
 */
function landingSites(
  state: OverworldState,
  ctx: MissionOfferContext,
): readonly MissionSite[] {
  const sites = crashSiteSites(state, ctx.tuning.crashSite);
  if (sites.length > 0) {
    return sites;
  }
  const occupied = citiesWithOffers(state);
  return state.map.cities
    .filter((city) => !occupied.has(city.id))
    .map((city) => ({ cityId: city.id, weight: 1 }));
}
