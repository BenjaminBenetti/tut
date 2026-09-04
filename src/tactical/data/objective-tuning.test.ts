import { describe, expect, it } from "vitest";

import { UNIT_TUNING } from "./unit-tuning";
import { OBJECTIVE_TUNING } from "./objective-tuning";
import { SPAWN_TUNING } from "./spawn-tuning";

const T = OBJECTIVE_TUNING;

describe("objective tuning", () => {
  it("costs whole action points a unit can actually pay", () => {
    expect(Number.isInteger(T.interactApCost)).toBe(true);
    expect(T.interactApCost).toBeGreaterThan(0);
    expect(T.interactApCost).toBeLessThanOrEqual(UNIT_TUNING.infantry.maxAp);
    expect(Number.isInteger(T.extractApCost)).toBe(true);
    expect(T.extractApCost).toBeGreaterThanOrEqual(0);
    expect(T.extractApCost).toBeLessThanOrEqual(UNIT_TUNING.infantry.maxAp);
  });

  it("plants charges from a tile a unit can stand on", () => {
    expect(Number.isInteger(T.interactRange)).toBe(true);
    expect(T.interactRange).toBeGreaterThanOrEqual(0);
  });

  it("destroys a spawner in one unit's turn beside it", () => {
    expect(T.chargeDamage).toBeGreaterThan(0);
    const actions = Math.floor(UNIT_TUNING.infantry.maxAp / T.interactApCost);
    expect(actions * T.chargeDamage).toBeGreaterThanOrEqual(
      SPAWN_TUNING.spawnerHp,
    );
  });
});
