import { describe, expect, it } from "vitest";

import { GARRISON_TURRET_TUNING, TURRET_TUNING } from "../data/turret-tuning";
import { GARRISON_TURRET_SOURCE_ID } from "../model/turret";
import { TURRET_DESTROYED } from "../model/turret-destroyed-event";
import { UNIT_DIED } from "../model/unit-died-event";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { downedEvent } from "./downed-unit-event";
import { unitAt } from "./tactical-fixtures.test-helper";
import { turretUnit } from "./unit-factory";

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
});
