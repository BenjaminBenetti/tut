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
 * Launch Window's fixed difficulty: 8, the floor of the finale's band
 * (d8–10, arc §3). It is the gate into the finale, so it is the easiest
 * finale fight and still the hardest Act III one.
 */
export const LAUNCH_WINDOW_DIFFICULTY = 8;

/**
 * The facility Launch Window defends (arc §6.9): the launch site, raised
 * in the dispersal plant's yard (`INSTALLATION_SITES`). The offer freezes
 * it in `Mission.defence`, and the UI knows Launch Window's result by it.
 */
export const LAUNCH_WINDOW_SITE: StoryInstallationId = "launch-site";

/**
 * Waves Launch Window's edges send: 7, what a director-rolled defence
 * sends for a region at mean infestation 80, one short of the cap. The
 * pad runs on the dispersal plant's four generators, the most of any
 * compound, so the longer siege is holdable.
 */
export const LAUNCH_WINDOW_WAVES = 7;

/**
 * Days a lost Launch Window slips before it is pinned again (arc §4: "a
 * loss delays the launch and never ends the campaign"; §6.9: "a loss
 * delays the launch 5 days"). The story's usual retry delay.
 */
export const LAUNCH_WINDOW_SLIP_DAYS = STORY_RETRY_DAYS;

/**
 * The two halves of Act III's gate (arc §3: "all three Great Hives
 * destroyed and Intel III researched"): `platform-approach` is set by
 * Intel III, `great-hives-destroyed` by the Great Hives package.
 */
export const LAUNCH_WINDOW_PIN_FLAGS: readonly CampaignFlagId[] = [
  "platform-approach",
  "great-hives-destroyed",
];

// ===========================================
// Rule
// ===========================================

/**
 * Launch Window (campaign arc §3, §4, §6.9): defend the launch site
 * until the launch. Act III's ending in the spine (`STORY_SPINE`), so
 * building it makes Act III exist once Acts I and II do.
 *
 * ```
 *   pinned   act-3, once platform-approach and great-hives-destroyed are
 *            both set; never expires, outside the cap
 *            city: storyDefenceCity, the quietest detected city: a free
 *            one, or else an ordinary offer's, which is withdrawn
 *            offer: defend-installation at d8, the launch site, 7 waves
 *   won      the spine ends Act III: into the finale if it exists, and
 *            while the Spore Platform is unbuilt that is campaign victory
 *   lost     the launch slips: pinned again 5 days on; never a defeat
 * ```
 */
export const LAUNCH_WINDOW: StoryMissionRule = {
  id: "launch-window",
  act: "act-3",
  pinWhen: LAUNCH_WINDOW_PIN_FLAGS,

  /** The pinned launch-site defence at `storyDefenceCity`'s city, if any. */
  create(state: OverworldState, ctx: MissionPinContext): Mission | undefined {
    const city = storyDefenceCity(state, ctx);
    if (city === undefined) {
      return undefined;
    }
    return buildStoryDefenceOffer(
      state,
      city,
      {
        storyId: "launch-window",
        difficulty: LAUNCH_WINDOW_DIFFICULTY,
        act: "act-3",
        site: LAUNCH_WINDOW_SITE,
        waves: LAUNCH_WINDOW_WAVES,
      },
      ctx,
    );
  },

  onWon: [{ kind: "advance-act" }],
  onLost: { kind: "retry", delayDays: LAUNCH_WINDOW_SLIP_DAYS },
};
