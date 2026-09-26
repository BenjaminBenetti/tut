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
import { HIVE_TUNING } from "../data/hive-tuning";
import { INFESTATION_TUNING } from "../data/infestation-tuning";
import { MISSION_TUNING } from "../data/mission-tuning";
import { NEW_GAME_TUNING } from "../data/new-game-tuning";
import { THREAT_TUNING } from "../data/threat-tuning";
import { NO_DEPLOYABLE_MODIFIERS } from "../model/deployable-modifiers";
import { DEPLOYABLE_TYPE_IDS } from "../model/deployable-type";
import type { TickContext } from "../model/tick-step";
import { DataDeployableTypeCatalogue } from "../repository/deployable-type-catalogue";
import { DataEventTypeCatalogue } from "../repository/event-type-catalogue";
import { EVENT_TUNING } from "../data/event-tuning";
import { EVENT_TYPES } from "../data/event-types";
import { EVENT_TYPE_IDS } from "../model/event-type";
import type { ActId } from "../../content/model/act-id";
import type { CampaignEvent } from "../model/campaign-event";
import { ADVANCE_DAY, advanceDay } from "../model/overworld-command";
import { INFESTATION_SPREAD } from "../model/infestation-spread-event";
import type { RegionId } from "../model/region";
import { createAdvanceDayHandler } from "./advance-day-service";
import { createOverworldCommandDispatcher } from "./command-dispatcher";
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
  hiveTuning: HIVE_TUNING,
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
    modifiers: NO_DEPLOYABLE_MODIFIERS,
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

  it("adds the deployable income bonus to the stipend", () => {
    const state = newGame();
    const plain = stipendStep().run(state, ctx(2));
    const boosted = stipendStep().run(state, {
      ...ctx(2),
      modifiers: { ...NO_DEPLOYABLE_MODIFIERS, incomeBonus: 150 },
    });
    expect(boosted.state.economy.credits - plain.state.economy.credits).toBe(
      150,
    );
    expect(boosted.state.economy.ledger).toHaveLength(1);
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

// ===========================================
// Threat step (#307)
// ===========================================

describe("threat step with a threat offset", () => {
  /** The threat step from the default pipeline. */
  function threatStep() {
    const step = createDefaultTickSteps<GameState>(TICK_DEPS).find(
      (s) => s.name === TICK_STEP_NAMES.threat,
    );
    if (!step) throw new Error("no threat step");
    return step;
  }

  it("folds the offset into the recomputed threat so it survives the tick", () => {
    const base = newGame();
    const plain = threatStep().run(base, ctx(2)).state.overworld.threat;
    // A fresh campaign sits near zero threat, so a positive offset is the
    // one that is not swallowed by the clamp.
    const shifted: GameState = {
      ...base,
      overworld: { ...base.overworld, threatOffset: 8 },
    };
    const { state } = threatStep().run(shifted, ctx(2));
    expect(state.overworld.threat).toBeCloseTo(plain + 8);
    expect(state.overworld.threatOffset).toBe(8);
  });
});

// ===========================================
// Hives and growth pauses (arc §6.5)
// ===========================================

describe("hives and growth pauses in the day tick", () => {
  /** The named step from the default pipeline. */
  function step(name: string) {
    const found = createDefaultTickSteps<GameState>(TICK_DEPS).find(
      (s) => s.name === name,
    );
    if (!found) throw new Error(`no ${name} step`);
    return found;
  }

  /** A region of the shipped map with at least three cities. */
  const REGION = EARTH_MAP.regions.find((r) => r.cityIds.length >= 3);
  if (!REGION) throw new Error("fixture needs a region with three cities");
  const REGION_ID: RegionId = REGION.id;
  const inRegion = new Set(REGION.cityIds);

  /**
   * The new game with `REGION`'s cities at 70, past the spread
   * threshold, every other city clean, and `extra` on the overworld.
   */
  function hotRegion(extra: Partial<GameState["overworld"]> = {}): GameState {
    const base = newGame();
    return {
      ...base,
      overworld: {
        ...base.overworld,
        map: {
          ...base.overworld.map,
          cities: base.overworld.map.cities.map((c) => ({
            ...c,
            infestation: inRegion.has(c.id) ? 70 : 0,
            detected: inRegion.has(c.id),
          })),
        },
        ...extra,
      },
    };
  }

  /** Infestation of the region's cities, in map order. */
  function regionLevels(state: GameState): number[] {
    return state.overworld.map.cities
      .filter((c) => inRegion.has(c.id))
      .map((c) => c.infestation);
  }

  /** Amounts spread from the region's cities, in event order. */
  function spreadFromRegion(events: readonly CampaignEvent[]): number[] {
    return events.flatMap((e) =>
      e.type === INFESTATION_SPREAD && inRegion.has(e.payload.fromCityId)
        ? [e.payload.amount]
        : [],
    );
  }

  it("holds a paused region's growth and spread, then lets both go on the day it resumes", () => {
    // Liberated on day 20: paused through day 30, grows again on day 31.
    const paused = hotRegion({ growthPausedUntil: { [REGION_ID]: 31 } });

    const grownDuring = step(TICK_STEP_NAMES.growth).run(paused, ctx(30));
    expect(regionLevels(grownDuring.state)).toEqual(regionLevels(paused));
    const spreadDuring = step(TICK_STEP_NAMES.spread).run(paused, ctx(30));
    expect(spreadFromRegion(spreadDuring.events)).toEqual([]);

    const grownAfter = step(TICK_STEP_NAMES.growth).run(paused, ctx(31));
    for (const level of regionLevels(grownAfter.state)) {
      expect(level).toBeGreaterThan(70);
    }
    const spreadAfter = step(TICK_STEP_NAMES.spread).run(paused, ctx(31));
    expect(spreadFromRegion(spreadAfter.events).length).toBeGreaterThan(0);
  });

  it("spreads 15 instead of 10 from a region that holds a hive", () => {
    const plain = step(TICK_STEP_NAMES.spread).run(hotRegion(), ctx(5));
    const amounts = spreadFromRegion(plain.events);
    expect(amounts.length).toBeGreaterThan(0);
    expect(amounts.every((a) => a === 10)).toBe(true);

    const hived = step(TICK_STEP_NAMES.spread).run(
      hotRegion({
        hives: [{ id: "hive-1", regionId: REGION_ID, formedDay: 1 }],
      }),
      ctx(5),
    );
    const boosted = spreadFromRegion(hived.events);
    expect(boosted.length).toBe(amounts.length);
    expect(boosted.every((a) => a === 15)).toBe(true);
  });

  /**
   * Plays up to `days` days of the default tick from seed `seed` in
   * `act`, recording each day's events and stopping when the campaign
   * ends (an untended campaign is lost to threat around day 60).
   * `withoutHives` drops the hive-formation step and the hive spread
   * boost: the day tick as it was before hives existed.
   */
  function play(seed: number, days: number, act: ActId, withoutHives: boolean) {
    const deps: TickDeps = withoutHives
      ? {
          ...TICK_DEPS,
          infestationTuning: { ...INFESTATION_TUNING, hiveSpreadMultiplier: 1 },
        }
      : TICK_DEPS;
    const steps = createDefaultTickSteps<GameState>(deps).filter(
      (s) => !withoutHives || s.name !== TICK_STEP_NAMES.hiveFormation,
    );
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    dispatcher.register(
      ADVANCE_DAY,
      createAdvanceDayHandler(steps, { catalogue: TICK_DEPS.catalogue }),
    );
    const start = createNewGame(
      { seed, createdAt: "2026-09-03T00:00:00.000Z" },
      {
        map: EARTH_MAP,
        squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
        starterRoster: STARTER_ROSTER,
        newGameTuning: NEW_GAME_TUNING,
        threatTuning: THREAT_TUNING,
        economyTuning: ECONOMY_TUNING,
      },
    );
    let state: GameState = {
      ...start,
      overworld: {
        ...start.overworld,
        progress: { ...start.overworld.progress, act },
      },
    };
    const perDay: (readonly CampaignEvent[])[] = [];
    for (let i = 0; i < days; i++) {
      const result = dispatcher.process(state, advanceDay());
      if (!result.ok) break;
      state = result.value.state;
      perDay.push(result.value.events);
    }
    return { state, perDay };
  }

  it("ticks an Act I campaign exactly as the day tick without hives did", () => {
    for (const seed of [3, 42, 1179]) {
      const withHives = play(seed, 150, "act-1", false);
      const without = play(seed, 150, "act-1", true);
      // Played to defeat, through weeks of regions far above 60.
      expect(withHives.state.overworld.outcome?.kind).toBe("defeat");
      expect(withHives.perDay.length).toBeGreaterThanOrEqual(50);
      expect(withHives.state).toEqual(without.state);
      expect(withHives.perDay).toEqual(without.perDay);
      expect(withHives.state.overworld.hives).toEqual([]);
      expect("hiveWatch" in withHives.state.overworld).toBe(false);
    }
  });

  it("forms hives in Act II over the same days, so the comparison above has teeth", () => {
    const withHives = play(42, 150, "act-2", false);
    const without = play(42, 150, "act-2", true);
    expect(withHives.state.overworld.hives.length).toBeGreaterThan(0);
    expect(withHives.state).not.toEqual(without.state);
  });
});
