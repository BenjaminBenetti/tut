import { INSTALLATION_SITES } from "../../../content/data/installation-sites";
import type { ActId } from "../../../content/model/act-id";
import type { StoryInstallationId } from "../../../content/model/installation-site-id";
import type { StoryMissionId } from "../../../content/model/story-mission-id";
import type { City } from "../../model/city";
import type { Mission } from "../../model/mission";
import type { MissionOfferContext } from "../../model/mission-offer-rule";
import type { MissionPinContext } from "../../model/mission-pin-trigger";
import type { OverworldState } from "../../model/overworld-state";
import type { RegionId } from "../../model/region";
import { hiveRegionIds } from "../hive-service";
import type { StoryCityPreference } from "./story-city";
import { pickStoryCity } from "./story-city";
import { buildStoryOffer } from "./story-offer-builder";

// ===========================================
// Types
// ===========================================

/** What a story defence is, beyond its city (campaign arc §6.9). */
export interface StoryDefenceSpec {
  /** The story mission the offer is. */
  readonly storyId: StoryMissionId;
  /** Its fixed difficulty (arc §3: story missions use fixed difficulties). */
  readonly difficulty: number;
  /** The act it belongs to, stamped on the offer. */
  readonly act: ActId;
  /** The story facility held; its compound and generators come from `INSTALLATION_SITES`. */
  readonly site: StoryInstallationId;
  /** Waves the edges send before the defence can be won; fixed by the story. */
  readonly waves: number;
}

// ===========================================
// Offer
// ===========================================

/**
 * A story mission built on Defend Installation (campaign arc §6.2,
 * §6.9: Uplink, Launch Window): the pinned story offer of
 * `defend-installation` at `city` (`buildStoryOffer`), holding
 * `spec.site` through `spec.waves` waves. The facility is the story's,
 * not one the player built, so the defence names no deployable; its
 * generators are the borrowed compound's. Draws what `buildStoryOffer`
 * draws: one id and one map seed.
 *
 * ```
 *   buildStoryOffer(city, defend-installation, difficulty)
 *     + defence { installation: site, generators: INSTALLATION_SITES[site], waves }
 * ```
 */
export function buildStoryDefenceOffer(
  state: OverworldState,
  city: City,
  spec: StoryDefenceSpec,
  ctx: MissionOfferContext,
): Mission {
  const offer = buildStoryOffer(
    state,
    city,
    {
      storyId: spec.storyId,
      typeId: "defend-installation",
      difficulty: spec.difficulty,
      act: spec.act,
    },
    ctx,
  );
  return {
    ...offer,
    defence: {
      installation: spec.site,
      generators: INSTALLATION_SITES[spec.site].generators,
      waves: spec.waves,
    },
  };
}

// ===========================================
// Site
// ===========================================

/**
 * Where the story raises a facility for the squad to hold (Uplink's
 * tracking array, Launch Window's launch site): the ground the Earth
 * holds best, so the fight is about the facility and not a city already
 * lost. Every city is a candidate, and `pickStoryCity` chooses among
 * them (#1179): a free city whenever there is one, and only when every
 * city holds an offer, an ordinary offer's city, which the director
 * withdraws. A pinned or triggered offer (another story mission, a hive,
 * a Defend Installation) is never taken. Among the free, or else the
 * claimable, the rule prefers the quiet ground (`quietestGround`):
 *
 * ```
 *   1. a detected city in a region with no hive      the quiet ground
 *   2. any detected city                             every region hives
 *   3. any city                                      nothing detected qualifies
 *   each tier's least infested city, ties going to map order
 *
 *   a city free         ──► the preferred free city
 *   none free           ──► the preferred ordinary offer's city, withdrawn
 *   none claimable      ──► undefined: the pin trigger asks tomorrow
 * ```
 *
 * The third tier keeps the story from stalling on a board whose detected
 * cities all hold offers; with it the gate's day is the pin's day on any
 * board that leaves a city free. Draws nothing: the choice is a pure
 * function of the map, the hives, the board and `ctx.displaceable`.
 *
 * @param state - The overworld as the story pin trigger sees it.
 * @param ctx - The director's answer to which offers may be taken.
 */
export function storyDefenceCity(
  state: OverworldState,
  ctx: Pick<MissionPinContext, "displaceable">,
): City | undefined {
  return pickStoryCity(
    state,
    ctx,
    state.map.cities,
    quietestGround(hiveRegionIds(state)),
  );
}

// ===========================================
// Helpers
// ===========================================

/**
 * The story defences' taste in cities: the three tiers of
 * `storyDefenceCity`, each searched for its least infested city.
 *
 * @param hived - The regions holding a hive.
 */
function quietestGround(hived: ReadonlySet<RegionId>): StoryCityPreference {
  return (cities) => {
    const detected = cities.filter((city) => city.detected);
    const quiet = detected.filter((city) => !hived.has(city.regionId));
    return (
      leastInfested(quiet) ?? leastInfested(detected) ?? leastInfested(cities)
    );
  };
}

/** The least infested of `cities`, the first in order on a tie; undefined when empty. */
function leastInfested(cities: readonly City[]): City | undefined {
  let best: City | undefined;
  for (const city of cities) {
    if (best === undefined || city.infestation < best.infestation) {
      best = city;
    }
  }
  return best;
}
