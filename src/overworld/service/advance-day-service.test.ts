import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { CREDITS_CHANGED } from "../../economy/model/economy-event";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { DEPLOYABLE_TYPES } from "../data/deployable-types";
import { EARTH_MAP } from "../data/earth-map";
import { HIVE_TUNING } from "../data/hive-tuning";
import { INFESTATION_TUNING } from "../data/infestation-tuning";
import { ACTS } from "../data/acts";
import { MISSION_TUNING } from "../data/mission-tuning";
import { NEW_GAME_TUNING } from "../data/new-game-tuning";
import { THREAT_TUNING } from "../data/threat-tuning";
import type { CampaignEvent } from "../model/campaign-event";
import type { CampaignState } from "../model/campaign-state";
import type { CommandContext } from "../model/command-handler";
import { DEPLOYABLE_TYPE_IDS } from "../model/deployable-type";
import { ADVANCE_DAY, advanceDay } from "../model/overworld-command";
import { DAY_ADVANCED, GAME_ENDED } from "../model/overworld-domain-event";
import type { TickStep } from "../model/tick-step";
import { MAX_THREAT } from "../model/threat";
import { DataDeployableTypeCatalogue } from "../repository/deployable-type-catalogue";
import { DataEventTypeCatalogue } from "../repository/event-type-catalogue";
import { EVENT_TUNING } from "../data/event-tuning";
import { EVENT_TYPES } from "../data/event-types";
import { EVENT_TYPE_IDS } from "../model/event-type";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { CAMPAIGN_OVER, createAdvanceDayHandler } from "./advance-day-service";
import { createOverworldCommandDispatcher } from "./command-dispatcher";
import type { TickDeps } from "./default-tick-steps";
import { MISSION_CONSEQUENCE_RULES } from "./missions/mission-consequence-rules";
import { MISSION_OFFER_DECORATORS } from "./missions/mission-offer-decorators";
import { MISSION_OFFER_RULES } from "./missions/mission-offer-rules";
import { STORY_MISSION_RULES } from "./story/story-mission-rules";
import { createDefaultTickSteps, TICK_STEP_NAMES } from "./default-tick-steps";

// ===========================================
// Fixtures
// ===========================================

const CATALOGUE = new DataDeployableTypeCatalogue(
  DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
);

const TICK_DEPS: TickDeps = {
  catalogue: CATALOGUE,
  createTransactions: (ids) => new LedgerTransactionService(ids),
  infestationTuning: INFESTATION_TUNING,
  missionTuning: MISSION_TUNING,
  missionTypes: MISSION_TYPES,
  missionOffers: MISSION_OFFER_RULES,
  missionConsequences: MISSION_CONSEQUENCE_RULES,
  offerDecorators: MISSION_OFFER_DECORATORS,
  acts: ACTS,
  threatTuning: THREAT_TUNING,
  economyTuning: ECONOMY_TUNING,
  eventTypes: new DataEventTypeCatalogue(
    EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
  ),
  eventTuning: EVENT_TUNING,
  hiveTuning: HIVE_TUNING,
  storyMissions: STORY_MISSION_RULES,
};

