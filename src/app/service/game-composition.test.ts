import { describe, expect, it } from "vitest";

import { ok } from "../../core/model/result";
import { UNKNOWN_COMMAND } from "../../overworld/model/command-dispatcher";
import {
  ADVANCE_DAY,
  advanceDay,
} from "../../overworld/model/overworld-command";
import { DAY_ADVANCED } from "../../overworld/model/overworld-domain-event";
import { AUTOSAVE_SLOT_ID } from "../../save/data/save-slots";
import type { SaveError } from "../../save/model/save-error";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

const NOW = "2026-09-03T00:00:00.000Z";

const build = (): { game: GameComposition; failures: SaveError[] } => {
  const failures: SaveError[] = [];
  const game = composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: (error) => {
      failures.push(error);
    },
  });
  return { game, failures };
};

describe("composeGame", () => {
  it("builds deterministic campaigns from the shipped content", () => {
    const { game } = build();
    const a = game.createCampaign({ seed: 7, createdAt: NOW });
    const b = game.createCampaign({ seed: 7, createdAt: NOW });
    expect(a).toEqual(b);
    expect(a.meta.seed).toBe(7);
    expect(a.roster.squads.length).toBeGreaterThan(0);
    expect(a.economy.credits).toBeGreaterThan(0);
  });

  it("autosaves a campaign as soon as the session starts", () => {
    const { game, failures } = build();
    const state = game.createCampaign({ seed: 7, createdAt: NOW });
    game.session.start(state);
    const loaded = game.saves.loadGame(AUTOSAVE_SLOT_ID);
    expect(loaded.ok && loaded.value).toEqual(state);
    expect(game.saves.listSlots().map((s) => s.id)).toEqual([AUTOSAVE_SLOT_ID]);
    expect(failures).toEqual([]);
  });

  it("rejects commands with no registered handler and leaves the autosave alone", () => {
    const { game } = build();
    const state = game.createCampaign({ seed: 7, createdAt: NOW });
    game.session.start(state);
    const result = game.session.store?.dispatch(advanceDay());
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.error.code).toBe(UNKNOWN_COMMAND);
    expect(game.session.state).toBe(state);
    const loaded = game.saves.loadGame(AUTOSAVE_SLOT_ID);
    expect(loaded.ok && loaded.value).toEqual(state);
  });

  it("routes registered handlers through the store and autosaves the outcome", () => {
    const { game } = build();
    game.dispatcher.register(ADVANCE_DAY, (state) => {
      const from = state.overworld.day;
      return ok({
        state: { ...state, overworld: { ...state.overworld, day: from + 1 } },
        events: [{ type: DAY_ADVANCED, payload: { from, to: from + 1 } }],
      });
    });
    game.session.start(game.createCampaign({ seed: 7, createdAt: NOW }));

    const result = game.session.store?.dispatch(advanceDay());
    expect(result?.ok).toBe(true);
    expect(game.session.state?.overworld.day).toBe(2);
    const loaded = game.saves.loadGame(AUTOSAVE_SLOT_ID);
    expect(loaded.ok && loaded.value.overworld.day).toBe(2);
  });

  it("passes the seed source and clock through for the menu", () => {
    const { game } = build();
    expect(game.newSeed()).toBe(7);
    expect(game.clock.now()).toBe(NOW);
  });
});
