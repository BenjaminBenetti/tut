import { describe, expect, it } from "vitest";

import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { CITY_INFESTATION_CHANGED } from "../../model/city-infestation-changed-event";
import type { MissionConsequenceContext } from "../../model/mission-consequence-rule";
import type { OverworldState } from "../../model/overworld-state";
import { INFESTATION_CLEARANCE_CONSEQUENCE } from "./infestation-clearance-consequence";
import {
  boardMap,
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

/** A one-city board with c0 at `infestation`, and a clearance on it. */
function cityAt(infestation: number): OverworldState {
  return fixtureState({ map: boardMap([infestation]) });
}

const CLEARANCE = missionAt("c0", 9);

/** c0's infestation in `state`. */
function c0(state: OverworldState): number | undefined {
  return state.map.cities.find((city) => city.id === "c0")?.infestation;
}

// ===========================================
// Played
// ===========================================

describe("INFESTATION_CLEARANCE_CONSEQUENCE.onResolved", () => {
  it("applies the resolver's cut on a win and emits the change", () => {
    const state = cityAt(50);
    const { state: next, events } =
      INFESTATION_CLEARANCE_CONSEQUENCE.onResolved(
        state,
        CLEARANCE,
        resultFor(CLEARANCE, "won", -16),
        CTX,
      );
    expect(c0(next)).toBe(34);
    expect(events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "c0", from: 50, to: 34 },
      },
    ]);
    expect(c0(state)).toBe(50);
  });

  it("mops up a won city left at 14, in one change to 0 (arc §5)", () => {
    const { state, events } = INFESTATION_CLEARANCE_CONSEQUENCE.onResolved(
      cityAt(30),
      CLEARANCE,
      resultFor(CLEARANCE, "won", -16),
      CTX,
    );
    expect(c0(state)).toBe(0);
    expect(state.map.cities[0]?.detected).toBe(false);
    expect(events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "c0", from: 30, to: 0 },
      },
    ]);
  });

  it("does not mop up a won city left at 15", () => {
    const { state, events } = INFESTATION_CLEARANCE_CONSEQUENCE.onResolved(
      cityAt(31),
      CLEARANCE,
      resultFor(CLEARANCE, "won", -16),
      CTX,
    );
    expect(c0(state)).toBe(15);
    expect(events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "c0", from: 31, to: 15 },
      },
    ]);
  });

  it("never mops up after an extraction or a loss", () => {
    const extracted = INFESTATION_CLEARANCE_CONSEQUENCE.onResolved(
      cityAt(12),
      CLEARANCE,
      resultFor(CLEARANCE, "extracted", 0),
      CTX,
    );
    expect(c0(extracted.state)).toBe(12);
    expect(extracted.events).toEqual([]);

    const lost = INFESTATION_CLEARANCE_CONSEQUENCE.onResolved(
      cityAt(4),
      CLEARANCE,
      resultFor(CLEARANCE, "lost", 5),
      CTX,
    );
    expect(c0(lost.state)).toBe(9);
  });

  it("reads the threshold from the tuning", () => {
    const off: MissionConsequenceContext = {
      tuning: {
        ...MISSION_TUNING,
        clearance: { ...MISSION_TUNING.clearance, mopUpBelow: 0 },
      },
      hive: HIVE_TUNING,
    };
    const { state } = INFESTATION_CLEARANCE_CONSEQUENCE.onResolved(
      cityAt(30),
      CLEARANCE,
      resultFor(CLEARANCE, "won", -16),
      off,
    );
    expect(c0(state)).toBe(14);
  });

  it("clamps a loss at maximum infestation and emits nothing then", () => {
    const state = cityAt(100);
    const applied = INFESTATION_CLEARANCE_CONSEQUENCE.onResolved(
      state,
      CLEARANCE,
      resultFor(CLEARANCE, "lost", 5),
      CTX,
    );
    expect(applied.state).toBe(state);
    expect(applied.events).toEqual([]);
  });
});

// ===========================================
// Lapsed
// ===========================================

describe("INFESTATION_CLEARANCE_CONSEQUENCE.onExpired", () => {
  it("adds the offer's frozen ignore penalty to its city", () => {
    const { state, events } = INFESTATION_CLEARANCE_CONSEQUENCE.onExpired(
      cityAt(50),
      missionAt("c0", 5, 10),
      CTX,
    );
    expect(c0(state)).toBe(60);
    expect(events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "c0", from: 50, to: 60 },
      },
    ]);
  });
});
