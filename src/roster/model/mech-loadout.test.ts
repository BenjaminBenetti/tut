import { describe, expect, it } from "vitest";

import { PART_SLOTS } from "./mech-part";
import {
  LOADOUT_FIELD_FOR_SLOT,
  loadoutPartIds,
  type MechLoadout,
} from "./mech-loadout";

const loadout: MechLoadout = {
  name: "Skirmisher",
  chassisId: "chassis-vanguard",
  legsId: "legs-strider",
  armsId: "arms-manipulator",
  armWeaponId: "arm-weapon-autocannon",
  backWeaponId: "back-weapon-missile-pod",
  utilityIds: ["utility-radiator", "utility-targeting-computer"],
};

describe("LOADOUT_FIELD_FOR_SLOT", () => {
  it("covers every slot except utility", () => {
    const covered = Object.keys(LOADOUT_FIELD_FOR_SLOT).sort();
    const expected = PART_SLOTS.filter((slot) => slot !== "utility").sort();
    expect(covered).toEqual(expected);
  });

  it("points each slot at a field holding a part id", () => {
    for (const field of Object.values(LOADOUT_FIELD_FOR_SLOT)) {
      expect(typeof loadout[field]).toBe("string");
    }
  });
});

describe("loadoutPartIds", () => {
  it("lists chassis first, then single-part slots, then utilities in order", () => {
    expect(loadoutPartIds(loadout)).toEqual([
      "chassis-vanguard",
      "legs-strider",
      "arms-manipulator",
      "arm-weapon-autocannon",
      "back-weapon-missile-pod",
      "utility-radiator",
      "utility-targeting-computer",
    ]);
  });

  it("keeps duplicates so a validator can see them", () => {
    const doubled = {
      ...loadout,
      utilityIds: ["utility-radiator", "utility-radiator"],
    };
    expect(
      loadoutPartIds(doubled).filter((id) => id === "utility-radiator"),
    ).toHaveLength(2);
  });
});

describe("MechLoadout", () => {
  it("round-trips through JSON with and without upgrades", () => {
    const upgraded: MechLoadout = {
      ...loadout,
      upgrades: { "arm-weapon-autocannon": 1 },
    };
    for (const original of [loadout, upgraded]) {
      const restored = JSON.parse(JSON.stringify(original)) as MechLoadout;
      expect(restored).toStrictEqual(original);
    }
  });
});
