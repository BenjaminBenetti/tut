import { describe, expect, it } from "vitest";

import {
  COVER_OPACITY,
  COVER_RING_INNER_RADIUS,
  COVER_RING_OUTER_RADIUS,
  GROUND_SLAB_THICKNESS,
  LINE_OF_SIGHT_OPACITY,
  LINE_OF_SIGHT_PIP_OUTER_RADIUS,
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
  it("lifts overlays off the ground without clearing a slab", () => {
    // #555 raised this to a whole slab thickness because the slab model
    // was pivoted on `tileTop`, so half of it stood above the plane
    // overlays measured from and anything lifted less was drawn inside
    // the ground. #557 moved the slab so its top face lands on
    // `tileTop`; the lift is a nudge between two coincident planes
    // again, and paying a slab for it would read as hovering.
    expect(OVERLAY_LIFT).toBeGreaterThan(0);
    expect(OVERLAY_LIFT).toBeLessThan(GROUND_SLAB_THICKNESS);
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

  it("leaves ground visible around every band tile, so neither reads as terrain", () => {
    // #569: a band that reaches its tile edges merges with its
    // neighbours into a flat sheet, and a flat blue sheet is a pond.
    expect(MOVE_RANGE_ONE_AP_FOOTPRINT).toBeLessThanOrEqual(0.85);
    expect(MOVE_RANGE_TWO_AP_FOOTPRINT).toBeLessThan(
      MOVE_RANGE_ONE_AP_FOOTPRINT,
    );
  });

  it("keeps the weapon-range mark small enough not to bury a move band", () => {
    // #572: at nearly a whole tile the range overlay filled in a city and
    // covered the 2 AP band underneath it.
    expect(WEAPON_RANGE_FOOTPRINT).toBeLessThan(MOVE_RANGE_TWO_AP_FOOTPRINT);
  });

  it("ranks a threat above an attribute, so cover never out-shouts sight", () => {
    // #590: cover is a property of a tile the player may never care
    // about; being seen is the thing on this plane entitled to
    // interrupt. Cover was the heaviest value in the file at 0.85.
    expect(COVER_OPACITY).toBeLessThan(LINE_OF_SIGHT_OPACITY);
    expect(COVER_OPACITY).toBeLessThanOrEqual(0.6);
  });

  it("keeps the cover mark a ring rather than a donut", () => {
    // The tile it marks has to stay legible through it, so the annulus
    // is narrower than the hole it leaves in the middle.
    const band = COVER_RING_OUTER_RADIUS - COVER_RING_INNER_RADIUS;
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThan(COVER_RING_INNER_RADIUS);
    // And it stays inside its own tile.
    expect(COVER_RING_OUTER_RADIUS).toBeLessThanOrEqual(0.5);
  });

  it("nests the sight pip inside the cover ring instead of overlapping it", () => {
    // A tile can carry both. Sized so it reads as a ring with a dot in
    // it rather than two marks fighting over the same pixels.
    expect(LINE_OF_SIGHT_PIP_OUTER_RADIUS).toBeLessThan(
      COVER_RING_INNER_RADIUS,
    );
  });
});
