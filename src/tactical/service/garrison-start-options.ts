import type { DeployableTypeCatalogue } from "../../overworld/model/deployable-type-catalogue";
import type { MissionId } from "../../overworld/model/mission";
import { garrisonTurretsFor } from "../../overworld/service/deployable-effects-service";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type { MissionStartOptions } from "../model/mission-start-options";

// ===========================================
// Types
// ===========================================

/** The `StartMission` handler's `startOptionsFor` port, named for reuse. */
export type StartOptionsFor = (
  state: MissionCampaignState,
  missionId: MissionId,
) => MissionStartOptions | undefined;

// ===========================================
// Factory
// ===========================================

/**
 * Builds the `startOptionsFor` port that reads a mission's garrison off
 * the overworld (#1155, GDD §5.6): the mission's city names its region,
 * and the region's online defensive batteries stand
 * `computeModifiers().garrisonTurrets[regionId]` turrets on the map.
 *
 * ```
 *   missionId ──► overworld.missions ──► mission.cityId ──► city.regionId
 *                                                          └──► garrisonTurrets[regionId]
 *   unknown mission ──► undefined (the start runs as it always did)
 * ```
 *
 * Pure over the state it is handed; the catalogue is fixed at composition.
 */
export function createGarrisonStartOptions(
  catalogue: DeployableTypeCatalogue,
): StartOptionsFor {
  return (state, missionId) => {
    const mission = state.overworld.missions.find((m) => m.id === missionId);
    if (mission === undefined) {
      return undefined;
    }
    return {
      garrisonTurrets: garrisonTurretsFor(
        state.overworld,
        catalogue,
        mission.cityId,
      ),
    };
  };
}
