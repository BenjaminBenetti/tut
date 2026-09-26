import { INSTALLATION_SITES } from "../../../content/data/installation-sites";
import type { InstallationSiteId } from "../../../content/model/installation-site-id";
import type { StoryMissionId } from "../../../content/model/story-mission-id";
import type { Mission } from "../../../overworld/model/mission";
import type {
  MissionOutcome,
  MissionResult,
  MissionResultDefence,
} from "../../../overworld/model/mission-result";
import type { GameState } from "../../../save/model/game-state";
import {
  campaignOnDay,
  missionAt,
} from "../../view/mission-fixtures.test-helper";

/**
 * A pinned Act III defence of `site` through `waves` waves at "lagos",
 * as story `storyId` offers it.
 */
export function storyDefenceOffer(
  storyId: StoryMissionId,
  site: InstallationSiteId,
  waves: number,
): Mission {
  return {
    ...missionAt("mission-4", "lagos", 7, 6),
    typeId: "defend-installation",
    storyId,
    pinned: true,
    act: "act-3",
    defence: {
      installation: site,
      generators: INSTALLATION_SITES[site].generators,
      waves,
    },
  };
}

/**
 * A result on "lagos" ending in `outcome`, with `defence` as the played
 * defence recorded it, or none, as the auto-resolver leaves it.
 */
export function defenceResult(
  outcome: MissionOutcome,
  defence?: MissionResultDefence,
): MissionResult {
  return {
    missionId: "mission-4",
    cityId: "lagos",
    outcome,
    squadCasualties: [],
    squadsWiped: [],
    mechsDestroyed: [],
    mechDamage: [],
    creditsAwarded: 0,
    techPointsAwarded: 0,
    infestationDelta: 0,
    ...(defence === undefined ? {} : { defence }),
  };
}

/** A campaign on day 4 whose story progress is overridden by `story`. */
export function campaignWith(
  story: Partial<GameState["overworld"]["progress"]> = {},
): GameState {
  const state = campaignOnDay(4, []);
  return {
    ...state,
    overworld: {
      ...state.overworld,
      progress: { ...state.overworld.progress, ...story },
    },
  };
}
