import { describe, expect, it } from "vitest";

import { MAP_SIZE_PRESETS } from "../model/map-recipe";
import {
  MAX_MAP_DIMENSION,
  MIN_MAP_DIMENSION,
} from "../model/map-size-definition";
import { createRegistry } from "../../core/service/definition-registry";
import { MAP_SIZE_DEFINITIONS } from "./map-sizes";

describe("map size definitions", () => {
  const sizes = createRegistry("map size", Object.values(MAP_SIZE_DEFINITIONS));

  it("define every preset exactly once", () => {
    for (const id of MAP_SIZE_PRESETS) {
      expect(sizes.has(id), id).toBe(true);
    }
    expect(sizes.ids.length).toBe(MAP_SIZE_PRESETS.length);
  });

  it("stay inside the supported dimension range", () => {
    for (const size of sizes.values) {
      for (const value of [size.width, size.depth]) {
        expect(Number.isInteger(value), size.id).toBe(true);
        expect(value).toBeGreaterThanOrEqual(MIN_MAP_DIMENSION);
        expect(value).toBeLessThanOrEqual(MAX_MAP_DIMENSION);
      }
    }
  });

  it("grow monotonically from small to large", () => {
    const areas = MAP_SIZE_PRESETS.map((id) => {
      const size = sizes.get(id);
      return size.width * size.depth;
    });
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i]).toBeGreaterThan(
        areas[i - 1] ?? Number.POSITIVE_INFINITY,
      );
    }
  });
});
