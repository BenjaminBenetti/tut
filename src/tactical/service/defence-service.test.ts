import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { OBJECTIVE_UPDATED } from "../model/objective-updated-event";
import type {
  DefendGeneratorsObjective,
  TacticalState,
} from "../model/tactical-state";
import type { Unit } from "../model/unit";
import {
  createDefenceStep,
  defenceProgress,
  defendStatus,
  objectiveComplete,
  objectiveFailed,
} from "./defence-service";
import {
  ctxWith,
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number) => ({ x, y: 0, z });

function generatorAt(id: string, x: number, z: number, hp = 40): Unit {
  return { ...unitAt(id, "infantry", at(x, z), { hp }), kind: "generator" };
}

const DEFENCE: DefendGeneratorsObjective = {
  id: "objective-1",
  kind: "defend-generators",
  installation: "sensor-array",
  targetIds: ["gen-1", "gen-2"],
  complete: false,
  failed: false,
};

/** Two generators, a squad and `bugs` living bugs, `wave` of `totalWaves` landed. */
function defence(options: {
  readonly generatorHp?: readonly [number, number];
  readonly bugs?: number;
  readonly wave?: number;
  readonly totalWaves?: number;
  readonly objective?: DefendGeneratorsObjective;
}): TacticalState {
  const [first, second] = options.generatorHp ?? [40, 40];
  const bugs = Array.from({ length: options.bugs ?? 0 }, (_, i) =>
    unitAt(`bug-${String(i)}`, "infantry", at(7, i), { team: "bugs" }),
  );
  return missionWith(
    openField().build(),
    [
      unitAt("unit-1", "infantry", at(1, 1)),
      generatorAt("gen-1", 3, 3, first),
      generatorAt("gen-2", 4, 4, second),
      ...bugs,
    ],
    {
      objectives: [options.objective ?? DEFENCE],
      edgeSpawn: {
        nextTurn: 9,
        wave: options.wave ?? 0,
        ...(options.totalWaves === undefined
          ? {}
          : { totalWaves: options.totalWaves }),
      },
    },
  );
}

// ===========================================
// Status
// ===========================================

describe("defendStatus (#1175)", () => {
  it("is open while waves are still due, whether or not bugs are on the map", () => {
    expect(defendStatus(defence({ wave: 1, totalWaves: 3 }), DEFENCE)).toBe(
      "open",
    );
    expect(
      defendStatus(defence({ wave: 2, totalWaves: 3, bugs: 4 }), DEFENCE),
    ).toBe("open");
  });

  it("stays open after the last wave while any bug lives", () => {
    expect(
      defendStatus(defence({ wave: 3, totalWaves: 3, bugs: 1 }), DEFENCE),
    ).toBe("open");
  });

  it("is complete once every wave has landed and the last bug is dead", () => {
    expect(defendStatus(defence({ wave: 3, totalWaves: 3 }), DEFENCE)).toBe(
      "complete",
    );
    const overshoot = defence({ wave: 4, totalWaves: 3 });
    expect(defendStatus(overshoot, DEFENCE)).toBe("complete");
  });

  it("fails the moment no generator is running, even with a wave still due", () => {
    expect(
      defendStatus(
        defence({ generatorHp: [0, 0], wave: 1, totalWaves: 3 }),
        DEFENCE,
      ),
    ).toBe("failed");
    // One generator standing is a defence still open.
    expect(
      defendStatus(
        defence({ generatorHp: [0, 12], wave: 1, totalWaves: 3 }),
        DEFENCE,
      ),
    ).toBe("open");
  });

  it("never completes on a schedule with no wave total", () => {
    expect(defendStatus(defence({ wave: 9 }), DEFENCE)).toBe("open");
  });

  it("counts only the generators the objective tracks", () => {
    const onlyFirst = { ...DEFENCE, targetIds: ["gen-1"] };
    expect(
      defendStatus(
        defence({ generatorHp: [0, 40], wave: 1, totalWaves: 3 }),
        onlyFirst,
      ),
    ).toBe("failed");
  });
});

