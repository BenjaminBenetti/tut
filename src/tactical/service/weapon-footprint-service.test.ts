import { describe, expect, it } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { weaponFootprint } from "./weapon-footprint-service";
import { attackDistance } from "./weapon-reach-service";
import type { WeaponProfile } from "../model/weapon-profile";

const BEAM: WeaponProfile = {
  range: 12,
  accuracy: 90,
  damage: 10,
  armorPen: 4,
  beam: true,
};
const ORIGIN = { x: 1, y: 0, z: 3 };

describe("continuous beam geometry", () => {
  it("continues twelve tiles through a nearby aim point and stops at its range limit", () => {
    const map = new FixtureMapBuilder(20, 8, 4).fillGround().build();
    const tiles = weaponFootprint(
      map,
      BEAM,
      { x: 3, y: 0, z: 3 },
      new TileIndex(map),
      ORIGIN,
    );
    expect(tiles.map(({ tile }) => tile.x)).toEqual(
      Array.from({ length: 12 }, (_, n) => n + 2),
    );
    expect(tiles.every(({ distance }) => distance === 0)).toBe(true);
  });

  it("stops at walls beyond the aimed tile and at map edges", () => {
    const map = new FixtureMapBuilder(20, 8, 4)
      .fillGround()
      .wall({ x: 7, y: 0, z: 3 }, "e", "solid")
      .build();
    expect(
      weaponFootprint(
        map,
        BEAM,
        { x: 3, y: 0, z: 3 },
        new TileIndex(map),
        ORIGIN,
      ).at(-1)?.tile.x,
    ).toBe(7);
    const edge = new FixtureMapBuilder(8, 8, 4).fillGround().build();
    expect(
      weaponFootprint(
        edge,
        BEAM,
        { x: 3, y: 0, z: 3 },
        new TileIndex(edge),
        ORIGIN,
      ).at(-1)?.tile.x,
    ).toBe(7);
  });

  it("uses the normal diagonal range metric, with no duplicate or shooter tiles", () => {
    const map = new FixtureMapBuilder(20, 20, 4).fillGround().build();
    const tiles = weaponFootprint(
      map,
      BEAM,
      { x: 3, y: 0, z: 5 },
      new TileIndex(map),
      ORIGIN,
    ).map(({ tile }) => tile);
    expect(tiles.at(-1)).toMatchObject({ x: 7, y: 0, z: 9 });
    expect(tiles.every((tile) => attackDistance(ORIGIN, tile) <= 12)).toBe(
      true,
    );
    expect(
      new Set(tiles.map((tile) => `${tile.x}/${tile.y}/${tile.z}`)).size,
    ).toBe(tiles.length);
    expect(tiles).not.toContainEqual(expect.objectContaining(ORIGIN));
  });
});
