import { describe, expect, it } from "vitest";

import { LAYER_TILES, STOREY_LAYERS } from "../../core/model/elevation";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { MELEE_RANGE } from "../model/weapon-profile";
import {
  attackDistance,
  heightReachBonus,
  weaponReach,
  withinReach,
} from "./weapon-reach-service";

const T = COMBAT_TUNING;
const at = (x: number, y: number, z: number) => ({ x, y, z });

describe("attackDistance (#1119)", () => {
  it("is the Manhattan distance on level ground, so every flat rule holds", () => {
    expect(attackDistance(at(1, 0, 1), at(4, 0, 5))).toBe(7);
    expect(attackDistance(at(0, 0, 0), at(0, 0, 0))).toBe(0);
    expect(attackDistance(at(0, 3, 0), at(2, 3, 0))).toBe(2);
  });

  it("combines the vertical gap at the renderer's layer height, rounded to whole tiles", () => {
    // Straight up one storey: 2 layers × 0.75 = 1.5 tiles, rounded to 2.
    expect(attackDistance(at(0, STOREY_LAYERS, 0), at(0, 0, 0))).toBe(2);
    // hypot(4, 1.5) = 4.27 -> 4; hypot(4, 3) = 5.
    expect(attackDistance(at(0, STOREY_LAYERS, 0), at(4, 0, 0))).toBe(4);
    expect(attackDistance(at(0, 2 * STOREY_LAYERS, 0), at(4, 0, 0))).toBe(5);
    expect(LAYER_TILES).toBe(0.75);
  });

  it("is symmetric: height counts the same up as down", () => {
    expect(attackDistance(at(0, 4, 0), at(3, 0, 2))).toBe(
      attackDistance(at(3, 0, 2), at(0, 4, 0)),
    );
  });

  it("keeps a half-layer step next door within a claw's reach, and a full storey out of it", () => {
    expect(attackDistance(at(0, 1, 0), at(1, 0, 0))).toBe(MELEE_RANGE);
    expect(
      attackDistance(at(0, STOREY_LAYERS, 0), at(1, 0, 0)),
    ).toBeGreaterThan(MELEE_RANGE);
  });
});

describe("heightReachBonus and weaponReach (#1119)", () => {
  it("buys reach per whole storey above the target, capped", () => {
    expect(heightReachBonus(8, at(0, STOREY_LAYERS, 0), at(5, 0, 0), T)).toBe(
      T.reachBonusPerStorey,
    );
    expect(
      heightReachBonus(8, at(0, 2 * STOREY_LAYERS, 0), at(5, 0, 0), T),
    ).toBe(2 * T.reachBonusPerStorey);
    expect(
      heightReachBonus(8, at(0, 10 * STOREY_LAYERS, 0), at(5, 0, 0), T),
    ).toBe(T.maxReachBonus);
    expect(weaponReach(8, at(0, STOREY_LAYERS, 0), at(5, 0, 0), T)).toBe(
      8 + T.reachBonusPerStorey,
    );
  });

  it("gives nothing for a half storey, for level ground, or for shooting up", () => {
    expect(heightReachBonus(8, at(0, 1, 0), at(5, 0, 0), T)).toBe(0);
    expect(heightReachBonus(8, at(0, 0, 0), at(5, 0, 0), T)).toBe(0);
    expect(heightReachBonus(8, at(0, 0, 0), at(5, STOREY_LAYERS, 0), T)).toBe(
      0,
    );
    expect(weaponReach(8, at(0, 0, 0), at(5, STOREY_LAYERS, 0), T)).toBe(8);
  });

  it("gives a melee weapon nothing, whatever it stands on", () => {
    expect(
      heightReachBonus(
        MELEE_RANGE,
        at(0, 3 * STOREY_LAYERS, 0),
        at(1, 0, 0),
        T,
      ),
    ).toBe(0);
  });
});

describe("withinReach (#1119)", () => {
  it("holds the three-dimensional distance against the height-adjusted reach", () => {
    // Level ground: eight tiles reaches eight, not nine.
    expect(withinReach(8, at(0, 0, 0), at(8, 0, 0), T)).toBe(true);
    expect(withinReach(8, at(0, 0, 0), at(9, 0, 0), T)).toBe(false);
    // Two storeys up: the bonus (4) outweighs the height's cost, so nine
    // across is now inside reach ...
    expect(withinReach(8, at(0, 2 * STOREY_LAYERS, 0), at(9, 0, 0), T)).toBe(
      true,
    );
    // ... while the same shot upward is further and earns nothing.
    expect(withinReach(8, at(0, 0, 0), at(8, 2 * STOREY_LAYERS, 0), T)).toBe(
      false,
    );
  });

  it("refuses a claw a storey below its target next door", () => {
    expect(
      withinReach(MELEE_RANGE, at(0, 0, 0), at(1, STOREY_LAYERS, 0), T),
    ).toBe(false);
    expect(withinReach(MELEE_RANGE, at(0, 0, 0), at(1, 1, 0), T)).toBe(true);
  });
});
