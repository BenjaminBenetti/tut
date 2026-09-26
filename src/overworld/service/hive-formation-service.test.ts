import { describe, expect, it } from "vitest";

import type { ActId } from "../../content/model/act-id";
import type { Rng } from "../../core/model/rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { HIVE_TUNING } from "../data/hive-tuning";
import type { CampaignState } from "../model/campaign-state";
import { NO_DEPLOYABLE_MODIFIERS } from "../model/deployable-modifiers";
import type { EarthMap } from "../model/earth-map";
import { HIVE_FORMED } from "../model/hive-formed-event";
import type { OverworldState } from "../model/overworld-state";
import type { TickContext } from "../model/tick-step";
import { createInitialCampaignProgress } from "./campaign-progress-factory";
import { buildEarthMap } from "./earth-map-builder";
import {
  createHiveFormationStep,
  HIVE_FORMATION_STEP_NAME,
  hivesFormIn,
  watchHives,
} from "./hive-formation-service";

// ===========================================
// Fixtures
// ===========================================

/** Two regions in map order: north (n1, n2) and south (s1). */
function earth(): EarthMap {
  return buildEarthMap({
    regions: [
      {
        id: "north",
        name: "North",
        biome: "temperate",
        cities: [
          { id: "n1", name: "N1", layout: { x: 0.1, y: 0.1 } },
          { id: "n2", name: "N2", layout: { x: 0.2, y: 0.1 } },
        ],
      },
      {
        id: "south",
        name: "South",
        biome: "desert",
        cities: [{ id: "s1", name: "S1", layout: { x: 0.5, y: 0.8 } }],
      },
    ],
    links: [
      ["n1", "n2"],
      ["n2", "s1"],
    ],
  });
}

/** An overworld in `act` with the given city levels. */
function overworld(
  act: ActId,
  levels: Readonly<Record<string, number>>,
): OverworldState {
  const map = earth();
  return {
    day: 1,
    map: {
      ...map,
      cities: map.cities.map((c) => ({
        ...c,
        infestation: levels[c.id] ?? 0,
        detected: (levels[c.id] ?? 0) > 0,
      })),
    },
    threat: 30,
    threatOffset: 0,
    spreadCooldowns: {},
    missions: [],
    pendingEvents: [],
    deployables: [],
    hives: [],
    progress: { ...createInitialCampaignProgress(), act },
  };
}

/** `state` with its cities set to `levels`. */
function at(
  state: OverworldState,
  levels: Readonly<Record<string, number>>,
): OverworldState {
  return {
    ...state,
    map: {
      ...state.map,
      cities: state.map.cities.map((c) => ({
        ...c,
        infestation: levels[c.id] ?? c.infestation,
      })),
    },
  };
}

/** North's mean is exactly the threshold: 70 and 50. */
const NORTH_AT_60 = { n1: 70, n2: 50 };
/** North's mean one point under the threshold. */
const NORTH_AT_59 = { n1: 70, n2: 48 };

/**
 * Runs `watchHives` for `days` days from `first`, feeding each day's
 * state into the next, and returns every day's result.
 */
function watch(
  start: OverworldState,
  days: number,
  first = 1,
  ids = new SequentialIdGenerator(),
) {
  const results: ReturnType<typeof watchHives>[] = [];
  let state = start;
  for (let day = first; day < first + days; day++) {
    const result = watchHives(state, day, ids, HIVE_TUNING);
    results.push(result);
    state = result.state;
  }
  return { state, results };
}

/** An Rng that fails the test if the step draws anything. */
const NO_DRAWS = new Proxy({} as Rng, {
  get: (_target, name) => () => {
    throw new Error(`hive formation drew from the RNG (${String(name)})`);
  },
});

// ===========================================
// Act gate
// ===========================================

describe("hivesFormIn", () => {
  it("is off before formsFromAct and on from it, by act order", () => {
    expect(hivesFormIn("act-1", HIVE_TUNING)).toBe(false);
    expect(hivesFormIn("act-2", HIVE_TUNING)).toBe(true);
    expect(hivesFormIn("act-3", HIVE_TUNING)).toBe(true);
    expect(hivesFormIn("finale", HIVE_TUNING)).toBe(true);
    expect(hivesFormIn("act-2", { formsFromAct: "act-3" })).toBe(false);
  });
});

// ===========================================
// Formation
// ===========================================

