import type { CampaignFlagId } from "../../../content/model/campaign-flag-id";
import type { StoryInstallationId } from "../../../content/model/installation-site-id";
import type { Mission } from "../../model/mission";
import type { MissionPinContext } from "../../model/mission-pin-trigger";
import type { OverworldState } from "../../model/overworld-state";
import type { StoryMissionRule } from "../../model/story-mission-rule";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import {
  buildStoryDefenceOffer,
  storyDefenceCity,
} from "./story-defence-offer";

// ===========================================
// Constants
// ===========================================

/**
 * Uplink's fixed difficulty, in the Act III band (5–9, arc §3). It
 * opens the act, so it sits low in the band, but one step above the
 * floor: the player comes to it straight from Act II's ending, whose
 * band tops out at 7, and the act's first story fight should not be
 * easier than the last one of the act before. Armoured variants arrive
 * with Act III too, so d6 is already the hardest mix the player has met.
 */
export const UPLINK_DIFFICULTY = 6;

/**
 * The facility Uplink defends (arc §6.9): the tracking array, raised in
 * the sensor array's yard (`INSTALLATION_SITES`). The offer freezes it in
 * `Mission.defence`, and the UI knows Uplink's result by it.
 */
export const UPLINK_SITE: StoryInstallationId = "tracking-array";

/**
 * Waves Uplink's edges send (arc §6.9: "defend a tracking array through
 * its counted waves"). A defence rolled by the director sends 3 plus
 * one per 20 points of its region's mean infestation (5 at the trigger's
 * floor of 40, 8 at most); Uplink takes the floor's 5. The array runs on
 * the sensor array's two generators, the fewest of any compound, so the
 * waves stay short of what a late-game defence sends.
 */
export const UPLINK_WAVES = 5;

/**
 * Set when Uplink is won (arc §4, §6.9): the beacon tracking data is in.
 * It reveals Intel III, Platform Approach (`tech.platform-approach`), and
 * it is the flag the Great Hives package reads to reveal the three hives.
 */
export const UPLINK_WON_FLAG: CampaignFlagId = "uplink-won";

// ===========================================
// Rule
// ===========================================

/**
 * Uplink (campaign arc §3 Act III, §4, §6.9): defend a tracking array
 * through its counted waves. It is Act III's first story beat.
 *
 * ```
 *   pinned   the day the campaign is in act-3: no flags, so entering the
 *            act is the whole trigger; never expires, outside the cap
 *            city: storyDefenceCity, the quietest detected city: a free
 *            one, or else an ordinary offer's, which is withdrawn
 *            offer: defend-installation at d6, the tracking array, 5 waves
 *   map      the defend rule raises the array's compound (the sensor array's yard)
 *   setup    the defend setup stands its generators and the defend objective
 *   won      the defend consequence on the host city; the story sets uplink-won,
 *            which reveals Platform Approach and, later, the Great Hives
 *   lost     the defend consequence; pinned again 5 days on (STORY_RETRY_DAYS)
 * ```
 *
 * Entering an act is recorded as `progress.act` (the spine's
 * `advance-act`), and the pin trigger already pins a rule only in its
 * own act, so `pinWhen` is empty: no flag is needed to say "Act III has
 * begun". The site draws nothing from the rule's stream; the offer draws
 * its id and map seed.
 */
export const UPLINK: StoryMissionRule = {
  id: "uplink",
  act: "act-3",
  pinWhen: [],

  /** The pinned tracking-array defence at `storyDefenceCity`'s city, if any. */
  create(state: OverworldState, ctx: MissionPinContext): Mission | undefined {
    const city = storyDefenceCity(state, ctx);
    if (city === undefined) {
      return undefined;
    }
    return buildStoryDefenceOffer(
      state,
      city,
      {
        storyId: "uplink",
        difficulty: UPLINK_DIFFICULTY,
        act: "act-3",
        site: UPLINK_SITE,
        waves: UPLINK_WAVES,
      },
      ctx,
    );
  },

  onWon: [{ kind: "flag", flag: UPLINK_WON_FLAG }],
  onLost: { kind: "retry", delayDays: STORY_RETRY_DAYS },
};
