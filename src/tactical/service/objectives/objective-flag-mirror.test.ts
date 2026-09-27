import { describe, expect, it } from "vitest";

import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type {
  Objective,
  StripWreckObjective,
  TacticalState,
} from "../../model/tactical-state";
import {
  ctxWith,
  missionWith,
  openField,
  riggedRng,
} from "../tactical-fixtures.test-helper";
import { createObjectiveFlagMirror } from "./objective-flag-mirror";

// ===========================================
// Fixtures
// ===========================================

const CTX = ctxWith(riggedRng(true));

const STRIP: StripWreckObjective = {
  id: "strip",
  kind: "strip-wreck",
  targetId: "wreck-1",
  turnsNeeded: 2,
  turnsWorked: 0,
  workedBy: [],
  complete: false,
};

/** Another kind's objective, which a strip mirror must never touch. */
const NEST: Objective = {
  id: "nest",
  kind: "destroy-spawner",
  targetId: "spawner-1",
  complete: false,
};

/** A mission holding `objectives` on the open field. */
function missionOf(...objectives: readonly Objective[]): TacticalState {
  return missionWith(openField().build(), [], { objectives });
}

/** A strip mirror whose live rule answers `complete` and `failed` as given. */
function mirrorSaying(complete: boolean, failed: boolean) {
  return createObjectiveFlagMirror({
    kind: "strip-wreck",
    /** The fixed answer. */
    complete: () => complete,
    /** The fixed answer. */
    failed: () => failed,
  });
}

// ===========================================
// createObjectiveFlagMirror
// ===========================================

describe("createObjectiveFlagMirror (#1179)", () => {
  it("records a live completion on the flags and announces it", () => {
    const applied = mirrorSaying(true, false)(missionOf(NEST, STRIP), CTX);
    expect(applied.state.objectives).toEqual([
      NEST,
      { ...STRIP, complete: true, failed: false },
    ]);
    expect(applied.events).toEqual([
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: "strip", complete: true, failed: false },
      },
    ]);
  });

  it("records a live failure on the flags and announces it", () => {
    const applied = mirrorSaying(false, true)(missionOf(STRIP), CTX);
    expect(applied.state.objectives).toEqual([
      { ...STRIP, complete: false, failed: true },
    ]);
    expect(applied.events).toEqual([
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: "strip", complete: false, failed: true },
      },
    ]);
  });

  it("never sets both, and never takes a flag back", () => {
    const done = missionOf({ ...STRIP, complete: true, failed: false });
    const lost = missionOf({ ...STRIP, complete: false, failed: true });
    for (const mission of [done, lost]) {
      for (const [complete, failed] of [
        [true, true],
        [false, false],
        [true, false],
        [false, true],
      ] as const) {
        const applied = mirrorSaying(complete, failed)(mission, CTX);
        expect(applied.state).toBe(mission);
        expect(applied.events).toEqual([]);
      }
    }
  });

  it("prefers complete when the live rule says both", () => {
    const applied = mirrorSaying(true, true)(missionOf(STRIP), CTX);
    expect(applied.state.objectives).toEqual([
      { ...STRIP, complete: true, failed: false },
    ]);
  });

  it("returns the mission itself when nothing moved or no objective is of its kind", () => {
    const open = missionOf(STRIP);
    expect(mirrorSaying(false, false)(open, CTX)).toEqual({
      state: open,
      events: [],
    });
    expect(mirrorSaying(false, false)(open, CTX).state).toBe(open);
    const other = missionOf(NEST);
    expect(mirrorSaying(true, true)(other, CTX).state).toBe(other);
  });
});
