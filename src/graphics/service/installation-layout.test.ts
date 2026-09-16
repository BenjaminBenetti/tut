import { describe, expect, it } from "vitest";

import type { GroundPoint } from "./coastline-projection";
import type { InstallationLayoutOptions } from "./installation-layout";
import {
  CANDIDATES_PER_RING,
  planInstallationSlots,
} from "./installation-layout";

// ===========================================
// Fixtures
// ===========================================

const OPTIONS: InstallationLayoutOptions = {
  ringRadius: 0.7,
  clearance: 0.55,
  bounds: { width: 24, depth: 12 },
};

const ANCHOR: GroundPoint = { x: 10, z: 6 };

function distance(a: GroundPoint, b: GroundPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// ===========================================
// Tests
// ===========================================

describe("planInstallationSlots (#1155)", () => {
  it("returns nothing for nothing", () => {
    expect(planInstallationSlots(ANCHOR, 0, [], OPTIONS)).toEqual([]);
  });

  it("puts every slot on the ring, clear of each other, and is deterministic", () => {
    const slots = planInstallationSlots(ANCHOR, 6, [], OPTIONS);
    expect(slots).toHaveLength(6);
    for (const slot of slots) {
      expect(distance(slot, ANCHOR)).toBeCloseTo(OPTIONS.ringRadius, 6);
    }
    for (const [i, a] of slots.entries()) {
      for (const b of slots.slice(i + 1)) {
        expect(distance(a, b)).toBeGreaterThanOrEqual(OPTIONS.clearance);
      }
    }
    expect(planInstallationSlots(ANCHOR, 6, [], OPTIONS)).toEqual(slots);
  });

  it("starts north and keeps its order when more are asked for", () => {
    const one = planInstallationSlots(ANCHOR, 1, [], OPTIONS);
    const three = planInstallationSlots(ANCHOR, 3, [], OPTIONS);
    expect(one[0]).toEqual({ x: 10, z: 6 - OPTIONS.ringRadius });
    expect(three[0]).toEqual(one[0]);
  });

  it("keeps clear of a city standing on the anchor and of one beside the ring", () => {
    const onAnchor = { x: 10.05, z: 6 };
    const beside = { x: 10, z: 6 - OPTIONS.ringRadius - 0.1 };
    const slots = planInstallationSlots(ANCHOR, 4, [onAnchor, beside], OPTIONS);
    for (const slot of slots) {
      expect(distance(slot, onAnchor)).toBeGreaterThanOrEqual(
        OPTIONS.clearance,
      );
      expect(distance(slot, beside)).toBeGreaterThanOrEqual(OPTIONS.clearance);
    }
    // The roomiest slot, west and clear of both, comes first.
    expect(slots[0]?.x).toBeLessThan(ANCHOR.x);
  });

  it("moves out to a wider ring when the first is full", () => {
    const perRing = 4;
    const slots = planInstallationSlots(ANCHOR, 6, [], {
      ...OPTIONS,
      candidatesPerRing: perRing,
    });
    expect(slots).toHaveLength(6);
    const radii = slots.map((slot) => distance(slot, ANCHOR));
    expect(radii.slice(0, perRing).every((r) => Math.abs(r - 0.7) < 1e-6)).toBe(
      true,
    );
    expect(radii.slice(perRing).every((r) => r > 0.7 + 1e-6)).toBe(true);
  });

  it("stays inside the plane and still places everything at a corner anchor", () => {
    const corner = { x: 0.1, z: 0.1 };
    const slots = planInstallationSlots(corner, 3, [], OPTIONS);
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.x).toBeGreaterThanOrEqual(OPTIONS.clearance);
      expect(slot.z).toBeGreaterThanOrEqual(OPTIONS.clearance);
    }
  });

  it("stacks on the roomiest slots rather than dropping an installation when nowhere is clear", () => {
    // Cities on every candidate of every ring: nothing is clear.
    const obstacles: GroundPoint[] = [];
    for (let ring = 0; ring < 4; ring++) {
      const radius = OPTIONS.ringRadius * 1.6 ** ring;
      for (let i = 0; i < CANDIDATES_PER_RING; i++) {
        const angle = (i / CANDIDATES_PER_RING) * 2 * Math.PI;
        obstacles.push({
          x: ANCHOR.x + Math.sin(angle) * radius,
          z: ANCHOR.z - Math.cos(angle) * radius,
        });
      }
    }
    const slots = planInstallationSlots(ANCHOR, 2, obstacles, OPTIONS);
    expect(slots).toHaveLength(2);
    expect(planInstallationSlots(ANCHOR, 2, obstacles, OPTIONS)).toEqual(slots);
  });
});
