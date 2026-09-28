import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { INTACT_POD_TUNING } from "../../data/intact-pod-tuning";
import { endTurn } from "../../model/end-turn-command";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import { POD_RECOVERED } from "../../model/pod-recovered-event";
import type { TacticalEvent } from "../../model/tactical-event";
import type {
  RecoverPodObjective,
  TacticalPhase,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import {
  ctxWith,
  missionWith,
  openField,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { createEndTurnHandler, DEFAULT_PHASE_STEPS } from "../turn-service";
import { createObjectiveDeadlineStep } from "./objective-deadline-step";
import { OBJECTIVE_RULES } from "./objective-rules";
import {
  objectiveComplete,
  objectiveFailed,
  objectiveResultFields,
  objectiveResults,
} from "./objective-status";
import {
  createRecoveryStep,
  podLost,
  podRecovered,
  RECOVER_POD_OBJECTIVE,
} from "./recover-pod-objective";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The recovery turn: the drop comes as it ends. */
const RECOVERY_TURN = INTACT_POD_TUNING.recoveryTurn;

/** Where the pod stands on the 8×8 field. */
const POD_POS = at(5, 5);

/** The pod, a generator-kind unit of ours with 65 hit points of 65. */
function pod(hp = 65): Unit {
  return {
    ...unitAt("pod", "infantry", POD_POS, { hp, ap: 0 }),
    kind: "generator",
    maxHp: 65,
    maxAp: 0,
  };
}

/** Keep the pod alive until the drop as the recovery turn ends. */
const RECOVERY: RecoverPodObjective = {
  id: "objective-1",
  kind: "recover-pod",
  targetId: "pod",
  complete: false,
  failed: false,
  deadlineTurn: RECOVERY_TURN,
  huntedAt: POD_POS,
};

/** A mission with one rifle squad, the pod (unless `withPod` is false) and the recovery. */
function missionOn(
  turn: number,
  options: {
    readonly phase?: TacticalPhase;
    readonly podHp?: number;
    readonly withPod?: boolean;
    readonly objective?: Partial<RecoverPodObjective>;
  } = {},
): TacticalState {
  const units = [unitAt("u", "infantry", at(0, 0))];
  if (options.withPod !== false) units.push(pod(options.podHp));
  return missionWith(openField().build(), units, {
    turn,
    phase: options.phase ?? "player",
    objectives: [{ ...RECOVERY, ...options.objective }],
  });
}

/** The recovery objective of `mission`. */
function recoveryOf(mission: TacticalState): RecoverPodObjective {
  const found = mission.objectives.find((o) => o.id === RECOVERY.id);
  if (found?.kind !== "recover-pod") {
    throw new Error("fixture objective is gone");
  }
  return found;
}

const ctx = ctxWith(new Mulberry32Rng(7));

/** EndTurn with the shipped order: the deadlines, then the drop. */
const END_TURN = createEndTurnHandler([
  ...DEFAULT_PHASE_STEPS,
  createObjectiveDeadlineStep(),
  createRecoveryStep(),
]);

/** Ends the phase and returns the mission and what it said. */
function endPhase(mission: TacticalState): {
  readonly state: TacticalState;
  readonly events: readonly TacticalEvent[];
} {
  const outcome = END_TURN(mission, endTurn(), ctx);
  if (!outcome.ok) {
    throw new Error(`EndTurn refused: ${outcome.error.kind}`);
  }
  return outcome.value;
}

// ===========================================
// Live status
// ===========================================

describe("recover-pod, live (#1179, campaign arc §6.9)", () => {
  it("is the recover-pod entry of the shipped table", () => {
    expect(OBJECTIVE_RULES["recover-pod"]).toBe(RECOVER_POD_OBJECTIVE);
  });

  it("stays open through the recovery turn while the pod stands", () => {
    for (const turn of [1, RECOVERY_TURN - 1, RECOVERY_TURN]) {
      const mission = missionOn(turn);
      expect(podRecovered(RECOVERY, mission)).toBe(false);
      expect(podLost(RECOVERY, mission)).toBe(false);
      expect(objectiveComplete(mission, RECOVERY)).toBe(false);
      expect(objectiveFailed(mission, RECOVERY)).toBe(false);
    }
  });

  it("reads as recovered once the recovery turn has ended with the pod standing", () => {
    const mission = missionOn(RECOVERY_TURN + 1, { podHp: 1 });
    expect(podRecovered(RECOVERY, mission)).toBe(true);
    expect(objectiveComplete(mission, RECOVERY)).toBe(true);
    expect(objectiveFailed(mission, RECOVERY)).toBe(false);
  });

  it("reads as lost when the pod is down to nothing, before or after the drop was due", () => {
    for (const turn of [3, RECOVERY_TURN + 1]) {
      const mission = missionOn(turn, { podHp: 0 });
      expect(podLost(RECOVERY, mission)).toBe(true);
      expect(podRecovered(RECOVERY, mission)).toBe(false);
      expect(objectiveFailed(mission, RECOVERY)).toBe(true);
      expect(objectiveComplete(mission, RECOVERY)).toBe(false);
    }
  });

  it("reads a pod that is off the map as lost unless the drop lifted it", () => {
    const gone = missionOn(RECOVERY_TURN + 1, { withPod: false });
    expect(podLost(RECOVERY, gone)).toBe(true);
    const lifted = { ...RECOVERY, complete: true, recoveredHp: 40 };
    const after = missionOn(RECOVERY_TURN + 1, {
      withPod: false,
      objective: lifted,
    });
    expect(podLost(lifted, after)).toBe(false);
    expect(podRecovered(lifted, after)).toBe(true);
  });

  it("points a guard at the pod and tallies one pod", () => {
    const mission = missionOn(3);
    expect(RECOVER_POD_OBJECTIVE.destination?.(RECOVERY, mission)).toEqual({
      targetIds: ["pod"],
    });
    expect(objectiveResults(mission)).toEqual([
      expect.objectContaining({ done: 0, total: 1 }),
    ]);
    expect(objectiveResults(missionOn(RECOVERY_TURN + 1))).toEqual([
      expect.objectContaining({ done: 1, total: 1 }),
    ]);
  });
});

// ===========================================
// The drop
// ===========================================

describe("createRecoveryStep (#1179)", () => {
  it("leaves the pod alone through the recovery turn", () => {
    const step = createRecoveryStep();
    for (const phase of ["player", "bugs"] as const) {
      const mission = missionOn(RECOVERY_TURN, { phase });
      const applied = step(mission, ctx);
      expect(applied.state).toBe(mission);
      expect(applied.events).toEqual([]);
    }
  });

  it("lifts the pod as the next turn opens: gone from the map, complete, its hit points kept", () => {
    const mission = missionOn(RECOVERY_TURN + 1, { podHp: 37 });
    const applied = createRecoveryStep()(mission, ctx);
    expect(applied.state.units.map((unit) => unit.id)).toEqual(["u"]);
    expect(recoveryOf(applied.state)).toEqual({
      ...RECOVERY,
      complete: true,
      recoveredHp: 37,
    });
    expect(applied.events).toEqual([
      {
        type: POD_RECOVERED,
        payload: {
          unitId: "pod",
          objectiveId: "objective-1",
          pos: POD_POS,
          hp: 37,
        },
      },
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: "objective-1", complete: true, failed: false },
      },
    ]);
    // Lifted once: the next phase finds nothing to do.
    const later = { ...applied.state, turn: RECOVERY_TURN + 2 };
    const again = createRecoveryStep()(later, ctx);
    expect(again.state).toBe(later);
    expect(again.events).toEqual([]);
  });

  it("fails the recovery once when the swarm destroys the pod, and never lifts the wreck", () => {
    const mission = missionOn(4, { podHp: 0 });
    const applied = createRecoveryStep()(mission, ctx);
    expect(recoveryOf(applied.state)).toEqual({ ...RECOVERY, failed: true });
    expect(applied.events).toEqual([
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: "objective-1", complete: false, failed: true },
      },
    ]);
    const later = { ...applied.state, turn: RECOVERY_TURN + 1 };
    const again = createRecoveryStep()(later, ctx);
    expect(again.state).toBe(later);
    expect(again.events).toEqual([]);
    expect(again.state.units.map((unit) => unit.id)).toContain("pod");
  });
});

