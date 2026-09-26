import type { City } from "../../model/city";
import type { Mission } from "../../model/mission";
import type { MissionPinContext } from "../../model/mission-pin-trigger";
import type { NemesisLore } from "../../model/nemesis-lore";
import type { OverworldState } from "../../model/overworld-state";
import type { StoryMissionRule } from "../../model/story-mission-rule";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import { hasFlag } from "../campaign-progress-service";
import { hasDebuted } from "../mission-generation-service";
import { ALPHA_HUNT_DEBUT } from "../missions/alpha-hunt-offer";
import {
  BROODMOTHER_SIGHTED_FLAG,
  BROODMOTHER_SIGHTING_ACT,
  freshQuarry,
  huntingGrounds,
  quarryStream,
} from "../missions/alpha-hunt-quarry";
import { pickStoryCity } from "./story-city";
import { buildStoryOffer } from "./story-offer-builder";

// ===========================================
// Constants
// ===========================================

/**
 * The sighting's fixed difficulty (arc §3: story missions use fixed
 * difficulties; Act II's band is d3–7). d5, the band's middle: the first
 * Broodmother is the act's new threat, not its ending, so she is met at
 * the difficulty an ordinary Act II mission sits at, on a medium map
 * (`MISSION_TUNING.difficulty["alpha-hunt"]`), with 68 hit points
 * (`broodmotherHp(5, 0)`).
 */
export const BROODMOTHER_SIGHTING_DIFFICULTY = 5;

// ===========================================
// Rule
// ===========================================

/**
 * The Broodmother sighting (campaign arc §6.8: "the first one is a story
 * beat"): the scripted first Alpha Hunt, pinned the day the type debuts.
 *
 * ```
 *   pinned   act-2, once ten Act II missions are played (ALPHA_HUNT_DEBUT)
 *            and broodmother-sighted is not set; never expires
 *   city     the worst detected city in a region holding a hive, ties in
 *            map order; a free one first, else one whose ordinary offer
 *            is withdrawn (pickStoryCity). None today: asked again tomorrow
 *   offer    an alpha hunt at d5, pinned, stamped act-2, carrying a fresh
 *            Broodmother named from the lore on the fork "broodmother:<id>"
 *   played   the alpha-hunt consequence rule sets broodmother-sighted,
 *            whatever the outcome, so the ordinary hunts take over and the
 *            sighting is never pinned again; she dies or joins the record
 *            like any hunt's Broodmother
 * ```
 *
 * The flag is set when the sighting is played, not when it is offered,
 * so no ordinary hunt joins the board while the scripted one waits on
 * it. A lost sighting is not retried: its retry delay runs out, but
 * `create` finds the flag set and pins nothing, and the Broodmother who
 * got away comes back through the ordinary offer as a nemesis. Winning
 * it moves no story on, so `onWon` is empty.
 *
 * @param lore - The names the first Broodmother may take.
 * @returns The rule for `STORY_MISSION_RULES["broodmother-sighting"]`.
 */
export function createBroodmotherSighting(
  lore: Pick<NemesisLore, "broodmotherNames">,
): StoryMissionRule {
  return {
    id: "broodmother-sighting",
    act: BROODMOTHER_SIGHTING_ACT,
    pinWhen: [],

    /** The pinned d5 hunt at the worst hive-region city, once the type debuts. */
    create(state: OverworldState, ctx: MissionPinContext): Mission | undefined {
      const { progress } = state;
      if (
        hasFlag(progress, BROODMOTHER_SIGHTED_FLAG) ||
        !hasDebuted(ALPHA_HUNT_DEBUT, progress)
      ) {
        return undefined;
      }
      const city = pickStoryCity(
        state,
        ctx,
        huntingGrounds(state, false),
        worst,
      );
      if (city === undefined) {
        return undefined;
      }
      const offer = buildStoryOffer(
        state,
        city,
        {
          storyId: "broodmother-sighting",
          typeId: "alpha-hunt",
          difficulty: BROODMOTHER_SIGHTING_DIFFICULTY,
          act: BROODMOTHER_SIGHTING_ACT,
        },
        ctx,
      );
      return {
        ...offer,
        alphaHunt: freshQuarry(state, quarryStream(ctx.rng, offer), lore),
      };
    },

    onWon: [],
    onLost: { kind: "retry", delayDays: STORY_RETRY_DAYS },
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The city with the most infestation among `cities`, the first in their
 * order on a tie: where the swarm is thickest, she is laying.
 */
function worst(cities: readonly City[]): City | undefined {
  let found: City | undefined;
  for (const city of cities) {
    if (found === undefined || city.infestation > found.infestation) {
      found = city;
    }
  }
  return found;
}
