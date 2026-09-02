import { describe, expect, it } from "vitest";

import { MAP_SIZE_DEFINITIONS } from "../../mapgen/data/map-sizes";
import { MAP_SIZE_IDS } from "./map-size-id";

describe("MapSizeId", () => {
  it("lists each id once", () => {
    expect(new Set(MAP_SIZE_IDS).size).toBe(MAP_SIZE_IDS.length);
  });

  it("matches the sizes map generation defines", () => {
    expect([...MAP_SIZE_IDS].sort()).toEqual(
      Object.keys(MAP_SIZE_DEFINITIONS).sort(),
    );
  });
});
