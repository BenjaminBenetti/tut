import { describe, expect, it } from "vitest";

import { CIVILIAN_TUNING } from "../data/civilian-tuning";
import { GARRISON_TURRET_TUNING, TURRET_TUNING } from "../data/turret-tuning";
import { CIVILIANS_KILLED } from "../model/civilians-killed-event";
import { GARRISON_TURRET_SOURCE_ID } from "../model/turret";
import { TURRET_DESTROYED } from "../model/turret-destroyed-event";
import { UNIT_DIED } from "../model/unit-died-event";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { downedEvent } from "./downed-unit-event";
import { FIXTURE_TEMPLATES, unitAt } from "./tactical-fixtures.test-helper";
import { civilianUnit, turretUnit } from "./unit-factory";

// ===========================================
// Tests
// ===========================================

describe("downedEvent (#1155)", () => {
  const at = { x: 2, y: 0, z: 3 };

  it("gives a squad or a bug a UnitDied, with the killer when there is one", () => {
    const squad = unitAt("s1", "infantry", at);
    expect(downedEvent(squad, "b1")).toEqual({
      type: UNIT_DIED,
      payload: { unitId: "s1", killerId: "b1" },
    });
    const bug = unitAt("b1", "infantry", at, { team: "bugs" });
    expect(downedEvent(bug)).toEqual({
      type: UNIT_DIED,
      payload: { unitId: "b1" },
    });
  });

  it("gives an engineer's turret and a garrison turret a TurretDestroyed at its tile", () => {
    const ids = new SequentialIdGenerator();
    const engineers = turretUnit(
      TURRET_TUNING,
      "tdf",
      { pos: at, facing: "n" },
      ids,
    ).unit;
    expect(downedEvent(engineers, "b1")).toEqual({
      type: TURRET_DESTROYED,
      payload: { turretId: engineers.id, pos: at, killerId: "b1" },
    });
    const garrison = turretUnit(
      GARRISON_TURRET_TUNING,
      "tdf",
      { pos: at, facing: "n" },
      ids,
      GARRISON_TURRET_SOURCE_ID,
    ).unit;
    expect(downedEvent(garrison)).toEqual({
      type: TURRET_DESTROYED,
      payload: { turretId: garrison.id, pos: at },
    });
  });

  it("drops a carrier's specimen with its UnitDied, and gives a civilian group a CiviliansKilled (#1179, campaign arc §6.4)", () => {
    const specimen = {
      unitId: "lurker-1",
      species: "lurker" as const,
      templateId: FIXTURE_TEMPLATES.bug,
      movePenalty: 1,
    };
    const carrier = { ...unitAt("s1", "infantry", at), carrying: specimen };
    expect(downedEvent(carrier, "b1")).toEqual({
      type: UNIT_DIED,
      payload: { unitId: "s1", killerId: "b1", dropped: specimen },
    });
    const group = civilianUnit(
      CIVILIAN_TUNING,
      { pos: at, facing: "n" },
      new SequentialIdGenerator(),
    ).unit;
    expect(downedEvent(group, "b1")).toEqual({
      type: CIVILIANS_KILLED,
      payload: { unitId: group.id, pos: at, killerId: "b1" },
    });
  });
});
