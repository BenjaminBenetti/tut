import type { City } from "../../model/city";
import type { Mission } from "../../model/mission";
import type { MissionOfferContext } from "../../model/mission-offer-rule";
import type { OverworldState } from "../../model/overworld-state";
import type { StoryMissionRule } from "../../model/story-mission-rule";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import { citiesWithOffers } from "../missions/mission-offer-builder";
import { buildStoryOffer } from "./story-offer-builder";

// ===========================================
// Constants
// ===========================================

/**
 * Live Specimen's fixed difficulty (arc §3: story missions use fixed
 * difficulties; Act I's band is d1–4).
 *
 * d3, not the band's top: the capture is the test. Taking a lurker alive
 * asks for a precise damage window (half health or less, not dead), a
 * squad at arm's length with the net, and a carrier slowed by a move on
 * the walk home. d3 keeps that on a small map (clearance maps grow to
 * medium at d4, `MISSION_TUNING.difficulty`), so the walk home is short,
 * and keeps the nests and the edge waves mid-band, in line with Act I's
 * 90% first-attempt target (arc D5).
 */
export const LIVE_SPECIMEN_DIFFICULTY = 3;

// ===========================================
// Rule
// ===========================================

/**
 * Live Specimen (campaign arc §3, §4, §6.9): Act I's ending. Take a
 * lurker alive with the capture net and bring it home.
 *
 * ```
 *   pinned   act-1, once `capture-net` is set (Intel I, Pheromone Analysis,
 *            sets it), so it pins the day after the research; never expires
 *   city     the worst detected city with any infestation and no offer, ties
 *            in map order: lurkers must be plausible there, and it is where
 *            the swarm is thickest (none today: asked again tomorrow)
 *   offer    an infestation clearance at d3, pinned, stamped act-1
 *   map      the clearance's settlement map
 *   setup    the clearance's nests, made optional; the capture decides; two
 *            lurkers placed by the nests (tactical STORY_SETUP_RULES)
 *   won      the clearance's own consequences, then advance-act: Act II if
 *            its ending (Intact Pod) is built, otherwise the campaign is won
 *   lost     extracted without the specimen, or lost: pinned again 5 days on
 * ```
 *
 * The region the spore sample came from is not recorded anywhere (the
 * Crash Site sets only the `spore-sample` flag), so the city is chosen
 * by infestation alone. The story layer runs after the clearance's own
 * consequence rule, so a won Live Specimen still cuts its city's
 * infestation like any won clearance.
 */
export const LIVE_SPECIMEN: StoryMissionRule = {
  id: "live-specimen",
  act: "act-1",
  pinWhen: ["capture-net"],

  /** The pinned d3 clearance at the worst detected infested city without an offer. */
  create(state: OverworldState, ctx: MissionOfferContext): Mission | undefined {
    const city = specimenCity(state);
    if (city === undefined) {
      return undefined;
    }
    return buildStoryOffer(
      state,
      city,
      {
        storyId: "live-specimen",
        typeId: "infestation-clearance",
        difficulty: LIVE_SPECIMEN_DIFFICULTY,
        act: "act-1",
      },
      ctx,
    );
  },

  onWon: [{ kind: "advance-act" }],
  onLost: { kind: "retry", delayDays: STORY_RETRY_DAYS },
};

// ===========================================
// Helpers
// ===========================================

/**
 * Where the hunt is: the detected city with the most infestation that
 * holds no offer, the first in map order on a tie, or none when no
 * detected city is infested and free.
 */
function specimenCity(state: OverworldState): City | undefined {
  const occupied = citiesWithOffers(state);
  let worst: City | undefined;
  for (const city of state.map.cities) {
    if (!city.detected || city.infestation <= 0 || occupied.has(city.id)) {
      continue;
    }
    if (worst === undefined || city.infestation > worst.infestation) {
      worst = city;
    }
  }
  return worst;
}
