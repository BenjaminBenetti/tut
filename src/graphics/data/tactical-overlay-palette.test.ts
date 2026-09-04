import { describe, expect, it } from "vitest";

import {
  BLOCKED_SHOT_OPACITY,
  BLOCKED_SHOT_SIZE,
  COVER_OPACITY,
  COVER_TICK_INSET,
  COVER_TICK_LENGTH,
  COVER_TICK_WIDTH,
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
  });

  it("lets the cover tick be solid, because its shape is what keeps it quiet", () => {
    // The ceiling this used to carry (0.6) belonged to the centred ring,
    // which was loud because of where it sat rather than how strong it
    // was. A bar against the wall that earns it reads as part of that
    // wall; at 0.55 it simply vanished (#624).
    expect(COVER_OPACITY).toBeGreaterThan(0.6);
  });

  it("keeps the cover tick short of its own edge, so neighbours stay apart", () => {
    // Two tiles either side of one wall are both covered by it and each
    // draws its own tick; without the inset they would land on top of
    // each other and read as one mark belonging to neither.
    expect(COVER_TICK_INSET).toBeGreaterThan(COVER_TICK_WIDTH / 2);
    // Shorter than the edge, or a run of ticks joins into a continuous
    // line -- which is the weapon-range boundary's shape.
    expect(COVER_TICK_LENGTH).toBeLessThan(1);
  });

  it("leaves the middle of the tile to the blocked-shot diamond", () => {
    // A tile can carry both, and now they do not compete at all: cover
    // lives against the edges, the diamond in the centre. The diamond's
    // corners reach half its side times root two.
    const diamondReach = (BLOCKED_SHOT_SIZE / 2) * Math.SQRT2;
    const tickInnerEdge = 0.5 - COVER_TICK_INSET - COVER_TICK_WIDTH;
    expect(diamondReach).toBeLessThan(tickInnerEdge);
  });
});
