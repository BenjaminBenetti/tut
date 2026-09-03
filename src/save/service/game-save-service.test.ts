import { describe, expect, it } from "vitest";

import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../model/game-state";
import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import type { SaveEnvelope } from "../model/save-envelope";
import { MemoryKeyValueStore } from "../repository/memory-key-value-store";
import type { GameSaveService } from "./game-save-service";
import { createGameSaveService } from "./game-save-service";
import { createNewGame } from "./new-game-service";

const NOW = "2026-09-02T06:00:00.000Z";

/** A new campaign from the shipped content. */
function newGame(seed: number): GameState {
  return createNewGame(
    { seed, createdAt: "2026-09-02T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
}

/** A service over an in-memory store with a fixed clock. */
function build(): { service: GameSaveService; store: MemoryKeyValueStore } {
  const store = new MemoryKeyValueStore();
  const service = createGameSaveService(store, { now: () => NOW });
  return { service, store };
}

/** Wraps a state in an envelope of the given version, as text. */
function envelopeText(schemaVersion: number, state: unknown): string {
  const envelope: SaveEnvelope<unknown> = {
    schemaVersion,
    savedAt: NOW,
    state,
  };
  return JSON.stringify(envelope);
}

describe("GameSaveService", () => {
  it("saves and loads a campaign unchanged", () => {
    const { service } = build();
    const state = newGame(42);
    expect(service.saveGame("slot-1", state)).toEqual({
      ok: true,
      value: undefined,
    });
    const loaded = service.loadGame("slot-1");
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value).toEqual(state);
      expect(loaded.value).not.toBe(state);
    }
  });

  it("stamps slots with the clock and the current schema version", () => {
    const { service } = build();
    service.saveGame("autosave", newGame(1));
    service.saveGame("slot-2", newGame(2));
    expect(service.listSlots()).toEqual([
      {
        id: "autosave",
        savedAt: NOW,
        schemaVersion: GAME_STATE_SCHEMA_VERSION,
      },
      { id: "slot-2", savedAt: NOW, schemaVersion: GAME_STATE_SCHEMA_VERSION },
    ]);
  });

  it("exports exactly the text a slot stores, so either can be imported", () => {
    const { service, store } = build();
    const state = newGame(42);
    service.saveGame("slot-1", state);
    const exported = service.exportGame(state);
    expect(exported).toBe(store.get("tut:save:slot-1"));
    expect(JSON.parse(exported)).toMatchObject({
      schemaVersion: GAME_STATE_SCHEMA_VERSION,
      savedAt: NOW,
    });
  });

  it("imports an exported campaign unchanged into a fresh service", () => {
    const state = newGame(42);
    const exported = build().service.exportGame(state);
    const imported = build().service.importGame(exported);
    expect(imported).toEqual({ ok: true, value: state });
  });

  it("reports a missing slot", () => {
    const { service } = build();
    const result = service.loadGame("slot-9");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("missing");
    }
  });

  it("rejects corrupt, foreign and future documents with typed errors", () => {
    const { service } = build();
    const kinds = [
      service.importGame("{not json"),
      service.importGame('{"hello":"world"}'),
      service.importGame(envelopeText(GAME_STATE_SCHEMA_VERSION, { hp: 3 })),
      service.importGame(
        envelopeText(GAME_STATE_SCHEMA_VERSION + 1, newGame(1)),
      ),
    ].map((result) => (result.ok ? "ok" : result.error.kind));
    expect(kinds).toEqual([
      "parse",
      "malformed",
      "malformed",
      "unsupported-version",
    ]);
  });

  it("rejects a slot whose envelope holds something other than a campaign", () => {
    const { service, store } = build();
    store.set(
      "tut:save:slot-1",
      envelopeText(GAME_STATE_SCHEMA_VERSION, { day: 4 }),
    );
    const result = service.loadGame("slot-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("malformed");
    }
  });

  it("reports storage failures instead of throwing", () => {
    const store = new MemoryKeyValueStore();
    store.set = () => {
      throw new Error("QuotaExceededError");
    };
    const service = createGameSaveService(store, { now: () => NOW });
    expect(service.saveGame("slot-1", newGame(1))).toEqual({
      ok: false,
      error: { kind: "storage", message: "QuotaExceededError" },
    });
  });

  it("keeps a campaign playable after a save, load, export, import cycle", () => {
    const { service } = build();
    const state = newGame(42);
    service.saveGame("slot-1", state);
    const loaded = service.loadGame("slot-1");
    if (!loaded.ok) {
      throw new Error(loaded.error.message);
    }
    const reimported = service.importGame(service.exportGame(loaded.value));
    expect(reimported).toEqual({ ok: true, value: state });
  });
});
