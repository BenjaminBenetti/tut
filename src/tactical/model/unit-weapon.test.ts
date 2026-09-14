import { describe, expect, it } from "vitest";

import type { UnitWeapon } from "./unit-weapon";
import {
  DEFAULT_WEAPON_NAME,
  PRIMARY_WEAPON_ID,
  defaultWeaponId,
  displayWeaponName,
  weaponOf,
} from "./unit-weapon";

// ===========================================
// Fixtures
// ===========================================

const SHAPE = { range: 8, accuracy: 65, damage: 3, armorPen: 0 };
const BITE: UnitWeapon = {
  id: PRIMARY_WEAPON_ID,
  name: DEFAULT_WEAPON_NAME,
  profile: { ...SHAPE, range: 1 },
};
const CARBINE: UnitWeapon = {
  id: PRIMARY_WEAPON_ID,
  name: "Carbine",
  profile: SHAPE,
};
const ARM: UnitWeapon = { id: "arm", name: "Autocannon", profile: SHAPE };
const BACK: UnitWeapon = {
  id: "back",
  name: DEFAULT_WEAPON_NAME,
  profile: SHAPE,
};

// ===========================================
// Tests
// ===========================================

describe("weaponOf and defaultWeaponId", () => {
  it("names the first weapon when nothing is asked for, and finds one by id", () => {
    expect(weaponOf([ARM, BACK], undefined)).toBe(ARM);
    expect(weaponOf([ARM, BACK], "back")).toBe(BACK);
    expect(weaponOf([ARM, BACK], "leg")).toBeUndefined();
    expect(defaultWeaponId([ARM, BACK])).toBe("arm");
    expect(defaultWeaponId([])).toBeUndefined();
  });
});

describe("displayWeaponName (#1130)", () => {
  it("labels a squad's named weapon and one of several, but not a lone placeholder", () => {
    // A bug's bite is just its attack: no label.
    expect(displayWeaponName([BITE], BITE)).toBeUndefined();
    // A squad's carbine is worth naming even though it is the only one.
    expect(displayWeaponName([CARBINE], CARBINE)).toBe("Carbine");
    // With several, every one is labelled, placeholder or not.
    expect(displayWeaponName([ARM, BACK], ARM)).toBe("Autocannon");
    expect(displayWeaponName([ARM, BACK], BACK)).toBe(DEFAULT_WEAPON_NAME);
  });
});