// ===========================================
// Through EndTurn
// ===========================================

describe("recover-pod through EndTurn (#1179)", () => {
  it("keeps the generic deadline off a standing pod and lifts it as turn 9 opens", () => {
    const bugPhase = endPhase(missionOn(RECOVERY_TURN, { podHp: 50 }));
    expect(bugPhase.state.phase).toBe("bugs");
    expect(bugPhase.state.turn).toBe(RECOVERY_TURN);
    expect(bugPhase.state.units.map((unit) => unit.id)).toContain("pod");
    expect(recoveryOf(bugPhase.state).complete).toBe(false);

    const next = endPhase(bugPhase.state);
    expect(next.state.phase).toBe("player");
    expect(next.state.turn).toBe(RECOVERY_TURN + 1);
    expect(recoveryOf(next.state)).toEqual({
      ...RECOVERY,
      complete: true,
      recoveredHp: 50,
    });
    expect(next.state.units.map((unit) => unit.id)).toEqual(["u"]);
    const types = next.events.map((event) => event.type);
    expect(types).toContain(POD_RECOVERED);
    expect(
      next.events.filter(
        (event) =>
          event.type === OBJECTIVE_UPDATED &&
          (event.payload as { failed: boolean }).failed,
      ),
    ).toEqual([]);
  });

  it("records the recovery in the mission's result fields", () => {
    const lifted = endPhase(
      endPhase(missionOn(RECOVERY_TURN, { podHp: 50 })).state,
    ).state;
    expect(objectiveResultFields(lifted)).toEqual({
      podRecovered: true,
      podHpLeft: 50,
    });
    expect(objectiveResultFields(missionOn(5, { podHp: 22 }))).toEqual({
      podRecovered: false,
      podHpLeft: 22,
    });
    expect(objectiveResultFields(missionOn(5, { podHp: -3 }))).toEqual({
      podRecovered: false,
      podHpLeft: 0,
    });
  });
});
