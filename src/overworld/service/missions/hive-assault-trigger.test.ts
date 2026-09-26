import { describe, expect, it } from "vitest";

import { ACTS } from "../../data/acts";
import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import type { Hive } from "../../model/hive";
import type { Mission } from "../../model/mission";
import { isMissionExpired } from "../../model/mission";
import type { OverworldState } from "../../model/overworld-state";
import { withInfestation } from "../../model/city";
import { getCity } from "../earth-map-query-service";
import {
  HIVE_ASSAULT_TRIGGER,
  hiveAssaultDifficulty,
  hiveAssaultTechPoints,
} from "./hive-assault-trigger";
import {
  fixtureState,
  missionAt,
  offerContext,
  UNCLAMPED_ACT,
} from "./mission-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** A hive in the fixture's east region (mid 50, full 100), formed on `formedDay`. */
function eastHive(formedDay = 5, id = "hive-1"): Hive {
  return { id, regionId: "east", formedDay };
}

/** A hive in the fixture's west region (clean 0, low 10). */
function westHive(formedDay = 5): Hive {
  return { id: "hive-2", regionId: "west", formedDay };
}

/** The fixture overworld on `day` with `hives` standing. */
function withHives(
  hives: readonly Hive[],
  day = 5,
  missions: readonly Mission[] = [],
): OverworldState {
  return fixtureState({ day, hives, missions });
}

/** The first of `offers`; fails the test when there is none. */
function firstOf(offers: readonly Mission[]): Mission {
  const [offer] = offers;
  if (offer === undefined) {
    throw new Error("expected at least one offer");
  }
  return offer;
}

/** Today's hive offers on `state`, on seed 1, in `act`. */
function triggered(
  state: OverworldState,
  act = UNCLAMPED_ACT,
): readonly Mission[] {
  return HIVE_ASSAULT_TRIGGER.trigger(state, offerContext(1, act));
}

// ===========================================
// Trigger
// ===========================================

describe("HIVE_ASSAULT_TRIGGER — trigger", () => {
  it("offers nothing while no hive stands", () => {
    expect(triggered(fixtureState())).toEqual([]);
  });

  it("pins one offer per hive at the most infested city of its region", () => {
    const offers = triggered(withHives([eastHive(), westHive()]));

    expect(
      offers.map((offer) => [offer.typeId, offer.cityId, offer.hive]),
    ).toEqual([
      [
        "hive-assault",
        "full",
        { hiveId: "hive-1", regionId: "east", level: 0 },
      ],
      ["hive-assault", "low", { hiveId: "hive-2", regionId: "west", level: 0 }],
    ]);
    for (const offer of offers) {
      expect(offer.pinned).toBe(true);
    }
  });

  it("never duplicates the offer of a hive already on the board", () => {
    const state = withHives([eastHive(), westHive()]);
    const first = firstOf(triggered(withHives([eastHive()])));

    const offers = triggered({ ...state, missions: [first] });

    expect(offers.map((offer) => offer.hive?.hiveId)).toEqual(["hive-2"]);
  });

  it("moves to the next city when the worst one already holds an offer", () => {
    const state = withHives([eastHive()], 5, [missionAt("full", 9)]);

    expect(triggered(state).map((offer) => offer.cityId)).toEqual(["mid"]);
  });

  it("skips a hive whose every city holds an offer, until one is free", () => {
    const state = withHives([eastHive()], 5, [
      missionAt("full", 9),
      missionAt("mid", 9),
    ]);

    expect(triggered(state)).toEqual([]);
  });

  it("offers an assault that never expires", () => {
    const offer = firstOf(triggered(withHives([eastHive()])));

    expect(isMissionExpired(offer, offer.expiresDay)).toBe(false);
    expect(isMissionExpired(offer, 10_000)).toBe(false);
  });

  it("levels the hive by its age: +1 every seven days", () => {
    const levels = [5, 11, 12, 19, 26].map(
      (day) => firstOf(triggered(withHives([eastHive(5)], day))).hive?.level,
    );

    expect(levels).toEqual([0, 0, 1, 2, 3]);
  });

  it("adds the level to the host's difficulty and clamps it into the act band", () => {
    const west = (day: number): Mission =>
      firstOf(triggered(withHives([westHive(5)], day)));
    // "low" at 10 and threat 40: 1 + 9 × (0.07 + 0.12) = 2.71 → 3.
    expect(west(5).difficulty).toBe(3);
    expect(west(12).difficulty).toBe(4);
    expect(west(26).difficulty).toBe(6);

    const act2 = ACTS["act-2"];
    const late = firstOf(triggered(withHives([westHive(5)], 5 + 7 * 9), act2));
    expect(late.hive?.level).toBe(9);
    expect(late.difficulty).toBe(act2.difficultyBand.max);
  });

  it("pays the multiplied tech points for its difficulty", () => {
    const offer = firstOf(triggered(withHives([westHive(5)], 12)));

    expect(offer.rewards.techPoints).toBe(
      Math.floor((10 + 3 * offer.difficulty) * 2),
    );
    expect(offer.rewards.credits).toBe(offer.difficulty * 300);
    expect(MISSION_TUNING.hiveAssault.techRewardMultiplier).toBe(2);
  });

  it("is a large map at every difficulty", () => {
    const offer = firstOf(triggered(withHives([westHive(5)])));

    expect(offer.difficulty).toBe(3);
    expect(offer.mapParams.size).toBe("large");
  });
});

