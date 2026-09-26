import { describe, expect, it } from "vitest";

import { COMBAT_TUNING } from "../data/combat-tuning";
import type { WeaponProfile } from "../model/weapon-profile";
import { damageRange, resistanceTo } from "./attack-formulae";

// ===========================================
// Fixtures
// ===========================================

/** A 12-damage weapon with no penetration: a band of 9–15 on bare skin. */
const PLAIN: WeaponProfile = {
  range: 5,
  accuracy: 60,
  damage: 12,
  armorPen: 0,
};

/** The same weapon throwing acid. */
const ACID: WeaponProfile = { ...PLAIN, tags: ["acid"] };

// ===========================================
// Resistance
// ===========================================

describe("resistanceTo (campaign arc §10.2)", () => {
  it("is the target's resistance to a tag the weapon carries, and nothing otherwise", () => {
    expect(resistanceTo(ACID, { acid: 3 })).toBe(3);
    expect(resistanceTo(ACID, { spine: 3 })).toBe(0);
    expect(resistanceTo(PLAIN, { acid: 3 })).toBe(0);
    expect(resistanceTo(ACID, undefined)).toBe(0);
  });

  it("takes the best of two tags rather than their sum", () => {
    expect(
      resistanceTo({ tags: ["acid", "spine"] }, { acid: 2, spine: 3 }),
    ).toBe(3);
  });
});

describe("damageRange with resistance (campaign arc §10.2)", () => {
  it("takes a resisted tag's points off both ends of the band, after armour", () => {
    // 12 ± 25% is 9–15; 4 armour makes it 5–11; 3 acid resistance 2–8.
    expect(damageRange(ACID, 4, COMBAT_TUNING)).toEqual([5, 11]);
    expect(damageRange(ACID, 4, COMBAT_TUNING, { acid: 3 })).toEqual([2, 8]);
  });

  it("leaves a hit whose tag the target does not resist, or an untagged hit, exactly as it was", () => {
    const band = damageRange(PLAIN, 4, COMBAT_TUNING);
    expect(damageRange(PLAIN, 4, COMBAT_TUNING, { acid: 3 })).toEqual(band);
    expect(damageRange(ACID, 4, COMBAT_TUNING, { spine: 3 })).toEqual(band);
  });

  it("comes off after the minimum-damage floor, so a hit it fully absorbs does nothing", () => {
    // The spitter's spit on a mech: 4 damage, pen 1, against 6 armour
    // floors at 1 either way; 3 points of acid plate take it to 0.
    const spit: WeaponProfile = {
      range: 6,
      accuracy: 60,
      damage: 4,
      armorPen: 1,
      tags: ["acid"],
    };
    expect(damageRange(spit, 6, COMBAT_TUNING)).toEqual([1, 1]);
    expect(damageRange(spit, 6, COMBAT_TUNING, { acid: 3 })).toEqual([0, 0]);
  });
});

// ===========================================
// Armour-piercing rounds
// ===========================================

describe("damageRange with armour-piercing rounds (campaign arc §10.2)", () => {
  /** The plain weapon loaded with two points of piercing rounds. */
  const AP: WeaponProfile = { ...PLAIN, pierce: 2 };

  it("strips its points off the target's armour, on top of the gun's own penetration", () => {
    // 9–15 against 4 armour is 5–11; the rounds leave 2 armour, 7–13.
    expect(damageRange(PLAIN, 4, COMBAT_TUNING)).toEqual([5, 11]);
    expect(damageRange(AP, 4, COMBAT_TUNING)).toEqual([7, 13]);
    // With a pen 1 gun, 4 − 1 − 2 leaves 1 armour: 8–14.
    expect(damageRange({ ...AP, armorPen: 1 }, 4, COMBAT_TUNING)).toEqual([
      8, 14,
    ]);
  });

  it("strips armour to nothing but never below it", () => {
    // 1 armour less 2 pierce is bare skin: the band itself, not a bonus.
    expect(damageRange(AP, 1, COMBAT_TUNING)).toEqual([9, 15]);
    expect(damageRange(AP, 0, COMBAT_TUNING)).toEqual([9, 15]);
    expect(damageRange(PLAIN, 0, COMBAT_TUNING)).toEqual([9, 15]);
  });

  it("comes off before the minimum-damage floor, so it cannot lift a hit the plate still stops", () => {
    // A 4-damage gun (3–5) against 8 armour floors at 1; the rounds
    // leave 6 armour, which still stops it. Pierce added after the
    // floor would have made it 3.
    const weak: WeaponProfile = { ...PLAIN, damage: 4, pierce: 2 };
    expect(damageRange({ ...weak, pierce: 0 }, 8, COMBAT_TUNING)).toEqual([
      1, 1,
    ]);
    expect(damageRange(weak, 8, COMBAT_TUNING)).toEqual([1, 1]);
    // Against 5 the rounds leave 3, and the top of the band (5) gets
    // two points through where the plain gun still floors.
    expect(damageRange({ ...weak, pierce: 0 }, 5, COMBAT_TUNING)).toEqual([
      1, 1,
    ]);
    expect(damageRange(weak, 5, COMBAT_TUNING)).toEqual([1, 2]);
  });

  it("does nothing with no rounds loaded, or a nonsense negative load", () => {
    const band = damageRange(PLAIN, 4, COMBAT_TUNING);
    expect(damageRange({ ...PLAIN, pierce: 0 }, 4, COMBAT_TUNING)).toEqual(
      band,
    );
    expect(damageRange({ ...PLAIN, pierce: -3 }, 4, COMBAT_TUNING)).toEqual(
      band,
    );
  });

  it("works alongside resistance: pierce before the floor, resistance after", () => {
    // 4 armour less 2 pierce: 7–13; 3 acid resistance: 4–10.
    expect(
      damageRange({ ...AP, tags: ["acid"] }, 4, COMBAT_TUNING, { acid: 3 }),
    ).toEqual([4, 10]);
  });
});
