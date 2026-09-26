import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../../content/data/mission-types";
import { MISSION_DIFFICULTY_RANGE } from "../../../content/model/mission-type";
import { ACTS } from "../../data/acts";
import { MISSION_TUNING } from "../../data/mission-tuning";
import type { MissionOfferContext } from "../../model/mission-offer-rule";
import { getCity } from "../earth-map-query-service";
import {
  fixtureState,
  missionAt,
  offerContext,
  progressIn,
  UNCLAMPED_ACT,
} from "./mission-fixtures.test-helper";
import {
  buildOffer,
  buildOfferAtDifficulty,
  citiesWithOffers,
  clampToBand,
  difficultyFor,
  mapSizeFor,
} from "./mission-offer-builder";

// ===========================================
// Fixtures
// ===========================================

const RULE = MISSION_TUNING.difficulty["infestation-clearance"];
const CLEARANCE = MISSION_TYPES["infestation-clearance"];

/** `ctx` with a carcass chance of `chance`. */
function withCarcassChance(
  ctx: MissionOfferContext,
  chance: number,
): MissionOfferContext {
  return {
    ...ctx,
    tuning: {
      ...ctx.tuning,
      techCarcass: { chance, basePoints: 10, pointsPerDifficulty: 2 },
    },
  };
}

// ===========================================
// Formulae
// ===========================================

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

  it("clamps into a narrow type band", () => {
    const narrow = { ...CLEARANCE, difficultyBand: { min: 4, max: 6 } };
    expect(difficultyFor(0, 0, narrow, RULE)).toBe(4);
    expect(difficultyFor(100, 100, narrow, RULE)).toBe(6);
  });
});

