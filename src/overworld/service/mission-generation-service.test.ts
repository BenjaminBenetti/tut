import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ACTS } from "../data/acts";
import { MISSION_TUNING } from "../data/mission-tuning";
import type { ActCatalogue, ActDefinition } from "../model/act-definition";
import type { Mission } from "../model/mission";
import type { MissionOfferDecorator } from "../model/mission-offer-decorator";
import type {
  MissionDebut,
  MissionOfferRule,
  MissionOfferRules,
  MissionSite,
} from "../model/mission-offer-rule";
import { MISSION_OFFERED } from "../model/mission-offered-event";
import type { MissionTuning } from "../model/mission-tuning";
import type { OverworldState } from "../model/overworld-state";
import { getCity } from "./earth-map-query-service";
import type { MissionGenerationDeps } from "./mission-generation-service";
import {
  countsAgainstCap,
  generateMissions,
  hasDebuted,
} from "./mission-generation-service";
import {
  boardMap,
  fixtureState,
  installation,
  missionAt,
  progressIn,
} from "./missions/mission-fixtures.test-helper";
import { buildOffer } from "./missions/mission-offer-builder";
import { MISSION_OFFER_DECORATORS } from "./missions/mission-offer-decorators";
import { MISSION_OFFER_RULES } from "./missions/mission-offer-rules";

// ===========================================
// Fixtures
// ===========================================

/** The shipped director on `seed`, with `overrides`. */
function deps(
  seed: number,
  overrides: Partial<MissionGenerationDeps> = {},
): MissionGenerationDeps {
  return {
    intelBonus: {},
    rng: new Mulberry32Rng(seed),
    ids: new SequentialIdGenerator(),
    tuning: MISSION_TUNING,
    missionTypes: MISSION_TYPES,
    offerRules: MISSION_OFFER_RULES,
    acts: ACTS,
    decorators: [],
    ...overrides,
  };
}

/** Shipped tuning whose defend roll succeeds in every installed region at or above 40. */
const ALWAYS_DEFEND: MissionTuning = {
  ...MISSION_TUNING,
  defence: {
    ...MISSION_TUNING.defence,
    offer: {
      ...MISSION_TUNING.defence.offer,
      chanceAtThreshold: 1,
      chanceAtMax: 1,
    },
  },
};

/** `count` detected cities in one region, all at `infestation`. */
function wideBoard(
  count: number,
  infestation = 50,
  overrides: Partial<OverworldState> = {},
): OverworldState {
  return fixtureState({
    map: boardMap(Array.from({ length: count }, () => infestation)),
    ...overrides,
  });
}

/** Every act of the shipped catalogue with `patch` applied. */
function actsWith(patch: Partial<ActDefinition>): ActCatalogue {
  const acts = {} as Record<ActId, ActDefinition>;
  for (const id of ACT_IDS) {
    acts[id] = { ...ACTS[id], ...patch };
  }
  return acts;
}

/**
 * A test offer rule for `typeId`: every detected city is a site of
 * weight 1 unless `eligible` says otherwise, and the offer is the
 * shared builder's.
 */
function fakeOffer(
  typeId: MissionTypeId,
  debut: MissionDebut = { act: "act-1", missionsInAct: 0 },
  eligible?: (state: OverworldState) => readonly MissionSite[],
): MissionOfferRule {
  return {
    kind: "offer",
    typeId,
    debut,
    eligible: (state) =>
      eligible?.(state) ??
      state.map.cities
        .filter((city) => city.detected)
        .map((city) => ({ cityId: city.id, weight: 1 })),
    create: (state, site, ctx) =>
      buildOffer(state, getCity(state.map, site.cityId), typeId, ctx),
  };
}

/** Both mission types drawn by the board, through `fakeOffer` unless given. */
function bothDrawn(
  defend: MissionOfferRule = fakeOffer("defend-installation"),
): MissionOfferRules {
  return {
    "infestation-clearance": fakeOffer("infestation-clearance"),
    "defend-installation": defend,
  };
}

