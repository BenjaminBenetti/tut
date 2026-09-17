import { describe, expect, it } from "vitest";

import {
  turretBurnedOut,
  turretDestroyed,
  turretHasBattery,
  turretIsActive,
} from "./turret";

// ===========================================
// Fixtures
// ===========================================

/** A turret in the state the row describes. */
function turret(hp: number, turnsLeft: number | undefined) {
  return turnsLeft === undefined
    ? { kind: "turret" as const, hp }
    : { kind: "turret" as const, hp, turnsLeft };
}

// ===========================================
// Tests
// ===========================================

describe("turret predicates (#1138, #1155)", () => {
  it("reads an engineer's turret: active while the battery holds, burnt out at zero, destroyed with turns left", () => {
    const fresh = turret(30, 3);
    expect(turretHasBattery(fresh)).toBe(true);
    expect(turretIsActive(fresh)).toBe(true);
    expect(turretBurnedOut(fresh)).toBe(false);
    expect(turretDestroyed(fresh)).toBe(false);

    const burnt = turret(0, 0);
    expect(turretIsActive(burnt)).toBe(false);
    expect(turretBurnedOut(burnt)).toBe(true);
    expect(turretDestroyed(burnt)).toBe(false);

    const shot = turret(0, 2);
    expect(turretIsActive(shot)).toBe(false);
    expect(turretBurnedOut(shot)).toBe(false);
    expect(turretDestroyed(shot)).toBe(true);
  });

  it("reads a garrison turret on mains: active with no battery, never burnt out, destroyed at zero", () => {
    const standing = turret(30, undefined);
    expect(turretHasBattery(standing)).toBe(false);
    expect(turretIsActive(standing)).toBe(true);
    expect(turretBurnedOut(standing)).toBe(false);
    expect(turretDestroyed(standing)).toBe(false);

    const down = turret(0, undefined);
    expect(turretIsActive(down)).toBe(false);
    expect(turretBurnedOut(down)).toBe(false);
    expect(turretDestroyed(down)).toBe(true);
  });

  it("answers no for anything that is not a turret, whatever it carries", () => {
    const squad = { kind: "squad" as const, hp: 10 };
    expect(turretHasBattery(squad)).toBe(false);
    expect(turretIsActive(squad)).toBe(false);
    expect(turretBurnedOut({ kind: "bug" as const, hp: 0, turnsLeft: 0 })).toBe(
      false,
    );
    expect(turretDestroyed({ kind: "mech" as const, hp: 0 })).toBe(false);
  });
});
