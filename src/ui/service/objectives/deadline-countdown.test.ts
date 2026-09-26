import { describe, expect, it } from "vitest";

import type {
  DestroyPodObjective,
  DestroySpawnerObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import type { ObjectivePresentationCatalogue } from "../../model/objective-presentation";
import {
  countdownAt,
  countdownText,
  DEADLINE_URGENT_TURNS,
  deadlineCountdown,
  DEFAULT_DEADLINE_PHRASE,
  objectiveCountdowns,
  soonestCountdown,
  soonestOf,
  turnsUntilDeadline,
  urgentDeadlineTargets,
} from "./deadline-countdown";
import { OBJECTIVE_PRESENTATION } from "./objective-presentation";

// ===========================================
// Fixtures
// ===========================================

/** Wreck the pod by the end of turn 8. */
const POD_OBJECTIVE: DestroyPodObjective = {
  id: "objective-1",
  kind: "destroy-pod",
  targetId: "spawner-1",
  complete: false,
  deadlineTurn: 8,
};

/** A nest with a deadline of its own and no phrase for it. */
const TIMED_NEST: DestroySpawnerObjective = {
  id: "objective-2",
  kind: "destroy-spawner",
  targetId: "spawner-2",
  complete: false,
  deadlineTurn: 6,
};

/** A nest on no clock. */
const NEST: DestroySpawnerObjective = {
  id: "objective-3",
  kind: "destroy-spawner",
  targetId: "spawner-3",
  complete: false,
};

/** Just what the countdowns read: the turn and the objectives. */
function missionOn(
  turn: number,
  objectives: TacticalState["objectives"],
): TacticalState {
  return { turn, objectives } as unknown as TacticalState;
}

// ===========================================
// The countdown
// ===========================================

describe("deadline countdown (ADR 0013 §2.3)", () => {
  it("counts the turns left with this one included, down to the deadline turn itself", () => {
    expect(turnsUntilDeadline(8, 1)).toBe(8);
    expect(turnsUntilDeadline(8, 7)).toBe(2);
    expect(turnsUntilDeadline(8, 8)).toBe(1);
    expect(turnsUntilDeadline(8, 9)).toBe(0);
  });

  it("says when the pod matures, in turns and then at the end of this one", () => {
    expect(countdownText("Pod matures", 8)).toBe("Pod matures in 8 turns");
    expect(countdownText("Pod matures", 2)).toBe("Pod matures in 2 turns");
    expect(countdownText("Pod matures", 1)).toBe(
      "Pod matures at the end of this turn",
    );
  });

  it("turns urgent in the last two turns", () => {
    expect(DEADLINE_URGENT_TURNS).toBe(2);
    expect(deadlineCountdown(POD_OBJECTIVE, 6, "Pod matures")).toEqual({
      text: "Pod matures in 3 turns",
      turnsLeft: 3,
      urgent: false,
    });
    expect(deadlineCountdown(POD_OBJECTIVE, 7, "Pod matures")).toEqual({
      text: "Pod matures in 2 turns",
      turnsLeft: 2,
      urgent: true,
    });
    expect(deadlineCountdown(POD_OBJECTIVE, 8, "Pod matures")?.urgent).toBe(
      true,
    );
  });

  it("shows nothing without a deadline, once done, once failed, or past it", () => {
    expect(deadlineCountdown(NEST, 1, "x")).toBeUndefined();
    expect(
      deadlineCountdown({ ...POD_OBJECTIVE, complete: true }, 3, "x"),
    ).toBeUndefined();
    expect(
      deadlineCountdown({ ...POD_OBJECTIVE, failed: true }, 3, "x"),
    ).toBeUndefined();
    expect(deadlineCountdown(POD_OBJECTIVE, 9, "x")).toBeUndefined();
  });
});

// ===========================================
// Mission queries
// ===========================================

describe("objectiveCountdowns and soonestCountdown", () => {
  it("counts down every open objective with a deadline, in its kind's words", () => {
    const countdowns = objectiveCountdowns(
      missionOn(5, [POD_OBJECTIVE, TIMED_NEST, NEST]),
    );
    expect([...countdowns.keys()]).toEqual(["objective-1", "objective-2"]);
    expect(countdowns.get("objective-1")?.text).toBe("Pod matures in 4 turns");
    expect(countdowns.get("objective-2")?.text).toBe(
      `${DEFAULT_DEADLINE_PHRASE} in 2 turns`,
    );
  });

  it("asks the injected table for the words", () => {
    const presentations: ObjectivePresentationCatalogue = {
      ...OBJECTIVE_PRESENTATION,
      "destroy-pod": {
        ...OBJECTIVE_PRESENTATION["destroy-pod"],
        deadlinePhrase: () => "Probe ripens",
      },
    };
    expect(
      objectiveCountdowns(missionOn(5, [POD_OBJECTIVE]), presentations).get(
        "objective-1",
      )?.text,
    ).toBe("Probe ripens in 4 turns");
  });

  it("picks the soonest, the first on a tie, and nothing when nothing counts down", () => {
    const countdowns = objectiveCountdowns(
      missionOn(5, [POD_OBJECTIVE, TIMED_NEST]),
    );
    expect(soonestCountdown(countdowns)?.turnsLeft).toBe(2);
    const tie = objectiveCountdowns(
      missionOn(5, [POD_OBJECTIVE, { ...POD_OBJECTIVE, id: "objective-9" }]),
    );
    expect(soonestCountdown(tie)).toBe(tie.get("objective-1"));
    expect(soonestCountdown(objectiveCountdowns(missionOn(5, [NEST])))).toBe(
      undefined,
    );
  });
});

// ===========================================
// Urgent targets
// ===========================================

describe("urgentDeadlineTargets (#1179)", () => {
  it("names what the urgent objectives track, and nothing sooner or done", () => {
    const objectives = [POD_OBJECTIVE, TIMED_NEST, NEST];
    // Turn 5: the nest's deadline (6) is two turns off, the pod's (8) four.
    expect([...urgentDeadlineTargets(missionOn(5, objectives))]).toEqual([
      "spawner-2",
    ]);
    // Turn 7: the pod is in its last two turns; the nest's deadline passed.
    expect([...urgentDeadlineTargets(missionOn(7, objectives))]).toEqual([
      "spawner-1",
    ]);
    expect([...urgentDeadlineTargets(missionOn(6, objectives))]).toEqual([
      "spawner-2",
    ]);
    // Wrecked in time: nothing ripens.
    expect([
      ...urgentDeadlineTargets(
        missionOn(8, [{ ...POD_OBJECTIVE, complete: true }]),
      ),
    ]).toEqual([]);
  });
});

describe("countdownAt and soonestOf (campaign arc §11)", () => {
  it("counts any deadline down the way an objective's is", () => {
    expect(countdownAt(20, 18, "Drop ship leaves")).toEqual({
      text: "Drop ship leaves in 3 turns",
      turnsLeft: 3,
      urgent: false,
    });
    expect(countdownAt(20, 20, "Drop ship leaves")).toEqual({
      text: "Drop ship leaves at the end of this turn",
      turnsLeft: 1,
      urgent: true,
    });
    expect(countdownAt(20, 21, "Drop ship leaves")).toBeUndefined();
    expect(deadlineCountdown(POD_OBJECTIVE, 6, "Pod matures")).toEqual(
      countdownAt(8, 6, "Pod matures"),
    );
  });

  it("picks the soonest of any countdowns, the first on a tie", () => {
    const pod = countdownAt(8, 6, "Pod matures")!;
    const ship = countdownAt(7, 6, "Drop ship leaves")!;
    const tie = countdownAt(8, 6, "Drop ship leaves")!;
    expect(soonestOf([pod, ship])).toBe(ship);
    expect(soonestOf([pod, tie])).toBe(pod);
    expect(soonestOf([])).toBeUndefined();
  });
});
