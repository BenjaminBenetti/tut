import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { MISSION_DIFFICULTY_RANGE } from "../../content/model/mission-type";
import { MISSION_TUNING } from "../data/mission-tuning";
import { MAX_INFESTATION } from "../model/city";
import type { EarthMap } from "../model/earth-map";
import type { Mission } from "../model/mission";
import type {
  MissionTuning,
  MissionTypeGenerationRule,
} from "../model/mission-tuning";
import {
  CITY_INFESTATION_CHANGED,
  MISSION_EXPIRED,
  MISSION_OFFERED,
} from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import { buildEarthMap } from "./earth-map-builder";
import type { MissionGenerationDeps } from "./mission-generation-service";
import {
  difficultyFor,
  expireMissions,
  generateMissions,
  mapSizeFor,
  offerChance,
} from "./mission-generation-service";

// ===========================================
// Fixtures
// ===========================================

const RULE: MissionTypeGenerationRule =
  MISSION_TUNING.rules["infestation-clearance"];
const CLEARANCE = MISSION_TYPES["infestation-clearance"];

/** A rule that offers to every eligible city, every day. */
const ALWAYS: MissionTuning = {
  rules: {
    "infestation-clearance": { ...RULE, chanceAtThreshold: 1, chanceAtMax: 1 },
  },
};

/** A rule that never offers. */
const NEVER: MissionTuning = {
  rules: {
    "infestation-clearance": { ...RULE, chanceAtThreshold: 0, chanceAtMax: 0 },
  },
};

/**
 * Two regions, four cities:
 *
 *   west (temperate): clean=0 (city)   low=10 (town)
 *   east (desert):    mid=50 (city)    full=100 (town)
 */
function fixtureMap(): EarthMap {
  return buildEarthMap({
    regions: [
      {
        id: "west",
        name: "West",
        biome: "temperate",
        cities: [
          { id: "clean", name: "Clean", layout: { x: 0.1, y: 0.1 } },
          {
            id: "low",
            name: "Low",
            layout: { x: 0.2, y: 0.1 },
            infestation: 10,
            scale: "town",
          },
        ],
      },
      {
        id: "east",
        name: "East",
        biome: "desert",
        cities: [
          {
            id: "mid",
            name: "Mid",
            layout: { x: 0.8, y: 0.1 },
            infestation: 50,
          },
          {
            id: "full",
            name: "Full",
            layout: { x: 0.9, y: 0.1 },
            infestation: 100,
            scale: "town",
          },
        ],
      },
    ],
    links: [
      ["clean", "low"],
      ["low", "mid"],
      ["mid", "full"],
    ],
  });
}

function fixtureState(overrides: Partial<OverworldState> = {}): OverworldState {
  return {
    day: 5,
    map: fixtureMap(),
    threat: 40,
    spreadCooldowns: {},
    missions: [],
    pendingEvents: [],
    deployables: [],
    hives: [],
    ...overrides,
  };
}

function deps(
  seed: number,
  tuning: MissionTuning = MISSION_TUNING,
  intelBonus: Record<string, number> = {},
): MissionGenerationDeps {
  return {
    intelBonus,
    rng: new Mulberry32Rng(seed),
    ids: new SequentialIdGenerator(),
    tuning,
    missionTypes: MISSION_TYPES,
  };
}

function missionAt(cityId: string, expiresDay: number, penalty = 10): Mission {
  return {
    id: `mission-${cityId}`,
    typeId: "infestation-clearance",
    cityId,
    difficulty: 3,
    mapParams: {
      biome: "temperate",
      settlement: "city",
      size: "small",
      seed: "1",
    },
    rewards: { credits: 900 },
    createdDay: expiresDay - 5,
    expiresDay,
    ignorePenalty: penalty,
  };
}

// ===========================================
// Formulae
// ===========================================

describe("offerChance", () => {
  it("is zero below the threshold and linear up to the maximum", () => {
    expect(offerChance(RULE.minInfestation - 1, RULE)).toBe(0);
    expect(offerChance(RULE.minInfestation, RULE)).toBeCloseTo(
      RULE.chanceAtThreshold,
    );
    expect(offerChance(MAX_INFESTATION, RULE)).toBeCloseTo(RULE.chanceAtMax);
    const mid = (RULE.minInfestation + MAX_INFESTATION) / 2;
    expect(offerChance(mid, RULE)).toBeCloseTo(
      (RULE.chanceAtThreshold + RULE.chanceAtMax) / 2,
    );
  });

  it("treats a threshold at maximum infestation as an all-or-nothing gate", () => {
    const gate = { ...RULE, minInfestation: MAX_INFESTATION };
    expect(offerChance(99, gate)).toBe(0);
    expect(offerChance(100, gate)).toBeCloseTo(RULE.chanceAtMax);
  });
});

