import { describe, expect, it } from "vitest";

import { SurfaceIds } from "../../mapgen/data/surfaces";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { MODEL_MANIFEST } from "../data/model-manifest";
import {
  GROUND_SLAB_THICKNESS,
  OVERLAY_LIFT,
} from "../data/tactical-overlay-palette";
import { surfaceRise, tileRiseFor } from "./surface-rise";

// ===========================================
// surfaceRise
// ===========================================

describe("surfaceRise (#1130)", () => {
  it("lifts a sidewalk by the half of its slab that stands above the plane", () => {
    const sidewalk = MODEL_MANIFEST["tile.city.sidewalk"].height;
    expect(sidewalk).toBeGreaterThan(GROUND_SLAB_THICKNESS);
    expect(surfaceRise(SurfaceIds.SIDEWALK)).toBeCloseTo(
      (sidewalk - GROUND_SLAB_THICKNESS) / 2,
      6,
    );
  });

  it("rises higher than the move bands were lifted, which is why they vanished", () => {
    // The 1 AP band sits at OVERLAY_LIFT and the 2 AP band at 1.5 times
    // it; both were inside the sidewalk slab before the rise was added.
    expect(surfaceRise(SurfaceIds.SIDEWALK)).toBeGreaterThan(
      OVERLAY_LIFT * 1.5,
    );
  });

  it("rises nothing for a slab as thin as the ground, for stairs, and for water", () => {
    for (const surface of [
      SurfaceIds.GRASS,
      SurfaceIds.ROAD,
      SurfaceIds.FLOOR,
      SurfaceIds.ROOF,
      SurfaceIds.STAIRS,
      SurfaceIds.WATER,
    ]) {
      expect(surfaceRise(surface), surface).toBe(0);
    }
  });

  it("rises nothing for a surface with no art registered", () => {
    expect(surfaceRise("moss")).toBe(0);
  });
});

// ===========================================
// tileRiseFor
// ===========================================

describe("tileRiseFor (#1130)", () => {
  it("answers per tile from the map's surfaces, and nothing off the map", () => {
    const map = new FixtureMapBuilder(3, 3, 1)
      .fillGround(0, SurfaceIds.ROAD)
      .tile({ x: 1, y: 0, z: 1 }, SurfaceIds.SIDEWALK)
      .build();
    const rise = tileRiseFor(map);
    expect(rise({ x: 1, y: 0, z: 1 })).toBe(surfaceRise(SurfaceIds.SIDEWALK));
    expect(rise({ x: 0, y: 0, z: 0 })).toBe(0);
    expect(rise({ x: 9, y: 0, z: 9 })).toBe(0);
  });
});
