import { describe, expect, it } from "vitest";

import type { CampaignFlagId } from "../../../content/model/campaign-flag-id";
import type { Mission } from "../../../overworld/model/mission";
import type {
  MissionOutcome,
  ObjectiveResult,
} from "../../../overworld/model/mission-result";
import { missionAt } from "../../view/mission-fixtures.test-helper";
import {
  campaignWith,
  defenceResult,
} from "./story-defence-fixtures.test-helper";
import {
  SPORE_PLATFORM_STORY_PRESENTATION,
  platformEnding,
  platformStageReached,
} from "./spore-platform-presentation";
import {
  STORY_PRESENTATION,
  storyBriefingFieldsOf,
  storyBriefingRowsOf,
  storyDebriefTaglineFor,
} from "./story-presentation";

// ===========================================
// Fixtures
// ===========================================

const PLATFORM: Mission = {
  ...missionAt("mission-9", "lagos", 10, 10),
  typeId: "spore-platform",
  storyId: "spore-platform",
  pinned: true,
  act: "finale",
};

/** The hull's objective, as the resolver records it. */
const HULL: readonly ObjectiveResult[] = [
  { kind: "board-core", complete: false, failed: true },
];

/** The core's objective, as the resolver records it. */
const CORE = (complete: boolean): readonly ObjectiveResult[] => [
  {
    kind: "destroy-platform-core",
    complete,
    failed: false,
    done: complete ? 60 : 12,
    total: 60,
  },
];

/** A played result ending in `outcome`, decided on `objectives`. */
function result(
  outcome: MissionOutcome,
  objectives?: readonly ObjectiveResult[],
) {
  return {
    ...defenceResult(outcome),
    missionId: PLATFORM.id,
    ...(objectives === undefined ? {} : { objectives }),
  };
}

/** A campaign whose flags are `flags`. */
const flagged = (...flags: CampaignFlagId[]) => ({
  state: campaignWith({ flags }),
});

// ===========================================
// Briefing
// ===========================================

describe("the Spore Platform's briefing (#1179, arc D7)", () => {
  it("is in the story table, after every other story's slots", () => {
    expect(STORY_PRESENTATION["spore-platform"]).toBe(
      SPORE_PLATFORM_STORY_PRESENTATION,
    );
    expect(SPORE_PLATFORM_STORY_PRESENTATION.storyId).toBe("spore-platform");
    const fields = storyBriefingFieldsOf(STORY_PRESENTATION).map(
      (field) => field.field,
    );
    expect(fields.slice(-2)).toEqual(["story-first-loss", "story-last-chance"]);
    expect(fields.filter((field) => field === "story-win")).toHaveLength(1);
  });

  it("says a win saves the Earth, and what the first loss costs", () => {
    expect(
      storyBriefingRowsOf(PLATFORM, flagged(), STORY_PRESENTATION),
    ).toEqual([
      { field: "story-win", label: "Win", value: "Earth is saved" },
      {
        field: "story-first-loss",
        label: "First loss",
        value: "+30 infestation everywhere; a second chance must be researched",
      },
    ]);
  });

  it("says, on the retry, that a second loss is defeat", () => {
    expect(
      storyBriefingRowsOf(
        PLATFORM,
        flagged("platform-failed", "last-hope"),
        STORY_PRESENTATION,
      ),
    ).toEqual([
      { field: "story-win", label: "Win", value: "Earth is saved" },
      {
        field: "story-last-chance",
        label: "Last chance",
        value: "A second loss is defeat",
      },
    ]);
  });
});

// ===========================================
// Debrief
// ===========================================

describe("the Spore Platform's debrief (#1179, arc D1, D7)", () => {
  it("knows a platform result by its last stage's objective", () => {
    expect(platformStageReached(result("lost", HULL))).toBe("hull");
    expect(platformStageReached(result("won", CORE(true)))).toBe("core");
    expect(platformStageReached(result("lost"))).toBeUndefined();
    expect(
      platformStageReached(
        result("won", [
          { kind: "destroy-spawner", complete: true, failed: false },
        ]),
      ),
    ).toBeUndefined();
  });

  it("says Earth is saved on a win the story recorded", () => {
    const won = result("won", CORE(true));
    expect(platformEnding(won, flagged("campaign-won"))).toBe("won");
    expect(storyDebriefTaglineFor(won, flagged("campaign-won"))).toBe(
      "The platform core is destroyed and the Spore Platform falls silent. Earth is saved.",
    );
  });

  it("says where the first assault broke, what it cost and what brings the platform back", () => {
    expect(
      storyDebriefTaglineFor(result("lost", HULL), flagged("platform-failed")),
    ).toBe(
      "The assault broke on the hull. The platform seeds the Earth: +30 infestation in every city. Research Last Hope for a second assault.",
    );
    expect(
      storyDebriefTaglineFor(
        result("lost", CORE(false)),
        flagged("platform-failed"),
      ),
    ).toBe(
      "The assault broke in the core. The platform seeds the Earth: +30 infestation in every city. Research Last Hope for a second assault.",
    );
  });

  it("says the Earth is lost on the second failure", () => {
    const flags = flagged("platform-failed", "last-hope", "campaign-lost");
    expect(platformEnding(result("lost", CORE(false)), flags)).toBe("lost");
    expect(storyDebriefTaglineFor(result("lost", HULL), flags)).toBe(
      "The second assault broke on the hull. There is no third: the Earth is lost.",
    );
  });

  it("keeps quiet for a result the story did not act on, or that is not the platform's", () => {
    expect(
      storyDebriefTaglineFor(result("won", CORE(true)), flagged()),
    ).toBeUndefined();
    expect(
      storyDebriefTaglineFor(result("lost", HULL), flagged()),
    ).toBeUndefined();
    expect(
      storyDebriefTaglineFor(result("lost"), flagged("campaign-lost")),
    ).toBeUndefined();
  });
});
