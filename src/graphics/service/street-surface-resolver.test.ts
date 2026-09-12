import { describe, expect, it } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { resolveStreetSurfaces } from "./street-surface-resolver";

/** A long avenue exposes both curb directions and a real central intersection. */
function avenue() {
  const builder = new FixtureMapBuilder(48, 48, 1).fillGround(0, "grass");
  for (let z = 0; z < 48; z++)
    for (let x = 0; x < 48; x++) {
      if ((z >= 22 && z <= 25) || (x >= 22 && x <= 25))
        builder.tile({ x, y: 0, z }, "road");
      else if ((z >= 20 && z <= 27) || (x >= 20 && x <= 27))
        builder.tile({ x, y: 0, z }, "sidewalk");
    }
  const map = builder.build();
  return {
    ...map,
    recipe: {
      ...map.recipe,
      params: { ...map.recipe.params, settlement: "city" as const },
    },
  };
}

describe("flush street infrastructure", () => {
  it("stays within level road cells and out of intersections without changing map data", () => {
    const map = avenue();
    const before = JSON.stringify(map);
    const index = new TileIndex(map);
    const details = resolveStreetSurfaces(map, index);
    expect(new Set(details.map((d) => d.modelId))).toEqual(
      new Set(["prop.manhole", "prop.curb-drain"]),
    );
    expect(new Set(details.map((d) => d.turns))).toEqual(new Set([0, 1]));
    for (const detail of details) {
      expect(index.getAt(detail.tile)?.surface).toBe("road");
      expect(detail.position.x).toBeGreaterThan(detail.tile.x);
      expect(detail.position.x).toBeLessThan(detail.tile.x + 1);
      expect(detail.position.z).toBeGreaterThan(detail.tile.z);
      expect(detail.position.z).toBeLessThan(detail.tile.z + 1);
      expect(
        detail.tile.x >= 20 &&
          detail.tile.x <= 27 &&
          detail.tile.z >= 20 &&
          detail.tile.z <= 27,
      ).toBe(false);
    }
    expect(resolveStreetSurfaces(map, index)).toEqual(details);
    expect(JSON.stringify(map)).toBe(before);
  });

  it("omits covers on occupied road tiles and broken curb approaches", () => {
    const map = avenue();
    const index = new TileIndex(map);
    const target = resolveStreetSurfaces(map, index)[0]!;
    const occupied = {
      ...map,
      tiles: map.tiles.map((t) =>
        index.keyOf(t) === index.keyOf(target.tile)
          ? { ...t, propId: "parked" }
          : t,
      ),
    };
    expect(
      resolveStreetSurfaces(occupied, new TileIndex(occupied)).some(
        (d) => index.keyOf(d.tile) === index.keyOf(target.tile),
      ),
    ).toBe(false);
    const noCurbs = {
      ...map,
      tiles: map.tiles.map((t) =>
        t.surface === "sidewalk" ? { ...t, surface: "grass" } : t,
      ),
    };
    expect(resolveStreetSurfaces(noCurbs, new TileIndex(noCurbs))).toEqual([]);
  });
});
