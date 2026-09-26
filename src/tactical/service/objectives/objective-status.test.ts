import { describe, expect, it } from "vitest";

import type {
  DefendGeneratorsObjective,
  DestroySpawnerObjective,
  Objective,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import {
  missionWith,
  openField,
  unitAt,
} from "../tactical-fixtures.test-helper";
import {
  objectiveComplete,
  objectiveFailed,
  objectiveResultFields,
  objectiveResults,
} from "./objective-status";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number) => ({ x, y: 0, z });

/** A generator unit with `hp` left; zero is a generator down. */
function generatorAt(id: string, x: number, z: number, hp = 40): Unit {
  return { ...unitAt(id, "infantry", at(x, z), { hp }), kind: "generator" };
}

const SPAWNER_OBJECTIVE: DestroySpawnerObjective = {
  id: "objective-1",
  kind: "destroy-spawner",
  targetId: "spawner-1",
  complete: false,
};

const DEFENCE: DefendGeneratorsObjective = {
  id: "objective-2",
  kind: "defend-generators",
  installation: "sensor-array",
  targetIds: ["gen-1", "gen-2"],
  complete: false,
  failed: false,
};

/**
 * A mission with `objectives`, one running and one downed generator, no
 * bugs, and every one of its `totalWaves` waves landed: a defence here
 * is held by its live rule.
 */
function missionHolding(objectives: readonly Objective[]): TacticalState {
  return missionWith(
    openField().build(),
    [
      unitAt("unit-1", "infantry", at(1, 1)),
      generatorAt("gen-1", 3, 3, 40),
      generatorAt("gen-2", 4, 4, 0),
    ],
    { objectives, edgeSpawn: { nextTurn: 9, wave: 3, totalWaves: 3 } },
  );
}

// ===========================================
// Status
// ===========================================

describe("objectiveComplete / objectiveFailed (ADR 0013 §2.3)", () => {
  it("answer a spawner objective from its flags", () => {
    const mission = missionHolding([]);
    const open = SPAWNER_OBJECTIVE;
    const done = { ...SPAWNER_OBJECTIVE, complete: true };
    const missed = { ...SPAWNER_OBJECTIVE, failed: true };
    expect([
      objectiveComplete(mission, open),
      objectiveFailed(mission, open),
    ]).toEqual([false, false]);
    expect([
      objectiveComplete(mission, done),
      objectiveFailed(mission, done),
    ]).toEqual([true, false]);
    expect([
      objectiveComplete(mission, missed),
      objectiveFailed(mission, missed),
    ]).toEqual([false, true]);
  });

  it("let a recorded failure override a kind's live rule", () => {
    const mission = missionHolding([]);
    expect(objectiveComplete(mission, DEFENCE)).toBe(true);
    const timedOut = { ...DEFENCE, failed: true };
    expect(objectiveComplete(mission, timedOut)).toBe(false);
    expect(objectiveFailed(mission, timedOut)).toBe(true);
  });
});

// ===========================================
// Result rows
// ===========================================

describe("objectiveResults", () => {
  it("writes one row per objective, in order, with a tally only where the kind keeps one", () => {
    const mission = missionHolding([
      { ...SPAWNER_OBJECTIVE, complete: true },
      DEFENCE,
      { ...SPAWNER_OBJECTIVE, id: "objective-3", failed: true },
    ]);
    expect(objectiveResults(mission)).toEqual([
      { kind: "destroy-spawner", complete: true, failed: false },
      {
        kind: "defend-generators",
        complete: true,
        failed: false,
        done: 1,
        total: 2,
      },
      { kind: "destroy-spawner", complete: false, failed: true },
    ]);
  });

  it("writes no rows for a mission without objectives", () => {
    expect(objectiveResults(missionHolding([]))).toEqual([]);
  });
});

// ===========================================
// Result fields
// ===========================================

describe("objectiveResultFields", () => {
  it("adds nothing when no objective has fields of its own", () => {
    expect(objectiveResultFields(missionHolding([]))).toEqual({});
    expect(objectiveResultFields(missionHolding([SPAWNER_OBJECTIVE]))).toEqual(
      {},
    );
  });

  it("adds a defence's own field", () => {
    expect(
      objectiveResultFields(missionHolding([SPAWNER_OBJECTIVE, DEFENCE])),
    ).toEqual({ defence: { installation: "sensor-array", held: true } });
  });

  it("keeps the first objective's field when two name the same one", () => {
    const second: DefendGeneratorsObjective = {
      ...DEFENCE,
      id: "objective-3",
      installation: "bank",
      targetIds: ["gen-2"],
    };
    expect(objectiveResultFields(missionHolding([DEFENCE, second]))).toEqual({
      defence: { installation: "sensor-array", held: true },
    });
  });
});
