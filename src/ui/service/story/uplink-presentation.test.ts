import { describe, expect, it } from "vitest";

import {
  campaignWith,
  defenceResult,
  storyDefenceOffer,
} from "./story-defence-fixtures.test-helper";
import {
  STORY_PRESENTATION,
  storyBriefingRowsOf,
  storyDebriefTaglineFor,
  storyDescriptionOf,
} from "./story-presentation";
import { UPLINK_PRESENTATION } from "./uplink-presentation";

// ===========================================
// Fixtures
// ===========================================

const UPLINK = storyDefenceOffer("uplink", "tracking-array", 5);

/** The tracking array's defence as a played result records it. */
const array = (held: boolean) => ({
  installation: "tracking-array" as const,
  held,
});

// ===========================================
// Briefing
// ===========================================

describe("Uplink's briefing (#1179)", () => {
  it("is in the story table", () => {
    expect(STORY_PRESENTATION.uplink).toBe(UPLINK_PRESENTATION);
    expect(UPLINK_PRESENTATION.storyId).toBe("uplink");
  });

  it("says what holding the array takes and what it wins, in the story's words", () => {
    expect(
      storyBriefingRowsOf(
        UPLINK,
        { state: campaignWith() },
        STORY_PRESENTATION,
      ),
    ).toEqual([
      {
        field: "story-objective",
        label: "Objective",
        value: "Hold the tracking array through 5 waves",
      },
      {
        field: "story-win",
        label: "Win",
        value: "The platform's beacons are revealed",
      },
    ]);
    expect(storyDescriptionOf(UPLINK, STORY_PRESENTATION)).toBe(
      "The Spore Platform steers by beacons no one has found. Keep the tracking array powered while it listens: if a generator still runs when the last wave is dead, it has them.",
    );
  });
});

// ===========================================
// Debrief
// ===========================================

describe("Uplink's debrief (#1179)", () => {
  it("says the array locked on, and what that opens, on a win the story recorded", () => {
    expect(
      storyDebriefTaglineFor(defenceResult("won", array(true)), {
        state: campaignWith({ storyWon: ["uplink"] }),
      }),
    ).toBe(
      "The tracking array held through every wave and locked onto the Spore Platform's beacons. Platform Approach can now be researched.",
    );
  });

  it("says it never locked on, and when Uplink is back, on a loss the story will retry", () => {
    const ctx = { state: campaignWith({ storyRetryDay: { uplink: 9 } }) };
    expect(
      storyDebriefTaglineFor(defenceResult("extracted", array(true)), ctx),
    ).toBe(
      "The force pulled out before the tracking array locked on. The beacons are still dark: Uplink is pinned again in 5 days.",
    );
    expect(
      storyDebriefTaglineFor(defenceResult("lost", array(false)), ctx),
    ).toBe(
      "The tracking array fell before it locked on. The beacons are still dark: Uplink is pinned again in 5 days.",
    );
  });

  it("keeps quiet for a built installation's defence, an auto-resolved Uplink, or the launch site", () => {
    const won = { state: campaignWith({ storyWon: ["uplink"] }) };
    expect(
      storyDebriefTaglineFor(
        defenceResult("won", { installation: "sensor-array", held: true }),
        won,
      ),
    ).toBeUndefined();
    expect(storyDebriefTaglineFor(defenceResult("won"), won)).toBeUndefined();
    expect(
      storyDebriefTaglineFor(
        defenceResult("won", { installation: "launch-site", held: true }),
        won,
      ),
    ).toBeUndefined();
  });
});
