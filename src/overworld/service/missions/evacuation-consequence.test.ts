import { describe, expect, it } from "vitest";

import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import type { Mission } from "../../model/mission";
import type {
  MissionResult,
  ObjectiveResult,
} from "../../model/mission-result";
import type { OverworldState } from "../../model/overworld-state";
import {
  EVACUATION_CONSEQUENCE,
  EVACUATION_LOST_SOURCE,
  EVACUATION_SAVED_SOURCE,
  evacueesSaved,
} from "./evacuation-consequence";
import { MISSION_CONSEQUENCE_RULES } from "./mission-consequence-rules";
import {
  fixtureState,
  missionAt,
  resultFor,
} from "./mission-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const CTX = { tuning: MISSION_TUNING, hive: HIVE_TUNING };

/** A d3 evacuation at "mid" with four groups at 100 credits each. */
const EVACUATION: Mission = {
  ...missionAt("mid", 20, 0, "evacuation"),
  evacuation: { groups: 4, creditsPerGroup: 100 },
};

/** The rescue objective's row with `done` of 4 groups aboard. */
function rescueRow(done: number, complete: boolean): ObjectiveResult {
  return {
    kind: "rescue-civilians",
    complete,
    failed: false,
    done,
    total: 4,
  };
}

/**
 * A played result: `outcome`, 900 credits and a −14 delta from the
 * resolver, `rescued` of four groups aboard with the rescue row
 * `complete`.
 */
function played(
  outcome: MissionResult["outcome"],
  rescued: number,
  complete: boolean,
): MissionResult {
  return {
    ...resultFor(EVACUATION, outcome, -14),
    creditsAwarded: 900,
    civiliansRescued: rescued,
    civiliansTotal: 4,
    objectives: [rescueRow(rescued, complete)],
  };
}

/** `onResolved` on the fixture overworld, returning the next state. */
function resolved(result: MissionResult, state = fixtureState()) {
  return EVACUATION_CONSEQUENCE.onResolved(state, EVACUATION, result, CTX);
}

// ===========================================
// Tests
// ===========================================

describe("EVACUATION_CONSEQUENCE (arc §6.4)", () => {
  it("is the evacuation's entry in the shipped table", () => {
    expect(MISSION_CONSEQUENCE_RULES.evacuation).toBe(EVACUATION_CONSEQUENCE);
    expect(EVACUATION_CONSEQUENCE.typeId).toBe("evacuation");
    expect("onOffered" in EVACUATION_CONSEQUENCE).toBe(false);
  });

  it("pays the outcome's credits plus 100 for each group aboard, and moves no city", () => {
    /** The rule's settlement of `result` for the fixture offer. */
    const settle = (_: Mission, result: MissionResult, ctx: typeof CTX) => {
      const settled = EVACUATION_CONSEQUENCE.settle?.(EVACUATION, result, ctx);
      if (settled === undefined) throw new Error("the evacuation settles");
      return settled;
    };
    expect(settle(EVACUATION, played("won", 3, true), CTX)).toEqual({
      creditsAwarded: 900 + 3 * 100,
      infestationDelta: 0,
    });
    // A group flown out is flown out, whatever became of the rest.
    expect(settle(EVACUATION, played("lost", 1, false), CTX)).toEqual({
      creditsAwarded: 900 + 100,
      infestationDelta: 0,
    });
    // Auto-resolved: no groups reported, no per-group extra.
    expect(settle(EVACUATION, resultFor(EVACUATION, "won", -14), CTX)).toEqual({
      creditsAwarded: 0,
      infestationDelta: 0,
    });
  });

  it("lifts the stipend by half for ten days when the city is saved", () => {
    const before = fixtureState();
    const { state, events } = resolved(played("won", 2, true), before);
    expect(state.stipendModifiers).toEqual([
      { factor: 1.5, daysLeft: 10, source: EVACUATION_SAVED_SOURCE },
    ]);
    expect(events).toEqual([]);
    // Nothing else moves: the city keeps its infestation.
    expect(state.map).toBe(before.map);
  });

  it("cuts the stipend by a tenth for ten days when it is lost", () => {
    for (const result of [
      played("lost", 0, false),
      played("extracted", 1, false),
    ]) {
      expect(resolved(result).state.stipendModifiers).toEqual([
        { factor: 0.9, daysLeft: 10, source: EVACUATION_LOST_SOURCE },
      ]);
    }
  });

  it("cuts the stipend by a tenth for ten days when it is ignored", () => {
    const { state, events } = EVACUATION_CONSEQUENCE.onExpired(
      fixtureState(),
      EVACUATION,
      CTX,
    );
    expect(state.stipendModifiers).toEqual([
      { factor: 0.9, daysLeft: 10, source: EVACUATION_LOST_SOURCE },
    ]);
    expect(events).toEqual([]);
  });

  it("refreshes a second saved window rather than stacking it, and keeps others", () => {
    const before: OverworldState = fixtureState({
      stipendModifiers: [
        { factor: 1.5, daysLeft: 3, source: EVACUATION_SAVED_SOURCE },
        { factor: 0.9, daysLeft: 6, source: EVACUATION_LOST_SOURCE },
        { factor: 0.5, daysLeft: 2 },
      ],
    });
    expect(
      resolved(played("won", 4, true), before).state.stipendModifiers,
    ).toEqual([
      { factor: 0.9, daysLeft: 6, source: EVACUATION_LOST_SOURCE },
      { factor: 0.5, daysLeft: 2 },
      { factor: 1.5, daysLeft: 10, source: EVACUATION_SAVED_SOURCE },
    ]);
  });
});

describe("evacueesSaved", () => {
  it("reads the rescue objective: half the groups aboard is saved, fewer is not", () => {
    expect(evacueesSaved(played("won", 2, true))).toBe(true);
    expect(evacueesSaved(played("extracted", 1, false))).toBe(false);
  });

  it("counts a completed rescue as saved even when the force was lost", () => {
    expect(evacueesSaved(played("lost", 3, true))).toBe(true);
  });

  it("falls back on the outcome when the mission was auto-resolved", () => {
    expect(evacueesSaved(resultFor(EVACUATION, "won", -14))).toBe(true);
    expect(evacueesSaved(resultFor(EVACUATION, "extracted", 0))).toBe(false);
    expect(evacueesSaved(resultFor(EVACUATION, "lost", 5))).toBe(false);
  });
});
