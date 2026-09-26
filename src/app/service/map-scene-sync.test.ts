import { describe, expect, it } from "vitest";

import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import type { MapSceneState } from "../../graphics/model/map-scene-state";
import type { MapStateView } from "../../graphics/model/map-state-view";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CityId } from "../../overworld/model/city";
import type { EarthMap } from "../../overworld/model/earth-map";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { Mission } from "../../overworld/model/mission";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { CampaignGameStore } from "./game-session";
import { GameStore } from "./game-store";
import {
  MapSceneSync,
  mapSceneState,
  missionCueCityIds,
} from "./map-scene-sync";

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
  rewards: { credits: 1500, techPoints: 0 },
  createdDay: 1,
  expiresDay: 9,
  ignorePenalty: 10,
};

/** Records every update it receives. */
class RecordingView implements MapStateView {
  readonly calls: { map: EarthMap; missions: CityId[]; deployables: number }[] =
    [];
  update(state: MapSceneState): void {
    this.calls.push({
      map: state.map,
      missions: [...state.missionCueCityIds].sort(),
      deployables: state.deployables.length,
    });
  }
}

/** A store over an empty dispatcher; `replaceState` is enough to drive changes. */
function storeOf(state: GameState): CampaignGameStore {
  return new GameStore<GameState, OverworldCommand, CampaignEvent>(
    state,
    createOverworldCommandDispatcher<GameState>(),
  );
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
    expect(view.calls[0]?.deployables).toBe(0);

    const withMission: GameState = {
      ...state,
      overworld: {
        ...state.overworld,
        missions: [MISSION],
        deployables: [
          {
            id: "deployable-1",
            typeId: "sensor-array",
            regionId: "east-asia",
            level: 1,
            builtDay: 1,
            online: true,
          },
        ],
      },
    };
    store.replaceState(withMission);
    expect(view.calls).toHaveLength(2);
    expect(view.calls[1]?.missions).toEqual(["new-york"]);
    expect(view.calls[1]?.deployables).toBe(1);

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

describe("missionCueCityIds", () => {
  it("collects one id per city with a clearance mission on offer", () => {
    const state = newGame();
    expect(
      missionCueCityIds({
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

describe("mapSceneState", () => {
  it("hands the map, the egg cues and every deployable to the scene (#1155)", () => {
    const state = newGame();
    const overworld = {
      ...state.overworld,
      missions: [MISSION],
      deployables: [
        {
          id: "deployable-1",
          typeId: "defensive-battery" as const,
          regionId: "western-europe",
          level: 1 as const,
          builtDay: 1,
          online: false,
        },
      ],
    };
    const scene = mapSceneState(overworld);
    expect(scene.map).toBe(overworld.map);
    expect(scene.missionCueCityIds).toEqual(new Set(["new-york"]));
    expect(scene.deployables).toBe(overworld.deployables);
    expect(scene).not.toHaveProperty("greatHives");
  });

  it("hands the revealed Great Hives to the scene for their beacons (#1179)", () => {
    const state = newGame();
    const greatHives = [
      {
        id: "greathive-1",
        continentId: "europe" as const,
        name: "Europe",
        regionId: "eastern-europe",
        regionIds: ["eastern-europe"],
        revealedDay: 200,
        level: 0,
      },
    ];
    const scene = mapSceneState({ ...state.overworld, greatHives });
    expect(scene.greatHives).toBe(greatHives);
  });
});