describe("clampToBand", () => {
  it("moves a difficulty into the band and leaves one inside it alone", () => {
    const band = { min: 3, max: 7 };
    expect(clampToBand(1, band)).toBe(3);
    expect(clampToBand(5, band)).toBe(5);
    expect(clampToBand(10, band)).toBe(7);
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
// Offers
// ===========================================

describe("buildOffer", () => {
  it("fills the offer from its type, city and region", () => {
    const state = fixtureState({ day: 12, threat: 40 });
    const ctx = offerContext(3, UNCLAMPED_ACT, { east: 2 });
    const mid = buildOffer(
      state,
      getCity(state.map, "mid"),
      "infestation-clearance",
      ctx,
    );

    expect(mid.id).toBe("mission-1");
    expect(mid.typeId).toBe("infestation-clearance");
    expect(mid.cityId).toBe("mid");
    expect(mid.difficulty).toBe(difficultyFor(50, 40, CLEARANCE, RULE));
    expect(mid.rewards.credits).toBe(
      mid.difficulty * CLEARANCE.rewardPerDifficulty,
    );
    expect(mid.rewards.techPoints).toBe(
      CLEARANCE.techRewardBase +
        mid.difficulty * CLEARANCE.techRewardPerDifficulty,
    );
    expect(mid.createdDay).toBe(12);
    expect(mid.expiresDay).toBe(12 + CLEARANCE.expiryDays + 2);
    expect(mid.ignorePenalty).toBe(CLEARANCE.ignorePenalty);
    expect(mid.act).toBe("act-1");
    expect(mid).not.toHaveProperty("pinned");
    expect(mid.mapParams).toEqual({
      infestation: 5,
      biome: "desert",
      settlement: "city",
      size: mapSizeFor(mid.difficulty, RULE),
      seed: mid.mapParams.seed,
      ...(mid.mapParams.techCarcass === undefined
        ? {}
        : { techCarcass: mid.mapParams.techCarcass }),
    });
    expect(mid.mapParams.seed).toMatch(/^\d+$/);

    const full = buildOffer(
      state,
      getCity(state.map, "full"),
      "infestation-clearance",
      ctx,
    );
    expect(full.id).toBe("mission-2");
    expect(full.mapParams.settlement).toBe("town");
    expect(full.mapParams.infestation).toBe(10);
    expect(full.difficulty).toBeGreaterThanOrEqual(mid.difficulty);
  });

  it("clamps difficulty into the act's band and derives rewards, size and carcass from the clamped value (arc §3)", () => {
    // The overrun city at full threat is a d10 anywhere else; Act I's
    // band caps it at 4, and everything priced by difficulty follows.
    const state = fixtureState({ threat: 100 });
    const full = getCity(state.map, "full");
    const ctx = withCarcassChance(offerContext(3, ACTS["act-1"]), 1);
    const clamped = buildOffer(state, full, "infestation-clearance", ctx);
    expect(difficultyFor(100, 100, CLEARANCE, RULE)).toBe(10);
    expect(clamped.difficulty).toBe(4);
    expect(clamped.rewards).toEqual({
      credits: 4 * CLEARANCE.rewardPerDifficulty,
      techPoints:
        CLEARANCE.techRewardBase + 4 * CLEARANCE.techRewardPerDifficulty,
    });
    expect(clamped.mapParams.size).toBe(mapSizeFor(4, RULE));
    expect(clamped.mapParams.size).toBe("medium");
    expect(clamped.mapParams.techCarcass).toEqual({ techPoints: 10 + 2 * 4 });

    // A clean-ish city in Act III is lifted to the band's floor.
    const calm = fixtureState({ threat: 0, progress: progressIn("act-3") });
    const lifted = buildOffer(
      calm,
      getCity(calm.map, "low"),
      "infestation-clearance",
      offerContext(3, ACTS["act-3"]),
    );
    expect(difficultyFor(10, 0, CLEARANCE, RULE)).toBeLessThan(5);
    expect(lifted.difficulty).toBe(5);
    expect(lifted.act).toBe("act-3");
  });

  it("rolls a tech carcass on its own fork, worth the tuned points (#1171)", () => {
    const state = fixtureState({ day: 12, threat: 40 });
    const offers = (chance: number) =>
      ["mid", "full"].map((cityId) =>
        buildOffer(
          state,
          getCity(state.map, cityId),
          "infestation-clearance",
          withCarcassChance(offerContext(3), chance),
        ),
      );
    const none = offers(0);
    const all = offers(1);
    for (const mission of none) {
      expect(mission.mapParams).not.toHaveProperty("techCarcass");
    }
    for (const mission of all) {
      expect(mission.mapParams.techCarcass).toEqual({
        techPoints: 10 + 2 * mission.difficulty,
      });
    }
    // The roll is a fork, so it perturbs nothing else the builder draws.
    expect(all.map((m) => [m.id, m.difficulty, m.mapParams.seed])).toEqual(
      none.map((m) => [m.id, m.difficulty, m.mapParams.seed]),
    );
  });

  it("carries a carcass on roughly the tuned share of offers", () => {
    const state = fixtureState();
    const city = getCity(state.map, "mid");
    let carcasses = 0;
    const offers = 400;
    for (let seed = 1; seed <= offers; seed += 1) {
      const mission = buildOffer(
        state,
        city,
        "infestation-clearance",
        offerContext(seed),
      );
      if (mission.mapParams.techCarcass !== undefined) carcasses += 1;
    }
    expect(carcasses / offers).toBeGreaterThan(
      MISSION_TUNING.techCarcass.chance - 0.08,
    );
    expect(carcasses / offers).toBeLessThan(
      MISSION_TUNING.techCarcass.chance + 0.08,
    );
  });

  it("uses a city's local biome over its region's", () => {
    const state = fixtureState();
    const alpine = { ...getCity(state.map, "mid"), biome: "alpine" as const };
    expect(
      buildOffer(state, alpine, "infestation-clearance", offerContext(3))
        .mapParams.biome,
    ).toBe("alpine");
  });

  it("applies no intel bonus to a region without an entry", () => {
    const state = fixtureState({ day: 1 });
    const mission = buildOffer(
      state,
      getCity(state.map, "mid"),
      "infestation-clearance",
      offerContext(3, UNCLAMPED_ACT, { west: 4 }),
    );
    expect(mission.expiresDay).toBe(1 + CLEARANCE.expiryDays);
  });
});

describe("buildOfferAtDifficulty", () => {
  it("is buildOffer at the clamped difficulty, drawing the same", () => {
    const state = fixtureState({ threat: 100 });
    const full = getCity(state.map, "full");
    const ctx = (): MissionOfferContext =>
      withCarcassChance(offerContext(3, ACTS["act-1"]), 1);
    expect(
      buildOfferAtDifficulty(state, full, "infestation-clearance", 4, ctx()),
    ).toEqual(buildOffer(state, full, "infestation-clearance", ctx()));
  });

  it("takes the difficulty as given, outside the act's band, and prices from it", () => {
    const state = fixtureState();
    const offer = buildOfferAtDifficulty(
      state,
      getCity(state.map, "low"),
      "infestation-clearance",
      9,
      withCarcassChance(offerContext(3, ACTS["act-1"]), 1),
    );
    expect(offer.difficulty).toBe(9);
    expect(offer.rewards.credits).toBe(9 * CLEARANCE.rewardPerDifficulty);
    expect(offer.mapParams.size).toBe(mapSizeFor(9, RULE));
    expect(offer.mapParams.techCarcass).toEqual({ techPoints: 10 + 2 * 9 });
  });
});

describe("citiesWithOffers", () => {
  it("names every city holding an offer", () => {
    const state = fixtureState({
      missions: [missionAt("mid", 9), missionAt("full", 9)],
    });
    expect([...citiesWithOffers(state)].sort()).toEqual(["full", "mid"]);
    expect(citiesWithOffers(fixtureState()).size).toBe(0);
  });
});
