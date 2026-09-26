import type { Mission } from "../../model/mission";
import type { MissionPinContext } from "../../model/mission-pin-trigger";
import type { OverworldState } from "../../model/overworld-state";
import type { StoryMissionRule } from "../../model/story-mission-rule";
import { PLATFORM_FAILURE_INFESTATION } from "../../model/story-mission-rule";
import { storyDefenceCity } from "./story-defence-offer";
import { buildStoryOffer } from "./story-offer-builder";

// ===========================================
// Constants
// ===========================================

/**
 * The Spore Platform's fixed difficulty: 10, the top of the finale's
 * band (d8–10, arc §3) and of the game. Launch Window, the gate into
 * the finale, is the band's floor.
 */
export const SPORE_PLATFORM_DIFFICULTY = 10;

// ===========================================
// Rule
// ===========================================

/**
 * The Spore Platform (campaign arc §3, §4, §6.9, D1, D7): the finale,
 * the one mission of its act and the end of the spine (`STORY_SPINE`).
 * Two linked maps, the hull and then the core, fought by one squad with
 * no repairs between them (the `spore-platform` mission type).
 *
 * ```
 *   pinned   the day the campaign is in the finale (no flags: entering
 *            the act is the gate); never expires, outside the cap
 *            city: storyDefenceCity, the quietest ground the Earth holds
 *            offer: spore-platform at d10
 *   won      victory: campaign-won, and the campaign ends in victory
 *   lost     D7: the first loss adds +30 infestation to every city and
 *            sets platform-failed, which holds the platform back until
 *            Last Hope is researched (last-hope); a second loss sets
 *            campaign-lost, and the campaign ends in defeat
 * ```
 *
 * The site: the platform hangs in orbit, so no city is where it is
 * fought, and the offer's city only says where the assault lifts off.
 * The launch site Launch Window defended would be the natural answer,
 * but a resolved offer is gone and nothing records its city, so the
 * platform takes the story defences' rule instead: the detected city in
 * a region with no hive that is least infested, the ground the Earth
 * holds best, which is where Launch Window's own site went on the day
 * it was pinned unless the map moved since. Its map, biome and all,
 * is the platform's own (`SPORE_PLATFORM_MAP_RULE`), so the city
 * changes nothing on the tactical map; the briefing, the globe marker
 * and the result's city read it.
 *
 * Only reached once every act before the finale exists (`actExists`):
 * while Intact Pod (Act II's ending) is unbuilt, a won Live Specimen
 * still wins the campaign, and this rule is never asked.
 */
export const SPORE_PLATFORM: StoryMissionRule = {
  id: "spore-platform",
  act: "finale",
  pinWhen: [],

  /** The pinned platform assault from `storyDefenceCity`'s city, if any. */
  create(state: OverworldState, ctx: MissionPinContext): Mission | undefined {
    const city = storyDefenceCity(state, ctx);
    if (city === undefined) {
      return undefined;
    }
    return buildStoryOffer(
      state,
      city,
      {
        storyId: "spore-platform",
        typeId: "spore-platform",
        difficulty: SPORE_PLATFORM_DIFFICULTY,
        act: "finale",
      },
      ctx,
    );
  },

  onWon: [{ kind: "victory" }],
  onLost: { kind: "platform", cityInfestation: PLATFORM_FAILURE_INFESTATION },
};
