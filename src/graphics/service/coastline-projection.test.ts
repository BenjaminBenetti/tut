import { describe, expect, it } from "vitest";

import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import {
  projectCoastlines,
  projectLandPolygon,
  projectRing,
} from "./coastline-projection";

describe("coastline-projection", () => {
  it("maps the globe's corners to the map plane's corners", () => {
    const corners = projectRing(
      [
        [-180, 90],
        [180, 90],
        [180, -90],
        [-180, -90],
        [-180, 90],
      ],
      OVERWORLD_SCENE_CONFIG,
    );
    expect(corners).toEqual([
      { x: 0, z: 0 },
      { x: 24, z: 0 },
      { x: 24, z: 12 },
      { x: 0, z: 12 },
      { x: 0, z: 0 },
    ]);
  });

  it("puts east to +x and south to +z, the way layoutToWorld does", () => {
    const [london, nairobi] = projectRing(
      [
        [-0.13, 51.51],
        [36.82, -1.29],
      ],
      OVERWORLD_SCENE_CONFIG,
    );
    if (!london || !nairobi) throw new Error("projection dropped a point");
    expect(nairobi.x).toBeGreaterThan(london.x);
    expect(nairobi.z).toBeGreaterThan(london.z);
    // The equator sits halfway down the plane, the prime meridian halfway across.
    expect(london.x).toBeCloseTo(12 - (0.13 / 360) * 24, 6);
    expect(nairobi.z).toBeCloseTo(6 + (1.29 / 180) * 12, 6);
  });

  it("projects holes alongside the outer ring and keeps the set's order", () => {
    const projected = projectCoastlines(
      {
        source: "test",
        toleranceDeg: 0,
        polygons: [
          {
            outer: [
              [0, 0],
              [90, 0],
              [90, -45],
              [0, 0],
            ],
            holes: [
              [
                [30, -10],
                [40, -10],
                [40, -20],
                [30, -10],
              ],
            ],
          },
          { outer: [[-180, 90]], holes: [] },
        ],
      },
      OVERWORLD_SCENE_CONFIG,
    );
    expect(projected).toHaveLength(2);
    expect(projected[0]?.holes).toHaveLength(1);
    expect(projected[0]?.holes[0]?.[0]).toEqual({ x: 14, z: 6 + 12 / 18 });
    expect(projected[1]?.outer).toEqual([{ x: 0, z: 0 }]);
    expect(
      projectLandPolygon(
        { outer: [[180, -90]], holes: [] },
        {
          ...OVERWORLD_SCENE_CONFIG,
          mapWidth: 10,
          mapDepth: 5,
        },
      ).outer,
    ).toEqual([{ x: 10, z: 5 }]);
  });
});
