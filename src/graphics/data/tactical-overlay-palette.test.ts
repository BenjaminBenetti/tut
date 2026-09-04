import { describe, expect, it } from "vitest";

import {
  GROUND_SLAB_THICKNESS,
  MOVE_RANGE_ONE_AP_COLOUR,
  MOVE_RANGE_ONE_AP_FOOTPRINT,
  MOVE_RANGE_TWO_AP_COLOUR,
  MOVE_RANGE_ONE_AP_OPACITY,
  MOVE_RANGE_TWO_AP_FOOTPRINT,
  MOVE_RANGE_TWO_AP_OPACITY,
  OVERLAY_LIFT,
  WEAPON_RANGE_FOOTPRINT,
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

  it("separates the two move bands in both value and footprint", () => {
    // #521 relies on two channels and neither may quietly collapse. The
    // channels are opacity and footprint, not hue: #566 replaced the
    // darkened second hex with the same token laid on more thinly,
    // because darkening to say "less" collides with shadowed ground.
    expect(MOVE_RANGE_TWO_AP_OPACITY).toBeLessThan(MOVE_RANGE_ONE_AP_OPACITY);
    expect(MOVE_RANGE_TWO_AP_FOOTPRINT).toBeLessThan(
      MOVE_RANGE_ONE_AP_FOOTPRINT,
    );
  });

  it("keeps both move bands lighter than the ground they cover", () => {
    // Every blend has to come out above the terrain, or the dearer band
    // reads as shade again (#566). Same token both times is what
    // guarantees it.
    expect(MOVE_RANGE_TWO_AP_COLOUR).toBe(MOVE_RANGE_ONE_AP_COLOUR);
  });

  it("keeps the weapon-range mark small enough not to bury a move band", () => {
    // #572: at nearly a whole tile the range overlay filled in a city and
    // covered the 2 AP band underneath it.
    expect(WEAPON_RANGE_FOOTPRINT).toBeLessThan(MOVE_RANGE_TWO_AP_FOOTPRINT);
  });
});