describe("defenceProgress", () => {
  it("reports standing generators, the wave clock and the living bugs", () => {
    const mission = defence({
      generatorHp: [0, 40],
      bugs: 3,
      wave: 2,
      totalWaves: 5,
    });
    expect(defenceProgress(mission, DEFENCE)).toEqual({
      standing: 1,
      total: 2,
      wave: 2,
      totalWaves: 5,
      bugsLeft: 3,
      status: "open",
    });
  });

  it("ignores dead bugs and dead TDF units alike", () => {
    const mission = defence({ wave: 3, totalWaves: 3, bugs: 2 });
    const cleared: TacticalState = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.team === "bugs" ? { ...unit, hp: 0 } : unit,
      ),
    };
    expect(defenceProgress(cleared, DEFENCE).bugsLeft).toBe(0);
    expect(defenceProgress(cleared, DEFENCE).status).toBe("complete");
  });
});

describe("objectiveComplete and objectiveFailed", () => {
  it("answer a defence live and a spawner objective from its flag", () => {
    const held = defence({ wave: 3, totalWaves: 3 });
    expect(objectiveComplete(held, DEFENCE)).toBe(true);
    expect(objectiveFailed(held, DEFENCE)).toBe(false);
    const lost = defence({ generatorHp: [0, 0], wave: 1, totalWaves: 3 });
    expect(objectiveComplete(lost, DEFENCE)).toBe(false);
    expect(objectiveFailed(lost, DEFENCE)).toBe(true);
    // The stored flag says complete; the live rule says otherwise, and
    // the live rule is the answer.
    const stale = defence({
      wave: 1,
      totalWaves: 3,
      objective: { ...DEFENCE, complete: true },
    });
    expect(objectiveComplete(stale, DEFENCE)).toBe(false);
    // And a defence recorded as failed never reads complete, whatever
    // is standing now.
    const written = defence({
      wave: 3,
      totalWaves: 3,
      objective: { ...DEFENCE, failed: true },
    });
    expect(objectiveComplete(written, { ...DEFENCE, failed: true })).toBe(
      false,
    );
    const spawner = {
      id: "objective-2",
      kind: "destroy-spawner" as const,
      targetId: "spawner-1",
      complete: true,
    };
    expect(objectiveComplete(lost, spawner)).toBe(true);
    expect(objectiveFailed(lost, spawner)).toBe(false);
  });
});

// ===========================================
// Phase step
// ===========================================

describe("createDefenceStep", () => {
  const step = createDefenceStep();
  const ctx = ctxWith(new Mulberry32Rng(1));

  it("leaves an open defence alone, without an event", () => {
    const mission = defence({ wave: 1, totalWaves: 3, bugs: 2 });
    const result = step(mission, ctx);
    expect(result.state).toBe(mission);
    expect(result.events).toEqual([]);
  });

  it("marks a held defence complete and announces it once", () => {
    const mission = defence({ wave: 3, totalWaves: 3 });
    const result = step(mission, ctx);
    expect(result.state.objectives).toEqual([
      { ...DEFENCE, complete: true, failed: false },
    ]);
    expect(result.events).toEqual([
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: "objective-1", complete: true, failed: false },
      },
    ]);
    const again = step(result.state, ctx);
    expect(again.state).toBe(result.state);
    expect(again.events).toEqual([]);
  });

  it("marks a lost defence failed, and keeps it failed", () => {
    const mission = defence({
      generatorHp: [0, 0],
      wave: 1,
      totalWaves: 3,
      bugs: 3,
    });
    const result = step(mission, ctx);
    expect(result.state.objectives[0]).toMatchObject({
      complete: false,
      failed: true,
    });
    expect(result.events).toEqual([
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: "objective-1", complete: false, failed: true },
      },
    ]);
    // A wrecked installation does not come back: even with a generator
    // running again and the field clear, the failed flag stays.
    const revived = defence({
      wave: 3,
      totalWaves: 3,
      objective: { ...DEFENCE, failed: true },
    });
    const after = step(revived, ctx);
    expect(after.state).toBe(revived);
    expect(after.events).toEqual([]);
  });

  it("passes spawner objectives through untouched", () => {
    const mission = missionWith(openField().build(), [], {
      objectives: [
        {
          id: "objective-9",
          kind: "destroy-spawner",
          targetId: "spawner-1",
          complete: false,
        },
      ],
    });
    const result = step(mission, ctx);
    expect(result.state).toBe(mission);
    expect(result.events).toEqual([]);
  });
});
