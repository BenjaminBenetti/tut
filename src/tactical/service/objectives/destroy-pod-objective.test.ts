import { describe, expect, it } from "vitest";

import { manhattanDistance } from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../../data/combat-tuning";
import { OBJECTIVE_TUNING } from "../../data/objective-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import { attack } from "../../model/attack-command";
import { BUGS_SPAWNED } from "../../model/bugs-spawned-event";
import { endTurn } from "../../model/end-turn-command";
import { interact } from "../../model/interact-command";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type { SpawnSource } from "../../model/spawn-source";
import { SPAWNER_DAMAGED } from "../../model/spawner-damaged-event";
import { SPORE_POD_MATURED } from "../../model/spore-pod-matured-event";
import type { TacticalEvent } from "../../model/tactical-event";
import type {
  DestroyPodObjective,
  Spawner,
  TacticalPhase,
  TacticalState,
} from "../../model/tactical-state";
import { damageRange } from "../attack-formulae";
import { resolveAttack } from "../combat-service";
import {
  createInteractHandler,
  reachableObjectives,
} from "../objective-service";
import type { SpawnDeps } from "../spawn-service";
import {
  createPodBurstStep,
  hatch,
  podBurst,
  podBurstSize,
} from "../spawn-service";
import { damageSpawner } from "../spawner-damage-service";
import {
  ctxWith,
  fixtureAttackDeps,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { createEndTurnHandler, DEFAULT_PHASE_STEPS } from "../turn-service";
import { DESTROY_POD_OBJECTIVE } from "./destroy-pod-objective";
import { createObjectiveDeadlineStep } from "./objective-deadline-step";
import {
  objectiveComplete,
  objectiveFailed,
  objectiveResultFields,
  objectiveResults,
} from "./objective-status";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** Where the pod stands on the 8×8 field. */
const POD_POS = at(5, 5);

/** A ripening spore pod at difficulty one's hit points. */
const POD: Spawner = {
  id: "spawner-1",
  variant: "spore-pod",
  pos: POD_POS,
  hatchRadius: 2,
  hp: SPAWN_TUNING.podHp,
  timer: 0,
  destroyed: false,
};

/** Wreck the pod before the end of turn 8. */
const OBJECTIVE: DestroyPodObjective = {
  id: "objective-1",
  kind: "destroy-pod",
  targetId: POD.id,
  complete: false,
  deadlineTurn: SPAWN_TUNING.podMaturityTurn,
};

const SWARMER: SpawnSource = {
  id: "swarmer",
  name: "Swarmer",
  hp: 6,
  armor: 0,
  move: 7,
  ap: 2,
  weapon: { range: 1, accuracy: 60, damage: 3, armorPen: 0 },
  sightRange: 12,
  modelId: "bug.swarmer",
  hatchWeight: 1,
};

const SPAWN: SpawnDeps = { species: [SWARMER], tuning: SPAWN_TUNING };

/** A mission with one rifle squad at `squadPos`, the pod and its objective. */
function missionOn(
  turn: number,
  phase: TacticalPhase = "player",
  options: {
    readonly pod?: Partial<Spawner>;
    readonly squadPos?: TileCoord;
  } = {},
): TacticalState {
  return missionWith(
    openField().build(),
    [unitAt("u", "infantry", options.squadPos ?? at(0, 0))],
    {
      turn,
      phase,
      spawners: [{ ...POD, ...options.pod }],
      objectives: [OBJECTIVE],
    },
  );
}

/** EndTurn with the shipped order of what the pod needs: deadlines, then bursts. */
const END_TURN = createEndTurnHandler([
  ...DEFAULT_PHASE_STEPS,
  createObjectiveDeadlineStep(),
  createPodBurstStep(SPAWN),
]);

/** Ends the phase and returns the mission and what it said. */
function endPhase(mission: TacticalState): {
  readonly state: TacticalState;
  readonly events: readonly TacticalEvent[];
} {
  const outcome = END_TURN(mission, endTurn(), ctxWith(new Mulberry32Rng(7)));
  if (!outcome.ok) {
    throw new Error(`EndTurn refused: ${outcome.error.kind}`);
  }
  return outcome.value;
}

/** The mission as the pod matures: turn 8's bug phase ends. */
function matured(): {
  readonly state: TacticalState;
  readonly events: readonly TacticalEvent[];
} {
  return endPhase(missionOn(SPAWN_TUNING.podMaturityTurn, "bugs"));
}

const podOf = (mission: TacticalState): Spawner | undefined =>
  mission.spawners.find((spawner) => spawner.id === POD.id);

const objectiveOf = (mission: TacticalState): DestroyPodObjective => {
  const found = mission.objectives.find((o) => o.id === OBJECTIVE.id);
  if (found?.kind !== "destroy-pod") {
    throw new Error("fixture objective is gone");
  }
  return found;
};

// ===========================================
// Damage
// ===========================================

describe("the spore pod takes damage like a spawner (campaign arc §6.3)", () => {
  it("loses hit points to a shot, and says it was a pod that was hit", () => {
    const mission = missionOn(1, "player", { squadPos: at(0, 5) });
    const shot = resolveAttack(
      mission,
      attack("u", POD.id),
      ctxWith(riggedRng(true)),
      COMBAT_TUNING,
      fixtureAttackDeps(),
    );
    expect(shot.ok).toBe(true);
    if (!shot.ok) return;
    const [low] = damageRange(
      { range: 5, accuracy: 60, damage: 3, armorPen: 0 },
      0,
      COMBAT_TUNING,
    );
    expect(podOf(shot.value.state)?.hp).toBe(POD.hp - low);
    expect(shot.value.events).toContainEqual({
      type: SPAWNER_DAMAGED,
      payload: {
        spawnerId: POD.id,
        unitId: "u",
        damage: low,
        hp: POD.hp - low,
        destroyed: false,
        variant: "spore-pod",
      },
    });
  });

  it("loses hit points to charges planted beside it", () => {
    const mission = missionOn(1, "player", { squadPos: at(4, 5) });
    const planted = createInteractHandler(OBJECTIVE_TUNING)(
      mission,
      interact("u", OBJECTIVE.id),
      ctxWith(new Mulberry32Rng(1)),
    );
    expect(planted.ok).toBe(true);
    if (!planted.ok) return;
    expect(podOf(planted.value.state)?.hp).toBe(
      POD.hp - OBJECTIVE_TUNING.chargeDamage,
    );
    expect(objectiveOf(planted.value.state).complete).toBe(false);
  });

  it("is offered to a unit beside it, as a nest is", () => {
    const mission = missionOn(1, "player", { squadPos: at(4, 5) });
    expect(reachableObjectives(mission, "u", OBJECTIVE_TUNING)).toEqual([
      expect.objectContaining({
        objective: OBJECTIVE,
        target: { id: POD.id, pos: POD_POS },
      }),
    ]);
  });
});

// ===========================================
// Completion
// ===========================================

describe("destroying the pod completes destroy-pod", () => {
  it("completes the objective with the blow that empties it", () => {
    const mission = missionOn(1, "player", {
      squadPos: at(4, 5),
      pod: { hp: OBJECTIVE_TUNING.chargeDamage },
    });
    const planted = createInteractHandler(OBJECTIVE_TUNING)(
      mission,
      interact("u", OBJECTIVE.id),
      ctxWith(new Mulberry32Rng(1)),
    );
    expect(planted.ok).toBe(true);
    if (!planted.ok) return;
    const state = planted.value.state;
    expect(podOf(state)).toMatchObject({ hp: 0, destroyed: true });
    expect(podOf(state)?.matured).toBeUndefined();
    expect(objectiveOf(state).complete).toBe(true);
    expect(objectiveComplete(state, objectiveOf(state))).toBe(true);
    expect(objectiveFailed(state, objectiveOf(state))).toBe(false);
    expect(planted.value.events).toContainEqual({
      type: OBJECTIVE_UPDATED,
      payload: { objectiveId: OBJECTIVE.id, complete: true },
    });
  });

  it("fills podDestroyed and a 1 / 1 tally on the result", () => {
    const wrecked = damageSpawner(missionOn(3), POD.id, POD.hp, "u").state;
    expect(objectiveResultFields(wrecked)).toEqual({ podDestroyed: true });
    expect(objectiveResults(wrecked)).toEqual([
      {
        kind: "destroy-pod",
        complete: true,
        failed: false,
        done: 1,
        total: 1,
      },
    ]);
    // Still ripening at the end is not a wreck.
    expect(objectiveResultFields(missionOn(3))).toEqual({
      podDestroyed: false,
    });
  });
});

// ===========================================
// Maturing
// ===========================================

describe("the pod matures when turn 8 ends", () => {
  it("does not mature through turn 7's end or turn 8's player phase", () => {
    for (const [turn, phase] of [
      [SPAWN_TUNING.podMaturityTurn - 1, "bugs"],
      [SPAWN_TUNING.podMaturityTurn, "player"],
    ] as const) {
      const { state, events } = endPhase(missionOn(turn, phase));
      expect(podOf(state)).toEqual(POD);
      expect(objectiveOf(state)).toEqual(OBJECTIVE);
      expect(events.map((event) => event.type)).not.toContain(
        SPORE_POD_MATURED,
      );
      expect(state.units).toHaveLength(1);
    }
  });

  it("matures as turn 9 opens: the objective fails and a wave bursts from the pod", () => {
    const { state, events } = matured();
    expect(state.turn).toBe(SPAWN_TUNING.podMaturityTurn + 1);
    expect(state.phase).toBe("player");
    expect(podOf(state)).toMatchObject({
      hp: 0,
      destroyed: true,
      matured: true,
      burstPending: false,
    });
    expect(objectiveOf(state).failed).toBe(true);
    expect(objectiveFailed(state, objectiveOf(state))).toBe(true);
    // Failed, announced, matured, burst: in that order.
    const types = events.map((event) => event.type);
    expect(types.indexOf(OBJECTIVE_UPDATED)).toBeLessThan(
      types.indexOf(SPORE_POD_MATURED),
    );
    expect(types.indexOf(SPORE_POD_MATURED)).toBeLessThan(
      types.indexOf(BUGS_SPAWNED),
    );
    const burst = events.find((event) => event.type === BUGS_SPAWNED);
    if (burst?.type !== BUGS_SPAWNED) throw new Error("no burst");
    expect(burst.payload.source).toBe("pod");
    expect(burst.payload.sourceId).toBe(POD.id);
    // An edge wave's worth and the pod's bonus, around where it stood.
    const size = podBurstSize(0, 1, 0, SPAWN_TUNING);
    expect(size).toBe(4);
    expect(burst.payload.unitIds).toHaveLength(size);
    const bugs = state.units.filter((unit) => unit.team === "bugs");
    expect(bugs.map((bug) => bug.id)).toEqual(burst.payload.unitIds);
    for (const bug of bugs) {
      expect(manhattanDistance(bug.pos, POD_POS)).toBeLessThanOrEqual(
        POD.hatchRadius,
      );
      expect(bug.ap).toBe(0);
    }
  });

  it("reads a matured pod as failed by the kind's own rule, flag or no flag", () => {
    const ripening = missionOn(5);
    expect(DESTROY_POD_OBJECTIVE.failed(OBJECTIVE, ripening)).toBe(false);
    // A pod matured without the deadline step's flag on its objective:
    // the live rule still gives the job up.
    const gone = missionOn(5, "player", {
      pod: { hp: 0, destroyed: true, matured: true },
    });
    expect(DESTROY_POD_OBJECTIVE.failed(OBJECTIVE, gone)).toBe(true);
    expect(objectiveFailed(gone, OBJECTIVE)).toBe(true);
  });

  it("scales the burst with difficulty, capped at the largest wave", () => {
    expect(podBurstSize(0, 3, 0, SPAWN_TUNING)).toBe(6);
    expect(podBurstSize(0, 10, 0, SPAWN_TUNING)).toBe(SPAWN_TUNING.maxWaveSize);
  });

  it("bursts once: a later phase start releases nothing more", () => {
    const next = endPhase(matured().state);
    expect(next.events.map((event) => event.type)).not.toContain(BUGS_SPAWNED);
    expect(next.state.units).toHaveLength(matured().state.units.length);
  });
});

// ===========================================
// A matured pod
// ===========================================

describe("a matured pod cannot be destroyed for credit", () => {
  it("is gone: no damage lands, no charges are offered, and the objective stays failed", () => {
    const { state } = matured();
    const shot = damageSpawner(state, POD.id, 1_000, "u");
    expect(shot.events).toEqual([]);
    expect(shot.state).toBe(state);
    const bomber = {
      ...state,
      units: state.units.map((unit) =>
        unit.id === "u" ? { ...unit, pos: at(4, 5), ap: 2 } : unit,
      ),
    };
    expect(reachableObjectives(bomber, "u", OBJECTIVE_TUNING)).toEqual([]);
    const planted = createInteractHandler(OBJECTIVE_TUNING)(
      bomber,
      interact("u", OBJECTIVE.id),
      ctxWith(new Mulberry32Rng(1)),
    );
    expect(planted).toEqual({
      ok: false,
      error: {
        kind: "objective-target-missing",
        objectiveId: OBJECTIVE.id,
        targetId: POD.id,
      },
    });
    expect(objectiveComplete(state, objectiveOf(state))).toBe(false);
    expect(DESTROY_POD_OBJECTIVE.marker?.(objectiveOf(state), state)).toBe(
      undefined,
    );
    expect(objectiveResultFields(state)).toEqual({ podDestroyed: false });
    expect(objectiveResults(state)).toEqual([
      {
        kind: "destroy-pod",
        complete: false,
        failed: true,
        done: 0,
        total: 1,
      },
    ]);
  });
});

// ===========================================
// Spawn rules
// ===========================================

describe("a pod in the spawn rules", () => {
  it("never hatches, however its timer reads", () => {
    const mission = missionOn(4, "bugs");
    const hatched = hatch(mission, ctxWith(new Mulberry32Rng(3)), SPAWN);
    expect(hatched.events).toEqual([]);
    expect(podOf(hatched.state)).toEqual(POD);
  });

  it("draws nothing when no burst is pending, so a mission without one plays as it did", () => {
    const mission = missionOn(9);
    let forks = 0;
    const rng = new Mulberry32Rng(1);
    const counting = {
      ...ctxWith(rng),
      rng: Object.assign(Object.create(rng) as Mulberry32Rng, {
        fork: (label: string) => {
          forks += 1;
          return rng.fork(label);
        },
      }),
    };
    const applied = podBurst(mission, counting, SPAWN);
    expect(applied.state).toBe(mission);
    expect(applied.events).toEqual([]);
    expect(forks).toBe(0);
  });
});
