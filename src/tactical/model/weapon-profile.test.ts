import { describe, expect, it } from "vitest";

import { MELEE_RANGE, isMelee, isMeleeRange } from "./weapon-profile";

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
