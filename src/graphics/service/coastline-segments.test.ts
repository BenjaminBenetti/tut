import { describe, expect, it } from "vitest";

import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import type { GroundPolygon } from "./coastline-projection";
import { coastlineSegments, isBorderSegment } from "./coastline-segments";

describe("coastlineSegments", () => {
  it("emits every ring edge, holes included", () => {
    const polygon: GroundPolygon = {
      outer: [
        { x: 1, z: 1 },
        { x: 5, z: 1 },
        { x: 5, z: 5 },
        { x: 1, z: 5 },
        { x: 1, z: 1 },
      ],
      holes: [
        [
          { x: 2, z: 2 },
          { x: 3, z: 2 },
          { x: 3, z: 3 },
          { x: 2, z: 2 },
        ],
      ],
    };
    expect(coastlineSegments([polygon], OVERWORLD_SCENE_CONFIG)).toHaveLength(
      4 + 3,
    );
  });

  it("drops edges lying along the map's border", () => {
    const { mapWidth, mapDepth } = OVERWORLD_SCENE_CONFIG;
    expect(
      isBorderSegment({ x: 0, z: 1 }, { x: 0, z: 4 }, OVERWORLD_SCENE_CONFIG),
    ).toBe(true);
    expect(
      isBorderSegment(
        { x: 2, z: mapDepth },
        { x: mapWidth, z: mapDepth },
        OVERWORLD_SCENE_CONFIG,
      ),
    ).toBe(true);
    // A chord across the map is not a border, even from edge to edge.
    expect(
      isBorderSegment(
        { x: 0, z: 3 },
        { x: mapWidth, z: 3 },
        OVERWORLD_SCENE_CONFIG,
      ),
    ).toBe(false);
  });
});
