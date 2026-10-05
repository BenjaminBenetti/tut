import { describe, expect, it } from "vitest";

import type { Mission } from "../../../overworld/model/mission";
import { missionAt } from "../../view/mission-fixtures.test-helper";
import { CRASH_SITE_PRESENTATION } from "../missions/crash-site-presentation";
import { FIRST_SKYFALL_PRESENTATION } from "./first-skyfall-presentation";
import { campaignWith } from "./story-defence-fixtures.test-helper";
import {
  STORY_PRESENTATION,
  storyBriefingRowsOf,
  storyDescriptionOf,
  typeBriefingRowsOf,
} from "./story-presentation";

// ===========================================
// Fixtures
// ===========================================

/** First Skyfall's pinned d1 crash site, landed at Cairo. */
const SKYFALL: Mission = {
  ...missionAt("mission-2", "cairo", 7, 1),
  typeId: "crash-site",
  storyId: "first-skyfall",
  pinned: true,
  act: "act-1",
  crashSite: { landingCityId: "cairo", preLandingInfestation: 0 },
};

// ===========================================
// Briefing
// ===========================================

describe("First Skyfall's briefing (#1238)", () => {
  it("is in the story table", () => {
    expect(STORY_PRESENTATION["first-skyfall"]).toBe(
      FIRST_SKYFALL_PRESENTATION,
    );
  });

  it("says to breach the hull and destroy the core, when the core ripens, and what opens the hull", () => {
    expect(
      storyBriefingRowsOf(
        SKYFALL,
        { state: campaignWith() },
        STORY_PRESENTATION,
      ),
    ).toEqual([
      {
        field: "story-objective",
        label: "Objective",
        value: "Breach the pod's hull, destroy its core, then extract",
      },
      {
        field: "story-core",
        label: "Pod core",
        value: "Ripens at the end of turn 12 · 80 hp",
      },
      {
        field: "story-hull",
        label: "Hull",
        value:
          "Rockets and breaching charges open a plate; grenades and mech guns open a glowing seam",
      },
    ]);
    expect(storyDescriptionOf(SKYFALL, STORY_PRESENTATION)).toContain(
      "Breach the pod's hull and destroy its core",
    );
  });

  it("reads the core's clock and hit points off the offer's difficulty", () => {
    const rows = storyBriefingRowsOf(
      { ...SKYFALL, difficulty: 5 },
      { state: campaignWith() },
      STORY_PRESENTATION,
    );
    expect(rows.find((row) => row.field === "story-core")?.value).toBe(
      "Ripens at the end of turn 9 · 120 hp",
    );
  });

  it("drops the crash site's clock row, which is a spore pod's, and keeps the landing and the tech bonus", () => {
    const state = campaignWith();
    const typeRows = CRASH_SITE_PRESENTATION.briefingRows(SKYFALL, { state });
    expect(
      typeBriefingRowsOf(SKYFALL, typeRows, STORY_PRESENTATION).map(
        (row) => row.field,
      ),
    ).toEqual(["landing", "tech-bonus"]);
  });
});
