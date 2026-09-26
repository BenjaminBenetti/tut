import { describe, expect, it } from "vitest";

import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { CAMPAIGN_FLAG_SET } from "../../model/campaign-flag-set-event";
import { CITY_INFESTATION_CHANGED } from "../../model/city-infestation-changed-event";
import type { Mission } from "../../model/mission";
import type { MissionResult } from "../../model/mission-result";
import type { OverworldState } from "../../model/overworld-state";
import { hasFlag } from "../campaign-progress-service";
import { getCity } from "../earth-map-query-service";
import { setCityInfestation } from "../city-infestation-service";
import { CRASH_SITE_CONSEQUENCE, podWrecked } from "./crash-site-consequence";
import {
  fixtureState,
  missionAt,
  resultFor,
} from "./mission-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const CTX = { tuning: MISSION_TUNING, hive: HIVE_TUNING };

/** A crash site that landed at "low" (10 before the landing). */
const CRASH: Mission = {
  ...missionAt("low", 20, 15, "crash-site"),
  crashSite: { landingCityId: "low", preLandingInfestation: 10 },
};

/** The fixture overworld with the crash site's landing made: low at 20. */
function landed(): OverworldState {
  const offered = CRASH_SITE_CONSEQUENCE.onOffered?.(
    fixtureState(),
    CRASH,
    CTX,
  );
  if (offered === undefined) {
    throw new Error("the crash site rule must land its pod");
  }
  return offered.state;
}

/** A played result with the pod reported as `podDestroyed`. */
function played(
  outcome: MissionResult["outcome"],
  podDestroyed?: boolean,
): MissionResult {
  return {
    ...resultFor(CRASH, outcome, -14),
    ...(podDestroyed === undefined ? {} : { podDestroyed }),
  };
}

/** The landing city's infestation in `state`. */
function low(state: OverworldState): number {
  return getCity(state.map, "low").infestation;
}

// ===========================================
// Offered
// ===========================================

describe("CRASH_SITE_CONSEQUENCE — offered", () => {
  it("lands the pod: +10 on the landing city", () => {
    expect(low(landed())).toBe(20);
  });
});

// ===========================================
// Won
// ===========================================

describe("CRASH_SITE_CONSEQUENCE — won", () => {
  it("erases the landing, ignoring the resolver's delta, and recovers the spore sample", () => {
    const { state, events } = CRASH_SITE_CONSEQUENCE.onResolved(
      landed(),
      CRASH,
      played("won", true),
      CTX,
    );
    expect(low(state)).toBe(10);
    expect(hasFlag(state.progress, "spore-sample")).toBe(true);
    expect(events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "low", from: 20, to: 10 },
      },
      { type: CAMPAIGN_FLAG_SET, payload: { flag: "spore-sample" } },
    ]);
  });

  it("leaves a landing city that has fallen below its old value where it is", () => {
    const cooled = setCityInfestation(landed(), "low", 4).state;
    const { state, events } = CRASH_SITE_CONSEQUENCE.onResolved(
      cooled,
      CRASH,
      played("won", true),
      CTX,
    );
    expect(low(state)).toBe(4);
    expect(events.map((event) => event.type)).toEqual([CAMPAIGN_FLAG_SET]);
  });

  it("returns a clean landing city to clean, and so unseen", () => {
    const clean: Mission = {
      ...missionAt("clean", 20, 15, "crash-site"),
      crashSite: { landingCityId: "clean", preLandingInfestation: 0 },
    };
    const before = CRASH_SITE_CONSEQUENCE.onOffered?.(
      fixtureState(),
      clean,
      CTX,
    );
    expect(getCity(before?.state.map ?? fixtureState().map, "clean")).toEqual(
      expect.objectContaining({ infestation: 10, detected: true }),
    );
    const { state } = CRASH_SITE_CONSEQUENCE.onResolved(
      before?.state ?? fixtureState(),
      clean,
      played("won", true),
      CTX,
    );
    expect(getCity(state.map, "clean")).toEqual(
      expect.objectContaining({ infestation: 0, detected: false }),
    );
  });

  it("sets spore-sample on the first win only", () => {
    const first = CRASH_SITE_CONSEQUENCE.onResolved(
      landed(),
      CRASH,
      played("won", true),
      CTX,
    );
    const again = CRASH_SITE_CONSEQUENCE.onResolved(
      setCityInfestation(first.state, "low", 20).state,
      CRASH,
      played("won", true),
      CTX,
    );
    expect(again.events.map((event) => event.type)).toEqual([
      CITY_INFESTATION_CHANGED,
    ]);
    expect(
      again.state.progress.flags.filter((flag) => flag === "spore-sample"),
    ).toHaveLength(1);
  });

  it("erases an auto-resolved win's landing too: no pod reported, the outcome decides", () => {
    const { state } = CRASH_SITE_CONSEQUENCE.onResolved(
      landed(),
      CRASH,
      played("won"),
      CTX,
    );
    expect(low(state)).toBe(10);
    expect(hasFlag(state.progress, "spore-sample")).toBe(true);
  });
});

