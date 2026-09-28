import { describe, expect, it } from "vitest";

import { broodmotherFlight } from "../../../bugs/service/broodmother-flight-step";
import { broodmotherHp } from "../../../bugs/service/broodmother-service";
import {
  fieldMap,
  motherMission,
} from "../../../bugs/service/broodmother.test-helper";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ATTACK_RESOLVED } from "../../model/attack-resolved-event";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type {
  KillBroodmotherObjective,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { unitAt } from "../tactical-fixtures.test-helper";
import {
  huntStatus,
  KILL_BROODMOTHER_OBJECTIVE,
  KILL_BROODMOTHER_STEP,
} from "./kill-broodmother-objective";
import {
  objectiveComplete,
  objectiveFailed,
  objectiveResultFields,
} from "./objective-status";

// ===========================================
// Fixtures
// ===========================================

/** The squad, far from her, at the south-west corner of the field. */
const SQUAD: Unit = unitAt("squad-1", "infantry", { x: 1, y: 0, z: 1 });

/** A step context; the hunt's step draws nothing. */
const CTX = { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() };

/** Her hit points at difficulty 1, unscarred: the fixture's Broodmother. */
const MAX_HP = broodmotherHp(1, 0);

/** Half her hit points: low enough to send her running. */
const HALF_HP = Math.floor(MAX_HP / 2);

/**
 * A 16×16 field with the squad and the Broodmother at `anchor` on `hp`,
 * and a kill-broodmother objective on her.
 */
function hunt(
  anchor = { x: 7, z: 7 },
  hp?: number,
): {
  mission: TacticalState;
  mother: Unit;
  objective: KillBroodmotherObjective;
} {
  const { mission, mother } = motherMission(
    fieldMap(16, 16).build(),
    [SQUAD],
    { x: anchor.x, y: 0, z: anchor.z },
    { phase: "player", ...(hp === undefined ? {} : { hp }) },
  );
  const objective: KillBroodmotherObjective = {
    id: "objective-1",
    kind: "kill-broodmother",
    targetId: mother.id,
    complete: false,
    failed: false,
  };
  return {
    mission: { ...mission, objectives: [objective] },
    mother,
    objective,
  };
}

/** `mission` with `unitId`'s hit points set to `hp`. */
function withHp(
  mission: TacticalState,
  unitId: string,
  hp: number,
): TacticalState {
  return {
    ...mission,
    units: mission.units.map((unit) =>
      unit.id === unitId ? { ...unit, hp } : unit,
    ),
  };
}

/** The mission's only objective, as a hunt. */
function only(mission: TacticalState): KillBroodmotherObjective {
  const [objective] = mission.objectives;
  if (objective?.kind !== "kill-broodmother") {
    throw new Error("expected the hunt");
  }
  return objective;
}

// ===========================================
// Status
// ===========================================

describe("huntStatus (#1179, campaign arc §6.8)", () => {
  it("is open while she lives on the map and the force stands", () => {
    const { mission, objective } = hunt();
    expect(huntStatus(objective, mission)).toBe("open");
  });

  it("is complete once she lies dead on the map, whatever the squad does next", () => {
    const { mission, mother, objective } = hunt();
    const dead = withHp(mission, mother.id, 0);
    expect(huntStatus(objective, dead)).toBe("complete");
    // The squad falling afterwards takes nothing back.
    const lost = withHp(dead, SQUAD.id, 0);
    expect(huntStatus(objective, lost)).toBe("complete");
  });

  it("fails once she has escaped off the map edge", () => {
    // Half health on the east edge of the 16-wide field: her block
    // (x 13–15) touches it, so the flight step takes her off it.
    const { mission, mother, objective } = hunt({ x: 13, z: 7 }, HALF_HP);
    const fled = broodmotherFlight(mission).state;
    expect(fled.escaped?.map((unit) => unit.id)).toEqual([mother.id]);
    expect(huntStatus(objective, fled)).toBe("failed");
  });

  it("fails when the mission is over or nobody is left who could kill her", () => {
    const { mission, objective } = hunt();
    expect(huntStatus(objective, { ...mission, outcome: "extracted" })).toBe(
      "failed",
    );
    expect(huntStatus(objective, withHp(mission, SQUAD.id, 0))).toBe("failed");
    expect(
      huntStatus(objective, {
        ...mission,
        units: mission.units.filter((unit) => unit.id !== SQUAD.id),
        extracted: [SQUAD],
      }),
    ).toBe("failed");
  });

  it("fails when she was never placed", () => {
    const { mission, objective } = hunt();
    expect(
      huntStatus({ ...objective, targetId: "unit-missing" }, mission),
    ).toBe("failed");
  });

  it("is what the live status reads", () => {
    const { mission, mother } = hunt();
    const [objective] = mission.objectives;
    expect(objectiveComplete(mission, objective!)).toBe(false);
    expect(objectiveFailed(mission, objective!)).toBe(false);
    const dead = withHp(mission, mother.id, 0);
    expect(objectiveComplete(dead, objective!)).toBe(true);
    expect(objectiveFailed(dead, objective!)).toBe(false);
    const fled = broodmotherFlight(
      hunt({ x: 13, z: 7 }, HALF_HP).mission,
    ).state;
    expect(objectiveFailed(fled, fled.objectives[0]!)).toBe(true);
    expect(objectiveComplete(fled, fled.objectives[0]!)).toBe(false);
  });
});

// ===========================================
// Phase step
// ===========================================

describe("KILL_BROODMOTHER_STEP", () => {
  it("leaves an open hunt alone and says nothing", () => {
    const { mission } = hunt();
    const stepped = KILL_BROODMOTHER_STEP(mission, CTX);
    expect(stepped.state).toBe(mission);
    expect(stepped.events).toEqual([]);
  });

  it("marks her death once and announces it", () => {
    const { mission, mother } = hunt();
    const stepped = KILL_BROODMOTHER_STEP(withHp(mission, mother.id, 0), CTX);
    expect(only(stepped.state)).toMatchObject({
      complete: true,
      failed: false,
    });
    expect(stepped.events).toEqual([
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: "objective-1", complete: true, failed: false },
      },
    ]);
    expect(KILL_BROODMOTHER_STEP(stepped.state, CTX).events).toEqual([]);
  });

  it("fails the hunt in the same phase opening the flight step lets her go", () => {
    const { mission } = hunt({ x: 13, z: 7 }, HALF_HP);
    const fled = broodmotherFlight(mission).state;
    const stepped = KILL_BROODMOTHER_STEP(fled, CTX);
    expect(only(stepped.state)).toMatchObject({
      complete: false,
      failed: true,
    });
    expect(stepped.events).toEqual([
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: "objective-1", complete: false, failed: true },
      },
    ]);
  });

  it("never flips a flag back", () => {
    const { mission, mother } = hunt();
    const won = KILL_BROODMOTHER_STEP(withHp(mission, mother.id, 0), CTX).state;
    // Even were she somehow back on her feet, the flag stands.
    const revived = withHp(won, mother.id, 10);
    expect(KILL_BROODMOTHER_STEP(revived, CTX).events).toEqual([]);
    expect(only(KILL_BROODMOTHER_STEP(revived, CTX).state).complete).toBe(true);
    // And a failed hunt stays failed when she is later found dead.
    const failed = KILL_BROODMOTHER_STEP(
      { ...mission, outcome: "lost" },
      CTX,
    ).state;
    const found = withHp({ ...failed, outcome: undefined }, mother.id, 0);
    expect(only(KILL_BROODMOTHER_STEP(found, CTX).state)).toMatchObject({
      complete: false,
      failed: true,
    });
  });
});

