import { describe, expect, it } from "vitest";

import { LOADOUT_FIELD_FOR_SLOT, loadoutPartIds } from "../model/mech-loadout";
import type { MechPart } from "../model/mech-part";
import { isChassisPart } from "../model/mech-part";
import { DataSquadTypeCatalogue } from "../repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../repository/static-part-catalogue";
import { STARTER_PARTS } from "./parts";
import { SQUAD_TYPES } from "./squad-types";
import { STARTER_LOADOUT, STARTER_ROSTER } from "./starter-roster";

const parts = new StaticPartCatalogue(STARTER_PARTS);
const squadTypes = new DataSquadTypeCatalogue(SQUAD_TYPES);

/** Every part of the loadout other than the chassis. */
function fittedParts(): MechPart[] {
  return loadoutPartIds(STARTER_LOADOUT)
    .filter((id) => id !== STARTER_LOADOUT.chassisId)
    .map((id) => parts.getPart(id))
    .filter((part): part is MechPart => part !== undefined);
}

describe("STARTER_LOADOUT", () => {
  it("references only starter parts, each in its own slot", () => {
    for (const [slot, field] of Object.entries(LOADOUT_FIELD_FOR_SLOT)) {
      const part = parts.getPart(STARTER_LOADOUT[field]);
      expect(part, field).toBeDefined();
      expect(part?.slot, field).toBe(slot);
    }
    for (const id of STARTER_LOADOUT.utilityIds) {
      expect(parts.getPart(id)?.slot, id).toBe("utility");
    }
  });

  it("has no duplicate parts", () => {
    const ids = loadoutPartIds(STARTER_LOADOUT);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fits its chassis: utility slots, weight and power balance", () => {
    const chassis = parts.getPart(STARTER_LOADOUT.chassisId);
    if (chassis === undefined || !isChassisPart(chassis)) {
      throw new Error("starter chassis is missing or not a chassis");
    }
    const fitted = fittedParts();
    expect(fitted).toHaveLength(loadoutPartIds(STARTER_LOADOUT).length - 1);
    expect(STARTER_LOADOUT.utilityIds.length).toBeLessThanOrEqual(
      chassis.capacity.utilitySlots,
    );
    const weight = fitted.reduce((sum, part) => sum + part.stats.weight, 0);
    expect(weight).toBeLessThanOrEqual(chassis.capacity.maxWeight);
    const power =
      chassis.stats.power +
      fitted.reduce((sum, part) => sum + part.stats.power, 0);
    expect(power).toBeGreaterThanOrEqual(0);
  });
});

describe("STARTER_ROSTER", () => {
  it("uses catalogue squad types with unique call signs", () => {
    for (const squad of STARTER_ROSTER.squads) {
      expect(squadTypes.getSquadType(squad.typeId), squad.typeId).toBeDefined();
    }
    const names = STARTER_ROSTER.squads.map((squad) => squad.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("fields two rifle squads and one mech on the starter loadout", () => {
    expect(STARTER_ROSTER.squads.map((squad) => squad.typeId)).toEqual([
      "rifle",
      "rifle",
    ]);
    expect(STARTER_ROSTER.mechs).toHaveLength(1);
    expect(STARTER_ROSTER.mechs[0]?.loadout).toBe(STARTER_LOADOUT);
  });
});
