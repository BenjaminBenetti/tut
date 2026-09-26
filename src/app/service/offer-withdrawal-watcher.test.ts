import { describe, expect, it } from "vitest";

import { ok } from "../../core/model/result";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import { DAY_ADVANCED } from "../../overworld/model/day-advanced-event";
import type { MissionWithdrawnPayload } from "../../overworld/model/mission-withdrawn-event";
import { MISSION_WITHDRAWN } from "../../overworld/model/mission-withdrawn-event";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { advanceDay } from "../../overworld/model/overworld-command";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { CampaignGameStore } from "./game-session";
import { GameStore } from "./game-store";
import { createOfferWithdrawalWatcher } from "./offer-withdrawal-watcher";

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

const DISPLACED: MissionWithdrawnPayload = {
  missionId: "mission-3",
  typeId: "infestation-clearance",
  cityId: "lagos",
  replacedBy: "mission-9",
};

const LAPSED: MissionWithdrawnPayload = {
  missionId: "mission-4",
  typeId: "hive-assault",
  cityId: "cairo",
  reason: "target-gone",
};

/** A day tick's other news, which the watcher must pass over. */
const DAY: CampaignEvent = { type: DAY_ADVANCED, payload: { from: 1, to: 2 } };

/** The event the director raises for `payload`. */
function withdrawn(payload: MissionWithdrawnPayload): CampaignEvent {
  return { type: MISSION_WITHDRAWN, payload };
}

/**
 * A store whose every command lands `FRESH` with the events the test
 * queued next, so "a day that withdrew two offers" is one dispatch.
 */
function scriptedStore(): {
  store: CampaignGameStore;
  next: (events: readonly CampaignEvent[]) => void;
} {
  let queued: readonly CampaignEvent[] = [];
  const store = new GameStore<GameState, OverworldCommand, CampaignEvent>(
    FRESH,
    { process: (state) => ok({ state, events: queued }) },
  );
  return {
    store,
    next: (events) => {
      queued = events;
      store.dispatch(advanceDay());
    },
  };
}

// ===========================================
// Tests
// ===========================================

describe("createOfferWithdrawalWatcher (#1179)", () => {
  it("tells the listener every offer one command withdrew, in order, with the state it left", () => {
    const heard: [readonly MissionWithdrawnPayload[], GameState][] = [];
    const { store, next } = scriptedStore();
    createOfferWithdrawalWatcher((withdrawals, state) => {
      heard.push([withdrawals, state]);
    })(store);

    next([DAY, withdrawn(DISPLACED), withdrawn(LAPSED)]);

    expect(heard).toEqual([[[DISPLACED, LAPSED], FRESH]]);
  });

  it("stays quiet on a command that withdrew nothing", () => {
    const heard: unknown[] = [];
    const { store, next } = scriptedStore();
    createOfferWithdrawalWatcher((withdrawals) => heard.push(withdrawals))(
      store,
    );

    next([DAY]);
    next([]);

    expect(heard).toEqual([]);
  });

  it("announces nothing when a campaign is loaded, and nothing once detached", () => {
    const heard: unknown[] = [];
    const { store, next } = scriptedStore();
    const detach = createOfferWithdrawalWatcher((withdrawals) =>
      heard.push(withdrawals),
    )(store);

    store.replaceState(FRESH);
    detach();
    next([withdrawn(DISPLACED)]);

    expect(heard).toEqual([]);
  });
});
