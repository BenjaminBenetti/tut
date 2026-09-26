import { describe, expect, it } from "vitest";

import { CONTINENTS } from "../../../overworld/data/continents";
import type { GreatHive } from "../../../overworld/model/great-hive";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import type { GameState } from "../../../save/model/game-state";
import {
  campaignOnDay,
  missionAt,
} from "../../view/mission-fixtures.test-helper";
import {
  createGreatHivePresentation,
  GREAT_HIVE_PRESENTATION,
  greatHiveTargetText,
} from "./great-hive-presentation";
import {
  STORY_PRESENTATION,
  storyBriefingRowsOf,
  storyDebriefTaglineFor,
  storyDescriptionOf,
} from "./story-presentation";

// ===========================================
// Fixtures
// ===========================================

/** The Great Hive under Europe, seated in Eastern Europe. */
const EUROPE: GreatHive = {
  id: "greathive-1",
  continentId: "europe",
  name: "Europe",
  regionId: "eastern-europe",
  regionIds: CONTINENTS.europe.regionIds,
  revealedDay: 200,
  level: 0,
};

/** The two other Great Hives, standing. */
const ASIA: GreatHive = {
  ...EUROPE,
  id: "greathive-2",
  continentId: "asia",
  name: "Asia",
  regionId: "north-asia",
  regionIds: CONTINENTS.asia.regionIds,
};
const OCEANIA: GreatHive = {
  ...EUROPE,
  id: "greathive-3",
  continentId: "oceania",
  name: "Oceania",
  regionId: "oceania",
  regionIds: CONTINENTS.oceania.regionIds,
};

/** The pinned assault on Europe's Great Hive. */
const ASSAULT: Mission = {
  ...missionAt("mission-9", "moscow", 9999, 8),
  typeId: "hive-assault",
  storyId: "great-hive",
  hive: {
    hiveId: EUROPE.id,
    regionId: EUROPE.regionId,
    level: 0,
    great: true,
  },
  pinned: true,
};

/** The campaign on day 210 with `hives` revealed. */
function campaign(hives: readonly GreatHive[] | undefined): GameState {
  const state = campaignOnDay(210, [ASSAULT]);
  return {
    ...state,
    overworld: {
      ...state.overworld,
      ...(hives === undefined ? {} : { greatHives: hives }),
    },
  };
}

/** The assault's result with `outcome`. */
function result(
  outcome: MissionResult["outcome"],
  missionId = ASSAULT.id,
): MissionResult {
  return {
    missionId,
    cityId: "moscow",
    outcome,
    squadCasualties: [],
    squadsWiped: [],
    mechsDestroyed: [],
    mechDamage: [],
    creditsAwarded: 0,
    techPointsAwarded: 0,
    infestationDelta: 0,
    hiveCoreDestroyed: outcome === "won",
  };
}

// ===========================================
// Briefing
// ===========================================

