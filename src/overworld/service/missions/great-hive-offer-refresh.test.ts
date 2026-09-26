import { describe, expect, it } from "vitest";

import { ACTS } from "../../data/acts";
import type { Mission } from "../../model/mission";
import type { MissionTriggerRule } from "../../model/mission-offer-rule";
import type { OverworldState } from "../../model/overworld-state";
import { withGreatHiveRefresh } from "./great-hive-offer-refresh";
import { HIVE_ASSAULT_TRIGGER } from "./hive-assault-trigger";
import {
  fixtureState,
  missionAt,
  offerContext,
} from "./mission-fixtures.test-helper";
import { MISSION_OFFER_RULES } from "./mission-offer-rules";

// ===========================================
// Fixtures
// ===========================================

/** The fixture overworld with one Great Hive, standing unless `destroyedDay` is given. */
function withGreatHive(destroyedDay?: number): OverworldState {
  const state = fixtureState({ day: 200 });
  const [region] = state.map.regions;
  if (region === undefined) {
    throw new Error("The fixture map has a region");
  }
  return {
    ...state,
    greatHives: [
      {
        id: "greathive-1",
        continentId: "europe",
        name: "Europe",
        regionId: region.id,
        regionIds: [region.id],
        revealedDay: 190,
        level: 0,
        ...(destroyedDay === undefined ? {} : { destroyedDay }),
      },
    ],
  };
}

/** A Great Hive assault on the fixture map's first city. */
function greatOffer(state: OverworldState): Mission {
  const [city] = state.map.cities;
  if (city === undefined) {
    throw new Error("The fixture map has a city");
  }
  return {
    ...missionAt(city.id, 300, 0, "hive-assault"),
    pinned: true,
    storyId: "great-hive",
    difficulty: 8,
    hive: {
      hiveId: "greathive-1",
      regionId: city.regionId,
      level: 0,
      great: true,
    },
  };
}

/** The shipped table's hive-assault entry, which must be a trigger with a refresh. */
function shippedRule(): MissionTriggerRule {
  const rule = MISSION_OFFER_RULES["hive-assault"];
  if (rule.kind !== "trigger") {
    throw new Error("hive-assault is a trigger rule");
  }
  return rule;
}

/** `rule`'s refresh of `mission` on `state`. */
function refresh(
  rule: MissionTriggerRule,
  mission: Mission,
  state: OverworldState,
): Mission | undefined {
  if (rule.refresh === undefined) {
    throw new Error("The rule refreshes its offers");
  }
  return rule.refresh(mission, state, offerContext(1, ACTS["act-3"]));
}

// ===========================================
// The decorator
// ===========================================

describe("withGreatHiveRefresh", () => {
  it("keeps a standing Great Hive's offer by identity", () => {
    const state = withGreatHive();
    const offer = greatOffer(state);
    expect(refresh(shippedRule(), offer, state)).toBe(offer);
  });

  it("withdraws the offer once its Great Hive has fallen or is unknown", () => {
    const fallen = withGreatHive(199);
    expect(refresh(shippedRule(), greatOffer(fallen), fallen)).toBeUndefined();
    const none = fixtureState({ day: 200 });
    expect(refresh(shippedRule(), greatOffer(fallen), none)).toBeUndefined();
  });

  it("guards against the ordinary refresh, which would withdraw the Great Hive offer", () => {
    const state = withGreatHive();
    expect(
      refresh(HIVE_ASSAULT_TRIGGER, greatOffer(state), state),
    ).toBeUndefined();
  });

  it("hands ordinary Hive Assault offers to the ordinary refresh", () => {
    const state: OverworldState = {
      ...withGreatHive(),
      hives: [{ id: "hive-1", regionId: "west", formedDay: 150 }],
    };
    const [city] = state.map.cities;
    if (city === undefined) {
      throw new Error("The fixture map has a city");
    }
    const ordinary: Mission = {
      ...missionAt(city.id, 300, 0, "hive-assault"),
      pinned: true,
      hive: { hiveId: "hive-1", regionId: "west", level: 0 },
    };
    const decorated = withGreatHiveRefresh(HIVE_ASSAULT_TRIGGER);
    expect(refresh(decorated, ordinary, state)).toEqual(
      refresh(HIVE_ASSAULT_TRIGGER, ordinary, state),
    );
    const gone = { ...state, hives: [] };
    expect(refresh(decorated, ordinary, gone)).toBeUndefined();
  });
});
