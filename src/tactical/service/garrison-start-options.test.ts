import { describe, expect, it } from "vitest";

import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { DEPLOYABLE_TYPES } from "../../overworld/data/deployable-types";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Deployable } from "../../overworld/model/deployable";
import type { DeployableLevel } from "../../overworld/model/deployable-level";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import type { Mission } from "../../overworld/model/mission";
import { DataDeployableTypeCatalogue } from "../../overworld/repository/deployable-type-catalogue";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { createGarrisonStartOptions } from "./garrison-start-options";

// ===========================================
// Fixtures
// ===========================================

const CATALOGUE = new DataDeployableTypeCatalogue(
  DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
);

/** A fresh campaign with one mission on the first city and the given installations. */
function campaign(deployables: readonly Deployable[]): {
  state: GameState;
  mission: Mission;
  regionId: string;
} {
  const fresh = createNewGame(
    { seed: 7, createdAt: "2026-09-04T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  const city = fresh.overworld.map.cities[0];
  if (city === undefined) throw new Error("fixture needs a city");
  const mission: Mission = {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: city.id,
    difficulty: 1,
    mapParams: {
      biome: "temperate",
      settlement: city.scale,
      size: "small",
      seed: "1",
    },
    rewards: { credits: 300 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
  };
  return {
    state: {
      ...fresh,
      overworld: { ...fresh.overworld, missions: [mission], deployables },
    },
    mission,
    regionId: city.regionId,
  };
}

function battery(
  id: string,
  regionId: string,
  level: DeployableLevel,
  online = true,
): Deployable {
  return {
    id,
    typeId: "defensive-battery",
    regionId,
    level,
    builtDay: 1,
    online,
  };
}

// ===========================================
// Tests
// ===========================================

describe("createGarrisonStartOptions", () => {
  it("starts a mission in a region with a level 2 battery with 2 garrison turrets", () => {
    const { state, mission, regionId } = campaign([]);
    const armed = {
      ...state,
      overworld: {
        ...state.overworld,
        deployables: [battery("d1", regionId, 2)],
      },
    };
    expect(createGarrisonStartOptions(CATALOGUE)(armed, mission.id)).toEqual({
      garrisonTurrets: 2,
    });
  });

  it("reads the battery's level: a level 1 battery stands one turret, level 3 three", () => {
    const { state, mission, regionId } = campaign([]);
    for (const level of [1, 3] as const) {
      const armed = {
        ...state,
        overworld: {
          ...state.overworld,
          deployables: [battery("d1", regionId, level)],
        },
      };
      expect(
        createGarrisonStartOptions(CATALOGUE)(armed, mission.id)
          ?.garrisonTurrets,
      ).toBe(level);
    }
  });

  it("stands no turrets for a region with no battery, an offline one, or one elsewhere", () => {
    const { state, mission, regionId } = campaign([]);
    const elsewhere = state.overworld.map.regions.find(
      (r) => r.id !== regionId,
    );
    if (elsewhere === undefined) throw new Error("fixture needs two regions");
    const cases: readonly Deployable[][] = [
      [],
      [battery("d1", regionId, 3, false)],
      [battery("d1", elsewhere.id, 3)],
    ];
    for (const deployables of cases) {
      const quiet = {
        ...state,
        overworld: { ...state.overworld, deployables },
      };
      expect(createGarrisonStartOptions(CATALOGUE)(quiet, mission.id)).toEqual({
        garrisonTurrets: 0,
      });
    }
  });

  it("returns nothing for a mission the campaign does not offer", () => {
    const { state, regionId } = campaign([]);
    const armed = {
      ...state,
      overworld: {
        ...state.overworld,
        deployables: [battery("d1", regionId, 2)],
      },
    };
    expect(createGarrisonStartOptions(CATALOGUE)(armed, "ghost")).toBe(
      undefined,
    );
  });
});
