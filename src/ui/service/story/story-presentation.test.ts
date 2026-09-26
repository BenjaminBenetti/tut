import { describe, expect, it } from "vitest";

import type { MissionResult } from "../../../overworld/model/mission-result";
import type { GameState } from "../../../save/model/game-state";
import type { StoryPresentationCatalogue } from "../../model/story-presentation";
import {
  campaignOnDay,
  missionAt,
} from "../../view/mission-fixtures.test-helper";
import { LIVE_SPECIMEN_PRESENTATION } from "./live-specimen-presentation";
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

const CLEARANCE = missionAt("mission-1", "cairo", 7, 3);

const SPECIMEN = {
  ...missionAt("mission-2", "lagos", 7, 3),
  storyId: "live-specimen" as const,
  pinned: true,
  act: "act-1" as const,
};

const SKYFALL = {
  ...missionAt("mission-3", "lagos", 7, 1),
  typeId: "crash-site" as const,
  storyId: "first-skyfall" as const,
  pinned: true,
};

/** A campaign on day 4 whose story progress is overridden by `story`. */
function campaign(
  story: Partial<GameState["overworld"]["progress"]> = {},
): GameState {
  const state = campaignOnDay(4, [CLEARANCE, SPECIMEN]);
  return {
    ...state,
    overworld: {
      ...state.overworld,
      progress: { ...state.overworld.progress, ...story },
    },
  };
}

/** A result on "lagos" ending in `outcome`, with `extra` on top. */
function result(
  outcome: MissionResult["outcome"],
  extra: Partial<MissionResult> = {},
): MissionResult {
  return {
    missionId: "mission-2",
    cityId: "lagos",
    outcome,
    squadCasualties: [],
    squadsWiped: [],
    mechsDestroyed: [],
    mechDamage: [],
    creditsAwarded: 0,
    techPointsAwarded: 0,
    infestationDelta: 0,
    ...extra,
  };
}

const CAPTURED = [
  { kind: "destroy-spawner", complete: false, failed: false },
  { kind: "capture-specimen", complete: true, failed: false },
] as const;

const MISSED = [
  { kind: "destroy-spawner", complete: true, failed: false },
  { kind: "capture-specimen", complete: false, failed: false },
] as const;

// ===========================================
// The table
// ===========================================

describe("STORY_PRESENTATION (ADR 0013 §2.5)", () => {
  it("has Live Specimen and nothing for First Skyfall, whose crash site says it all", () => {
    expect(STORY_PRESENTATION["live-specimen"]).toBe(
      LIVE_SPECIMEN_PRESENTATION,
    );
    expect(LIVE_SPECIMEN_PRESENTATION.storyId).toBe("live-specimen");
    expect(STORY_PRESENTATION["first-skyfall"]).toBeUndefined();
  });

  it("builds every story's fields once, in story order", () => {
    const stories: StoryPresentationCatalogue = {
      "live-specimen": LIVE_SPECIMEN_PRESENTATION,
      "first-skyfall": {
        storyId: "first-skyfall",
        briefingFields: [
          { field: "story-win", label: "Win" },
          { field: "story-landing", label: "Landing" },
        ],
        briefingRows: () => [],
      },
    };
    expect(storyBriefingFieldsOf(stories).map((f) => f.field)).toEqual([
      "story-win",
      "story-landing",
      "story-objective",
      "story-kit",
    ]);
  });
});

// ===========================================
// Briefing
// ===========================================

describe("Live Specimen's briefing (#1179)", () => {
  it("says what wins it, what the win does and what the squads carry", () => {
    expect(
      storyBriefingRowsOf(SPECIMEN, { state: campaign() }, STORY_PRESENTATION),
    ).toEqual([
      {
        field: "story-objective",
        label: "Objective",
        value: "Net a lurker at 50% HP or less, then bring it home",
      },
      { field: "story-win", label: "Win", value: "Act I ends" },
      {
        field: "story-kit",
        label: "Kit",
        value: "Every squad carries a capture net",
      },
    ]);
    expect(storyDescriptionOf(SPECIMEN, STORY_PRESENTATION)).toBe(
      "The lab needs a lurker alive. Wear one down, net it and carry it to the drop ship. The nests here are optional: only the specimen wins the mission.",
    );
  });

  it("adds nothing to a mission that is not a story's, or whose story has no presentation", () => {
    for (const mission of [CLEARANCE, SKYFALL]) {
      expect(
        storyBriefingRowsOf(mission, { state: campaign() }, STORY_PRESENTATION),
      ).toEqual([]);
      expect(storyDescriptionOf(mission, STORY_PRESENTATION)).toBeUndefined();
    }
  });
});

// ===========================================
// Debrief
// ===========================================

describe("Live Specimen's debrief (#1179)", () => {
  it("says the specimen came home on a win the story recorded", () => {
    expect(
      storyDebriefTaglineFor(
        result("won", { specimenCaptured: "lurker", objectives: CAPTURED }),
        { state: campaign({ storyWon: ["live-specimen"] }) },
      ),
    ).toBe(
      "The lurker is home alive, in the net. The lab has its live specimen, and Act I is over.",
    );
  });

  it("says none came home, and when the hunt is back, on an extraction or a loss the story will retry", () => {
    const ctx = { state: campaign({ storyRetryDay: { "live-specimen": 9 } }) };
    for (const outcome of ["extracted", "lost"] as const) {
      expect(
        storyDebriefTaglineFor(result(outcome, { objectives: MISSED }), ctx),
      ).toBe(
        "No lurker came home alive. The lab is still waiting: the hunt is pinned again in 5 days.",
      );
    }
  });

  it("keeps quiet for a result that is not Live Specimen's", () => {
    const won = { state: campaign({ storyWon: ["live-specimen"] }) };
    const retry = {
      state: campaign({ storyRetryDay: { "live-specimen": 9 } }),
    };
    // An ordinary clearance: no capture objective, no specimen.
    expect(
      storyDebriefTaglineFor(
        result("won", {
          objectives: [
            { kind: "destroy-spawner", complete: true, failed: false },
          ],
        }),
        won,
      ),
    ).toBeUndefined();
    // Auto-resolved: no objectives recorded.
    expect(storyDebriefTaglineFor(result("lost"), retry)).toBeUndefined();
    // A capture the story never recorded.
    expect(
      storyDebriefTaglineFor(
        result("won", { specimenCaptured: "lurker", objectives: CAPTURED }),
        { state: campaign() },
      ),
    ).toBeUndefined();
    expect(
      storyDebriefTaglineFor(result("extracted", { objectives: MISSED }), {
        state: campaign(),
      }),
    ).toBeUndefined();
  });
});
