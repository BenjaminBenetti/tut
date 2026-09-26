import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { hashSeed } from "../../../core/service/seed-hash";
import { HIVE_CAVERN_SIZE } from "../../data/hive-cavern-recipe";
import { HIVE_CAVERN_TUNING } from "../../data/hive-cavern-tuning";
import { type CavernPlan, planCavern } from "./cavern-planner";

// ===========================================
// Fixture
// ===========================================

/**
 * Plans are cheap (no carve), so the planner's counting guarantees are
 * swept far wider than the map sweep can afford. Before the replan
 * fallback, 67 of 3,000 plans had no side chamber and 26 had four
 * chambers in all.
 */
const PLANS = 1_000;

/** Longest gap the planner leaves between centre-line samples. */
const SAMPLE_STEP = 0.25;

/** The plan a seed string gives on the hive cavern board. */
function plan(seed: string): CavernPlan {
  return planCavern(
    HIVE_CAVERN_SIZE,
    HIVE_CAVERN_TUNING,
    new Mulberry32Rng(hashSeed(seed)),
  );
}

// ===========================================
// Tests
// ===========================================

describe("planCavern (#1179)", () => {
  it("plans the same cavern from the same seed", () => {
    expect(plan("same")).toEqual(plan("same"));
    expect(plan("same")).not.toEqual(plan("other"));
  });

  it("always plans five to eight chambers with one to three side chambers", () => {
    const tuning = HIVE_CAVERN_TUNING;
    for (let s = 0; s < PLANS; s++) {
      const { chambers } = plan(`count-${String(s)}`);
      const sides = chambers.filter((c) => c.role === "side").length;
      const route = chambers.length - sides;
      expect(chambers.length, `seed ${String(s)}`).toBeGreaterThanOrEqual(
        tuning.chamberCount.min,
      );
      expect(chambers.length, `seed ${String(s)}`).toBeLessThanOrEqual(
        tuning.chamberCount.max,
      );
      expect(sides, `seed ${String(s)}`).toBeGreaterThanOrEqual(
        tuning.sideChamberCount.min,
      );
      expect(sides, `seed ${String(s)}`).toBeLessThanOrEqual(
        tuning.sideChamberCount.max,
      );
      expect(route, `seed ${String(s)}`).toBeGreaterThanOrEqual(
        tuning.minRouteChambers,
      );
    }
  });

  it("runs the route from the mouth to the core down the board, tunnel by tunnel", () => {
    for (let s = 0; s < 50; s++) {
      const { chambers, tunnels } = plan(`route-${String(s)}`);
      const route = chambers.filter((c) => c.role !== "side");
      expect(route[0]?.role).toBe("mouth");
      expect(route[route.length - 1]?.role).toBe("core");
      for (let i = 1; i < route.length; i++) {
        expect(route[i]!.centre.z).toBeGreaterThan(route[i - 1]!.centre.z);
        expect(route[i]!.depth).toBe(i);
      }
      const main = tunnels.filter((t) => t.kind === "main");
      expect(main.map((t) => [t.from, t.to])).toEqual(
        route.slice(1).map((_, i) => [i, i + 1]),
      );
    }
  });

  it("starts burrows only in route chambers or the core, on the level spine", () => {
    for (let s = 0; s < 200; s++) {
      const { chambers, tunnels } = plan(`burrow-${String(s)}`);
      for (const burrow of tunnels.filter((t) => t.kind === "burrow")) {
        expect(["route", "core"]).toContain(chambers[burrow.from]?.role);
      }
    }
  });

  it("samples every centre line densely and inside the board", () => {
    const tunnels = Array.from({ length: 100 }, (_, s) =>
      plan(`samples-${String(s)}`),
    ).flatMap((p) => p.tunnels);
    for (const tunnel of tunnels) {
      tunnel.samples.forEach((p, i) => {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.z).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(HIVE_CAVERN_SIZE.width - 1);
        expect(p.z).toBeLessThanOrEqual(HIVE_CAVERN_SIZE.depth - 1);
        const q = tunnel.samples[i - 1];
        if (q !== undefined) {
          expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThanOrEqual(
            SAMPLE_STEP + 1e-9,
          );
        }
      });
    }
  });
});