function newGame(seed: number): GameState {
  return createNewGame(
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
}

function context(seed = 1): CommandContext {
  return { rng: new Mulberry32Rng(seed), ids: new SequentialIdGenerator() };
}

/** A step that records its name, day and one RNG draw, changing nothing else. */
function recordingStep<TState extends CampaignState>(
  name: string,
  log: { name: string; day: number; draw: number }[],
): TickStep<TState> {
  return {
    name,
    run: (state, ctx) => {
      log.push({ name, day: ctx.day, draw: ctx.rng.nextInt(0, 1_000_000) });
      return { state, events: [] };
    },
  };
}

/** A step that adds `amount` to the treasury and reports it. */
function creditStep<TState extends CampaignState>(
  name: string,
  amount: number,
): TickStep<TState> {
  return {
    name,
    run: (state) => {
      const before = state.economy.credits;
      const after = before + amount;
      return {
        state: { ...state, economy: { ...state.economy, credits: after } },
        events: [
          {
            type: CREDITS_CHANGED,
            payload: {
              before,
              after,
              transaction: {
                id: `t-${name}`,
                day: state.overworld.day,
                amount,
                kind: "stipend",
                ref: name,
              },
            },
          },
        ],
      };
    },
  };
}

/** Runs `days` ticks of the default pipeline through the dispatcher. */
function runDays(seed: number, days: number) {
  const dispatcher = createOverworldCommandDispatcher<GameState>();
  dispatcher.register(
    ADVANCE_DAY,
    createAdvanceDayHandler(createDefaultTickSteps<GameState>(TICK_DEPS), {
      catalogue: CATALOGUE,
    }),
  );
  let state = newGame(seed);
  const perDay: CampaignEvent[][] = [];
  for (let i = 0; i < days; i++) {
    const result = dispatcher.process(state, advanceDay());
    if (!result.ok) {
      throw new Error(`Day ${i + 1} failed: ${result.error.message}`);
    }
    state = result.value.state;
    perDay.push([...result.value.events]);
  }
  return { state, perDay };
}

// ===========================================
// Orchestrator
// ===========================================

describe("createAdvanceDayHandler", () => {
  it("increments the day first and announces it before any step event", () => {
    const start = newGame(1);
    const handler = createAdvanceDayHandler<GameState>([creditStep("a", 5)], {
      catalogue: CATALOGUE,
    });
    const result = handler(start, advanceDay(), context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.overworld.day).toBe(2);
    expect(result.value.events[0]).toEqual({
      type: DAY_ADVANCED,
      payload: { from: 1, to: 2 },
    });
    expect(result.value.events[1]?.type).toBe(CREDITS_CHANGED);
    expect(start.overworld.day).toBe(1);
  });

  it("folds steps in order, threading state and concatenating events", () => {
    const log: { name: string; day: number; draw: number }[] = [];
    const handler = createAdvanceDayHandler<CampaignState>(
      [
        recordingStep("one", log),
        creditStep("two", 10),
        recordingStep("three", log),
        creditStep("four", 20),
      ],
      { catalogue: CATALOGUE },
    );
    const start = newGame(2);
    const result = handler(start, advanceDay(), context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(log.map((entry) => entry.name)).toEqual(["one", "three"]);
    expect(log.every((entry) => entry.day === 2)).toBe(true);
    expect(result.value.state.economy.credits).toBe(start.economy.credits + 30);
    expect(result.value.events.map((e) => e.type)).toEqual([
      DAY_ADVANCED,
      CREDITS_CHANGED,
      CREDITS_CHANGED,
    ]);
  });

  it("gives each step its own stream, different per day and stable per seed", () => {
    const log: { name: string; day: number; draw: number }[] = [];
    const handler = createAdvanceDayHandler<CampaignState>(
      [recordingStep("a", log), recordingStep("b", log)],
      { catalogue: CATALOGUE },
    );
    const day1 = handler(newGame(3), advanceDay(), context(9));
    if (!day1.ok) throw new Error("day 1 failed");
    handler(day1.value.state, advanceDay(), context(9));
    const [a1, b1, a2, b2] = log;
    expect(a1?.draw).not.toBe(b1?.draw);
    expect(a1?.draw).not.toBe(a2?.draw);
    expect(b1?.draw).not.toBe(b2?.draw);

    const replay: { name: string; day: number; draw: number }[] = [];
    const again = createAdvanceDayHandler<CampaignState>(
      [recordingStep("a", replay), recordingStep("b", replay)],
      { catalogue: CATALOGUE },
    );
    again(newGame(3), advanceDay(), context(9));
    expect(replay).toEqual([a1, b1]);
  });

  it("refuses to advance an ended campaign and changes nothing", () => {
    const handler = createAdvanceDayHandler<GameState>([creditStep("a", 5)], {
      catalogue: CATALOGUE,
    });
    const base = newGame(4);
    const ended: GameState = {
      ...base,
      overworld: {
        ...base.overworld,
        outcome: {
          kind: "defeat",
          day: 30,
          summary: {
            citiesLost: 1,
            citiesInfested: 2,
            citiesTotal: 36,
            missionsRun: 0,
            daysSurvived: 30,
            finalThreat: 100,
          },
        },
      },
    };
    const result = handler(ended, advanceDay(), context());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(CAMPAIGN_OVER);
    expect(result.error.message).toContain("day 30");
  });

  it("rejects duplicate step names at construction", () => {
    expect(() =>
      createAdvanceDayHandler<CampaignState>(
        [creditStep("same", 1), creditStep("same", 2)],
        { catalogue: CATALOGUE },
      ),
    ).toThrow(/Duplicate tick step name "same"/);
  });
});

// ===========================================
// Default pipeline
// ===========================================

describe("default tick pipeline", () => {
  it("lists the steps in the documented order", () => {
    expect(createDefaultTickSteps(TICK_DEPS).map((step) => step.name)).toEqual([
      TICK_STEP_NAMES.upkeep,
      TICK_STEP_NAMES.growth,
      TICK_STEP_NAMES.spread,
      TICK_STEP_NAMES.hiveFormation,
      TICK_STEP_NAMES.detection,
      TICK_STEP_NAMES.missionExpiry,
      TICK_STEP_NAMES.missionGeneration,
      TICK_STEP_NAMES.events,
      TICK_STEP_NAMES.stipend,
      TICK_STEP_NAMES.threat,
      TICK_STEP_NAMES.outcome,
    ]);
  });

  it("pays an online bank's bonus inside the day's stipend, at its level", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    dispatcher.register(
      ADVANCE_DAY,
      createAdvanceDayHandler(createDefaultTickSteps<GameState>(TICK_DEPS), {
        catalogue: CATALOGUE,
      }),
    );
    const base = newGame(3);
    const region = base.overworld.map.regions[0];
    if (!region) throw new Error("fixture needs a region");
    const withBank = (level: 1 | 3): GameState => ({
      ...base,
      overworld: {
        ...base.overworld,
        deployables: [
          {
            id: "bank-1",
            typeId: "bank",
            regionId: region.id,
            level,
            builtDay: 1,
            online: true,
          },
        ],
      },
    });
    const stipendOf = (state: GameState): number => {
      const result = dispatcher.process(state, advanceDay());
      if (!result.ok) throw new Error(result.error.message);
      const stipend = result.value.state.economy.ledger.filter(
        (t) => t.kind === "stipend",
      );
      expect(stipend).toHaveLength(1);
      return stipend[0]?.amount ?? 0;
    };
    const plain = stipendOf(base);
    const bank = DEPLOYABLE_TYPES.bank;
    expect(stipendOf(withBank(1)) - plain).toBe(
      bank.levels[1].effect.incomeBonus,
    );
    expect(stipendOf(withBank(3)) - plain).toBe(
      bank.levels[3].effect.incomeBonus,
    );
  });

  it("finds a hidden landing sooner with a level 3 sensor array in its region", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    dispatcher.register(
      ADVANCE_DAY,
      createAdvanceDayHandler(createDefaultTickSteps<GameState>(TICK_DEPS), {
        catalogue: CATALOGUE,
      }),
    );
    const base = newGame(3);
    const region = base.overworld.map.regions.find(
      (r) =>
        base.overworld.map.cities.filter((c) => c.regionId === r.id).length >=
        3,
    );
    if (!region) throw new Error("fixture needs a region with three cities");
    const [target] = base.overworld.map.cities.filter(
      (c) => c.regionId === region.id,
    );
    if (!target) throw new Error("fixture needs a city");
    // Every other city on Earth is clean; the target is quietly at 8.
    const quiet: GameState = {
      ...base,
      overworld: {
        ...base.overworld,
        missions: [],
        map: {
          ...base.overworld.map,
          cities: base.overworld.map.cities.map((c) =>
            c.id === target.id
              ? { ...c, infestation: 8, detected: false }
              : { ...c, infestation: 0, detected: false },
          ),
        },
      },
    };
    const withSensor: GameState = {
      ...quiet,
      overworld: {
        ...quiet.overworld,
        deployables: [
          {
            id: "sensor-1",
            typeId: "sensor-array",
            regionId: region.id,
            level: 3,
            builtDay: 1,
            online: true,
          },
        ],
      },
    };
    const detectedAfter = (state: GameState): boolean => {
      const result = dispatcher.process(state, advanceDay());
      if (!result.ok) throw new Error(result.error.message);
      return (
        result.value.state.overworld.map.cities.find((c) => c.id === target.id)
          ?.detected ?? false
      );
    };
    expect(detectedAfter(quiet)).toBe(false);
    expect(detectedAfter(withSensor)).toBe(true);
  });

  it("is deterministic over 50 days from a fixed seed", () => {
    const a = runDays(42, 50);
    const b = runDays(42, 50);
    expect(a.state).toEqual(b.state);
    expect(a.perDay).toEqual(b.perDay);
    expect(a.state.overworld.day).toBe(51);
    expect(runDays(43, 50).state).not.toEqual(a.state);
  });

  it("emits exactly one DayAdvanced per tick, first, with consecutive days", () => {
    const { perDay } = runDays(42, 50);
    perDay.forEach((events, index) => {
      const dayEvents = events.filter((e) => e.type === DAY_ADVANCED);
      expect(dayEvents).toHaveLength(1);
      expect(events[0]).toEqual({
        type: DAY_ADVANCED,
        payload: { from: index + 1, to: index + 2 },
      });
    });
  });

  it("lets threat rise and infestation grow when the player does nothing", () => {
    const start = newGame(42);
    const { state } = runDays(42, 50);
    expect(state.overworld.threat).toBeGreaterThan(start.overworld.threat);
    expect(state.overworld.threat).toBeLessThanOrEqual(MAX_THREAT);
    const sum = (s: GameState): number =>
      s.overworld.map.cities.reduce((t, c) => t + c.infestation, 0);
    expect(sum(state)).toBeGreaterThan(sum(start));
  });

  it("pays a stipend every day and stamps ledger entries with the tick's day", () => {
    const start = newGame(42);
    const { state, perDay } = runDays(42, 5);
    const stipends = state.economy.ledger.filter((t) => t.kind === "stipend");
    expect(stipends.map((t) => t.day)).toEqual([2, 3, 4, 5, 6]);
    expect(state.economy.credits).toBeGreaterThan(start.economy.credits);
    expect(new Set(state.economy.ledger.map((t) => t.id)).size).toBe(
      state.economy.ledger.length,
    );
    for (const events of perDay) {
      expect(events.some((e) => e.type === CREDITS_CHANGED)).toBe(true);
    }
  });

  it("writes the advanced rng and id snapshots back through the dispatcher", () => {
    const start = newGame(42);
    const { state } = runDays(42, 3);
    expect(state.meta.ids).not.toEqual(start.meta.ids);
    expect(state.meta.seed).toBe(start.meta.seed);
  });

  it("ends the campaign once and then refuses further days", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    dispatcher.register(
      ADVANCE_DAY,
      createAdvanceDayHandler(createDefaultTickSteps<GameState>(TICK_DEPS), {
        catalogue: CATALOGUE,
      }),
    );
    const base = newGame(5);
    const doomed: GameState = {
      ...base,
      overworld: {
        ...base.overworld,
        map: {
          regions: base.overworld.map.regions,
          cities: base.overworld.map.cities.map((c) => ({
            ...c,
            infestation: 100,
          })),
        },
      },
    };
    const first = dispatcher.process(doomed, advanceDay());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.state.overworld.outcome?.kind).toBe("defeat");
    expect(
      first.value.events.filter((e) => e.type === GAME_ENDED),
    ).toHaveLength(1);
    const second = dispatcher.process(first.value.state, advanceDay());
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe(CAMPAIGN_OVER);
  });
});
