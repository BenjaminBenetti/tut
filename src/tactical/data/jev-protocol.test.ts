import { describe, expect, it } from "vitest";

import { JEV_STATUSES } from "../model/jev-status";
import { OBJECTIVE_RULES } from "../service/objectives/objective-rules";
import JEV_PROTOCOL from "./jev-protocol.json";

// ===========================================
// Tests
// ===========================================

/**
 * The protocol Jev reads (ADR 0012) must describe everything an
 * observation can carry (#1179): every objective kind a mission can
 * hold, and every status a unit can show. A kind or a status added to
 * the rules without a line here fails the build rather than reaching
 * Jev unexplained. The relay compares the `gameplay` block exactly, so
 * any change to it needs a relay redeploy.
 */
describe("jev-protocol.json", () => {
  const { gameplay } = JEV_PROTOCOL;

  it("describes every objective kind the rules define, and no other", () => {
    expect(Object.keys(gameplay.objective_kinds).sort()).toEqual(
      Object.keys(OBJECTIVE_RULES).sort(),
    );
  });

  it("describes every status Jev reads, in the model's order, and no other", () => {
    // Every UnitStatus, then the flag statuses such as `fleeing`.
    expect(Object.keys(gameplay.statuses)).toEqual([...JEV_STATUSES]);
  });

  it("gives every kind and status a description of its own", () => {
    const descriptions = [
      ...Object.values(gameplay.objective_kinds),
      ...Object.values(gameplay.statuses),
    ];
    for (const description of descriptions) {
      expect(typeof description).toBe("string");
      expect(description.trim().length).toBeGreaterThan(40);
    }
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("points the objective list at the per-kind descriptions", () => {
    expect(gameplay.objectives).toContain("objective_kinds");
  });
});