describe("watchHives", () => {
  it("forms a hive after exactly seven days at a mean of 60", () => {
    const { state, results } = watch(overworld("act-2", NORTH_AT_60), 7);
    results.slice(0, 6).forEach((result, index) => {
      expect(result.state.hives).toEqual([]);
      expect(result.state.hiveWatch).toEqual({ north: index + 1 });
      expect(result.events).toEqual([]);
    });
    const hive = { id: "hive-1", regionId: "north", formedDay: 7 };
    expect(state.hives).toEqual([hive]);
    expect(results[6]?.events).toEqual([
      { type: HIVE_FORMED, payload: { hive } },
    ]);
    expect("hiveWatch" in state).toBe(false);
  });

  it("resets the count on a day below the threshold", () => {
    const start = overworld("act-2", NORTH_AT_60);
    const five = watch(start, 5).state;
    expect(five.hiveWatch).toEqual({ north: 5 });

    const dipped = watchHives(
      at(five, NORTH_AT_59),
      6,
      new SequentialIdGenerator(),
      HIVE_TUNING,
    );
    expect(dipped.state.hiveWatch).toBeUndefined();
    expect(dipped.state.hives).toEqual([]);

    const back = watch(at(dipped.state, NORTH_AT_60), 7, 7);
    expect(
      back.results.slice(0, 6).every((r) => r.state.hives.length === 0),
    ).toBe(true);
    expect(back.state.hives.map((h) => [h.regionId, h.formedDay])).toEqual([
      ["north", 13],
    ]);
  });

  it("forms nothing and counts nothing in act-1", () => {
    const start = overworld("act-1", { n1: 100, n2: 100, s1: 100 });
    const { state, results } = watch(start, 30);
    expect(state).toBe(start);
    expect(results.every((r) => r.events.length === 0)).toBe(true);
    expect("hiveWatch" in state).toBe(false);
  });

  it("keeps at most one hive per region however long the region stays hot", () => {
    const { state } = watch(overworld("act-3", NORTH_AT_60), 40);
    expect(state.hives.map((h) => h.regionId)).toEqual(["north"]);
    expect("hiveWatch" in state).toBe(false);
  });

  it("forms same-day hives in map order", () => {
    const { state } = watch(overworld("act-2", { n1: 60, n2: 60, s1: 80 }), 7);
    expect(state.hives).toEqual([
      { id: "hive-1", regionId: "north", formedDay: 7 },
      { id: "hive-2", regionId: "south", formedDay: 7 },
    ]);
  });

  it("does not watch a region while its growth is paused", () => {
    const paused: OverworldState = {
      ...overworld("act-2", NORTH_AT_60),
      growthPausedUntil: { north: 11 },
    };
    const during = watch(paused, 10);
    expect(during.results.every((r) => r.state === paused)).toBe(true);
    const after = watch(during.state, 7, 11);
    expect(after.state.hives.map((h) => [h.regionId, h.formedDay])).toEqual([
      ["north", 17],
    ]);
  });

  it("returns the input itself on a day that changes nothing", () => {
    const cool = overworld("act-2", { n1: 10 });
    expect(
      watchHives(cool, 3, new SequentialIdGenerator(), HIVE_TUNING).state,
    ).toBe(cool);
  });
});

// ===========================================
// Tick step
// ===========================================

describe("createHiveFormationStep", () => {
  /** A campaign around `overworld`; only the overworld is read. */
  function campaign(ow: OverworldState): CampaignState {
    return {
      meta: {
        rng: { algorithm: "mulberry32", seed: 1, state: 1 },
        ids: { counters: {} },
      },
      overworld: ow,
      roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
      economy: { credits: 0, ledger: [], techPoints: 0 },
      tech: { unlocked: [] },
    };
  }

  /** The context of tick `day`, with an RNG that refuses every draw. */
  function ctx(day: number, ids = new SequentialIdGenerator()): TickContext {
    return { day, rng: NO_DRAWS, ids, modifiers: NO_DEPLOYABLE_MODIFIERS };
  }

  it("is named hive-formation and forms on the seventh tick without drawing randomness", () => {
    const step = createHiveFormationStep<CampaignState>({
      hiveTuning: HIVE_TUNING,
    });
    expect(step.name).toBe(HIVE_FORMATION_STEP_NAME);
    expect(step.name).toBe("hive-formation");
    const ids = new SequentialIdGenerator();
    let state = campaign(overworld("act-2", NORTH_AT_60));
    const events: string[] = [];
    for (let day = 2; day <= 8; day++) {
      const applied = step.run(state, ctx(day, ids));
      state = applied.state;
      events.push(...applied.events.map((e) => e.type));
    }
    expect(state.overworld.hives).toEqual([
      { id: "hive-1", regionId: "north", formedDay: 8 },
    ]);
    expect(events).toEqual([HIVE_FORMED]);
  });

  it("returns the campaign itself when nothing changes", () => {
    const step = createHiveFormationStep<CampaignState>({
      hiveTuning: HIVE_TUNING,
    });
    const state = campaign(overworld("act-1", NORTH_AT_60));
    const applied = step.run(state, ctx(2));
    expect(applied.state).toBe(state);
    expect(applied.events).toEqual([]);
  });
});
