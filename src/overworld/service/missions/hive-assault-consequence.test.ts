import { describe, expect, it } from "vitest";

import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { CAMPAIGN_FLAG_SET } from "../../model/campaign-flag-set-event";
import { CITY_INFESTATION_CHANGED } from "../../model/city-infestation-changed-event";
import type { Hive } from "../../model/hive";
import type { Mission } from "../../model/mission";
import type { MissionConsequenceContext } from "../../model/mission-consequence-rule";
import type { OverworldState } from "../../model/overworld-state";
import { REGION_LIBERATED } from "../../model/region-liberated-event";
import { getCity } from "../earth-map-query-service";
import {
  HIVE_ASSAULT_CONSEQUENCE,
  HIVE_CORE_SAMPLE_FLAG,
} from "./hive-assault-consequence";
import {
  fixtureState,
  missionAt,
  resultFor,
} from "./mission-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const CTX: MissionConsequenceContext = {
  tuning: MISSION_TUNING,
  hive: HIVE_TUNING,
};

/** The east hive (mid 50, full 100) and the day-20 overworld it stands in. */
const HIVE: Hive = { id: "hive-1", regionId: "east", formedDay: 5 };

/** A second hive, in the west (clean 0, low 10). */
const WEST_HIVE: Hive = { id: "hive-2", regionId: "west", formedDay: 5 };

/** The assault on `hive`, hosted at `cityId`. */
function assault(hive: Hive = HIVE, cityId = "full"): Mission {
  return {
    ...missionAt(cityId, 99, 0, "hive-assault"),
    pinned: true,
    hive: { hiveId: hive.id, regionId: hive.regionId, level: 2 },
  };
}

/** The overworld on day 20 with both hives standing. */
function world(): OverworldState {
  return fixtureState({ day: 20, hives: [HIVE, WEST_HIVE] });
}

/** Infestation of `cityId` in `state`. */
function infestation(state: OverworldState, cityId: string): number {
  return getCity(state.map, cityId).infestation;
}

// ===========================================
// Won
// ===========================================

describe("HIVE_ASSAULT_CONSEQUENCE — won", () => {
  it("liberates the hive's region: hive gone, cities −20, growth paused", () => {
    const mission = assault();
    const { state } = HIVE_ASSAULT_CONSEQUENCE.onResolved(
      world(),
      mission,
      resultFor(mission, "won", 0),
      CTX,
    );

    expect(state.hives).toEqual([WEST_HIVE]);
    expect(infestation(state, "mid")).toBe(30);
    expect(infestation(state, "full")).toBe(80);
    expect(infestation(state, "low")).toBe(10);
    expect(state.growthPausedUntil).toEqual({ east: 31 });
  });

  it("applies the resolver's delta to the host before the liberation cut", () => {
    const mission = assault();
    const { state, events } = HIVE_ASSAULT_CONSEQUENCE.onResolved(
      world(),
      mission,
      resultFor(mission, "won", -16),
      CTX,
    );

    expect(infestation(state, "full")).toBe(64);
    expect(infestation(state, "mid")).toBe(30);
    expect(events.map((event) => event.type)).toEqual([
      CITY_INFESTATION_CHANGED,
      CITY_INFESTATION_CHANGED,
      CITY_INFESTATION_CHANGED,
      REGION_LIBERATED,
      CAMPAIGN_FLAG_SET,
    ]);
    expect(events).toContainEqual({
      type: REGION_LIBERATED,
      payload: { hiveId: "hive-1", regionId: "east", pausedUntilDay: 31 },
    });
  });

  it("recovers the hive core sample on the first win only", () => {
    const first = assault();
    const once = HIVE_ASSAULT_CONSEQUENCE.onResolved(
      world(),
      first,
      resultFor(first, "won", 0),
      CTX,
    );
    expect(once.state.progress.flags).toEqual([HIVE_CORE_SAMPLE_FLAG]);
    expect(once.events).toContainEqual({
      type: CAMPAIGN_FLAG_SET,
      payload: { flag: "hive-core-sample" },
    });

    const second = assault(WEST_HIVE, "low");
    const twice = HIVE_ASSAULT_CONSEQUENCE.onResolved(
      once.state,
      second,
      resultFor(second, "won", 0),
      CTX,
    );
    expect(twice.state.hives).toEqual([]);
    expect(twice.state.progress.flags).toEqual([HIVE_CORE_SAMPLE_FLAG]);
    expect(twice.events.map((event) => event.type)).not.toContain(
      CAMPAIGN_FLAG_SET,
    );
  });

  it("liberates nothing, and announces nothing, for a hive already gone", () => {
    const mission = assault();
    const gone = { ...world(), hives: [WEST_HIVE] };

    const { state, events } = HIVE_ASSAULT_CONSEQUENCE.onResolved(
      gone,
      mission,
      resultFor(mission, "won", 0),
      CTX,
    );

    expect(state.map).toBe(gone.map);
    expect(events.map((event) => event.type)).toEqual([CAMPAIGN_FLAG_SET]);
  });

  it("reads the cut and the pause from the hive tuning", () => {
    const mission = assault();
    const { state } = HIVE_ASSAULT_CONSEQUENCE.onResolved(
      world(),
      mission,
      resultFor(mission, "won", 0),
      {
        ...CTX,
        hive: {
          ...HIVE_TUNING,
          liberationCut: 5,
          liberationGrowthPauseDays: 3,
        },
      },
    );

    expect(infestation(state, "mid")).toBe(45);
    expect(state.growthPausedUntil).toEqual({ east: 24 });
  });
});

// ===========================================
// Lost, extracted, lapsed
// ===========================================

describe("HIVE_ASSAULT_CONSEQUENCE — not won", () => {
  it("leaves the hive standing on a loss, with the small loss penalty on the host", () => {
    const mission = assault(HIVE, "mid");
    const { state, events } = HIVE_ASSAULT_CONSEQUENCE.onResolved(
      world(),
      mission,
      resultFor(mission, "lost", 5),
      CTX,
    );

    expect(state.hives).toEqual([HIVE, WEST_HIVE]);
    expect(infestation(state, "mid")).toBe(55);
    expect(state.progress.flags).toEqual([]);
    expect(state.growthPausedUntil).toBeUndefined();
    expect(events.map((event) => event.type)).toEqual([
      CITY_INFESTATION_CHANGED,
    ]);
  });

  it("leaves the hive standing when the squad pulls out", () => {
    const mission = assault();
    const before = world();
    const { state } = HIVE_ASSAULT_CONSEQUENCE.onResolved(
      before,
      mission,
      resultFor(mission, "extracted", 0),
      CTX,
    );

    expect(state.hives).toEqual(before.hives);
    expect(state.progress.flags).toEqual([]);
  });

  it("costs nothing when an offer lapses, since a pinned offer never does", () => {
    const before = world();

    expect(HIVE_ASSAULT_CONSEQUENCE.onExpired(before, assault(), CTX)).toEqual({
      state: before,
      events: [],
    });
  });
});
