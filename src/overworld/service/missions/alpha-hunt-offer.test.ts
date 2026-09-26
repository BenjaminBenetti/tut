import { describe, expect, it } from "vitest";

import { ACTS } from "../../data/acts";
import { NEMESIS_LORE } from "../../data/nemesis-lore";
import type { Hive } from "../../model/hive";
import type { Mission } from "../../model/mission";
import type { Nemesis } from "../../model/nemesis";
import type { OverworldState } from "../../model/overworld-state";
import { getCity } from "../earth-map-query-service";
import { hasDebuted } from "../mission-generation-service";
import { ALPHA_HUNT_DEBUT, createAlphaHuntOffer } from "./alpha-hunt-offer";
import { BROODMOTHER_SIGHTED_FLAG } from "./alpha-hunt-quarry";
import {
  fixtureState,
  missionAt,
  offerContext,
  progressIn,
} from "./mission-fixtures.test-helper";
import { buildOffer } from "./mission-offer-builder";
import { MISSION_OFFER_RULES } from "./mission-offer-rules";

// ===========================================
// Fixtures
// ===========================================

const RULE = createAlphaHuntOffer(NEMESIS_LORE);

/** A hive rooted in `regionId`. */
function hive(regionId: string): Hive {
  return { id: `hive-${regionId}`, regionId, formedDay: 1 };
}

/** A Broodmother nemesis living in `regionId`. */
function nemesis(overrides: Partial<Nemesis> = {}): Nemesis {
  return {
    id: "nemesis:mission-9:broodmother",
    speciesId: "broodmother",
    name: "Old Scald",
    scar: "burned along the flank",
    regionId: "east",
    level: 1,
    escapes: 1,
    ...overrides,
  };
}

/**
 * The fixture overworld twelve missions into Act II with the sighting
 * played, hives in both regions, and `overrides`. Detected cities: low
 * (west, 10), mid and full (east, 50 and 100).
 */
function hunting(overrides: Partial<OverworldState> = {}): OverworldState {
  const base = fixtureState();
  return fixtureState({
    hives: [hive("west"), hive("east")],
    progress: {
      ...progressIn("act-2", 12),
      flags: [BROODMOTHER_SIGHTED_FLAG],
      nemeses: [],
    },
    map: base.map,
    ...overrides,
  });
}

/** The site city ids the rule offers on `state`. */
function sites(state: OverworldState): readonly string[] {
  return RULE.kind === "offer"
    ? RULE.eligible(state, offerContext(1)).map((site) => site.cityId)
    : [];
}

/** The rule's offer at `cityId` on `state`, on seed `seed`. */
function offerAt(state: OverworldState, cityId: string, seed = 1): Mission {
  if (RULE.kind !== "offer") {
    throw new Error("Alpha Hunt is a board offer");
  }
  return RULE.create(state, { cityId, weight: 1 }, offerContext(seed));
}

// ===========================================
// Debut and registration
// ===========================================

describe("ALPHA_HUNT offer rule", () => {
  it("is the shipped board rule, debuting ten missions into Act II (arc §3)", () => {
    expect(MISSION_OFFER_RULES["alpha-hunt"]).toMatchObject({
      kind: "offer",
      typeId: "alpha-hunt",
      debut: { act: "act-2", missionsInAct: 10 },
    });
    expect(ALPHA_HUNT_DEBUT).toEqual({ act: "act-2", missionsInAct: 10 });
    expect(hasDebuted(ALPHA_HUNT_DEBUT, progressIn("act-1", 40))).toBe(false);
    expect(hasDebuted(ALPHA_HUNT_DEBUT, progressIn("act-2", 9))).toBe(false);
    expect(hasDebuted(ALPHA_HUNT_DEBUT, progressIn("act-2", 10))).toBe(true);
    expect(hasDebuted(ALPHA_HUNT_DEBUT, progressIn("act-3", 0))).toBe(true);
    expect(ACTS["act-1"].typeWeights["alpha-hunt"]).toBeUndefined();
    expect(ACTS["act-2"].typeWeights["alpha-hunt"]).toBe(15);
    expect(ACTS["act-3"].typeWeights["alpha-hunt"]).toBe(20);
    expect(ACTS.finale.typeWeights["alpha-hunt"]).toBeUndefined();
  });
});

// ===========================================
// Eligibility
// ===========================================

