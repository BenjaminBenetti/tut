import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { computeStipend } from "../../economy/service/income-service";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { DEPLOYABLE_TYPES } from "../data/deployable-types";
import { EARTH_MAP } from "../data/earth-map";
import { INFESTATION_TUNING } from "../data/infestation-tuning";
import { MISSION_TUNING } from "../data/mission-tuning";
import { NEW_GAME_TUNING } from "../data/new-game-tuning";
import { THREAT_TUNING } from "../data/threat-tuning";
import { DEPLOYABLE_TYPE_IDS } from "../model/deployable-type";
import type { TickContext } from "../model/tick-step";
import { DataDeployableTypeCatalogue } from "../repository/deployable-type-catalogue";
import { DataEventTypeCatalogue } from "../repository/event-type-catalogue";
import { EVENT_TUNING } from "../data/event-tuning";
import { EVENT_TYPES } from "../data/event-types";
import { EVENT_TYPE_IDS } from "../model/event-type";
import type { TickDeps } from "./default-tick-steps";
import { createDefaultTickSteps, TICK_STEP_NAMES } from "./default-tick-steps";
import { unfestedFraction } from "./threat-service";

// ===========================================
// Fixtures
// ===========================================

const TICK_DEPS: TickDeps = {
  catalogue: new DataDeployableTypeCatalogue(
    DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
  ),
  createTransactions: (ids) => new LedgerTransactionService(ids),
  infestationTuning: INFESTATION_TUNING,
  missionTuning: MISSION_TUNING,
  missionTypes: MISSION_TYPES,
  threatTuning: THREAT_TUNING,
  economyTuning: ECONOMY_TUNING,
  eventTypes: new DataEventTypeCatalogue(
    EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
  ),
  eventTuning: EVENT_TUNING,
};

function newGame(): GameState {
  return createNewGame(
    { seed: 11, createdAt: "2026-09-03T00:00:00.000Z" },
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

function ctx(day: number): TickContext {
  return {
    day,
    rng: new Mulberry32Rng(day),
    ids: new SequentialIdGenerator(),
    modifiers: { suppression: {}, spreadDeterrence: {}, intelBonus: {} },
  };
}

/** The stipend step from the default pipeline. */
function stipendStep() {
  const step = createDefaultTickSteps<GameState>(TICK_DEPS).find(
    (s) => s.name === TICK_STEP_NAMES.stipend,
  );
  if (!step) throw new Error("no stipend step");
  return step;
}

// ===========================================
// Stipend step
// ===========================================

describe("stipend step with event modifiers", () => {
  it("pays the plain stipend and leaves the field absent with no modifiers", () => {
    const state = newGame();
    const { state: next } = stipendStep().run(state, ctx(2));
    const expected = computeStipend(
      unfestedFraction(state.overworld.map),
      ECONOMY_TUNING,
    );
    expect(next.economy.credits - state.economy.credits).toBe(expected);
    expect("stipendModifiers" in next.overworld).toBe(false);
  });

  it("scales the payment by the product of active modifiers and counts them down", () => {
    const base = newGame();
    const state: GameState = {
      ...base,
      overworld: {
        ...base.overworld,
        stipendModifiers: [
          { factor: 1.5, daysLeft: 2 },
          { factor: 0.5, daysLeft: 1 },
        ],
      },
    };
    /** What the day pays with the base and floor scaled by `factor`. */
    const scaled = (factor: number): number =>
      computeStipend(unfestedFraction(state.overworld.map), {
        ...ECONOMY_TUNING,
        baseStipend: Math.round(ECONOMY_TUNING.baseStipend * factor),
        stipendFloor: Math.round(ECONOMY_TUNING.stipendFloor * factor),
      });
    const { state: day1 } = stipendStep().run(state, ctx(2));
    expect(day1.economy.credits - state.economy.credits).toBe(scaled(0.75));
    expect(day1.overworld.stipendModifiers).toEqual([
      { factor: 1.5, daysLeft: 1 },
    ]);

    const { state: day2 } = stipendStep().run(day1, ctx(3));
    expect(day2.economy.credits - day1.economy.credits).toBe(scaled(1.5));
    expect("stipendModifiers" in day2.overworld).toBe(false);
  });
});
