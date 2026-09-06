import { describe, expect, it } from "vitest";
import { TileIndex } from "../../mapgen/service/tile-index";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { DEFAULT_MISSION_HOOKS } from "../../mapgen/data/hook-requirements";
import {
  resolveDiagonalSlopeAppearances,
  terrainCornerLevels,
} from "./diagonal-slope-resolver";
import { diagonalTerrace } from "./diagonal-slope-fixture.test-helper";

const CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

describe("diagonal chain fitting (#848)", () => {
  for (const length of [2, 3, 4])
    for (const turns of [0, 1, 2, 3] as const) {
      it(`${length} corners, turn ${turns}: one plane with every incident vertex shared`, () => {
        const map = diagonalTerrace(length, turns);
        const index = new TileIndex(map);
        const result = resolveDiagonalSlopeAppearances(map, index);
        expect(
          [...result.values()].filter((a) => a.kind === "diagonal"),
        ).toHaveLength(length);
        const vertices = new Map<string, number[]>();
        for (const tile of map.tiles) {
          const appearance = result.get(index.keyOf(tile));
          let heights = terrainCornerLevels(tile, index);
          if (appearance?.kind === "transition")
            heights = appearance.corners.map(
              (h) => h + tile.y,
            ) as unknown as typeof heights;
          else if (appearance?.kind === "diagonal") {
            const [dx, dz] = [
              [-1, 1],
              [-1, -1],
              [1, -1],
              [1, 1],
            ][appearance.turns]!;
            heights = CORNERS.map(
              ([x, z]) =>
                tile.y + ((dx! > 0 ? x : 1 - x) + (dz! > 0 ? z : 1 - z)) / 2,
            ) as unknown as typeof heights;
          }
          for (const [i, [dx, dz]] of CORNERS.entries()) {
            const key = `${tile.x + dx},${tile.z + dz}`;
            const values = vertices.get(key) ?? [];
            values.push(heights[i]!);
            vertices.set(key, values);
          }
        }
        for (const [key, values] of vertices)
          expect(new Set(values).size, `shared vertex ${key}`).toBe(1);
      });
    }
  it("keeps isolated corners and existing man-made boundaries unchanged", () => {
    const isolated = diagonalTerrace(1);
    expect(
      resolveDiagonalSlopeAppearances(isolated, new TileIndex(isolated)).size,
    ).toBe(0);
    const field = diagonalTerrace(3);
    const walled = {
      ...field,
      tiles: field.tiles.map((t) =>
        t.x === 2 && t.z === 0 ? { ...t, walls: { n: "solid" as const } } : t,
      ),
    };
    expect(
      resolveDiagonalSlopeAppearances(walled, new TileIndex(walled)).size,
    ).toBe(0);
  });
  for (const level of [0, 2])
    it(`preserves a chain beside an existing cliff at adjacent level ${level}`, () => {
      const field = diagonalTerrace(3);
      const map = {
        ...field,
        tiles: field.tiles.map((t) => ({
          ...t,
          y: t.x === 0 && t.z === 1 ? level : t.y + 1,
        })),
      };
      expect(
        resolveDiagonalSlopeAppearances(map, new TileIndex(map)).size,
      ).toBe(0);
    });
  it("fits the rescaled four-chain and leaves #849's three-high slot outside this shape", () => {
    const make = (
      seed: string,
      settlement: "town" | "rural",
      size: "large" | "medium",
    ) =>
      generateTacticalMap({
        seed,
        params: {
          archetype: "settlement",
          biome: "snowy",
          settlement,
          size,
          hooks: DEFAULT_MISSION_HOOKS,
          slopeShare: 1,
        },
      });
    const map = make("qa813-snowy-town-large-0", "town", "large");
    const index = new TileIndex(map),
      result = resolveDiagonalSlopeAppearances(map, index);
    for (const [x, y, z] of [
      [23, 2, 91],
      [24, 3, 90],
      [25, 4, 89],
      [26, 5, 88],
    ])
      expect(result.get(index.keyOf({ x: x!, y: y!, z: z! }))).toEqual({
        kind: "diagonal",
        turns: 2,
      });
    const slot = make("hills-1", "rural", "medium");
    const slotIndex = new TileIndex(slot);
    expect(
      resolveDiagonalSlopeAppearances(slot, slotIndex).has(
        slotIndex.keyOf({ x: 10, y: 3, z: 29 }),
      ),
    ).toBe(false);
  });
});
