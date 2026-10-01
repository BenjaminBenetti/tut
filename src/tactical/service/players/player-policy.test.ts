import { describe, expect, it } from "vitest";

import { CAPTURE_NET } from "../../data/equipment";
import type { CaptureSpecimenObjective } from "../../model/tactical-state";
import type { TacticalState } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { FIXTURE_TEMPLATES, unitAt } from "../tactical-fixtures.test-helper";
import { OBJECTIVE_STRATEGIES } from "./objective-strategies.test-helper";
import type { UnitOrder } from "./objective-strategy.test-helper";
import { shotOptions } from "./player-combat.test-helper";
import {
  FIXTURE_PLAYER_RULES,
  lookingMission,
} from "./player-fixtures.test-helper";
import {
  killsSpared,
  planForce,
  standingOrders,
  underPlan,
} from "./player-policy.test-helper";
import { observe } from "./player-view.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** Live Specimen's deciding objective: a lurker, alive. */
const CAPTURE: CaptureSpecimenObjective = {
  id: "capture",
  kind: "capture-specimen",
  species: "lurker",
  complete: false,
  failed: false,
};

/** A lurker (the fixture bug, of the wanted species) at `x, z`. */
function lurker(id: string, x: number, z: number): Unit {
  return {
    ...unitAt(id, "infantry", { x, y: 0, z }, { team: "bugs" }),
    sourceId: "lurker",
  };
}

/**
 * A mission with the capture objective, the units, squads that carry a
 * net (so the capture stays open), and the fixture bug's weapon cut to
 * a lurker's bite (range 1), so only a unit on the next tile is in its
 * reach.
 */
function captureMission(units: readonly Unit[]): TacticalState {
  const mission = lookingMission(units);
  const bug = mission.templates[FIXTURE_TEMPLATES.bug];
  const squad = mission.templates[FIXTURE_TEMPLATES.infantry];
  if (bug === undefined || squad === undefined) {
    throw new Error("fixture templates");
  }
  return {
    ...mission,
    objectives: [CAPTURE],
    templates: {
      ...mission.templates,
      [FIXTURE_TEMPLATES.infantry]: { ...squad, equipment: [CAPTURE_NET.id] },
      [FIXTURE_TEMPLATES.bug]: {
        ...bug,
        weapons: bug.weapons.map((weapon) => ({
          ...weapon,
          profile: { ...weapon.profile, range: 1 },
        })),
      },
    },
  };
}

/** `unit` carrying a netted lurker home. */
function carrying(unit: Unit): Unit {
  return {
    ...unit,
    carrying: {
      unitId: "netted",
      species: "lurker",
      templateId: FIXTURE_TEMPLATES.bug,
      movePenalty: 1,
    },
  };
}

// ===========================================
// Tests
// ===========================================

describe("planning the force round a capture (#1179 C3b)", () => {
  it("spares the lurkers in sight while one is wanted, bar one with a unit of ours in its reach", () => {
    const view = observe(
      captureMission([
        unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
        lurker("far", 5, 1),
        lurker("biting", 1, 2),
        unitAt("other", "infantry", { x: 4, y: 0, z: 4 }, { team: "bugs" }),
      ]),
    );
    expect(view.enemies.map((enemy) => enemy.id).sort()).toEqual([
      "biting",
      "far",
      "other",
    ]);
    const plan = planForce(view, OBJECTIVE_STRATEGIES);
    expect([...plan.spared]).toEqual(["far"]);
    expect(plan.walkers.size).toBe(0);
  });

  it("spares nothing once a squad carries one, and walks the carrier home", () => {
    const view = observe(
      captureMission([
        carrying(unitAt("carrier", "infantry", { x: 4, y: 0, z: 4 })),
        unitAt("alpha", "infantry", { x: 2, y: 0, z: 2 }),
        lurker("far", 7, 4),
      ]),
    );
    const plan = planForce(view, OBJECTIVE_STRATEGIES);
    expect(plan.spared.size).toBe(0);
    expect(plan.settled).toBe(true);
    expect([...plan.couriers]).toEqual(["carrier"]);
    expect([...plan.walkers]).toEqual(["carrier"]);
    const { orders } = standingOrders(view, plan);
    expect(orders.get("carrier")).toMatchObject({
      kind: "extract",
      courier: true,
    });
    expect(orders.get("alpha")?.kind).toBe("extract");
    expect(orders.get("alpha")?.courier).toBeUndefined();
  });

  it("puts the plan's spared bugs on whatever order a unit acts under", () => {
    const view = observe(
      captureMission([
        unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
        lurker("far", 5, 1),
      ]),
    );
    const plan = planForce(view, OBJECTIVE_STRATEGIES);
    const hunt: UnitOrder = { kind: "hunt", goals: [{ x: 5, y: 0, z: 1 }] };
    expect(underPlan(hunt, plan)).toEqual({ ...hunt, spare: ["far"] });
    expect(underPlan(hunt, { ...plan, spared: new Set() })).toBe(hunt);
  });
});

describe("a shot at a spared bug", () => {
  it("is held when it could kill, and fair when it can only wound", () => {
    // The fixture rifle's band reaches 3 and stays under 10: it can kill
    // a lurker at 3 hit points, never one at 10.
    const view = observe(
      captureMission([
        unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
        { ...lurker("worn", 3, 1), hp: 3 },
        lurker("fresh", 1, 3),
      ]),
    );
    const alpha = view.own[0];
    if (alpha === undefined) throw new Error("alpha stands");
    const shots = shotOptions(view, alpha, FIXTURE_PLAYER_RULES);
    const at = (id: string) => shots.find((shot) => shot.targetId === id);
    const worn = at("worn");
    const fresh = at("fresh");
    if (worn === undefined || fresh === undefined) throw new Error("in range");
    expect(worn.preview.damage[1]).toBeGreaterThanOrEqual(3);
    expect(fresh.preview.damage[1]).toBeLessThan(10);
    const spare: UnitOrder = {
      kind: "hunt",
      goals: [],
      spare: ["worn", "fresh"],
    };
    expect(killsSpared(spare, worn)).toBe(true);
    expect(killsSpared(spare, fresh)).toBe(false);
    expect(killsSpared({ kind: "hunt", goals: [] }, worn)).toBe(false);
  });
});
