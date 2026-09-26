import { describe, expect, it } from "vitest";

import { ok } from "../../core/model/result";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { advanceDay } from "../../overworld/model/overworld-command";
import { KILL_GROUPS } from "../../bugs/data/kill-groups";
import { campaignTechConditions } from "../../overworld/service/campaign-tech-conditions";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { TECH_FAMILIES } from "../../tech/data/tech-families";
import { TECH_NODES } from "../../tech/data/tech-tree";
import { StaticTechCatalogue } from "../../tech/repository/static-tech-catalogue";
import type { CampaignGameStore } from "./game-session";
import { GameStore } from "./game-store";
import { createResearchRevealWatcher } from "./research-reveal-watcher";

// ===========================================
// Fixtures
// ===========================================

const FRESH: GameState = createNewGame(
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

/** `FRESH` with the species killed so far. */
function killed(...species: BugSpeciesId[]): GameState {
  return {
    ...FRESH,
    overworld: {
      ...FRESH.overworld,
      progress: { ...FRESH.overworld.progress, speciesKilled: species },
    },
  };
}

/**
 * A store whose every command lands the state the test queued next, so
 * a "mission that killed a spitter" is one dispatch.
 */
function scriptedStore(initial: GameState): {
  store: CampaignGameStore;
  next: (state: GameState) => void;
} {
  let queued = initial;
  const store = new GameStore<GameState, OverworldCommand, CampaignEvent>(
    initial,
    { process: () => ok({ state: queued, events: [] }) },
  );
  return {
    store,
    next: (state) => {
      queued = state;
      store.dispatch(advanceDay());
    },
  };
}

/** A watcher over the shipped tree that records every reveal's node ids. */
function watcher(): {
  observe: ReturnType<typeof createResearchRevealWatcher>;
  reveals: string[][];
} {
  const reveals: string[][] = [];
  const observe = createResearchRevealWatcher({
    catalogue: new StaticTechCatalogue(
      TECH_NODES,
      Object.values(TECH_FAMILIES),
    ),
    conditionsOf: (state) =>
      campaignTechConditions(
        state.overworld.progress,
        Object.values(KILL_GROUPS),
      ),
    onRevealed: (nodes) => {
      reveals.push(nodes.map((node) => node.id));
    },
  });
  return { observe, reveals };
}

// ===========================================
// Tests
// ===========================================

describe("createResearchRevealWatcher (campaign arc §8)", () => {
  it("announces an autopsy once, on the command that records its species' first kill", () => {
    const { observe, reveals } = watcher();
    const { store, next } = scriptedStore(FRESH);
    observe(store);
    next(FRESH);
    expect(reveals).toEqual([]);
    next(killed("spitter"));
    expect(reveals).toEqual([["tech.spitter-autopsy"]]);
    next(killed("spitter"));
    next(killed("spitter", "swarmer"));
    expect(reveals).toEqual([["tech.spitter-autopsy"]]);
    next(killed("spitter", "swarmer", "hive-guard"));
    expect(reveals).toEqual([
      ["tech.spitter-autopsy"],
      ["tech.hive-guard-autopsy"],
    ]);
  });

  it("takes a loaded or replaced campaign as a new baseline, never as a reveal", () => {
    const { observe, reveals } = watcher();
    const { store, next } = scriptedStore(FRESH);
    observe(store);
    store.replaceState(killed("spitter"));
    next(killed("spitter"));
    expect(reveals).toEqual([]);
    // Nor is research already shown when the watcher attaches.
    const loaded = scriptedStore(killed("spitter"));
    observe(loaded.store);
    loaded.next(killed("spitter"));
    expect(reveals).toEqual([]);
  });

  it("stops watching once detached", () => {
    const { observe, reveals } = watcher();
    const { store, next } = scriptedStore(FRESH);
    const detach = observe(store);
    detach();
    next(killed("spitter"));
    expect(reveals).toEqual([]);
  });
});
