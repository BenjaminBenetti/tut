import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { Unit } from "../../tactical/model/unit";
import { bestBy, clumpScore, distanceScore, tileDistance } from "./utility";

describe("utility scores", () => {
  it("distanceScore is 1 at zero distance and 0 at or past the maximum", () => {
    const origin = { x: 0, y: 0, z: 0 };
    expect(distanceScore(origin, origin, 10)).toBe(1);
    expect(distanceScore(origin, { x: 5, y: 0, z: 0 }, 10)).toBeCloseTo(0.5);
    expect(distanceScore(origin, { x: 7, y: 0, z: 7 }, 10)).toBe(0);
    expect(distanceScore(origin, { x: 1, y: 0, z: 0 }, 0)).toBe(0);
  });

  it("tileDistance ignores levels", () => {
    expect(tileDistance({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 1 })).toBe(3);
  });

  it("clumpScore is the fraction of enemies within the radius", () => {
    const unit = (id: string, x: number) =>
      ({
        id,
        pos: { x, y: 0, z: 0 },
        hp: 5,
      }) as unknown as Unit;
    const enemies = [unit("a", 1), unit("b", 2), unit("c", 9)];
    expect(clumpScore({ x: 0, y: 0, z: 0 }, enemies, 2)).toBeCloseTo(2 / 3);
    expect(clumpScore({ x: 0, y: 0, z: 0 }, [], 2)).toBe(0);
  });

  it("bestBy returns the top item and breaks exact ties with the rng", () => {
    const rng = new Mulberry32Rng(3);
    expect(bestBy([], () => 1, rng)).toBeUndefined();
    expect(bestBy([1, 5, 3], (n) => n, rng)).toBe(5);
    const picks = new Set<string>();
    for (let i = 0; i < 40; i++) {
      picks.add(bestBy(["a", "b", "c"], () => 1, new Mulberry32Rng(i))!);
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});
