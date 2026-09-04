import { describe, expect, it } from "vitest";

import {
  BLOCKED_SHOT_OPACITY,
  BLOCKED_SHOT_SIZE,
  COVER_OPACITY,
  COVER_RING_INNER_RADIUS,
  COVER_RING_OUTER_RADIUS,
  GROUND_SLAB_THICKNESS,
  MOVE_RANGE_ONE_AP_COLOUR,
  MOVE_RANGE_ONE_AP_FOOTPRINT,
  MOVE_RANGE_TWO_AP_COLOUR,
  MOVE_RANGE_ONE_AP_OPACITY,
  MOVE_RANGE_TWO_AP_FOOTPRINT,
  MOVE_RANGE_TWO_AP_OPACITY,
  OVERLAY_LIFT,
  WEAPON_RANGE_LINE_WIDTH,
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

  it("leaves ground visible around every band tile, so neither reads as terrain", () => {
    // #569: a band that reaches its tile edges merges with its
    // neighbours into a flat sheet, and a flat blue sheet is a pond.
    expect(MOVE_RANGE_ONE_AP_FOOTPRINT).toBeLessThanOrEqual(0.85);
    expect(MOVE_RANGE_TWO_AP_FOOTPRINT).toBeLessThan(
      MOVE_RANGE_ONE_AP_FOOTPRINT,
    );
  });

  it("keeps the weapon-range boundary a line, not a footprint", () => {
    // #572 shrank a tile-filling range overlay to a pip and #624 replaced
    // the pip with one outline. A "line" wide enough to read as a tile is
    // a fill again, and fills mean somewhere to stand.
    expect(WEAPON_RANGE_LINE_WIDTH).toBeLessThan(
      MOVE_RANGE_TWO_AP_FOOTPRINT / 4,
    );
  });

  it("ranks a refusal above an attribute, so cover never out-shouts it", () => {
    // #590: cover is a property of a tile the player may never care
    // about. A tile that will refuse the shot is the thing on this
    // plane entitled to interrupt -- and it can afford the weight,
    // because since #624 it is rare rather than universal.
    expect(COVER_OPACITY).toBeLessThan(BLOCKED_SHOT_OPACITY);
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

  it("nests the blocked-shot diamond inside the cover ring", () => {
    // A tile can carry both. The diamond's corners reach half its side
    // times root two; keeping that inside the ring's hole means the two
    // marks read as a ring with a diamond in it rather than fighting
    // over the same pixels.
    expect((BLOCKED_SHOT_SIZE / 2) * Math.SQRT2).toBeLessThan(
      COVER_RING_INNER_RADIUS,
    );
  });
});
