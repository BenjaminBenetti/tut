import { describe, expect, it } from "vitest";

import { CoverLevel } from "../model/cover";
import { PassMask } from "../model/pass-mask";
import type { TileGridSource } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import { NO_WALLS } from "../model/wall";
import { TileIndex } from "./tile-index";

function tile(x: number, y: number, z: number, surface = "grass"): Tile {
  return {
    x,
    y,
    z,
    surface,
    pass: PassMask.ALL,
    walls: NO_WALLS,
    coverProvided: CoverLevel.NONE,
  };
}

/**
 * 3 wide × 2 deep, 3 levels. Column (1,0) has ground plus a floor above
 * it and a roof above that; column (2,1) is empty (water-less hole).
 */
function source(tiles: readonly Tile[]): TileGridSource {
  return { width: 3, depth: 2, levels: 3, tiles };
}

const GROUND = [
  tile(0, 0, 0),
  tile(1, 0, 0),
  tile(2, 0, 0),
  tile(0, 0, 1),
  tile(1, 0, 1),
];
const STACK = [tile(1, 2, 0, "roof"), tile(1, 1, 0, "floor")];

describe("TileIndex", () => {
  it("looks up tiles by coordinate", () => {
    const index = new TileIndex(source([...GROUND, ...STACK]));
    expect(index.size).toBe(7);
    expect(index.get(1, 1, 0)?.surface).toBe("floor");
    expect(index.getAt({ x: 2, y: 0, z: 0 })).toBe(GROUND[2]);
    expect(index.has({ x: 2, y: 0, z: 1 })).toBe(false);
  });

  it("returns undefined instead of throwing for off-map coordinates", () => {
    const index = new TileIndex(source(GROUND));
    expect(index.get(-1, 0, 0)).toBeUndefined();
    expect(index.get(3, 0, 0)).toBeUndefined();
    expect(index.get(0, 3, 0)).toBeUndefined();
    expect(index.get(0, 0, 2)).toBeUndefined();
    expect(index.inBounds({ x: 0, y: 2, z: 1 })).toBe(true);
    expect(index.inBounds({ x: 0, y: 3, z: 1 })).toBe(false);
  });

  it("lists a column in ascending level order regardless of input order", () => {
    const index = new TileIndex(source([...STACK, ...GROUND]));
    expect(index.column(1, 0).map((t) => t.y)).toEqual([0, 1, 2]);
    expect(index.column(2, 1)).toEqual([]);
  });

  it("finds same-level neighbours and nothing across the edge", () => {
    const index = new TileIndex(source([...GROUND, ...STACK]));
    const origin = index.get(1, 0, 0);
    expect(origin).toBeDefined();
    if (origin === undefined) {
      return;
    }
    expect(index.neighbour(origin, "w")).toBe(GROUND[0]);
    expect(index.neighbour(origin, "e")).toBe(GROUND[2]);
    expect(index.neighbour(origin, "s")).toBe(GROUND[4]);
    expect(index.neighbour(origin, "n")).toBeUndefined();
    // The floor above is not a neighbour: same level only.
    expect(index.neighbour({ x: 0, y: 1, z: 0 }, "e")?.surface).toBe("floor");
  });

  it("packs keys with the ADR layout", () => {
    const index = new TileIndex(source([]));
    // (y * depth + z) * width + x
    expect(index.keyOf({ x: 2, y: 1, z: 1 })).toBe((1 * 2 + 1) * 3 + 2);
    expect(() => index.keyOf({ x: 3, y: 0, z: 0 })).toThrow(/outside/);
  });

  it("rejects out-of-bounds tiles", () => {
    expect(() => new TileIndex(source([tile(3, 0, 0)]))).toThrow(
      /outside 3×2×3/,
    );
    expect(() => new TileIndex(source([tile(0, 3, 0)]))).toThrow(
      /outside 3×2×3/,
    );
  });

  it("rejects duplicate coordinates", () => {
    expect(
      () => new TileIndex(source([tile(0, 0, 0), tile(0, 0, 0, "dirt")])),
    ).toThrow(/Duplicate tile at \(0, 0, 0\)/);
  });
});
