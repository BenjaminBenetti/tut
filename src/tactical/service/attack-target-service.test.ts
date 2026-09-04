import { describe, expect, it } from "vitest";

import type { Spawner } from "../model/tactical-state";
import {
  enemyAttackTargets,
  findAttackTarget,
  SPAWNER_ARMOR,
  SPAWNER_NAME,
} from "./attack-target-service";
import {
  FIXTURE_TEMPLATES,
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const spawner: Spawner = {
  id: "spawner-1",
  pos: { x: 4, y: 0, z: 4 },
  hatchRadius: 3,
  hp: 20,
  timer: 2,
  destroyed: false,
};

/** One TDF squad, one bug and one live spawner. */
function mission(spawners: readonly Spawner[] = [spawner]) {
  return missionWith(
    openField().build(),
    [
      unitAt("u", "infantry", { x: 0, y: 0, z: 0 }),
      unitAt("b", "infantry", { x: 7, y: 0, z: 7 }, { team: "bugs" }),
    ],
    { spawners },
  );
}

// ===========================================
// Tests
// ===========================================

describe("findAttackTarget", () => {
  it("projects a unit, taking its armor and name from its template", () => {
    const m = mission();
    const target = findAttackTarget(m, "u");
    expect(target).toEqual({
      kind: "unit",
      id: "u",
      name: FIXTURE_TEMPLATES.infantry,
      pos: { x: 0, y: 0, z: 0 },
      hp: 10,
      armor: 0,
      team: "tdf",
    });
  });

  it("projects a spawner as an unarmoured target on the bugs' side", () => {
    expect(findAttackTarget(mission(), "spawner-1")).toEqual({
      kind: "spawner",
      id: "spawner-1",
      name: SPAWNER_NAME,
      pos: spawner.pos,
      hp: 20,
      armor: SPAWNER_ARMOR,
      team: "bugs",
    });
  });

  it("resolves a destroyed spawner too, so the rules can reject it by name", () => {
    const gone = { ...spawner, hp: 0, destroyed: true };
    expect(findAttackTarget(mission([gone]), "spawner-1")).toMatchObject({
      kind: "spawner",
      hp: 0,
    });
  });

  it("is undefined for an id the mission holds neither of", () => {
    expect(findAttackTarget(mission(), "nobody")).toBeUndefined();
  });

  it("throws when a unit references a template the mission lacks", () => {
    const m = mission();
    const broken = {
      ...m,
      units: m.units.map((unit) =>
        unit.id === "u" ? { ...unit, templateId: "missing" } : unit,
      ),
    };
    expect(() => findAttackTarget(broken, "u")).toThrow(/template missing/);
  });
});

describe("enemyAttackTargets", () => {
  it("gives TDF the living bugs and the standing spawners", () => {
    expect(enemyAttackTargets(mission(), "tdf").map((t) => t.id)).toEqual([
      "b",
      "spawner-1",
    ]);
  });

  it("gives the bugs only TDF units — a spawner is their own", () => {
    expect(enemyAttackTargets(mission(), "bugs").map((t) => t.id)).toEqual([
      "u",
    ]);
  });

  it("leaves out the dead and the destroyed", () => {
    const m = mission([{ ...spawner, hp: 0, destroyed: true }]);
    const down = {
      ...m,
      units: m.units.map((unit) =>
        unit.id === "b" ? { ...unit, hp: 0 } : unit,
      ),
    };
    expect(enemyAttackTargets(down, "tdf")).toEqual([]);
  });
});