// ===========================================
// Refresh
// ===========================================

describe("HIVE_ASSAULT_TRIGGER — refresh", () => {
  /** The hive's offer made on day 5, and the state it stands in on `day`. */
  function standing(day: number): {
    offer: Mission;
    state: OverworldState;
  } {
    const offer = firstOf(triggered(withHives([westHive(5)], 5)));
    return { offer, state: withHives([westHive(5)], day, [offer]) };
  }

  /** `refresh`, which the shipped rule always has. */
  function refresh(
    mission: Mission,
    state: OverworldState,
  ): Mission | undefined {
    if (HIVE_ASSAULT_TRIGGER.refresh === undefined) {
      throw new Error("the hive trigger must re-level its offers");
    }
    return HIVE_ASSAULT_TRIGGER.refresh(mission, state, offerContext(99));
  }

  it("returns the offer itself on a day nothing changed", () => {
    const { offer, state } = standing(11);

    expect(refresh(offer, state)).toBe(offer);
  });

  it("re-levels the standing offer as the hive ages, keeping what was rolled", () => {
    const { offer, state } = standing(19);

    const refreshed = refresh(offer, state);

    expect(refreshed?.hive).toEqual({ ...offer.hive, level: 2 });
    expect(refreshed?.difficulty).toBe(offer.difficulty + 2);
    expect(refreshed?.rewards).toEqual({
      credits: (offer.difficulty + 2) * 300,
      techPoints: Math.floor((10 + 3 * (offer.difficulty + 2)) * 2),
    });
    expect(refreshed).toMatchObject({
      id: offer.id,
      cityId: offer.cityId,
      createdDay: offer.createdDay,
      expiresDay: offer.expiresDay,
      pinned: true,
      mapParams: { seed: offer.mapParams.seed },
    });
  });

  it("re-levels a hive at the band's top without multiplying its reward twice", () => {
    const act2 = { ...ACTS["act-2"] };
    const ctx = offerContext(99, act2);
    const capped = firstOf(
      HIVE_ASSAULT_TRIGGER.trigger(
        withHives([eastHive(5)], 40),
        offerContext(1, act2),
      ),
    );
    expect(capped.difficulty).toBe(act2.difficultyBand.max);

    const later = HIVE_ASSAULT_TRIGGER.refresh?.(
      capped,
      withHives([eastHive(5)], 47, [capped]),
      ctx,
    );

    expect(later?.hive?.level).toBe((capped.hive?.level ?? 0) + 1);
    expect(later?.difficulty).toBe(capped.difficulty);
    expect(later?.rewards).toEqual(capped.rewards);
  });

  it("follows the host city's infestation as well as the level", () => {
    const { offer, state } = standing(11);
    const low = getCity(state.map, "low");
    const worse: OverworldState = {
      ...state,
      map: {
        ...state.map,
        cities: state.map.cities.map((city) =>
          city.id === low.id ? withInfestation(city, 90) : city,
        ),
      },
    };

    const refreshed = refresh(offer, worse);

    expect(refreshed?.hive?.level).toBe(0);
    expect(refreshed?.difficulty).toBe(
      hiveAssaultDifficulty(
        getCity(worse.map, "low"),
        worse,
        0,
        offerContext(1),
      ),
    );
    expect(refreshed?.difficulty).toBeGreaterThan(offer.difficulty);
  });

  it("withdraws the offer once its hive is gone", () => {
    const { offer, state } = standing(11);

    expect(refresh(offer, { ...state, hives: [] })).toBeUndefined();
  });

  it("keeps an offer that carries no hive exactly as it is", () => {
    const bare = missionAt("low", 9, 0, "hive-assault");

    expect(refresh(bare, withHives([westHive(5)], 30, [bare]))).toBe(bare);
  });
});

// ===========================================
// Formulae
// ===========================================

describe("hive assault formulae", () => {
  it("prices tech points as the ordinary award times the multiplier", () => {
    const ctx = offerContext(1);
    expect(hiveAssaultTechPoints(7, ctx)).toBe(62);
    expect(
      hiveAssaultTechPoints(7, {
        ...ctx,
        tuning: {
          ...MISSION_TUNING,
          hiveAssault: { techRewardMultiplier: 1.5 },
        },
      }),
    ).toBe(46);
  });

  it("reads the hive's step length from the hive tuning", () => {
    const fast = {
      ...offerContext(1),
      hive: { ...HIVE_TUNING, difficultyStepDays: 1 },
    };
    const offer = firstOf(
      HIVE_ASSAULT_TRIGGER.trigger(withHives([westHive(5)], 8), fast),
    );

    expect(offer.hive?.level).toBe(3);
  });
});
