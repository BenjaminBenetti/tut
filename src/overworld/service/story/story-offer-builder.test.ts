import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../../content/data/mission-types";
import { ACTS } from "../../data/acts";
import { getCity } from "../earth-map-query-service";
import {
  fixtureState,
  offerContext,
} from "../missions/mission-fixtures.test-helper";
import { buildOfferAtDifficulty } from "../missions/mission-offer-builder";
import { buildStoryOffer } from "./story-offer-builder";

// ===========================================
// Builder
// ===========================================

describe("buildStoryOffer", () => {
  it("builds its type's offer at the fixed difficulty, unclamped, pinned with its story id and act", () => {
    // Act I's band tops out at 4; a story mission keeps its own 6.
    const state = fixtureState();
    const city = getCity(state.map, "low");
    const offer = buildStoryOffer(
      state,
      city,
      {
        storyId: "live-specimen",
        typeId: "infestation-clearance",
        difficulty: 6,
        act: "act-1",
      },
      offerContext(5, ACTS["act-1"]),
    );
    expect(ACTS["act-1"].difficultyBand.max).toBeLessThan(6);
    expect(offer).toEqual({
      ...buildOfferAtDifficulty(
        state,
        city,
        "infestation-clearance",
        6,
        offerContext(5, ACTS["act-1"]),
      ),
      pinned: true,
      storyId: "live-specimen",
      act: "act-1",
    });
    expect(offer.difficulty).toBe(6);
    expect(offer.rewards.credits).toBe(
      6 * MISSION_TYPES["infestation-clearance"].rewardPerDifficulty,
    );
  });
});
