import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import { FIRST_DAY } from "../../overworld/model/overworld-state";
import { computeThreat } from "../../overworld/service/threat-service";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import {
  STARTER_LOADOUT,
  STARTER_ROSTER,
} from "../../roster/data/starter-roster";
import { SQUAD_MAX_STRENGTH } from "../../roster/model/squad";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../model/game-state";
import type { NewGameDeps } from "./new-game-service";
import { createNewGame } from "./new-game-service";

const DEPS: NewGameDeps = {
  map: EARTH_MAP,
  squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
  starterRoster: STARTER_ROSTER,
  newGameTuning: NEW_GAME_TUNING,
  threatTuning: THREAT_TUNING,
  economyTuning: ECONOMY_TUNING,
};

const CREATED_AT = "2026-09-02T00:00:00.000Z";

/** A new campaign from the shipped content. */
function newGame(seed: number): GameState {
  return createNewGame({ seed, createdAt: CREATED_AT }, DEPS);
}

describe("createNewGame", () => {
  it("is deterministic: same seed gives a deep-equal state", () => {
    expect(newGame(42)).toEqual(newGame(42));
  });

  it("varies with the seed", () => {
    expect(newGame(42).overworld.map).not.toEqual(newGame(43).overworld.map);
  });

  it("round-trips the whole state through JSON", () => {
    const state = newGame(42);
    expect(JSON.parse(JSON.stringify(state)) as GameState).toEqual(state);
  });

  it("starts on day 1 with the threat its map implies", () => {
    const { overworld } = newGame(42);
    expect(overworld.day).toBe(FIRST_DAY);
    expect(overworld.day).toBe(1);
    expect(overworld.threat).toBe(
      computeThreat(overworld.map, FIRST_DAY, THREAT_TUNING),
    );
    expect(overworld.missions).toEqual([]);
    expect(overworld.spreadCooldowns).toEqual({});
    expect(overworld.pendingEvents).toEqual([]);
    expect(overworld.deployables).toEqual([]);
    expect(overworld.hives).toEqual([]);
  });

  it("seeds a few cities with infestation and leaves the rest clean", () => {
    const { overworld } = newGame(42);
    const infested = overworld.map.cities.filter((c) => c.infestation > 0);
    expect(infested.length).toBeGreaterThanOrEqual(
      NEW_GAME_TUNING.infestedCities.min,
    );
    expect(infested.length).toBeLessThanOrEqual(
      NEW_GAME_TUNING.infestedCities.max,
    );
    for (const c of infested) {
      expect(c.infestation).toBeGreaterThanOrEqual(
        NEW_GAME_TUNING.initialInfestation.min,
      );
      expect(c.infestation).toBeLessThanOrEqual(
        NEW_GAME_TUNING.initialInfestation.max,
      );
    }
    expect(overworld.map.regions).toEqual(EARTH_MAP.regions);
    expect(overworld.map.cities).toHaveLength(EARTH_MAP.cities.length);
  });

  it("fields the starter roster with fresh ids", () => {
    const { roster } = newGame(42);
    expect(roster.squads.map((s) => [s.id, s.name, s.typeId])).toEqual([
      ["squad-1", "Alpha", "rifle"],
      ["squad-2", "Bravo", "rifle"],
    ]);
    for (const squad of roster.squads) {
      expect(squad.strength).toBe(SQUAD_MAX_STRENGTH);
    }
    expect(roster.mechs).toHaveLength(1);
    expect(roster.mechs[0]?.id).toBe("mech-1");
    expect(roster.mechs[0]?.name).toBe("Hammerhead");
    expect(roster.mechs[0]?.loadout).toEqual(STARTER_LOADOUT);
    expect(roster.savedLoadouts).toEqual([STARTER_LOADOUT]);
  });

  it("grants the starting credits with an empty ledger", () => {
    const { economy } = newGame(42);
    expect(economy.credits).toBe(ECONOMY_TUNING.startingCredits);
    expect(economy.ledger).toEqual([]);
  });

  it("carries debug options into meta only when given", () => {
    expect("debug" in newGame(42).meta).toBe(false);
    const fast = createNewGame(
      {
        seed: 42,
        createdAt: CREATED_AT,
        debug: { threatEscalationMultiplier: 100 },
      },
      DEPS,
    );
    expect(fast.meta.debug).toEqual({ threatEscalationMultiplier: 100 });
    expect(JSON.parse(JSON.stringify(fast))).toEqual(fast);
  });

  it("writes the advanced id counters and the untouched master RNG back into meta", () => {
    const { meta } = newGame(42);
    expect(meta.seed).toBe(42);
    expect(meta.createdAt).toBe(CREATED_AT);
    expect(meta.ids).toEqual({ counters: { squad: 3, mech: 2 } });
    expect(new SequentialIdGenerator(meta.ids).nextId("squad")).toBe("squad-3");
    // The opening is drawn from a labelled fork, which leaves the master
    // stream exactly where a fresh generator starts.
    expect(meta.rng).toEqual(new Mulberry32Rng(42).getState());
  });

  it("has no active mission in M1", () => {
    const state = newGame(42);
    expect("activeMission" in state).toBe(false);
  });
});
