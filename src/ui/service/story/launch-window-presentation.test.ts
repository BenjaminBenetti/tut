import { describe, expect, it } from "vitest";

import { LAUNCH_WINDOW_PRESENTATION } from "./launch-window-presentation";
import {
  campaignWith,
  defenceResult,
  storyDefenceOffer,
} from "./story-defence-fixtures.test-helper";
import {
  STORY_PRESENTATION,
  storyBriefingFieldsOf,
  storyBriefingRowsOf,
  storyDebriefTaglineFor,
  storyDescriptionOf,
} from "./story-presentation";

// ===========================================
// Fixtures
// ===========================================

const LAUNCH = storyDefenceOffer("launch-window", "launch-site", 7);

/** The launch site's defence as a played result records it. */
const pad = (held: boolean) => ({
  installation: "launch-site" as const,
  held,
});

// ===========================================
// Briefing
// ===========================================

describe("Launch Window's briefing (#1179)", () => {
  it("is in the story table, and adds the Lost slot after every other story's", () => {
    expect(STORY_PRESENTATION["launch-window"]).toBe(
      LAUNCH_WINDOW_PRESENTATION,
    );
    expect(LAUNCH_WINDOW_PRESENTATION.storyId).toBe("launch-window");
    expect(
      storyBriefingFieldsOf(STORY_PRESENTATION).map((field) => field.field),
    ).toEqual(["story-objective", "story-win", "story-kit", "story-lost"]);
  });

  it("says what holding the pad takes, what it wins and what losing it costs", () => {
    expect(
      storyBriefingRowsOf(
        LAUNCH,
        { state: campaignWith() },
        STORY_PRESENTATION,
      ),
    ).toEqual([
      {
        field: "story-objective",
        label: "Objective",
        value: "Hold the launch site through 7 waves",
      },
      { field: "story-win", label: "Win", value: "The launch" },
      { field: "story-lost", label: "Lost", value: "The launch slips 5 days" },
    ]);
    expect(storyDescriptionOf(LAUNCH, STORY_PRESENTATION)).toBe(
      "The Great Hives are down and the approach is plotted. Hold the launch site until the assault lifts off: while a generator runs, the launch is on.",
    );
  });
});

// ===========================================
// Debrief
// ===========================================

describe("Launch Window's debrief (#1179)", () => {
  it("says the launch is away on a win the story recorded", () => {
    expect(
      storyDebriefTaglineFor(defenceResult("won", pad(true)), {
        state: campaignWith({ storyWon: ["launch-window"] }),
      }),
    ).toBe(
      "The launch site held through every wave, and the launch is away: the assault is bound for the Spore Platform.",
    );
  });

  it("says the window slipped, and when it is back, on a loss", () => {
    const ctx = {
      state: campaignWith({ storyRetryDay: { "launch-window": 9 } }),
    };
    expect(
      storyDebriefTaglineFor(defenceResult("extracted", pad(true)), ctx),
    ).toBe(
      "The force pulled out before the launch. The window slips: Launch Window is pinned again in 5 days.",
    );
    expect(storyDebriefTaglineFor(defenceResult("lost", pad(false)), ctx)).toBe(
      "The launch site fell before the launch. The window slips: Launch Window is pinned again in 5 days.",
    );
  });

  it("keeps quiet for the tracking array, an auto-resolved launch, or a win the story never recorded", () => {
    const won = { state: campaignWith({ storyWon: ["launch-window"] }) };
    expect(
      storyDebriefTaglineFor(
        defenceResult("won", { installation: "tracking-array", held: true }),
        won,
      ),
    ).toBeUndefined();
    expect(storyDebriefTaglineFor(defenceResult("won"), won)).toBeUndefined();
    expect(
      storyDebriefTaglineFor(defenceResult("won", pad(true)), {
        state: campaignWith(),
      }),
    ).toBeUndefined();
  });
});