describe("ALPHA_HUNT eligibility", () => {
  it("offers only detected, free cities in regions holding a hive", () => {
    expect(sites(hunting())).toEqual(["low", "mid", "full"]);
    expect(sites(hunting({ hives: [hive("east")] }))).toEqual(["mid", "full"]);
    expect(sites(hunting({ hives: [] }))).toEqual([]);
    expect(
      sites(
        hunting({ hives: [hive("east")], missions: [missionAt("full", 9)] }),
      ),
    ).toEqual(["mid"]);
  });

  it("waits for the sighting in Act II, and not past it", () => {
    const unsighted = hunting({
      progress: { ...progressIn("act-2", 30), nemeses: [] },
    });
    expect(sites(unsighted)).toEqual([]);
    const later = hunting({
      progress: { ...progressIn("act-3", 0), nemeses: [] },
    });
    expect(sites(later)).toEqual(["low", "mid", "full"]);
  });

  it("offers only a living nemesis's region while it has a free hunting ground", () => {
    const withNemesis = (regionId: string, hives: readonly Hive[]) =>
      hunting({
        hives,
        progress: {
          ...hunting().progress,
          nemeses: [nemesis({ regionId })],
        },
      });
    expect(sites(withNemesis("east", [hive("west"), hive("east")]))).toEqual([
      "mid",
      "full",
    ]);
    expect(sites(withNemesis("west", [hive("west"), hive("east")]))).toEqual([
      "low",
    ]);
    // Her region holds no hive: any hunting ground, and she is hunted there.
    expect(sites(withNemesis("west", [hive("east")]))).toEqual(["mid", "full"]);
    // An alpha nemesis is no Broodmother: no preference.
    const alpha = hunting({
      progress: {
        ...hunting().progress,
        nemeses: [nemesis({ speciesId: "brute", regionId: "west" })],
      },
    });
    expect(sites(alpha)).toEqual(["low", "mid", "full"]);
  });

  it("does not prefer a nemesis another hunt on the board is already after", () => {
    const hunted: Mission = {
      ...missionAt("full", 9, 15, "alpha-hunt"),
      alphaHunt: { nemesisId: nemesis().id, name: "Old Scald", scars: 1 },
    };
    const state = hunting({
      missions: [hunted],
      progress: { ...hunting().progress, nemeses: [nemesis()] },
    });
    expect(sites(state)).toEqual(["low", "mid"]);
    expect(offerAt(state, "mid").alphaHunt?.nemesisId).toBeUndefined();
  });
});

// ===========================================
// The offer
// ===========================================

describe("ALPHA_HUNT offer", () => {
  it("hunts a fresh Broodmother by default: the ordinary offer, named from the lore on its own fork", () => {
    const state = hunting();
    const offer = offerAt(state, "mid");
    const ordinary = buildOffer(
      state,
      getCity(state.map, "mid"),
      "alpha-hunt",
      offerContext(1),
    );
    const { alphaHunt, ...rest } = offer;
    expect(rest).toEqual(ordinary);
    expect(alphaHunt?.scars).toBe(0);
    expect(alphaHunt?.nemesisId).toBeUndefined();
    expect(NEMESIS_LORE.broodmotherNames).toContain(alphaHunt?.name);
    // Deterministic per seed, and the seeds do not all agree.
    expect(offerAt(state, "mid", 1).alphaHunt).toEqual(alphaHunt);
    const names = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(
        (seed) => offerAt(state, "mid", seed).alphaHunt?.name,
      ),
    );
    expect(names.size).toBeGreaterThan(1);
  });

  it("never names a fresh Broodmother after a living nemesis while other names are left", () => {
    const taken = NEMESIS_LORE.broodmotherNames.slice(0, -1);
    const state = hunting({
      progress: {
        ...hunting().progress,
        nemeses: taken.map((name, index) =>
          nemesis({ id: `n${String(index)}`, name, speciesId: "brute" }),
        ),
      },
    });
    for (let seed = 1; seed <= 5; seed++) {
      expect(offerAt(state, "mid", seed).alphaHunt?.name).toBe(
        NEMESIS_LORE.broodmotherNames.at(-1),
      );
    }
  });

  it("hunts a living nemesis at one more difficulty per level, clamped into the act, with her scars", () => {
    const state = (level: number) =>
      hunting({
        progress: {
          ...hunting().progress,
          nemeses: [nemesis({ level, escapes: level })],
        },
      });
    const plain = offerAt(hunting(), "mid");
    const levelOne = offerAt(state(1), "mid");
    expect(plain.difficulty).toBeLessThan(10);
    expect(levelOne.difficulty).toBe(plain.difficulty + 1);
    expect(levelOne.alphaHunt).toEqual({
      nemesisId: nemesis().id,
      name: "Old Scald",
      scar: "burned along the flank",
      scars: 1,
      level: 1,
    });
    expect(levelOne.rewards.credits).toBe(levelOne.difficulty * 300);
    // Clamped: the fixture context's band is 1–10, so a level-9 nemesis
    // at mid (d≥4) hits the top.
    expect(offerAt(state(9), "mid").difficulty).toBe(10);
    // Clamped into Act II's band (d3–7): mid is an ordinary d5 there,
    // and three levels would make it d8.
    if (RULE.kind !== "offer") throw new Error("board offer");
    const inAct2 = (level: number) =>
      RULE.create(
        level === 0 ? hunting() : state(level),
        { cityId: "mid", weight: 1 },
        offerContext(1, ACTS["act-2"]),
      ).difficulty;
    expect(inAct2(0)).toBe(5);
    expect(inAct2(1)).toBe(6);
    expect(inAct2(3)).toBe(ACTS["act-2"].difficultyBand.max);
  });
});
