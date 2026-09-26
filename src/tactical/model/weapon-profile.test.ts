import { describe, expect, it } from "vitest";

import type { WeaponProfile } from "./weapon-profile";
import {
  MELEE_RANGE,
  isBallistic,
  isMelee,
  isMeleeRange,
  pierceOf,
} from "./weapon-profile";

// ===========================================
// Tests
// ===========================================

describe("isMeleeRange", () => {
  it("is true only up to the contact range", () => {
    expect(isMeleeRange(MELEE_RANGE)).toBe(true);
    expect(isMeleeRange(MELEE_RANGE + 1)).toBe(false);
    expect(isMeleeRange(8)).toBe(false);
  });

  // Rules and presentation both ask "was that melee", and #457 was the two
  // of them answering it differently. They share this predicate so the
  // answer cannot drift again.
  it("gives the same answer as the profile-level check", () => {
    for (const range of [1, 2, 8, 14]) {
      const weapon = { range, accuracy: 65, damage: 10, armorPen: 0 };
      expect(isMeleeRange(range)).toBe(isMelee(weapon));
    }
  });
});

describe("isBallistic (campaign arc §10.2)", () => {
  /** A gun: reach, no blast, no energy, no guidance. */
  const GUN: WeaponProfile = {
    range: 10,
    accuracy: 70,
    damage: 18,
    armorPen: 2,
  };

  it("is true for a gun that fires rounds straight at one thing", () => {
    expect(isBallistic(GUN)).toBe(true);
    const loud: WeaponProfile = { ...GUN, demoForce: 1, heat: 2 };
    expect(isBallistic(loud)).toBe(true);
  });

  it("is false for a ram, a laser, a beam, a missile, a shell that bursts and a flame", () => {
    expect(isBallistic({ ...GUN, range: MELEE_RANGE })).toBe(false);
    expect(isBallistic({ ...GUN, energy: true })).toBe(false);
    expect(isBallistic({ ...GUN, beam: true })).toBe(false);
    expect(isBallistic({ ...GUN, guided: true })).toBe(false);
    expect(isBallistic({ ...GUN, aoe: { radius: 1, falloff: 0.5 } })).toBe(
      false,
    );
    expect(
      isBallistic({
        ...GUN,
        aoeEffect: { kind: "fire", chance: 1, falloff: 0 },
      }),
    ).toBe(false);
  });
});

describe("pierceOf", () => {
  it("is the rounds' points, and nothing for none or a negative load", () => {
    expect(pierceOf({ pierce: 2 })).toBe(2);
    expect(pierceOf({})).toBe(0);
    expect(pierceOf({ pierce: -1 })).toBe(0);
  });
});
