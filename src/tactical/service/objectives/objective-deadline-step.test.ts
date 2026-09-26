import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { BUGS_SPAWNED } from "../../model/bugs-spawned-event";
import type {
  ObjectiveOfKind,
  ObjectiveRulesTable,
} from "../../model/objective-rules";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type { TacticalApplied } from "../../model/tactical-event";
import {
  TACTICAL_PHASES,
  type Objective,
  type Spawner,
  type TacticalPhase,
  type TacticalState,
} from "../../model/tactical-state";
import { damageSpawner } from "../spawner-damage-service";
import {
  ctxWith,
  missionWith,
  openField,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { DESTROY_SPAWNER_OBJECTIVE } from "./destroy-spawner-objective";
import {
  createObjectiveDeadlineStep,
  deadlinePassed,
} from "./objective-deadline-step";
import { OBJECTIVE_RULES } from "./objective-rules";
import { objectiveComplete, objectiveFailed } from "./objective-status";

// ===========================================
// Fixtures
// ===========================================

/** The turn the fixture objective must be done by. Nothing ships with one yet. */
const DEADLINE = 8;

/** A live egg spawner at (4,0,4). */
const SPAWNER: Spawner = {
  id: "spawner-1",
  pos: { x: 4, y: 0, z: 4 },
  hatchRadius: 3,
  hp: 8,
  timer: 2,
  destroyed: false,
};

/** Destroy the spawner by the end of turn 8. */
const TIMED: Objective = {
  id: "objective-1",
  kind: "destroy-spawner",
  targetId: "spawner-1",
  complete: false,
  deadlineTurn: DEADLINE,
};

/** A mission on turn `turn` holding one unit, the spawner and `objectives`. */
function missionOn(
  turn: number,
  phase: TacticalPhase = "player",
  objectives: readonly Objective[] = [TIMED],
): TacticalState {
  return missionWith(
    openField().build(),
    [unitAt("u", "infantry", { x: 0, y: 0, z: 0 })],
    { turn, phase, spawners: [SPAWNER], objectives },
  );
}

/** Each `onDeadline` call a recording table saw: the objective and the mission handed over. */
interface DeadlineCall {
  readonly objective: ObjectiveOfKind<"destroy-spawner">;
  readonly mission: TacticalState;
}

/**
 * The shipped rules with a destroy-spawner `onDeadline` that records its
 * calls and "hatches": the spawner's timer drops to zero and a spawn is
 * announced, the way a pod maturing would set off a wave.
 */
function recordingRules(): {
  readonly rules: ObjectiveRulesTable;
  readonly calls: DeadlineCall[];
} {
  const calls: DeadlineCall[] = [];
  const onDeadline = (
    objective: ObjectiveOfKind<"destroy-spawner">,
    mission: TacticalState,
  ): TacticalApplied<TacticalState> => {
    calls.push({ objective, mission });
    return {
      state: {
        ...mission,
        spawners: mission.spawners.map((spawner) => ({ ...spawner, timer: 0 })),
      },
      events: [
        {
          type: BUGS_SPAWNED,
          payload: { unitIds: [], source: "spawner", sourceId: "spawner-1" },
        },
      ],
    };
  };
  return {
    rules: {
      ...OBJECTIVE_RULES,
      "destroy-spawner": { ...DESTROY_SPAWNER_OBJECTIVE, onDeadline },
    },
    calls,
  };
}

const ctx = ctxWith(new Mulberry32Rng(1));

// ===========================================
// deadlinePassed
// ===========================================

describe("deadlinePassed", () => {
  it("passes only once the deadline turn has ended, and never without one", () => {
    expect(deadlinePassed(TIMED, DEADLINE)).toBe(false);
    expect(deadlinePassed(TIMED, DEADLINE + 1)).toBe(true);
    const { deadlineTurn: _none, ...untimed } = TIMED;
    expect(deadlinePassed(untimed, 1_000)).toBe(false);
  });
});

// ===========================================
// The step
// ===========================================

describe("createObjectiveDeadlineStep (ADR 0013 §2.3)", () => {
  it("leaves the objective open through both phases of its deadline turn", () => {
    const step = createObjectiveDeadlineStep();
    for (const phase of TACTICAL_PHASES) {
      const mission = missionOn(DEADLINE, phase);
      const applied = step(mission, ctx);
      expect(applied.state).toBe(mission);
      expect(applied.events).toEqual([]);
    }
  });

  it("fails the objective and announces it when the next turn opens", () => {
    const applied = createObjectiveDeadlineStep()(missionOn(DEADLINE + 1), ctx);
    expect(applied.state.objectives).toEqual([{ ...TIMED, failed: true }]);
    expect(applied.events).toEqual([
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: "objective-1", complete: false, failed: true },
      },
    ]);
    const [failed] = applied.state.objectives;
    expect(failed).toBeDefined();
    if (failed === undefined) return;
    expect(objectiveFailed(applied.state, failed)).toBe(true);
    expect(objectiveComplete(applied.state, failed)).toBe(false);
  });

  it("hands the marked objective to its kind's onDeadline and keeps what it sets off", () => {
    const { rules, calls } = recordingRules();
    const applied = createObjectiveDeadlineStep(rules)(
      missionOn(DEADLINE + 1),
      ctx,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.objective).toEqual({ ...TIMED, failed: true });
    expect(calls[0]?.mission.objectives).toEqual([{ ...TIMED, failed: true }]);
    expect(applied.state.spawners[0]?.timer).toBe(0);
    expect(applied.state.objectives).toEqual([{ ...TIMED, failed: true }]);
    expect(applied.events.map((event) => event.type)).toEqual([
      OBJECTIVE_UPDATED,
      BUGS_SPAWNED,
    ]);
  });

  it("fails an objective once: later phases skip it and its consequences do not repeat", () => {
    const { rules, calls } = recordingRules();
    const step = createObjectiveDeadlineStep(rules);
    const first = step(missionOn(DEADLINE + 1), ctx).state;
    const later = { ...first, turn: DEADLINE + 2 };
    const applied = step(later, ctx);
    expect(applied.state).toBe(later);
    expect(applied.events).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("never fails an objective already done", () => {
    const { rules, calls } = recordingRules();
    const mission = missionOn(DEADLINE + 1, "player", [
      { ...TIMED, complete: true },
    ]);
    const applied = createObjectiveDeadlineStep(rules)(mission, ctx);
    expect(applied.state).toBe(mission);
    expect(applied.events).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("asks the kind's live rule whether the objective is still open", () => {
    const lost: Objective = {
      id: "objective-2",
      kind: "defend-generators",
      installation: "sensor-array",
      targetIds: [],
      complete: false,
      failed: false,
      deadlineTurn: DEADLINE,
    };
    const mission = missionOn(DEADLINE + 1, "player", [lost]);
    const applied = createObjectiveDeadlineStep()(mission, ctx);
    expect(applied.state).toBe(mission);
    expect(applied.events).toEqual([]);
  });

  it("leaves an objective without a deadline alone", () => {
    const { deadlineTurn: _none, ...untimed } = TIMED;
    const mission = missionOn(1_000, "player", [untimed]);
    const applied = createObjectiveDeadlineStep()(mission, ctx);
    expect(applied.state).toBe(mission);
    expect(applied.events).toEqual([]);
  });

  it("keeps a missed objective failed when its spawner falls afterwards", () => {
    const missed = createObjectiveDeadlineStep()(missionOn(DEADLINE + 1), ctx);
    const blown = damageSpawner(missed.state, "spawner-1", 8, "u");
    expect(blown.state.spawners[0]?.destroyed).toBe(true);
    expect(blown.state.objectives).toEqual([{ ...TIMED, failed: true }]);
    expect(blown.events.map((event) => event.type)).not.toContain(
      OBJECTIVE_UPDATED,
    );
  });
});