// ===========================================
// Rules
// ===========================================

describe("KILL_BROODMOTHER_OBJECTIVE", () => {
  it("marks and points at her tile only while she lives", () => {
    const { mission, mother, objective } = hunt();
    expect(KILL_BROODMOTHER_OBJECTIVE.marker?.(objective, mission)).toEqual(
      mother.pos,
    );
    expect(
      KILL_BROODMOTHER_OBJECTIVE.destination?.(objective, mission),
    ).toEqual({ position: mother.pos, targetIds: [mother.id] });
    const dead = withHp(mission, mother.id, 0);
    expect(
      KILL_BROODMOTHER_OBJECTIVE.marker?.(objective, dead),
    ).toBeUndefined();
    expect(KILL_BROODMOTHER_OBJECTIVE.destination?.(objective, dead)).toEqual({
      targetIds: [mother.id],
    });
  });

  it("tallies one Broodmother", () => {
    const { mission, mother, objective } = hunt();
    expect(KILL_BROODMOTHER_OBJECTIVE.tally?.(objective, mission)).toEqual({
      done: 0,
      total: 1,
    });
    expect(
      KILL_BROODMOTHER_OBJECTIVE.tally?.(
        objective,
        withHp(mission, mother.id, 0),
      ),
    ).toEqual({ done: 1, total: 1 });
  });

  it("reports her death, her escape and, while she lives, her last wound", () => {
    const { mission, mother } = hunt();
    const dead = withHp(mission, mother.id, 0);
    expect(objectiveResultFields(dead)).toEqual({
      broodmotherKilled: true,
      broodmotherEscaped: false,
    });

    const shot = {
      type: ATTACK_RESOLVED,
      payload: {
        attackerId: SQUAD.id,
        targetId: mother.id,
        hit: true,
        damage: MAX_HP - HALF_HP,
        targetHp: HALF_HP,
        weaponRange: 5,
      },
    } as const;
    const { mission: edge } = hunt({ x: 13, z: 7 }, HALF_HP);
    const fled = broodmotherFlight({ ...edge, log: [shot] }).state;
    expect(objectiveResultFields(fled)).toEqual({
      broodmotherKilled: false,
      broodmotherEscaped: true,
      broodmotherWound: "gunfire",
    });
  });
});
