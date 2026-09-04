import { describe, expect, it } from "vitest";

import {
  GROUND_SLAB_THICKNESS,
  MOVE_RANGE_ONE_AP_COLOUR,
  MOVE_RANGE_ONE_AP_FOOTPRINT,
  MOVE_RANGE_TWO_AP_COLOUR,
  MOVE_RANGE_TWO_AP_FOOTPRINT,
  OVERLAY_LIFT,
} from "./tactical-overlay-palette";

// ===========================================
// Tests
// ===========================================

describe("tactical overlay palette", () => {
  it("lifts overlays clear of the ground slab they are painted on", () => {
    // The regression this guards: a slab model pivots at its centre, so
    // half of it stands above the tile top. An overlay lifted less than
    // that is drawn inside the ground and depth-tested away — which is
    // what happened to every overlay when the real tile art landed.
    expect(OVERLAY_LIFT).toBeGreaterThan(GROUND_SLAB_THICKNESS / 2);
  });

  it("keeps every lifted layer clear of the slab too", () => {
    // The cover rings, line-of-sight pips and the dearer move band lift
    // by multiples of the base, so the smallest multiple is the one that
    // has to clear.
    for (const multiple of [1, 1.5, 2, 3]) {
      expect(OVERLAY_LIFT * multiple).toBeGreaterThan(
        GROUND_SLAB_THICKNESS / 2,
      );
    }
  });

  it("keeps the overlays hugging the ground rather than floating", () => {
    // A guard at the other end: a lift of a whole tile would read as a
    // hovering plane rather than paint on the floor.
    expect(OVERLAY_LIFT * 3).toBeLessThan(0.5);
  });

  it("separates the two move bands in both tone and footprint", () => {
    // #521 relies on two channels, so neither may quietly collapse.
    expect(MOVE_RANGE_ONE_AP_COLOUR).not.toBe(MOVE_RANGE_TWO_AP_COLOUR);
    expect(MOVE_RANGE_TWO_AP_FOOTPRINT).toBeLessThan(
      MOVE_RANGE_ONE_AP_FOOTPRINT,
    );
  });
});
