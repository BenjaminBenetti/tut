import { describe, expect, it } from "vitest";

import type { CommandProcessor } from "../../core/model/command-processor";
import { ok } from "../../core/model/result";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { StoreChange } from "../../ui/model/state-store";
import type { CampaignGameStore } from "./game-session";
import { StoreGameSession } from "./game-session";
import { GameStore } from "./game-store";

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

/** Accepts every command and leaves the state alone. */
const idleProcessor: CommandProcessor<
  GameState,
  OverworldCommand,
  CampaignEvent
> = { process: (state) => ok({ state, events: [] }) };

const createStore = (state: GameState): CampaignGameStore =>
  new GameStore(state, idleProcessor);

describe("StoreGameSession", () => {
  it("has no store or state until started", () => {
    const session = new StoreGameSession(createStore);
    expect(session.store).toBeUndefined();
    expect(session.state).toBeUndefined();
  });

  it("builds a store around the started state", () => {
    const session = new StoreGameSession(createStore);
    const state = stateWithSeed(7);
    session.start(state);
    expect(session.store?.getState()).toBe(state);
    expect(session.state).toBe(state);
  });

  it("attaches the observer to each new store and detaches the previous one", () => {
    const log: string[] = [];
    const session = new StoreGameSession(createStore, (store) => {
      const seed = store.getState().meta.seed;
      log.push(`attach:${seed}`);
      return () => {
        log.push(`detach:${seed}`);
      };
    });
    session.start(stateWithSeed(1));
    session.start(stateWithSeed(2));
    session.clear();
    expect(log).toEqual(["attach:1", "detach:1", "attach:2", "detach:2"]);
  });

  it("replace swaps the store's state and notifies subscribers", () => {
    const session = new StoreGameSession(createStore);
    session.start(stateWithSeed(1));
    const seen: StoreChange<GameState, OverworldCommand, CampaignEvent>[] = [];
    session.store?.subscribe((change) => {
      seen.push(change);
    });
    const next = stateWithSeed(3);
    session.replace(next);
    expect(session.state).toBe(next);
    expect(seen).toEqual([{ kind: "replace", state: next, events: [] }]);
  });

  it("refuses to replace when no session is active", () => {
    const session = new StoreGameSession(createStore);
    expect(() => {
      session.replace(stateWithSeed(1));
    }).toThrow(/no game session is active/);
  });

  it("clears back to no store", () => {
    const session = new StoreGameSession(createStore);
    session.start(stateWithSeed(1));
    session.clear();
    expect(session.store).toBeUndefined();
    expect(session.state).toBeUndefined();
  });
});
