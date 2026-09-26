import { describe, expect, it } from "vitest";

import { ACTS } from "../../data/acts";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { getCity } from "../earth-map-query-service";
import { crashSiteSites } from "./crash-site-landing";
import { CRASH_SITE_OFFER } from "./crash-site-offer";
import { fixtureState, offerContext } from "./mission-fixtures.test-helper";
import { buildOffer } from "./mission-offer-builder";

describe("CRASH_SITE_OFFER", () => {
  it("is drawn by the director from the third mission of Act I, after First Skyfall's slot", () => {
    expect(CRASH_SITE_OFFER.kind).toBe("offer");
    expect(CRASH_SITE_OFFER.typeId).toBe("crash-site");
    expect(CRASH_SITE_OFFER.debut).toEqual({
      act: "act-1",
      missionsInAct: 2,
    });
  });

  it("is eligible wherever a pod could land", () => {
    const state = fixtureState();
    expect(
      CRASH_SITE_OFFER.eligible(state, offerContext(1, ACTS["act-1"])),
    ).toEqual(crashSiteSites(state, MISSION_TUNING.crashSite));
  });

  it("creates the offer at the landing city, built on the landing, carrying it, at ×1.5 tech points", () => {
    const state = fixtureState();
    const created = CRASH_SITE_OFFER.create(
      state,
      { cityId: "clean", weight: 4 },
      offerContext(4, ACTS["act-1"]),
    );
    const plain = buildOffer(
      state,
      { ...getCity(state.map, "clean"), infestation: 10 },
      "crash-site",
      offerContext(4, ACTS["act-1"]),
    );
    expect(created).toEqual({
      ...plain,
      rewards: {
        ...plain.rewards,
        techPoints: Math.round(plain.rewards.techPoints * 1.5),
      },
      crashSite: { landingCityId: "clean", preLandingInfestation: 0 },
    });
    expect(created.cityId).toBe("clean");
    expect(created.typeId).toBe("crash-site");
    // Threat 40 and the landed 10: 0.7 × 0.1 + 0.3 × 0.4 of d1–10 is d3,
    // whose 8 + 3 × 3 = 17 tech points pay 26.
    expect(created.difficulty).toBe(3);
    expect(created.rewards.techPoints).toBe(26);
    expect(created.ignorePenalty).toBe(15);
    // The offer never lands anything itself: that is the consequence
    // rule's `onOffered`, when the director puts it on the board.
    expect(getCity(state.map, "clean").infestation).toBe(0);
  });
});