describe("difficultyFor", () => {
  it("stays inside the type's band and the global range", () => {
    for (const infestation of [0, 20, 50, 100]) {
      for (const threat of [0, 50, 100]) {
        const d = difficultyFor(infestation, threat, CLEARANCE, RULE);
        expect(Number.isInteger(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(CLEARANCE.difficultyBand.min);
        expect(d).toBeLessThanOrEqual(CLEARANCE.difficultyBand.max);
        expect(d).toBeGreaterThanOrEqual(MISSION_DIFFICULTY_RANGE.min);
        expect(d).toBeLessThanOrEqual(MISSION_DIFFICULTY_RANGE.max);
      }
    }
  });

  it("rises with infestation and with threat, from the band's floor to its ceiling", () => {
    expect(difficultyFor(0, 0, CLEARANCE, RULE)).toBe(
      CLEARANCE.difficultyBand.min,
    );
    expect(difficultyFor(100, 100, CLEARANCE, RULE)).toBe(
      CLEARANCE.difficultyBand.max,
    );
    expect(difficultyFor(80, 20, CLEARANCE, RULE)).toBeGreaterThan(
      difficultyFor(20, 20, CLEARANCE, RULE),
    );
    expect(difficultyFor(50, 90, CLEARANCE, RULE)).toBeGreaterThanOrEqual(
      difficultyFor(50, 10, CLEARANCE, RULE),
    );
  });

  it("clamps into a narrow band", () => {
    const narrow = { ...CLEARANCE, difficultyBand: { min: 4, max: 6 } };
    expect(difficultyFor(0, 0, narrow, RULE)).toBe(4);
    expect(difficultyFor(100, 100, narrow, RULE)).toBe(6);
  });
});

describe("mapSizeFor", () => {
  it("steps through small, medium and large at the rule's thresholds", () => {
    expect(mapSizeFor(RULE.mediumFromDifficulty - 1, RULE)).toBe("small");
    expect(mapSizeFor(RULE.mediumFromDifficulty, RULE)).toBe("medium");
    expect(mapSizeFor(RULE.largeFromDifficulty - 1, RULE)).toBe("medium");
    expect(mapSizeFor(RULE.largeFromDifficulty, RULE)).toBe("large");
  });
});

// ===========================================
// Expiry
// ===========================================

describe("expireMissions", () => {
  it("returns the same state when nothing has expired", () => {
    const state = fixtureState({ missions: [missionAt("mid", 6)] });
    const result = expireMissions(state);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it("removes missions whose expiry day has arrived and penalises their cities", () => {
    const state = fixtureState({
      day: 5,
      missions: [missionAt("mid", 5, 10), missionAt("low", 8)],
    });
    const result = expireMissions(state);
    expect(result.state.missions.map((m) => m.cityId)).toEqual(["low"]);
    const mid = result.state.map.cities.find((c) => c.id === "mid");
    expect(mid?.infestation).toBe(60);
    expect(result.events).toEqual([
      {
        type: MISSION_EXPIRED,
        payload: {
          missionId: "mission-mid",
          typeId: "infestation-clearance",
          cityId: "mid",
          ignorePenalty: 10,
        },
      },
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "mid", from: 50, to: 60 },
      },
    ]);
    expect(state.missions).toHaveLength(2);
    expect(state.map.cities.find((c) => c.id === "mid")?.infestation).toBe(50);
  });

  it("clamps the penalty at maximum infestation and emits no change event then", () => {
    const state = fixtureState({
      day: 9,
      missions: [missionAt("full", 9, 25)],
    });
    const result = expireMissions(state);
    const full = result.state.map.cities.find((c) => c.id === "full");
    expect(full?.infestation).toBe(MAX_INFESTATION);
    expect(result.events.map((e) => e.type)).toEqual([MISSION_EXPIRED]);
  });

  it("keeps a mission that expires tomorrow", () => {
    const state = fixtureState({ day: 4, missions: [missionAt("mid", 5)] });
    expect(expireMissions(state).state.missions).toHaveLength(1);
  });
});

// ===========================================
// Generation
// ===========================================

describe("generateMissions", () => {
  it("is deterministic for the same state, seed and deps", () => {
    const state = fixtureState();
    const a = generateMissions(state, deps(7, ALWAYS));
    const b = generateMissions(state, deps(7, ALWAYS));
    expect(a).toEqual(b);
    const c = generateMissions(state, deps(8, ALWAYS));
    expect(c.state.missions.map((m) => m.mapParams.seed)).not.toEqual(
      a.state.missions.map((m) => m.mapParams.seed),
    );
  });

  it("offers to every city above the threshold and none below it", () => {
    const result = generateMissions(fixtureState(), deps(1, ALWAYS));
    expect(result.state.missions.map((m) => m.cityId)).toEqual(["mid", "full"]);
    expect(result.events.map((e) => e.type)).toEqual([
      MISSION_OFFERED,
      MISSION_OFFERED,
    ]);
  });

  it("returns the same state when the chance is zero", () => {
    const state = fixtureState();
    const result = generateMissions(state, deps(1, NEVER));
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it("never offers a second mission to a city that already has one", () => {
    const state = fixtureState({ missions: [missionAt("mid", 20)] });
    const result = generateMissions(state, deps(1, ALWAYS));
    expect(result.state.missions.map((m) => m.cityId)).toEqual(["mid", "full"]);
    expect(result.state.missions[0]).toBe(state.missions[0]);
  });

  it("fills each mission from its type, city and region", () => {
    const state = fixtureState({ day: 12, threat: 40 });
    const result = generateMissions(state, deps(3, ALWAYS, { east: 2 }));
    const [mid, full] = result.state.missions;
    if (!mid || !full) {
      throw new Error("expected two missions");
    }

    expect(mid.id).toBe("mission-1");
    expect(full.id).toBe("mission-2");
    expect(mid.typeId).toBe("infestation-clearance");
    expect(mid.cityId).toBe("mid");
    expect(mid.difficulty).toBe(difficultyFor(50, 40, CLEARANCE, RULE));
    expect(mid.rewards.credits).toBe(
      mid.difficulty * CLEARANCE.rewardPerDifficulty,
    );
    expect(mid.createdDay).toBe(12);
    expect(mid.expiresDay).toBe(12 + CLEARANCE.expiryDays + 2);
    expect(mid.ignorePenalty).toBe(CLEARANCE.ignorePenalty);
    expect(mid.mapParams).toEqual({
      biome: "desert",
      settlement: "city",
      size: mapSizeFor(mid.difficulty, RULE),
      seed: mid.mapParams.seed,
    });
    expect(mid.mapParams.seed).toMatch(/^\d+$/);
    expect(full.mapParams.settlement).toBe("town");
    expect(full.difficulty).toBeGreaterThanOrEqual(mid.difficulty);
    expect(result.events[0]).toEqual({
      type: MISSION_OFFERED,
      payload: { mission: mid },
    });
  });

  it("applies no intel bonus to regions without an entry", () => {
    const state = fixtureState({ day: 1 });
    const result = generateMissions(state, deps(3, ALWAYS, { west: 4 }));
    for (const mission of result.state.missions) {
      expect(mission.expiresDay).toBe(1 + CLEARANCE.expiryDays);
    }
  });

  it("offers roughly in proportion to the tuned chance over many days", () => {
    const state = fixtureState({ threat: 0 });
    let offers = 0;
    const days = 400;
    for (let seed = 0; seed < days; seed++) {
      const result = generateMissions(state, deps(seed));
      offers += result.state.missions.filter((m) => m.cityId === "full").length;
    }
    const rate = offers / days;
    expect(rate).toBeGreaterThan(RULE.chanceAtMax - 0.1);
    expect(rate).toBeLessThan(RULE.chanceAtMax + 0.1);
  });

  it("does not mutate the input state", () => {
    const state = fixtureState();
    const snapshot = JSON.parse(JSON.stringify(state)) as OverworldState;
    generateMissions(state, deps(5, ALWAYS));
    expect(state).toEqual(snapshot);
  });

  it("rejects intel entries for unknown regions or with bad values", () => {
    const state = fixtureState();
    expect(() =>
      generateMissions(state, deps(1, ALWAYS, { nowhere: 1 })),
    ).toThrow(/unknown region "nowhere"/);
    expect(() =>
      generateMissions(state, deps(1, ALWAYS, { east: -1 })),
    ).toThrow(/non-negative integer/);
    expect(() =>
      generateMissions(state, deps(1, ALWAYS, { east: 1.5 })),
    ).toThrow(/non-negative integer/);
  });
});
