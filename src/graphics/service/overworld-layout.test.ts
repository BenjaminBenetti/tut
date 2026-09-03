import { describe, expect, it } from "vitest";

import type { City } from "../../overworld/model/city";
import type { Region } from "../../overworld/model/region";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import {
  layoutToWorld,
  mapCentre,
  regionPlateExtent,
} from "./overworld-layout";

const CONFIG: OverworldSceneConfig = {
  ...OVERWORLD_SCENE_CONFIG,
  mapWidth: 20,
  mapDepth: 10,
  platePadding: 1,
  plateMinSize: 2,
};

function city(id: string, x: number, y: number): City {
  return {
    id,
    name: id,
    regionId: "r",
    infestation: 0,
    neighbourIds: [],
    layout: { x, y },
  };
}

function region(x: number, y: number, cityIds: readonly string[]): Region {
  return {
    id: "r",
    name: "R",
    biome: "temperate",
    cityIds,
    neighbourRegionIds: [],
    layout: { x, y },
  };
}

describe("overworld-layout", () => {
  describe("layoutToWorld", () => {
    it("maps the north-west corner to the origin and the south-east corner to the far edge", () => {
      expect(layoutToWorld({ x: 0, y: 0 }, CONFIG)).toEqual({
        x: 0,
        y: 0,
        z: 0,
      });
      expect(layoutToWorld({ x: 1, y: 1 }, CONFIG)).toEqual({
        x: 20,
        y: 0,
        z: 10,
      });
    });

    it("scales linearly and stays on the ground plane", () => {
      expect(layoutToWorld({ x: 0.25, y: 0.5 }, CONFIG)).toEqual({
        x: 5,
        y: 0,
        z: 5,
      });
    });
  });

  it("mapCentre is the middle of the plane", () => {
    expect(mapCentre(CONFIG)).toEqual({ x: 10, y: 0, z: 5 });
  });

  describe("regionPlateExtent", () => {
    it("centres the plate on the region layout and covers every city with padding", () => {
      const cities = [
        city("a", 0.1, 0.2),
        city("b", 0.4, 0.3),
        city("c", 0.2, 0.6),
      ];
      const extent = regionPlateExtent(
        region(0.25, 0.4, ["a", "b", "c"]),
        cities,
        CONFIG,
      );
      expect(extent.centre).toEqual({ x: 5, y: 0, z: 4 });
      // Furthest city in x is "b" at 8 (3 away); in z it is "c" at 6 (2 away).
      expect(extent.width).toBeCloseTo(2 * (3 + 1));
      expect(extent.depth).toBeCloseTo(2 * (2 + 1));
      for (const c of cities) {
        const p = layoutToWorld(c.layout, CONFIG);
        expect(Math.abs(p.x - extent.centre.x)).toBeLessThanOrEqual(
          extent.width / 2,
        );
        expect(Math.abs(p.z - extent.centre.z)).toBeLessThanOrEqual(
          extent.depth / 2,
        );
      }
    });

    it("never shrinks below the minimum plate size", () => {
      const only = city("a", 0.5, 0.5);
      const extent = regionPlateExtent(region(0.5, 0.5, ["a"]), [only], CONFIG);
      expect(extent.width).toBe(2);
      expect(extent.depth).toBe(2);
    });
  });
});