/** How often each type is offered first, over `runs` seeds, on a one-slot board. */
function firstDraws(
  offerRules: MissionOfferRules,
  typeWeights: ActDefinition["typeWeights"],
  runs: number,
): Record<MissionTypeId, number> {
  const counts: Record<MissionTypeId, number> = {
    "infestation-clearance": 0,
    "defend-installation": 0,
  };
  const acts = actsWith({ boardCap: 1, typeWeights });
  for (let seed = 1; seed <= runs; seed += 1) {
    const [offer] = generateMissions(
      wideBoard(4),
      deps(seed, { offerRules, acts }),
    ).state.missions;
    if (offer !== undefined) {
      counts[offer.typeId] += 1;
    }
  }
  return counts;
}

/** A decorator that appends `|<tag>` to the map seed, recording the first draw of its stream. */
function tagging(
  tag: string,
  draws?: Map<string, number>,
): MissionOfferDecorator {
  return {
    id: tag,
    decorate: (mission, _state, ctx) => {
      draws?.set(mission.id, ctx.rng.next());
      return {
        ...mission,
        mapParams: {
          ...mission.mapParams,
          seed: `${mission.mapParams.seed}|${tag}`,
        },
      };
    },
  };
}

/** The ids of cities holding an offer in `state`. */
function offeredCities(state: OverworldState): string[] {
  return state.missions.map((mission) => mission.cityId);
}

// ===========================================
// Queries
// ===========================================

describe("hasDebuted", () => {
  const debut: MissionDebut = { act: "act-2", missionsInAct: 3 };

  it("waits for the debut act and for enough missions played in it", () => {
    expect(hasDebuted(debut, progressIn("act-1", 9))).toBe(false);
    expect(hasDebuted(debut, progressIn("act-2", 2))).toBe(false);
    expect(hasDebuted(debut, progressIn("act-2", 3))).toBe(true);
  });

  it("counts only the missions played in the current act", () => {
    expect(
      hasDebuted(debut, {
        ...progressIn("act-2", 10),
        actStartedAt: 8,
      }),
    ).toBe(false);
  });

  it("stays debuted in every later act", () => {
    expect(hasDebuted(debut, progressIn("act-3"))).toBe(true);
    expect(hasDebuted(debut, progressIn("finale"))).toBe(true);
  });
});

describe("countsAgainstCap", () => {
  it("counts an unpinned drawn offer and nothing pinned or triggered", () => {
    const clearance = missionAt("mid", 9);
    expect(countsAgainstCap(clearance, MISSION_OFFER_RULES)).toBe(true);
    expect(
      countsAgainstCap({ ...clearance, pinned: true }, MISSION_OFFER_RULES),
    ).toBe(false);
    expect(
      countsAgainstCap(
        missionAt("mid", 9, 10, "defend-installation"),
        MISSION_OFFER_RULES,
      ),
    ).toBe(false);
  });
});

// ===========================================
// The board
// ===========================================

