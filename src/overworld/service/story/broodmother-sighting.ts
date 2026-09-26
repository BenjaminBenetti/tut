import type { CampaignFlagId } from "../../../content/model/campaign-flag-id";
import type { CampaignProgress } from "../../model/campaign-progress";
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

/**
 * The flag that brings the sighting forward for a fast player: Intel II,
 * Pod Telemetry, whose research pins Intact Pod, the mission that ends
 * Act II. A campaign that researches it before ten Act II missions are
 * played would otherwise leave the act, and lose the sighting, before
 * it debuts (#1179: 12 of 60 Strong campaigns did). With it, the
 * sighting is pinned no later than the act's ending, so every campaign
 * that finishes Act II meets the Broodmother. It gates nothing (arc
 * D2): the sighting ends no act.
 */
export const BROODMOTHER_SIGHTING_EARLY_FLAG: CampaignFlagId = "pod-telemetry";

// ===========================================
// Rule
// ===========================================

/**
 * The Broodmother sighting (campaign arc §6.8: "the first one is a story
 * beat"): the scripted first Alpha Hunt, pinned the day the type debuts,
 * or earlier for a player about to leave Act II.
 *
 * ```
 *   pinned   act-2, once ten Act II missions are played (ALPHA_HUNT_DEBUT)
 *            or pod-telemetry is set (BROODMOTHER_SIGHTING_EARLY_FLAG),
 *            and broodmother-sighted is not set; never expires
 *   city     the worst detected city in a region holding a hive; when no
 *            such city can be had, the worst detected city anywhere. Ties
 *            in map order; a free one first, else one whose ordinary offer
 *            is withdrawn (pickStoryCity). None today: asked again tomorrow
 *   offer    an alpha hunt at d5, pinned, stamped act-2, carrying a fresh
 *            Broodmother named from the lore on the fork "broodmother:<id>"
 *   played   the alpha-hunt consequence rule sets broodmother-sighted,
 *            whatever the outcome, so the ordinary hunts take over and the
 *            sighting is never pinned again; she dies or joins the record
 *            like any hunt's Broodmother
 * ```
 *
 * Both widenings come from #1179's measurement over the campaign
 * sweep's 60 seeds. By the tenth Act II mission the modelled players had
 * nearly always destroyed every hive, so a sighting that waited for one
 * was played in 31 of 60 Average campaigns and in none of 60 Strong
 * ones, 12 of which had left Act II before its tenth mission. A
 * Broodmother lays wherever the swarm is thickest; a hive region is only
 * her first choice. Once she is sighted, the ordinary hunts still want a
 * hive region (`alphaHuntSites`).
 *
 * The flag is set when the sighting is played, not when it is offered,
 * so no ordinary hunt joins the board while the scripted one waits on
 * it. A sighting pinned as the act ends stays on the board into Act
 * III, like any pinned story offer, until it is played. A lost sighting
 * is not retried: its retry delay runs out, but `create` finds the flag
 * set and pins nothing, and the Broodmother who got away comes back
 * through the ordinary offer as a nemesis. Winning it moves no story on,
 * so `onWon` is empty.
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

    /** The pinned d5 hunt at the worst hive-region city, else the worst city, once due. */
    create(state: OverworldState, ctx: MissionPinContext): Mission | undefined {
      const { progress } = state;
      if (
        hasFlag(progress, BROODMOTHER_SIGHTED_FLAG) ||
        !isSightingDue(progress)
      ) {
        return undefined;
      }
      const city =
        pickStoryCity(state, ctx, huntingGrounds(state, false), worst) ??
        pickStoryCity(state, ctx, detectedCities(state), worst);
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
// When
// ===========================================

/**
 * Whether the sighting is due in `progress`'s act: ten Act II missions
 * are played (`ALPHA_HUNT_DEBUT`, the arc's "about 10 missions in"), or
 * Pod Telemetry is researched (`BROODMOTHER_SIGHTING_EARLY_FLAG`) and
 * the act's ending is about to be pinned. Past Act II `hasDebuted` is
 * true, but the story spine pins the sighting only in its own act.
 */
export function isSightingDue(progress: CampaignProgress): boolean {
  return (
    hasDebuted(ALPHA_HUNT_DEBUT, progress) ||
    hasFlag(progress, BROODMOTHER_SIGHTING_EARLY_FLAG)
  );
}

// ===========================================
// Helpers
// ===========================================

/** Every detected city, map order: where the sighting falls back to. */
function detectedCities(state: OverworldState): readonly City[] {
  return state.map.cities.filter((city) => city.detected);
}

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
