import { describe, expect, it } from "vitest";

import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { InMemoryGameSession } from "./game-session";

const stateWithSeed = (seed: number): GameState =>
  createNewGame(
    { seed, createdAt: "2026-09-02T00:00:00Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );

describe("InMemoryGameSession", () => {
  it("has no state until started", () => {
    const session = new InMemoryGameSession();
    expect(session.state).toBeUndefined();
  });

  it("exposes the exact state object it was started with", () => {
    const session = new InMemoryGameSession();
    const state = stateWithSeed(7);
    session.start(state);
    expect(session.state).toBe(state);
  });

  it("starting again swaps in the new campaign", () => {
    const session = new InMemoryGameSession();
    session.start(stateWithSeed(1));
    const second = stateWithSeed(2);
    session.start(second);
    expect(session.state).toBe(second);
  });

  it("replaces the state of an active session", () => {
    const session = new InMemoryGameSession();
    session.start(stateWithSeed(1));
    const next = stateWithSeed(3);
    session.replace(next);
    expect(session.state).toBe(next);
  });

  it("refuses to replace when no session is active", () => {
    const session = new InMemoryGameSession();
    expect(() => {
      session.replace(stateWithSeed(1));
    }).toThrow(/no game session is active/);
  });

  it("clears back to no state", () => {
    const session = new InMemoryGameSession();
    session.start(stateWithSeed(1));
    session.clear();
    expect(session.state).toBeUndefined();
  });
});