describe("generateMissions — the board", () => {
  it("fills the board to the act's cap: 3, 4, 5 (arc §5)", () => {
    const offered = (act: ActId) =>
      generateMissions(
        wideBoard(8, 50, { progress: progressIn(act) }),
        deps(1),
      );
    for (const [act, cap] of [
      ["act-1", 3],
      ["act-2", 4],
      ["act-3", 5],
    ] as const) {
      const { state, events } = offered(act);
      expect(ACTS[act].boardCap).toBe(cap);
      expect(state.missions).toHaveLength(cap);
      expect(events.map((e) => e.type)).toEqual(
        Array.from({ length: cap }, () => MISSION_OFFERED),
      );
    }
    // The finale draws no type yet: its story missions are pinned.
    expect(offered("finale").state.missions).toEqual([]);
  });

  it("stops short of the cap when no more sites are eligible", () => {
    // Act II needs 20: c0 qualifies, c1 does not, c2 is clean.
    const { state } = generateMissions(
      fixtureState({
        map: boardMap([50, 15, 0]),
        progress: progressIn("act-2"),
      }),
      deps(1),
    );
    expect(offeredCities(state)).toEqual(["c0"]);
  });

  it("counts the offers already on the board", () => {
    const two = wideBoard(8, 50, {
      missions: [missionAt("c0", 20), missionAt("c1", 20)],
    });
    const { state } = generateMissions(two, deps(1));
    expect(state.missions).toHaveLength(3);
    expect(state.missions.slice(0, 2)).toEqual(two.missions);

    const full = wideBoard(8, 50, {
      missions: [missionAt("c0", 20), missionAt("c1", 20), missionAt("c2", 20)],
    });
    const same = generateMissions(full, deps(1));
    expect(same.state).toBe(full);
    expect(same.events).toEqual([]);
  });

  it("does not count pinned offers against the cap (ADR 0013 §2.2)", () => {
    const pinned = (cityId: string): Mission => ({
      ...missionAt(cityId, 20),
      pinned: true,
    });
    const { state } = generateMissions(
      wideBoard(8, 50, {
        missions: [pinned("c0"), pinned("c1"), pinned("c2")],
      }),
      deps(1),
    );
    expect(state.missions).toHaveLength(6);
    expect(state.missions.filter((m) => m.pinned !== true)).toHaveLength(3);
  });

  it("does not count triggered defences against the cap", () => {
    const defences = ["c0", "c1", "c2"].map((cityId) =>
      missionAt(cityId, 20, 15, "defend-installation"),
    );
    const { state } = generateMissions(
      wideBoard(8, 50, { missions: defences }),
      deps(1),
    );
    expect(
      state.missions.filter((m) => m.typeId === "infestation-clearance"),
    ).toHaveLength(3);
  });

  it("never offers at a city that already holds an offer", () => {
    const { state } = generateMissions(
      wideBoard(4, 50, {
        missions: [missionAt("c1", 20, 10, "defend-installation")],
      }),
      deps(1),
    );
    const cities = offeredCities(state);
    expect(cities).toHaveLength(4);
    expect(new Set(cities).size).toBe(4);
  });

  it("weights the site draw by infestation", () => {
    const acts = actsWith({ boardCap: 1 });
    let worse = 0;
    const runs = 1000;
    for (let seed = 1; seed <= runs; seed += 1) {
      const { state } = generateMissions(
        fixtureState({ map: boardMap([20, 80]) }),
        deps(seed, { acts }),
      );
      if (state.missions[0]?.cityId === "c1") worse += 1;
    }
    expect(worse / runs).toBeGreaterThan(0.75);
    expect(worse / runs).toBeLessThan(0.85);
  });

  it("stamps the campaign's act on every offer", () => {
    for (const act of ["act-1", "act-2", "act-3"] as const) {
      const { state } = generateMissions(
        wideBoard(8, 50, { progress: progressIn(act) }),
        deps(3),
      );
      expect(state.missions.length).toBeGreaterThan(0);
      expect(state.missions.every((m) => m.act === act)).toBe(true);
    }
  });
});

// ===========================================
// Type draw
// ===========================================

describe("generateMissions — type draw", () => {
  it("draws types in proportion to the act's weights", () => {
    const counts = firstDraws(
      bothDrawn(),
      { "infestation-clearance": 1, "defend-installation": 3 },
      2000,
    );
    const share = counts["defend-installation"] / 2000;
    expect(share).toBeGreaterThan(0.71);
    expect(share).toBeLessThan(0.79);
  });

  it("renormalises over the types with an eligible site", () => {
    const nowhere = fakeOffer(
      "defend-installation",
      { act: "act-1", missionsInAct: 0 },
      () => [],
    );
    expect(
      firstDraws(
        bothDrawn(nowhere),
        { "infestation-clearance": 1, "defend-installation": 3 },
        200,
      ),
    ).toEqual({ "infestation-clearance": 200, "defend-installation": 0 });
  });

  it("renormalises over the types that have debuted (arc §3)", () => {
    const later = fakeOffer("defend-installation", {
      act: "act-2",
      missionsInAct: 0,
    });
    expect(
      firstDraws(
        bothDrawn(later),
        { "infestation-clearance": 1, "defend-installation": 3 },
        200,
      ),
    ).toEqual({ "infestation-clearance": 200, "defend-installation": 0 });
  });

  it("never draws a type without a weight in the act", () => {
    expect(
      firstDraws(bothDrawn(), { "infestation-clearance": 1 }, 200),
    ).toEqual({ "infestation-clearance": 200, "defend-installation": 0 });
  });

  it("gates a type on its debut: the act, then missions played in it", () => {
    const offerRules = bothDrawn(
      fakeOffer("defend-installation", { act: "act-1", missionsInAct: 2 }),
    );
    const acts = actsWith({ typeWeights: { "defend-installation": 1 } });
    const offered = (act: ActId, played: number) =>
      generateMissions(
        wideBoard(8, 50, { progress: progressIn(act, played) }),
        deps(1, { offerRules, acts }),
      ).state.missions.map((m) => m.typeId);
    expect(offered("act-1", 1)).toEqual([]);
    expect(offered("act-1", 2)).toEqual(
      Array.from({ length: 3 }, () => "defend-installation"),
    );
    expect(offered("act-2", 0)).toHaveLength(4);
  });
});