// ===========================================
// Lost, abandoned, lapsed
// ===========================================

describe("CRASH_SITE_CONSEQUENCE — lost, abandoned and lapsed", () => {
  it("roots the landing on a loss: +15 on the landing city, no sample", () => {
    const { state, events } = CRASH_SITE_CONSEQUENCE.onResolved(
      landed(),
      CRASH,
      played("lost", false),
      CTX,
    );
    expect(low(state)).toBe(35);
    expect(hasFlag(state.progress, "spore-sample")).toBe(false);
    expect(events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "low", from: 20, to: 35 },
      },
    ]);
  });

  it("roots it when the force pulls out with the pod standing", () => {
    const { state } = CRASH_SITE_CONSEQUENCE.onResolved(
      landed(),
      CRASH,
      played("extracted", false),
      CTX,
    );
    expect(low(state)).toBe(35);
  });

  it("erases the landing when the pod fell though nobody came home, without a sample", () => {
    const { state } = CRASH_SITE_CONSEQUENCE.onResolved(
      landed(),
      CRASH,
      played("lost", true),
      CTX,
    );
    expect(low(state)).toBe(10);
    expect(hasFlag(state.progress, "spore-sample")).toBe(false);
  });

  it("roots the landing when the offer lapses: +15", () => {
    const { state, events } = CRASH_SITE_CONSEQUENCE.onExpired(
      landed(),
      CRASH,
      CTX,
    );
    expect(low(state)).toBe(35);
    expect(events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "low", from: 20, to: 35 },
      },
    ]);
  });

  it("falls back to the offer's city when the offer has no landing spec", () => {
    const { crashSite: _dropped, ...bare } = CRASH;
    const { state } = CRASH_SITE_CONSEQUENCE.onExpired(
      fixtureState(),
      bare,
      CTX,
    );
    expect(low(state)).toBe(25);
    const won = CRASH_SITE_CONSEQUENCE.onResolved(
      fixtureState(),
      bare,
      played("won", true),
      CTX,
    );
    expect(low(won.state)).toBe(10);
  });
});

// ===========================================
// podWrecked
// ===========================================

describe("podWrecked", () => {
  it("reads podDestroyed, then the objectives, then the outcome", () => {
    const base = resultFor(CRASH, "extracted", 0);
    expect(podWrecked({ ...base, podDestroyed: true })).toBe(true);
    expect(podWrecked({ ...base, outcome: "won", podDestroyed: false })).toBe(
      false,
    );
    expect(
      podWrecked({
        ...base,
        objectives: [{ kind: "destroy-pod", complete: true, failed: false }],
      }),
    ).toBe(true);
    expect(
      podWrecked({
        ...base,
        objectives: [{ kind: "destroy-pod", complete: false, failed: true }],
      }),
    ).toBe(false);
    expect(podWrecked(base)).toBe(false);
    expect(podWrecked({ ...base, outcome: "won" })).toBe(true);
  });
});
