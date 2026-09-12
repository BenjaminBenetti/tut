import { describe, expect, it } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { PassMask } from "../../mapgen/model/pass-mask";
import { resolveMapModels, mapModelIds } from "./map-model-resolver";
import { resolveStreetDetails } from "./street-detail-resolver";

/** A four-lane avenue with a crossing and generous pavement. */
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

describe("street furniture", () => {
  it("uses both dormant municipal assets on straight curbs without changing gameplay data", () => {
    const map = avenue();
    const before = JSON.stringify(map);
    const index = new TileIndex(map);
    const details = resolveStreetDetails(map, index);
    expect(
      details.filter((p) => p.modelId === "prop.lamp-post").length,
    ).toBeGreaterThan(4);
    expect(
      details.filter((p) => p.modelId === "prop.hydrant").length,
    ).toBeGreaterThan(0);
    for (const detail of details) {
      expect(index.getAt(detail.tile)?.surface).toBe("sidewalk");
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
    expect(resolveStreetDetails(map, index)).toEqual(details);
    expect(mapModelIds(resolveMapModels(map))).toEqual(
      expect.arrayContaining(["prop.lamp-post", "prop.hydrant"]),
    );
    expect(JSON.stringify(map)).toBe(before);
  });

  it("keeps mission access, connector approaches, and occupied pavement clear", () => {
    const map = avenue();
    const index = new TileIndex(map);
    const target = resolveStreetDetails(map, index)[0]!;
    const protectedMap = {
      ...map,
      hooks: {
        ...map.hooks,
        deployZones: [
          {
            id: "deploy",
            kind: "deploy",
            tiles: [target.tile],
            requiredPass: PassMask.ALL,
          },
        ],
      },
    };
    expect(
      resolveStreetDetails(protectedMap, new TileIndex(protectedMap)).some(
        (p) =>
          Math.abs(p.tile.x - target.tile.x) <= 1 &&
          Math.abs(p.tile.z - target.tile.z) <= 1,
      ),
    ).toBe(false);
    const occupied = {
      ...map,
      tiles: map.tiles.map((tile) =>
        index.keyOf(tile) === index.keyOf(target.tile)
          ? { ...tile, propId: "occupied" }
          : tile,
      ),
    };
    expect(
      resolveStreetDetails(occupied, new TileIndex(occupied)).some(
        (p) => index.keyOf(p.tile) === index.keyOf(target.tile),
      ),
    ).toBe(false);
  });

  it("adds no municipal furniture to rural trails", () => {
    const map = avenue();
    const rural = {
      ...map,
      recipe: {
        ...map.recipe,
        params: { ...map.recipe.params, settlement: "rural" as const },
      },
    };
    expect(resolveStreetDetails(rural, new TileIndex(rural))).toEqual([]);
  });

  it("protects the complete dropship apron and both ends of connectors", () => {
    const map = avenue();
    const details = resolveStreetDetails(map, new TileIndex(map));
    const target = details[0]!.tile;
    const second = details.at(-1)!.tile;
    const clearance = { x: target.x - 2, z: target.z - 2, w: 5, d: 5 };
    const protectedMap = {
      ...map,
      dropships: [
        {
          deployZoneId: "ship",
          footprint: clearance,
          clearance,
          level: 0,
          facing: "n" as const,
        },
      ],
      connectors: [
        {
          id: "approach",
          kind: "ramp" as const,
          from: second,
          to: { ...second, y: 2 },
          pass: PassMask.ALL,
        },
      ],
    };
    const remaining = resolveStreetDetails(
      protectedMap,
      new TileIndex(protectedMap),
    );
    expect(
      remaining.some(
        (p) =>
          Math.abs(p.tile.x - target.x) <= 2 &&
          Math.abs(p.tile.z - target.z) <= 2,
      ),
    ).toBe(false);
    expect(
      remaining.some(
        (p) =>
          Math.abs(p.tile.x - second.x) <= 1 &&
          Math.abs(p.tile.z - second.z) <= 1,
      ),
    ).toBe(false);
  });
});
