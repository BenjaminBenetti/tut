import { describe, expect, it } from "vitest";

import type { CommandProcessor } from "../../core/model/command-processor";
import { ok } from "../../core/model/result";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { advanceDay } from "../../overworld/model/overworld-command";
import type { OverworldDomainEvent } from "../../overworld/model/overworld-domain-event";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import type { KeyValueStore } from "../../save/model/key-value-store";
import type { SaveError } from "../../save/model/save-error";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { createGameSaveService } from "../../save/service/game-save-service";
import { createNewGame } from "../../save/service/new-game-service";
import { AutosaveService } from "./autosave-service";
import { GameStore } from "./game-store";

const SLOT = "autosave";
const NOW = "2026-09-03T00:00:00.000Z";

const newGame = (): GameState =>
  createNewGame(
    { seed: 11, createdAt: NOW },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );

/** Bumps the day on every command. */
const bumpDay: CommandProcessor<
  GameState,
  OverworldCommand,
  OverworldDomainEvent
> = {
  process: (state) =>
    ok({
      state: {
        ...state,
        overworld: { ...state.overworld, day: state.overworld.day + 1 },
      },
      events: [],
    }),
};

const build = (store: KeyValueStore = new MemoryKeyValueStore()) => {
  const saves = createGameSaveService(store, { now: () => NOW });
  const failures: SaveError[] = [];
  const autosave = new AutosaveService(saves, SLOT, (error) => {
    failures.push(error);
  });
  return { saves, autosave, failures };
};

const savedDay = (saves: ReturnType<typeof build>["saves"]): number => {
  const loaded = saves.loadGame(SLOT);
  if (!loaded.ok) {
    throw new Error(loaded.error.message);
  }
  return loaded.value.overworld.day;
};

describe("AutosaveService", () => {
  it("saves the store's current state as soon as it attaches", () => {
    const { saves, autosave } = build();
    const state = newGame();
    autosave.attach(new GameStore(state, bumpDay));
    const loaded = saves.loadGame(SLOT);
    expect(loaded.ok && loaded.value).toEqual(state);
  });

  it("saves again after every successful command", () => {
    const { saves, autosave } = build();
    const store = new GameStore(newGame(), bumpDay);
    autosave.attach(store);
    store.dispatch(advanceDay());
    expect(savedDay(saves)).toBe(2);
    store.dispatch(advanceDay());
    expect(savedDay(saves)).toBe(3);
  });

  it("saves a replaced state too", () => {
    const { saves, autosave } = build();
    const store = new GameStore(newGame(), bumpDay);
    autosave.attach(store);
    const replaced = newGame();
    store.replaceState({
      ...replaced,
      overworld: { ...replaced.overworld, day: 9 },
    });
    expect(savedDay(saves)).toBe(9);
  });

  it("reports a failed write and keeps following the store", () => {
    const failing: KeyValueStore = {
      get: () => undefined,
      set: () => {
        throw new Error("quota exceeded");
      },
      remove: () => undefined,
      keys: () => [],
    };
    const { autosave, failures } = build(failing);
    const store = new GameStore(newGame(), bumpDay);
    autosave.attach(store);
    store.dispatch(advanceDay());
    expect(failures.map((f) => f.kind)).toEqual(["storage", "storage"]);
    expect(failures[0]?.message).toContain("quota exceeded");
  });

  it("stops saving once detached", () => {
    const { saves, autosave } = build();
    const store = new GameStore(newGame(), bumpDay);
    const detach = autosave.attach(store);
    detach();
    store.dispatch(advanceDay());
    expect(savedDay(saves)).toBe(1);
  });
});
