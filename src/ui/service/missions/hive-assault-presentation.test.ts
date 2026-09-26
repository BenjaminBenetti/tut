import { describe, expect, it } from "vitest";

import { HIVE_TUNING } from "../../../overworld/data/hive-tuning";
import { MISSION_TUNING } from "../../../overworld/data/mission-tuning";
import type { Hive } from "../../../overworld/model/hive";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import type { GameState } from "../../../save/model/game-state";
import {
  campaignOnDay,
  missionAt,
} from "../../view/mission-fixtures.test-helper";
import {
  createHiveAssaultPresentation,
  HIVE_ASSAULT_PRESENTATION,
} from "./hive-assault-presentation";
import {
  debriefTaglineFor,
  MISSION_PRESENTATION,
} from "./mission-presentation";

// ===========================================
// Fixtures
// ===========================================

/** A level-2 assault on the Middle East's hive, hosted at Cairo. */
const ASSAULT: Mission = {
  ...missionAt("mission-1", "cairo", 9, 6),
  typeId: "hive-assault",
  hive: { hiveId: "hive-1", regionId: "middle-east", level: 2 },
  pinned: true,
};

/** The Middle East's hive, formed on day 5. */
const HIVE: Hive = { id: "hive-1", regionId: "middle-east", formedDay: 5 };

/** The campaign on `day` with `hives` standing. */
function campaign(day: number, hives: readonly Hive[] = [HIVE]): GameState {
  const state = campaignOnDay(day, [ASSAULT]);
  return { ...state, overworld: { ...state.overworld, hives } };
}

/** An assault's result with `outcome`, the core fallen or not. */
function result(
  outcome: MissionResult["outcome"],
  hiveCoreDestroyed: boolean,
): MissionResult {
  return {
    missionId: ASSAULT.id,
    cityId: "cairo",
    outcome,
    squadCasualties: [],
    squadsWiped: [],
    mechsDestroyed: [],
    mechDamage: [],
    creditsAwarded: 0,
    techPointsAwarded: 0,
    infestationDelta: 0,
    hiveCoreDestroyed,
  };
}

// ===========================================
// Table
// ===========================================

describe("HIVE_ASSAULT_PRESENTATION", () => {
  it("is the table's entry for the type, under the hive glyph", () => {
    // The table wraps it for Great Hives (#1179); an ordinary assault is
    // shown exactly as this presentation shows it.
    const entry = MISSION_PRESENTATION["hive-assault"];
    const ctx = { state: campaign(20) };
    expect(entry.icon).toBe(HIVE_ASSAULT_PRESENTATION.icon);
    expect(entry.briefingRows(ASSAULT, ctx)).toEqual(
      HIVE_ASSAULT_PRESENTATION.briefingRows(ASSAULT, ctx),
    );
    expect(entry.offerNote?.(ASSAULT, ctx)).toBe(
      HIVE_ASSAULT_PRESENTATION.offerNote?.(ASSAULT, ctx),
    );
    expect(HIVE_ASSAULT_PRESENTATION.icon).toBe("marker-hive");
  });
});

// ===========================================
// Briefing
// ===========================================

describe("the Hive Assault briefing", () => {
  it("names the level, the region a win liberates and the tech multiplier", () => {
    expect(
      HIVE_ASSAULT_PRESENTATION.briefingRows(ASSAULT, { state: campaign(20) }),
    ).toEqual([
      {
        field: "hive-level",
        label: "Hive level",
        value: "2 (+1 every 7 days)",
      },
      {
        field: "liberates",
        label: "Liberates",
        value: "Middle East: cities −20, growth paused 10 days",
      },
      {
        field: "tech-multiplier",
        label: "Tech multiplier",
        value: "×2, in the reward",
      },
    ]);
  });

  it("quotes the tuning it is built with", () => {
    const presentation = createHiveAssaultPresentation({
      hive: {
        difficultyStepDays: 5,
        liberationCut: 30,
        liberationGrowthPauseDays: 4,
      },
      assault: { techRewardMultiplier: 1.5 },
    });

    expect(
      presentation
        .briefingRows(ASSAULT, { state: campaign(20) })
        .map((row) => row.value),
    ).toEqual([
      "2 (+1 every 5 days)",
      "Middle East: cities −30, growth paused 4 days",
      "×1.5, in the reward",
    ]);
  });

  it("adds nothing to an offer that carries no hive", () => {
    const { hive: _dropped, ...bare } = ASSAULT;

    expect(
      HIVE_ASSAULT_PRESENTATION.briefingRows(bare, { state: campaign(20) }),
    ).toEqual([]);
  });
});

// ===========================================
// Offer row
// ===========================================

describe("the Hive Assault offer note", () => {
  const note = (state: GameState): string | undefined =>
    HIVE_ASSAULT_PRESENTATION.offerNote?.(ASSAULT, { state });

  it("says the level and how many days until the hive next grows", () => {
    // Formed on day 5: it grows on days 12, 19, 26 …
    expect(note(campaign(20))).toBe("Hive level 2 · grows in 6 d");
    expect(note(campaign(25))).toBe("Hive level 2 · grows in 1 d");
    expect(note(campaign(26))).toBe("Hive level 2 · grows in 7 d");
  });

  it("shows the level alone once the hive is gone", () => {
    expect(note(campaign(20, []))).toBe("Hive level 2");
  });

  it("is absent on an offer that carries no hive", () => {
    const { hive: _dropped, ...bare } = ASSAULT;

    expect(
      HIVE_ASSAULT_PRESENTATION.offerNote?.(bare, { state: campaign(20) }),
    ).toBeUndefined();
  });
});

// ===========================================
// Debrief
// ===========================================

describe("the Hive Assault debrief", () => {
  const ctx = { state: campaign(20, []) };

  it("says the region is liberated on a win", () => {
    expect(debriefTaglineFor(result("won", true), ctx)).toBe(
      "The hive core is destroyed. Middle East is liberated: its cities are cleared by 20 and the bugs are held back for 10 days.",
    );
  });

  it("says the hive stands on every other outcome", () => {
    expect(debriefTaglineFor(result("extracted", false), ctx)).toBe(
      "The force pulled out with the hive core still standing. The hive grows on.",
    );
    expect(debriefTaglineFor(result("lost", true), ctx)).toBe(
      "The hive core fell, but nobody reached the drop ship. Without a confirmed kill the hive stands.",
    );
    expect(debriefTaglineFor(result("lost", false), ctx)).toBe(
      "The assault failed and the hive stands. It grows every 7 days.",
    );
  });

  it("leaves any other mission's result to the other types", () => {
    const { hiveCoreDestroyed: _dropped, ...other } = result("won", true);

    expect(
      HIVE_ASSAULT_PRESENTATION.debriefTagline?.(other, ctx),
    ).toBeUndefined();
  });

  it("reads the tuning's numbers", () => {
    expect(HIVE_TUNING.liberationCut).toBe(20);
    expect(HIVE_TUNING.liberationGrowthPauseDays).toBe(10);
    expect(MISSION_TUNING.hiveAssault.techRewardMultiplier).toBe(2);
  });
});
