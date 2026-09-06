import { describe, expect, it } from "vitest";
import type { Tile } from "../../mapgen/model/tile";
import { TileIndex } from "../../mapgen/service/tile-index";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { DEFAULT_MISSION_HOOKS } from "../../mapgen/data/hook-requirements";
import { threeSidedTerrace } from "./three-sided-slope-fixture.test-helper";
import { resolveThreeSidedSlopeAppearances } from "./three-sided-slope-resolver";
import { resolveMapModels } from "./map-model-resolver";
import { tileTop } from "../view/tactical-map-view";

describe("three-sided gully fitting (#849)", () => {
  for (const turns of [0, 1, 2, 3] as const)
    it(`opening turn ${turns}: places the end and mouth without changing map data`, () => {
      const map = threeSidedTerrace(turns);
      const before = JSON.stringify(map);
      const placements = resolveMapModels(map).tiles.filter((p) => p.terrain);
      expect(placements).toHaveLength(2);
      for (const placement of placements) {
        expect(placement.turns).toBe(turns);
        expect(placement.position.y).toBe(tileTop(0));
      }
      expect(JSON.stringify(map)).toBe(before);
    });
  const refusals: [string, number, number, Partial<Tile>][] = [
    ["opposite-high channel", 3, 4, { y: 0 }],
    ["four-high pit", 3, 2, { y: 1 }],
    ["two-layer high edge", 3, 4, { y: 2 }],
    ["walled end", 3, 3, { walls: { s: "solid" } }],
    ["paved mouth", 3, 2, { surface: "road" }],
    ["building mouth", 3, 2, { buildingId: "building" }],
    ["unselected flank", 2, 2, { slope: undefined }],
    ["raised exit", 3, 1, { y: 1 }],
  ];
  for (const [label, x, z, change] of refusals)
    it(`preserves ${label}`, () => {
      const field = threeSidedTerrace();
      const map = {
        ...field,
        levels: 3,
        tiles: field.tiles.map((t) =>
          t.x === x && t.z === z ? { ...t, ...change } : t,
        ),
      };
      expect(
        resolveThreeSidedSlopeAppearances(map, new TileIndex(map)).size,
      ).toBe(0);
    });
  it("honours zero slope share and an already fitted diagonal boundary", () => {
    const field = threeSidedTerrace();
    const map = {
      ...field,
      recipe: {
        ...field.recipe,
        params: { ...field.recipe.params, slopeShare: 0 },
      },
    };
    expect(
      resolveThreeSidedSlopeAppearances(map, new TileIndex(map)).size,
    ).toBe(0);
    const index = new TileIndex(field);
    expect(
      resolveThreeSidedSlopeAppearances(
        field,
        index,
        new Map([
          [index.keyOf({ x: 2, y: 0, z: 2 }), { kind: "diagonal", turns: 0 }],
        ]),
      ).size,
    ).toBe(0);
  });
  it("preserves a connector through the pocket", () => {
    const field = threeSidedTerrace();
    const map = {
      ...field,
      connectors: [
        {
          id: "protected-ramp",
          kind: "ramp" as const,
          pass: 3,
          from: { x: 3, y: 0, z: 3 },
          to: { x: 3, y: 1, z: 4 },
        },
      ],
    };
    expect(
      resolveThreeSidedSlopeAppearances(map, new TileIndex(map)).size,
    ).toBe(0);
  });
  it("fits the unchanged hills-1 J3 data at its exact current-main coordinates", () => {
    const map = generateTacticalMap({
      seed: "hills-1",
      params: {
        archetype: "settlement",
        biome: "snowy",
        settlement: "rural",
        size: "medium",
        hooks: DEFAULT_MISSION_HOOKS,
        slopeShare: 1,
      },
    });
    const placements = resolveMapModels(map).tiles;
    for (const [x, kind, modelId] of [
      [10, "three-sided", "tile.slope.three-sided"],
      [11, "three-sided-mouth", "tile.slope.outer"],
    ] as const) {
      const placement = placements.find(
        (p) => p.tile.x === x && p.tile.y === 3 && p.tile.z === 29,
      );
      expect(placement?.terrain).toEqual({ kind, turns: 1 });
      expect(placement?.modelId).toBe(modelId);
      expect(
        map.tiles.find((t) => t.x === x && t.y === 3 && t.z === 29)?.slope,
      ).toBeUndefined();
    }
  });
});