describe("the Great Hive briefing (#1179)", () => {
  it("is in the story table and replaces the type's description", () => {
    expect(STORY_PRESENTATION["great-hive"]).toBe(GREAT_HIVE_PRESENTATION);
    expect(storyDescriptionOf(ASSAULT, STORY_PRESENTATION)).toMatch(
      /^Uplink traced the Spore Platform's beacons to three Great Hives\./,
    );
  });

  it("names the target, the objective, the continent it frees and the beacon tally", () => {
    const state = campaign([EUROPE, { ...ASIA, destroyedDay: 205 }, OCEANIA]);

    expect(storyBriefingRowsOf(ASSAULT, { state }, STORY_PRESENTATION)).toEqual(
      [
        {
          field: "great-hive-target",
          label: "Target",
          value: "Great Hive: Europe",
        },
        {
          field: "great-hive-objective",
          label: "Objective",
          value: "Destroy the core; the beacon falls with it",
        },
        {
          field: "great-hive-liberates",
          label: "Liberates",
          value: "Europe, 4 regions: cities −20, growth paused 10 days",
        },
        {
          field: "great-hive-beacons",
          label: "Beacons",
          value: "Great Hives destroyed: 1 / 3",
        },
        {
          field: "great-hive-win",
          label: "Win",
          value: "All three: the launch window opens",
        },
      ],
    );
  });

  it("quotes the tuning it is built with, and the level a lost assault raised", () => {
    const presentation = createGreatHivePresentation({
      hive: { liberationCut: 35, liberationGrowthPauseDays: 6 },
      greatHive: { count: 3, maxLevel: 2 },
    });
    const state = campaign([
      { ...EUROPE, level: 1, regionIds: ["eastern-europe"] },
      ASIA,
      OCEANIA,
    ]);

    expect(
      presentation.briefingRows(ASSAULT, { state }).map((row) => row.value),
    ).toEqual([
      "Great Hive: Europe · level 1",
      "Destroy the core; the beacon falls with it",
      "Europe, 1 region: cities −35, growth paused 6 days",
      "Great Hives destroyed: 0 / 3",
      "All three: the launch window opens",
    ]);
  });

  it("adds nothing when the offer names no Great Hive the campaign knows", () => {
    expect(
      GREAT_HIVE_PRESENTATION.briefingRows(ASSAULT, {
        state: campaign(undefined),
      }),
    ).toEqual([]);
    const { hive: _dropped, ...bare } = ASSAULT;
    expect(
      GREAT_HIVE_PRESENTATION.briefingRows(bare, {
        state: campaign([EUROPE, ASIA, OCEANIA]),
      }),
    ).toEqual([]);
  });

  it("writes the target text the offer row shares", () => {
    expect(greatHiveTargetText(EUROPE)).toBe("Great Hive: Europe");
    expect(greatHiveTargetText({ ...EUROPE, level: 2 })).toBe(
      "Great Hive: Europe · level 2",
    );
  });
});

// ===========================================
// Debrief
// ===========================================

describe("the Great Hive debrief (#1179)", () => {
  const tagline = (state: GameState, of: MissionResult) =>
    storyDebriefTaglineFor(of, { state });

  it("says the beacon is dark and counts what is left after a win", () => {
    const state = campaign([
      { ...EUROPE, destroyedDay: 210, lastAssaultId: ASSAULT.id },
      ASIA,
      OCEANIA,
    ]);

    expect(tagline(state, result("won"))).toBe(
      "The Great Hive under Europe is destroyed, and its beacon with it. Europe is liberated. Great Hives destroyed: 1 / 3.",
    );
  });

  it("says the launch window opens when the third falls", () => {
    const state = campaign([
      { ...EUROPE, destroyedDay: 210, lastAssaultId: ASSAULT.id },
      { ...ASIA, destroyedDay: 204 },
      { ...OCEANIA, destroyedDay: 207 },
    ]);

    expect(tagline(state, result("won"))).toBe(
      "The Great Hive under Europe is destroyed, and its beacon with it. Europe is liberated. All three beacons are dark: the launch window opens.",
    );
  });

  it("says it still stands, how strong it grew and when it is pinned again after a loss", () => {
    const lost = campaign([
      { ...EUROPE, level: 1, retryDay: 215, lastAssaultId: ASSAULT.id },
      ASIA,
      OCEANIA,
    ]);
    const capped = campaign([
      { ...EUROPE, level: 2, retryDay: 215, lastAssaultId: ASSAULT.id },
      ASIA,
      OCEANIA,
    ]);

    expect(tagline(lost, result("lost"))).toBe(
      "The Great Hive under Europe still stands. It grows to level 1: a tougher core and one more guard. The assault is pinned again in 5 days.",
    );
    expect(tagline(capped, result("extracted"))).toBe(
      "The Great Hive under Europe still stands. It stands at level 2, as strong as it grows. The assault is pinned again in 5 days.",
    );
  });

  it("says nothing of a result that assaulted no Great Hive", () => {
    const state = campaign([
      { ...EUROPE, destroyedDay: 210, lastAssaultId: ASSAULT.id },
      ASIA,
      OCEANIA,
    ]);

    expect(
      GREAT_HIVE_PRESENTATION.debriefTagline?.(result("won", "mission-1"), {
        state,
      }),
    ).toBeUndefined();
    expect(
      GREAT_HIVE_PRESENTATION.debriefTagline?.(result("won"), {
        state: campaign(undefined),
      }),
    ).toBeUndefined();
  });
});
