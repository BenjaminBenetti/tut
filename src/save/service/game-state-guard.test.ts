import { describe, expect, it } from "vitest";

import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../model/game-state";
import { isGameStateShape } from "./game-state-guard";
import { createNewGame } from "./new-game-service";

const state: GameState = createNewGame(
  { seed: 7, createdAt: "2026-09-02T00:00:00.000Z" },
  {
    map: EARTH_MAP,
    squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
    starterRoster: STARTER_ROSTER,
    newGameTuning: NEW_GAME_TUNING,
    threatTuning: THREAT_TUNING,
    economyTuning: ECONOMY_TUNING,
  },
);

/** The state as it comes back from JSON, typed loosely for tampering. */
function jsonCopy(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
}

describe("isGameStateShape", () => {
  it("accepts a new campaign, before and after JSON", () => {
    expect(isGameStateShape(state)).toBe(true);
    expect(isGameStateShape(jsonCopy())).toBe(true);
  });

  it("rejects things that are not objects", () => {
    for (const value of [null, undefined, 3, "state", [], [state]]) {
      expect(isGameStateShape(value)).toBe(false);
    }
  });

  it("rejects a root missing any slice", () => {
    for (const slice of ["meta", "overworld", "roster", "economy"]) {
      const copy = jsonCopy();
      delete copy[slice];
      expect(isGameStateShape(copy), slice).toBe(false);
    }
  });

  it("rejects slices with the wrong field types", () => {
    const wrongSeed = jsonCopy();
    (wrongSeed.meta as Record<string, unknown>).seed = "42";
    const wrongDay = jsonCopy();
    (wrongDay.overworld as Record<string, unknown>).day = undefined;
    const wrongSquads = jsonCopy();
    (wrongSquads.roster as Record<string, unknown>).squads = {};
    const wrongLedger = jsonCopy();
    (wrongLedger.economy as Record<string, unknown>).ledger = "none";
    for (const bad of [wrongSeed, wrongDay, wrongSquads, wrongLedger]) {
      expect(isGameStateShape(bad)).toBe(false);
    }
  });
});
