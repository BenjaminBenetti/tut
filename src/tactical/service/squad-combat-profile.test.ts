import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import type { Squad } from "../../roster/model/squad";
import { UNIT_TUNING } from "../data/unit-tuning";
import { squadCombatProfile } from "./squad-combat-profile";
import { squadUnit } from "./unit-factory";

/** A full-strength, green squad of `typeId`. */
function squad(typeId: string, maxStrength = 5): Squad {
  return {
    id: "squad-1",
    name: "Alpha",
    typeId,
    strength: maxStrength,
    maxStrength,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

describe("squadCombatProfile (#1132)", () => {
  it("is exactly what the unit factory freezes into a green squad's template, for every shipped type", () => {
    for (const type of SQUAD_TYPES) {
      const profile = squadCombatProfile(type, UNIT_TUNING.infantry);
      const { template } = squadUnit(
        squad(type.id),
        type,
        { pos: { x: 0, y: 0, z: 0 }, facing: "n" },
        { ids: new SequentialIdGenerator(), tuning: UNIT_TUNING },
      );
      expect(template.maxHp).toBe(profile.maxHp);
      expect(template.maxAp).toBe(profile.maxAp);
      expect(template.move).toBe(profile.move);
      expect(template.armor).toBe(profile.armor);
      expect(template.sightRange).toBe(profile.sightRange);
      expect(template.weapons).toEqual([profile.weapon]);
    }
  });

  it("scales hit points with the squad's size and defaults to a full squad", () => {
    const rifle = SQUAD_TYPES.find((t) => t.id === "rifle")!;
    expect(squadCombatProfile(rifle, UNIT_TUNING.infantry).maxHp).toBe(20);
    expect(squadCombatProfile(rifle, UNIT_TUNING.infantry, 3).maxHp).toBe(12);
  });
});
