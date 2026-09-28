import { describe, expect, it } from "vitest";

import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import { missionAt } from "../../view/mission-fixtures.test-helper";
import { CRASH_SITE_PRESENTATION } from "../missions/crash-site-presentation";
import { debriefTaglineFor } from "../missions/mission-presentation";
import { INTACT_POD_PRESENTATION } from "./intact-pod-presentation";
import {
  campaignWith,
  defenceResult,
} from "./story-defence-fixtures.test-helper";
import {
  STORY_PRESENTATION,
  storyBriefingRowsOf,
  storyDebriefTaglineFor,
  storyDescriptionOf,
  typeBriefingRowsOf,
} from "./story-presentation";

// ===========================================
// Fixtures
// ===========================================

/** Intact Pod's pinned d6 crash site, landed at Cairo. */
const POD_OFFER: Mission = {
  ...missionAt("mission-5", "cairo", 7, 6),
  typeId: "crash-site",
  storyId: "intact-pod",
  pinned: true,
  act: "act-2",
  crashSite: { landingCityId: "cairo", preLandingInfestation: 0 },
};

/** An ordinary crash site at the same city. */
const PLAIN_CRASH: Mission = {
  ...POD_OFFER,
  id: "mission-6",
  storyId: undefined,
  pinned: undefined,
  act: undefined,
};

/** A played Intact Pod result ending in `outcome`, the pod as given. */
function podResult(
  outcome: MissionResult["outcome"],
  podRecovered: boolean,
  podHpLeft: number,
): MissionResult {
  return { ...defenceResult(outcome), podRecovered, podHpLeft };
}

// ===========================================
// Briefing
// ===========================================

describe("Intact Pod's briefing (#1179)", () => {
  it("is in the story table", () => {
    expect(STORY_PRESENTATION["intact-pod"]).toBe(INTACT_POD_PRESENTATION);
    expect(INTACT_POD_PRESENTATION.storyId).toBe("intact-pod");
  });

  it("says how long the pod must be kept, what a win ends and what a loss costs", () => {
    expect(
      storyBriefingRowsOf(
        POD_OFFER,
        { state: campaignWith() },
        STORY_PRESENTATION,
      ),
    ).toEqual([
      {
        field: "story-objective",
        label: "Objective",
        value: "Keep the pod alive until the recovery drop at turn 10",
      },
      { field: "story-win", label: "Win", value: "Act II ends" },
      {
        field: "story-lost",
        label: "Lost",
        value: "The pod is lost; telemetry finds another in 5 days",
      },
      {
        field: "story-landing",
        label: "Fresh landing",
        value: "Cairo · +10 now · erased once the pod is recovered",
      },
    ]);
    expect(storyDescriptionOf(POD_OFFER, STORY_PRESENTATION)).toBe(
      "Pod Telemetry tracked a spore pod down in one piece. Hold the crater until the drop ship lifts it at the end of turn 10: the swarm will go for the pod, and it cannot move.",
    );
  });

  it("drops the crash site's clock and landing rows, which describe a pod to burn, and keeps its tech bonus", () => {
    const state = campaignWith();
    const typeRows = CRASH_SITE_PRESENTATION.briefingRows(POD_OFFER, { state });
    expect(typeRows.map((row) => row.field)).toEqual([
      "pod",
      "landing",
      "tech-bonus",
    ]);
    expect(typeBriefingRowsOf(POD_OFFER, typeRows, STORY_PRESENTATION)).toEqual(
      [{ field: "tech-bonus", label: "Tech bonus", value: "TP ×1.5" }],
    );
    // An ordinary crash site keeps all three.
    const plainRows = CRASH_SITE_PRESENTATION.briefingRows(PLAIN_CRASH, {
      state,
    });
    expect(typeBriefingRowsOf(PLAIN_CRASH, plainRows, STORY_PRESENTATION)).toBe(
      plainRows,
    );
  });
});

// ===========================================
// Debrief
// ===========================================

describe("Intact Pod's debrief (#1179)", () => {
  it("says the pod is aboard and Act II is over on a win the story recorded", () => {
    expect(
      storyDebriefTaglineFor(podResult("won", true, 41), {
        state: campaignWith({ storyWon: ["intact-pod"] }),
      }),
    ).toBe(
      "The drop ship lifted the pod with 41 hp left. The lab has an intact pod, and Act II is over.",
    );
  });

  it("says what lost the pod, and when telemetry finds another", () => {
    const ctx = { state: campaignWith({ storyRetryDay: { "intact-pod": 9 } }) };
    expect(storyDebriefTaglineFor(podResult("lost", true, 30), ctx)).toBe(
      "The drop ship lifted the pod, but the force never made it home. Telemetry will find another: Intact Pod is pinned again in 5 days.",
    );
    expect(storyDebriefTaglineFor(podResult("won", false, 0), ctx)).toBe(
      "The swarm tore the pod open before the drop. Telemetry will find another: Intact Pod is pinned again in 5 days.",
    );
    expect(storyDebriefTaglineFor(podResult("extracted", false, 18), ctx)).toBe(
      "The force pulled out before the drop, and the pod was left to the swarm. Telemetry will find another: Intact Pod is pinned again in 5 days.",
    );
  });

  it("keeps quiet for a result without a pod to keep, or a win the story never recorded", () => {
    const won = { state: campaignWith({ storyWon: ["intact-pod"] }) };
    expect(storyDebriefTaglineFor(defenceResult("won"), won)).toBeUndefined();
    expect(
      storyDebriefTaglineFor(podResult("won", true, 41), {
        state: campaignWith(),
      }),
    ).toBeUndefined();
    // Nor does the crash site speak over it: its line reads podDestroyed.
    expect(debriefTaglineFor(podResult("won", true, 41), won)).toBeUndefined();
  });
});