// ===========================================
// Difficulty band
// ===========================================

describe("generateMissions — difficulty band", () => {
  it("clamps every offer into the act's band (arc §3)", () => {
    const hot = generateMissions(
      wideBoard(8, 100, {
        threat: 100,
        deployables: [installation("d", "north")],
      }),
      deps(1, { tuning: ALWAYS_DEFEND }),
    ).state.missions;
    expect(hot.map((m) => m.typeId)).toContain("defend-installation");
    expect(hot.every((m) => m.difficulty === 4)).toBe(true);

    const calm = generateMissions(
      wideBoard(8, 20, { threat: 0, progress: progressIn("act-3") }),
      deps(1),
    ).state.missions;
    expect(calm).toHaveLength(5);
    expect(calm.every((m) => m.difficulty === 5)).toBe(true);
  });
});

// ===========================================
// Triggers
// ===========================================

describe("generateMissions — Defend Installation", () => {
  it("keeps its trigger: offered on top of a full board, on the region's worst city", () => {
    const { state } = generateMissions(
      fixtureState({ deployables: [installation("dep-1", "east")] }),
      deps(1, { tuning: ALWAYS_DEFEND }),
    );
    const defend = state.missions.filter(
      (m) => m.typeId === "defend-installation",
    );
    expect(defend.map((m) => m.cityId)).toEqual(["full"]);
    expect(defend[0]).not.toHaveProperty("pinned");
    // Act I cap of 3: the defence takes no slot, so every other eligible
    // city (low at 10, mid at 50) still gets a clearance.
    expect(
      state.missions
        .filter((m) => m.typeId === "infestation-clearance")
        .map((m) => m.cityId)
        .sort(),
    ).toEqual(["low", "mid"]);
  });

  it("offers nothing below the regional threshold or without an installation", () => {
    const below = generateMissions(
      fixtureState({ deployables: [installation("dep-1", "west")] }),
      deps(1, { tuning: ALWAYS_DEFEND }),
    );
    const none = generateMissions(
      fixtureState(),
      deps(1, { tuning: ALWAYS_DEFEND }),
    );
    for (const { state } of [below, none]) {
      expect(state.missions.map((m) => m.typeId)).not.toContain(
        "defend-installation",
      );
    }
  });

  it("draws the same board when the trigger offers nothing", () => {
    const board = (tuning: MissionTuning) =>
      generateMissions(
        fixtureState({ deployables: [installation("dep-1", "west")] }),
        deps(3, { tuning }),
      );
    expect(board(ALWAYS_DEFEND)).toEqual(board(MISSION_TUNING));
  });
});

// ===========================================
// Decorators
// ===========================================

