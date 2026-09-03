import { describe, expect, it } from "vitest";

import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import type { MapStateView } from "../../graphics/model/map-state-view";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CityId } from "../../overworld/model/city";
import type { EarthMap } from "../../overworld/model/earth-map";
import type { Mission } from "../../overworld/model/mission";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { GameStore } from "./game-store";
import { MapSceneSync, missionCityIds } from "./map-scene-sync";

// ===========================================
// Fixtures
// ===========================================

const newGame = (): GameState =>
  createNewGame(
    { seed: 7, createdAt: "2026-09-03T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );

const MISSION: Mission = {
  id: "mission-1",
  typeId: "infestation-clearance",
  cityId: "new-york",
  difficulty: 5,
  mapParams: {
    biome: "temperate",
    settlement: "city",
    size: "medium",
    seed: "s",
  },
  rewards: { credits: 1500 },
  createdDay: 1,
  expiresDay: 9,
  ignorePenalty: 10,
};

/** Records every update it receives. */
class RecordingView implements MapStateView {
  readonly calls: { map: EarthMap; missions: CityId[] }[] = [];
  update(map: EarthMap, missionCityIds: ReadonlySet<CityId>): void {
    this.calls.push({ map, missions: [...missionCityIds].sort() });
  }
}

/** A store over an empty dispatcher; `replaceState` is enough to drive changes. */
function storeOf(state: GameState): GameStore<GameState, never, never> {
  return new GameStore(state, createOverworldCommandDispatcher<GameState>());
}

// ===========================================
// Tests
// ===========================================

describe("MapSceneSync", () => {
  it("applies the store's state on observe and on every change", () => {
    const view = new RecordingView();
    const sync = new MapSceneSync();
    sync.attach(view);
    const state = newGame();
    const store = storeOf(state);
    const detach = sync.observe(store);
    expect(view.calls).toHaveLength(1);
    expect(view.calls[0]?.map).toBe(state.overworld.map);
    expect(view.calls[0]?.missions).toEqual([]);

    const withMission: GameState = {
      ...state,
      overworld: { ...state.overworld, missions: [MISSION] },
    };
    store.replaceState(withMission);
    expect(view.calls).toHaveLength(2);
    expect(view.calls[1]?.missions).toEqual(["new-york"]);

    detach();
    store.replaceState(state);
    expect(view.calls).toHaveLength(2);
  });

  it("replays the latest state when the scene attaches after the store", () => {
    const view = new RecordingView();
    const sync = new MapSceneSync();
    const state = newGame();
    sync.observe(storeOf(state));
    expect(view.calls).toHaveLength(0);
    sync.attach(view);
    expect(view.calls).toHaveLength(1);
    expect(view.calls[0]?.map).toBe(state.overworld.map);
  });
});

describe("missionCityIds", () => {
  it("collects one id per hosting city", () => {
    const state = newGame();
    expect(
      missionCityIds({
        ...state.overworld,
        missions: [
          MISSION,
          { ...MISSION, id: "mission-2" },
          { ...MISSION, id: "m3", cityId: "london" },
        ],
      }),
    ).toEqual(new Set(["new-york", "london"]));
  });
});
