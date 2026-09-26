import { describe, expect, it } from "vitest";

import type { StoryDefence } from "./story-defence-presentation";
import {
  holdObjectiveRow,
  siteName,
  storyDefenceEnding,
} from "./story-defence-presentation";
import {
  campaignWith,
  defenceResult,
  storyDefenceOffer,
} from "./story-defence-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const ARRAY: StoryDefence = {
  storyId: "uplink",
  site: "tracking-array",
  waves: 5,
};

// ===========================================
// Briefing
// ===========================================

describe("holdObjectiveRow (#1179)", () => {
  it("names the facility and the waves the offer froze, not the story's", () => {
    expect(
      holdObjectiveRow(storyDefenceOffer("uplink", "tracking-array", 6), ARRAY),
    ).toEqual({
      field: "story-objective",
      label: "Objective",
      value: "Hold the tracking array through 6 waves",
    });
  });

  it("falls back to the story's facility and waves for an offer without a defence", () => {
    const { defence: _dropped, ...bare } = storyDefenceOffer(
      "uplink",
      "launch-site",
      9,
    );
    expect(holdObjectiveRow(bare, ARRAY).value).toBe(
      "Hold the tracking array through 5 waves",
    );
  });

  it("names a facility as a sentence does", () => {
    expect(siteName("tracking-array")).toBe("tracking array");
    expect(siteName("launch-site")).toBe("launch site");
  });
});

// ===========================================
// Debrief
// ===========================================

describe("storyDefenceEnding (#1179)", () => {
  const recorded = { state: campaignWith({ storyWon: ["uplink"] }) };
  const retrying = { state: campaignWith({ storyRetryDay: { uplink: 9 } }) };
  const array = (held: boolean) => ({
    installation: "tracking-array" as const,
    held,
  });

  it("is won for a win the story recorded", () => {
    expect(
      storyDefenceEnding(defenceResult("won", array(true)), recorded, ARRAY),
    ).toBe("won");
  });

  it("is pulled-out or fell, by whether a generator still ran, when the story will retry", () => {
    expect(
      storyDefenceEnding(
        defenceResult("extracted", array(true)),
        retrying,
        ARRAY,
      ),
    ).toBe("pulled-out");
    for (const outcome of ["extracted", "lost"] as const) {
      expect(
        storyDefenceEnding(
          defenceResult(outcome, array(false)),
          retrying,
          ARRAY,
        ),
      ).toBe("fell");
    }
  });

  it("is undefined for another facility's result, an auto-resolved one, or one the story did not act on", () => {
    const bank = { installation: "bank" as const, held: true };
    expect(
      storyDefenceEnding(defenceResult("won", bank), recorded, ARRAY),
    ).toBeUndefined();
    expect(
      storyDefenceEnding(defenceResult("won"), recorded, ARRAY),
    ).toBeUndefined();
    expect(
      storyDefenceEnding(defenceResult("won", array(true)), retrying, ARRAY),
    ).toBeUndefined();
    expect(
      storyDefenceEnding(defenceResult("lost", array(false)), recorded, ARRAY),
    ).toBeUndefined();
  });
});