describe("generateMissions — decorators", () => {
  const state = fixtureState({ deployables: [installation("dep-1", "east")] });

  it("applies every decorator to every new offer, in list order", () => {
    const { state: next, events } = generateMissions(
      state,
      deps(2, {
        tuning: ALWAYS_DEFEND,
        decorators: [tagging("a"), tagging("b")],
      }),
    );
    expect(next.missions.map((m) => m.typeId)).toContain("defend-installation");
    for (const mission of next.missions) {
      expect(mission.mapParams.seed).toMatch(/^\d+\|a\|b$/);
    }
    expect(
      events.map((e) => (e.payload as { mission: Mission }).mission),
    ).toEqual(next.missions);

    const swapped = generateMissions(
      state,
      deps(2, {
        tuning: ALWAYS_DEFEND,
        decorators: [tagging("b"), tagging("a")],
      }),
    ).state.missions;
    for (const mission of swapped) {
      expect(mission.mapParams.seed).toMatch(/^\d+\|b\|a$/);
    }
  });

  it("leaves existing offers alone", () => {
    const existing = missionAt("low", 20);
    const { state: next } = generateMissions(
      { ...state, missions: [existing] },
      deps(2, { decorators: [tagging("a")] }),
    );
    expect(next.missions[0]).toBe(existing);
  });

  it("gives each decorator its own stream, so decorators never shift the board or each other", () => {
    const bare = generateMissions(state, deps(2, { tuning: ALWAYS_DEFEND }));
    const alone = new Map<string, number>();
    const first = new Map<string, number>();
    const decorated = generateMissions(
      state,
      deps(2, {
        tuning: ALWAYS_DEFEND,
        decorators: [tagging("x", first), tagging("a", alone)],
      }),
    );
    const again = new Map<string, number>();
    generateMissions(
      state,
      deps(2, { tuning: ALWAYS_DEFEND, decorators: [tagging("a", again)] }),
    );

    // Stripping the tags gives back the undecorated board, draw for draw.
    const untagged = decorated.state.missions.map((m) => ({
      ...m,
      mapParams: { ...m.mapParams, seed: m.mapParams.seed.split("|")[0] },
    }));
    expect(untagged).toEqual(bare.state.missions);
    // "a" draws the same whether or not "x" runs before it; "x" draws differently.
    expect([...alone.entries()]).toEqual([...again.entries()]);
    expect([...first.values()]).not.toEqual([...alone.values()]);
  });

  it("ships with no decorators", () => {
    expect(MISSION_OFFER_DECORATORS).toEqual([]);
  });
});

// ===========================================
// Contract
// ===========================================

describe("generateMissions — contract", () => {
  it("is deterministic: the same state, seed and deps offer the same board", () => {
    const state = fixtureState({
      map: boardMap([10, 25, 40, 60, 80, 95]),
      deployables: [installation("dep-1", "north")],
    });
    const a = generateMissions(state, deps(7, { tuning: ALWAYS_DEFEND }));
    const b = generateMissions(state, deps(7, { tuning: ALWAYS_DEFEND }));
    expect(a).toEqual(b);
    const c = generateMissions(state, deps(8, { tuning: ALWAYS_DEFEND }));
    expect(
      c.state.missions.map((m) => [m.cityId, m.mapParams.seed]),
    ).not.toEqual(a.state.missions.map((m) => [m.cityId, m.mapParams.seed]));
  });

  it("returns the same state when nothing can be offered", () => {
    const state = fixtureState({ map: boardMap([0, 0]) });
    const result = generateMissions(state, deps(1));
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const state = fixtureState({
      deployables: [installation("dep-1", "east")],
    });
    const snapshot = JSON.parse(JSON.stringify(state)) as OverworldState;
    generateMissions(state, deps(5, { tuning: ALWAYS_DEFEND }));
    expect(state).toEqual(snapshot);
  });

  it("rejects intel entries for unknown regions or with bad values", () => {
    const state = fixtureState();
    expect(() =>
      generateMissions(state, deps(1, { intelBonus: { nowhere: 1 } })),
    ).toThrow(/unknown region "nowhere"/);
    expect(() =>
      generateMissions(state, deps(1, { intelBonus: { east: -1 } })),
    ).toThrow(/non-negative integer/);
    expect(() =>
      generateMissions(state, deps(1, { intelBonus: { east: 1.5 } })),
    ).toThrow(/non-negative integer/);
  });
});
