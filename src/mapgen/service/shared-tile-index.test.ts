import { describe, expect, it } from "vitest";

import { CoverLevel } from "../model/cover";
import { PassMask } from "../model/pass-mask";
import type { TileGridSource } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import { NO_WALLS } from "../model/wall";
import { tileIndexOf } from "./shared-tile-index";

// ===========================================
// Fixtures
// ===========================================

/** A plain ground tile. */
function tile(x: number, y: number, z: number): Tile {
  return {
    x,
    y,
    z,
    surface: "grass",
    pass: PassMask.ALL,
    walls: NO_WALLS,
    coverProvided: CoverLevel.NONE,
    blocksLos: false,
  };
}

/** A 3×2 grid, 2 levels, with its tile list and fields left writable. */
interface DraftGrid {
  width: number;
  depth: number;
  levels: number;
  tiles: Tile[];
}

/** Ground on the first row only, so a later tile is a new one. */
function grid(): DraftGrid {
  return {
    width: 3,
    depth: 2,
    levels: 2,
    tiles: [tile(0, 0, 0), tile(1, 0, 0), tile(2, 0, 0)],
  };
}

// ===========================================
// Sharing
// ===========================================

describe("tileIndexOf", () => {
  it("builds a grid's index once and hands the same one to every caller", () => {
    const source: TileGridSource = grid();
    const first = tileIndexOf(source);
    expect(first.size).toBe(3);
    expect(tileIndexOf(source)).toBe(first);
  });

  it("gives an equal but separate grid its own index", () => {
    const one = grid();
    const other = grid();
    expect(tileIndexOf(other)).not.toBe(tileIndexOf(one));
    expect(tileIndexOf(other).size).toBe(3);
  });

  // ===========================================
  // Staleness
  // ===========================================

  it("re-indexes a grid whose tile list grew in place", () => {
    const draft = grid();
    const before = tileIndexOf(draft);
    draft.tiles.push(tile(0, 0, 1));
    const after = tileIndexOf(draft);
    expect(after).not.toBe(before);
    expect(after.has({ x: 0, y: 0, z: 1 })).toBe(true);
  });

  it("re-indexes a grid whose tile list was replaced", () => {
    const draft = grid();
    const before = tileIndexOf(draft);
    draft.tiles = [tile(0, 1, 1), tile(1, 1, 1), tile(2, 1, 1)];
    const after = tileIndexOf(draft);
    expect(after).not.toBe(before);
    expect(after.size).toBe(3);
    expect(after.get(1, 1, 1)).toBe(draft.tiles[1]);
    expect(after.has({ x: 1, y: 0, z: 0 })).toBe(false);
  });

  it("re-indexes a grid whose bounds changed", () => {
    const draft = grid();
    const before = tileIndexOf(draft);
    draft.width = 4;
    const after = tileIndexOf(draft);
    expect(after).not.toBe(before);
    expect(after.width).toBe(4);
  });

  it("throws what the index throws on a bad grid, and keeps nothing", () => {
    const draft = grid();
    draft.tiles.push(tile(0, 0, 0));
    expect(() => tileIndexOf(draft)).toThrow("Duplicate tile at (0, 0, 0)");
    draft.tiles.pop();
    expect(tileIndexOf(draft).size).toBe(3);
  });
});
