import { describe, expect, it } from "vitest";

import {
  footprintCentre,
  footprintContains,
  footprintSizeOf,
  footprintTiles,
} from "./footprint-service";

describe("footprintSizeOf", () => {
  it("is one for a template that declares nothing, and the declared side otherwise", () => {
    expect(footprintSizeOf({})).toBe(1);
    expect(footprintSizeOf({ footprint: undefined })).toBe(1);
    expect(footprintSizeOf({ footprint: 2 })).toBe(2);
  });
});

describe("footprintTiles", () => {
  it("is the anchor alone for a one-tile footprint", () => {
    expect(footprintTiles({ x: 3, y: 2, z: 5 }, 1)).toEqual([
      { x: 3, y: 2, z: 5 },
    ]);
  });

  it("lists a 2×2 anchor first, then row-major with z outer and x inner, all on the anchor's level", () => {
    expect(footprintTiles({ x: 3, y: 2, z: 5 }, 2)).toEqual([
      { x: 3, y: 2, z: 5 },
      { x: 4, y: 2, z: 5 },
      { x: 3, y: 2, z: 6 },
      { x: 4, y: 2, z: 6 },
    ]);
  });
});

describe("footprintCentre", () => {
  it("centres a one-tile footprint on its own tile", () => {
    expect(footprintCentre({ x: 3, y: 0, z: 5 }, 1)).toEqual({
      x: 3.5,
      z: 5.5,
    });
  });

  it("centres a 2×2 on the corner its four tiles share", () => {
    expect(footprintCentre({ x: 3, y: 0, z: 5 }, 2)).toEqual({ x: 4, z: 6 });
  });
});

describe("footprintContains", () => {
  const anchor = { x: 3, y: 2, z: 5 };

  it("covers exactly the four tiles of a 2×2, and nothing beside or beneath them", () => {
    for (const tile of footprintTiles(anchor, 2)) {
      expect(footprintContains(anchor, 2, tile)).toBe(true);
    }
    expect(footprintContains(anchor, 2, { x: 5, y: 2, z: 5 })).toBe(false);
    expect(footprintContains(anchor, 2, { x: 2, y: 2, z: 5 })).toBe(false);
    expect(footprintContains(anchor, 2, { x: 3, y: 2, z: 7 })).toBe(false);
    expect(footprintContains(anchor, 2, { x: 4, y: 0, z: 6 })).toBe(false);
  });

  it("a one-tile footprint contains only its anchor", () => {
    expect(footprintContains(anchor, 1, anchor)).toBe(true);
    expect(footprintContains(anchor, 1, { x: 4, y: 2, z: 5 })).toBe(false);
  });
});
