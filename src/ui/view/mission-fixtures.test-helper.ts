import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Mission } from "../../overworld/model/mission";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";

/** A campaign from the shipped content on day `day`. */
export function campaignOnDay(
  day: number,
  missions: readonly Mission[],
): GameState {
  const state = createNewGame(
    { seed: 3, createdAt: "2026-09-03T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  return { ...state, overworld: { ...state.overworld, day, missions } };
}

/** A clearance mission at `cityId`, expiring on `expiresDay`. */
export function missionAt(
  id: string,
  cityId: string,
  expiresDay: number,
  difficulty = 3,
): Mission {
  return {
    id,
    typeId: "infestation-clearance",
    cityId,
    difficulty,
    mapParams: {
      biome: "desert",
      settlement: "town",
      size: "medium",
      seed: "9",
    },
    rewards: { credits: difficulty * 300 },
    createdDay: 1,
    expiresDay,
    ignorePenalty: 10,
  };
}
