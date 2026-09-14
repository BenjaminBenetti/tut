import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../mapgen/model/tile-coord";
import { MEDKIT, REPAIR_KIT } from "../data/equipment";
import type { HealProfile } from "../model/equipment";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { UNITS_HEALED } from "../model/unit-healed-event";
import { healReach, resolveHealAt } from "./heal-service";
import {
  FIXTURE_TEMPLATES,
  missionWith,
  openField,
  unitAt,
  walledField,
} from "./tactical-fixtures.test-helper";

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The shipped medkit's effect: 10 to organic units within 2 tiles. */
const MEND: HealProfile = MEDKIT.heal!;

/** The shipped repair kit's effect: 25 to mechanical units within 2 tiles. */
const WELD: HealProfile = REPAIR_KIT.heal!;

/** The unit as the mission now has it. */
function unit(mission: TacticalState, id: string): Unit {
  return mission.units.find((u) => u.id === id)!;
}

describe("healReach", () => {
  it("mends living units of the user's side and make in the footprint, capped at full, and counts the whole", () => {
    // A medic at (1,1) throws at (3,1): the footprint reaches two tiles
    // out in every direction, the medic included.
    const mission = missionWith(openField().build(), [
      unitAt("medic", "infantry", at(1, 1), { hp: 7 }),
      unitAt("hurt", "infantry", at(3, 1), { hp: 2 }),
      unitAt("whole", "infantry", at(4, 2)),
      unitAt("far", "infantry", at(6, 1), { hp: 1 }),
      unitAt("dead", "infantry", at(3, 2), { hp: 0 }),
      unitAt("bug", "infantry", at(2, 1), { team: "bugs", hp: 3 }),
      unitAt("mech", "mech", at(3, 0), { hp: 4 }),
    ]);
    const reach = healReach(mission, unit(mission, "medic"), MEND, at(3, 1));
    expect(
      reach.beneficiaries.map((b) => [b.unit.id, b.amount, b.hpAfter]),
    ).toEqual([
      // Impact first, then by distance: the hurt squad on the tile, the
      // medic two tiles off. The bug and the mech are passed over, the
      // dead squad too, and "far" is three tiles out.
      ["hurt", 8, 10],
      ["medic", 3, 10],
    ]);
    expect(reach.alreadyWhole).toBe(1);
    expect(reach.footprint[0]?.tile).toMatchObject(at(3, 1));
  });

  it("a repair kit mends mechs and a mechanical squad, never flesh, by construction rather than kind (#1138)", () => {
    const base = missionWith(openField().build(), [
      unitAt("engineer", "infantry", at(1, 1), { hp: 5 }),
      unitAt("mech", "mech", at(3, 1), { hp: 1 }),
      unitAt("turret", "infantry", at(3, 2), { hp: 4 }),
    ]);
    // A squad-kind unit whose template says it is metal, the shape the
    // deployable turret takes (#1138).
    const mission: TacticalState = {
      ...base,
      templates: {
        ...base.templates,
        "squad:turret": {
          ...base.templates[FIXTURE_TEMPLATES.infantry]!,
          id: "squad:turret",
          construction: "mechanical",
        },
      },
      units: base.units.map((u) =>
        u.id === "turret" ? { ...u, templateId: "squad:turret" } : u,
      ),
    };
    const weld = healReach(mission, unit(mission, "engineer"), WELD, at(3, 1));
    expect(weld.beneficiaries.map((b) => [b.unit.id, b.amount])).toEqual([
      ["mech", 9],
      ["turret", 6],
    ]);
    expect(weld.alreadyWhole).toBe(0);
    const mend = healReach(mission, unit(mission, "engineer"), MEND, at(3, 1));
    expect(mend.beneficiaries.map((b) => b.unit.id)).toEqual(["engineer"]);
  });

  it("does not reach through a solid wall, as a blast does not", () => {
    const mission = missionWith(walledField(), [
      unitAt("medic", "infantry", at(1, 4), { hp: 9 }),
      unitAt("behind", "infantry", at(4, 4), { hp: 1 }),
      unitAt("beside", "infantry", at(2, 4), { hp: 1 }),
    ]);
    const reach = healReach(mission, unit(mission, "medic"), MEND, at(3, 4));
    expect(reach.beneficiaries.map((b) => b.unit.id)).toEqual([
      "beside",
      "medic",
    ]);
  });
});

describe("resolveHealAt", () => {
  it("restores the hit points and announces everyone mended in one event", () => {
    const before = missionWith(openField().build(), [
      unitAt("medic", "infantry", at(1, 1)),
      unitAt("hurt", "infantry", at(2, 1), { hp: 3 }),
      unitAt("hurt-2", "infantry", at(2, 2), { hp: 9 }),
    ]);
    const after = resolveHealAt(before, "medic", MEDKIT.id, MEND, at(2, 1));
    expect(unit(after.state, "hurt").hp).toBe(10);
    expect(unit(after.state, "hurt-2").hp).toBe(10);
    expect(unit(after.state, "medic").hp).toBe(10);
    expect(after.events).toEqual([
      {
        type: UNITS_HEALED,
        payload: {
          kitId: MEDKIT.id,
          userId: "medic",
          healed: [
            { unitId: "hurt", amount: 7, hpAfter: 10 },
            { unitId: "hurt-2", amount: 1, hpAfter: 10 },
          ],
        },
      },
    ]);
    // The input is untouched.
    expect(unit(before, "hurt").hp).toBe(3);
  });

  it("leaves the mission alone and raises nothing when there is nobody to mend", () => {
    const before = missionWith(openField().build(), [
      unitAt("medic", "infantry", at(1, 1)),
      unitAt("mech", "mech", at(2, 1), { hp: 3 }),
    ]);
    const after = resolveHealAt(before, "medic", MEDKIT.id, MEND, at(2, 1));
    expect(after.state).toBe(before);
    expect(after.events).toEqual([]);
    expect(
      resolveHealAt(before, "ghost", MEDKIT.id, MEND, at(2, 1)).events,
    ).toEqual([]);
  });
});
