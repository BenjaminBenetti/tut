import { describe, expect, it } from "vitest";

import { CONTINENTS } from "../../../overworld/data/continents";
import type { GreatHive } from "../../../overworld/model/great-hive";
import type { Mission } from "../../../overworld/model/mission";
import type { GameState } from "../../../save/model/game-state";
import type { MissionPresentation } from "../../model/mission-presentation";
import {
  campaignOnDay,
  missionAt,
} from "../../view/mission-fixtures.test-helper";
import { withGreatHiveOffer } from "./great-hive-offer-presentation";
import { HIVE_ASSAULT_PRESENTATION } from "./hive-assault-presentation";
import { MISSION_PRESENTATION } from "./mission-presentation";

// ===========================================
// Fixtures
// ===========================================

/** Europe's Great Hive, raised once by a lost assault. */
const EUROPE: GreatHive = {
  id: "greathive-1",
  continentId: "europe",
  name: "Europe",
  regionId: "eastern-europe",
  regionIds: CONTINENTS.europe.regionIds,
  revealedDay: 200,
  level: 1,
};

/** An ordinary level-2 assault on the Middle East's hive. */
const ORDINARY: Mission = {
  ...missionAt("mission-1", "cairo", 9, 6),
  typeId: "hive-assault",
  hive: { hiveId: "hive-1", regionId: "middle-east", level: 2 },
  pinned: true,
};

/** The pinned assault on Europe's Great Hive. */
const GREAT: Mission = {
  ...missionAt("mission-9", "moscow", 9999, 8),
  typeId: "hive-assault",
  storyId: "great-hive",
  hive: { hiveId: EUROPE.id, regionId: EUROPE.regionId, level: 1, great: true },
  pinned: true,
};

/** Day 210, the Middle East's hive standing and Europe's Great Hive revealed. */
function campaign(greatHives: readonly GreatHive[] = [EUROPE]): GameState {
  const state = campaignOnDay(210, [ORDINARY, GREAT]);
  return {
    ...state,
    overworld: {
      ...state.overworld,
      hives: [{ id: "hive-1", regionId: "middle-east", formedDay: 5 }],
      greatHives,
    },
  };
}

// ===========================================
// Decorator
// ===========================================

describe("withGreatHiveOffer (#1179)", () => {
  it("is the table's Hive Assault entry", () => {
    const entry: MissionPresentation = MISSION_PRESENTATION["hive-assault"];
    const ctx = { state: campaign() };

    expect(entry.offerNote?.(GREAT, ctx)).toBe("Great Hive: Europe · level 1");
    expect(entry.briefingRows(GREAT, ctx)).toEqual([]);
  });

  it("shows an ordinary assault exactly as the type does", () => {
    const decorated = withGreatHiveOffer(HIVE_ASSAULT_PRESENTATION);
    const ctx = { state: campaign() };

    expect(decorated.icon).toBe(HIVE_ASSAULT_PRESENTATION.icon);
    expect(decorated.briefingFields).toBe(
      HIVE_ASSAULT_PRESENTATION.briefingFields,
    );
    expect(decorated.briefingRows(ORDINARY, ctx)).toEqual(
      HIVE_ASSAULT_PRESENTATION.briefingRows(ORDINARY, ctx),
    );
    expect(decorated.briefingRows(ORDINARY, ctx)).not.toEqual([]);
    expect(decorated.offerNote?.(ORDINARY, ctx)).toBe(
      HIVE_ASSAULT_PRESENTATION.offerNote?.(ORDINARY, ctx),
    );
  });

  it("drops the ordinary hive's rows for a Great Hive, whose story says it", () => {
    const decorated = withGreatHiveOffer(HIVE_ASSAULT_PRESENTATION);

    expect(decorated.briefingRows(GREAT, { state: campaign() })).toEqual([]);
  });

  it("names the Great Hive on the offer row, or says Great Hive when it is unknown", () => {
    const decorated = withGreatHiveOffer(HIVE_ASSAULT_PRESENTATION);

    expect(decorated.offerNote?.(GREAT, { state: campaign() })).toBe(
      "Great Hive: Europe · level 1",
    );
    expect(decorated.offerNote?.(GREAT, { state: campaign([]) })).toBe(
      "Great Hive",
    );
  });
});
