import { describe, expect, it } from "vitest";

import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { UNIT_ABANDONED } from "../model/unit-abandoned-event";
import { leaveBehind, standingForce } from "./left-behind-service";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number) => ({ x, y: 0, z });

/**
 * One of everything the stranding must tell apart: two squads and a
 * mech standing, a turret, a squad already dead, a generator, a freed
 * civilian group, a bug, and a squad aboard.
 */
function crowd(): TacticalState {
  const units: Unit[] = [
    unitAt("unit-1", "infantry", at(1, 1)),
    unitAt("bug-1", "infantry", at(7, 7), { team: "bugs" }),
    unitAt("unit-2", "mech", at(2, 1)),
    { ...unitAt("unit-3", "infantry", at(3, 1)), hp: 0 },
    { ...unitAt("turret-1", "infantry", at(4, 1)), kind: "turret" },
    { ...unitAt("gen-1", "infantry", at(5, 1)), kind: "generator" },
    { ...unitAt("civ-1", "infantry", at(6, 1)), kind: "civilian" },
    unitAt("unit-4", "infantry", at(1, 2)),
  ];
  return missionWith(openField().build(), units, {
    extracted: [unitAt("unit-5", "infantry", at(0, 0))],
  });
}

// ===========================================
// standingForce
// ===========================================

describe("standingForce", () => {
  it("is every living TDF unit on the map, turrets included, generators, civilian groups, bugs and the dead not", () => {
    expect(standingForce(crowd()).map((unit) => unit.id)).toEqual([
      "unit-1",
      "unit-2",
      "turret-1",
      "unit-4",
    ]);
  });
});

// ===========================================
// leaveBehind
// ===========================================

describe("leaveBehind", () => {
  it("drops the standing force to zero hit points, one UnitAbandoned each in units order", () => {
    const mission = crowd();
    const left = leaveBehind(mission);
    expect(left.events).toEqual(
      ["unit-1", "unit-2", "turret-1", "unit-4"].map((unitId) => ({
        type: UNIT_ABANDONED,
        payload: { unitId },
      })),
    );
    const hp = Object.fromEntries(
      left.state.units.map((unit) => [unit.id, unit.hp]),
    );
    expect(hp["unit-1"]).toBe(0);
    expect(hp["unit-2"]).toBe(0);
    expect(hp["turret-1"]).toBe(0);
    expect(hp["unit-4"]).toBe(0);
  });

  it("leaves the bugs, the dead, the generator, the civilian group and whoever boarded exactly as they were", () => {
    const mission = crowd();
    const left = leaveBehind(mission);
    for (const id of ["bug-1", "unit-3", "gen-1", "civ-1"]) {
      expect(left.state.units.find((unit) => unit.id === id)).toBe(
        mission.units.find((unit) => unit.id === id),
      );
    }
    expect(left.state.extracted).toBe(mission.extracted);
    expect(left.state.outcome).toBeUndefined();
  });

  it("returns the mission itself when nobody is left to strand, and never mutates it", () => {
    const empty = missionWith(openField().build(), [
      unitAt("bug-1", "infantry", at(7, 7), { team: "bugs" }),
    ]);
    expect(leaveBehind(empty)).toEqual({ state: empty, events: [] });
    expect(leaveBehind(empty).state).toBe(empty);
    const mission = crowd();
    const before = structuredClone(mission);
    leaveBehind(mission);
    expect(mission).toEqual(before);
  });
});
