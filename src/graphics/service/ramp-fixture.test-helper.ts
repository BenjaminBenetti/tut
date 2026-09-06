import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";

/** Three adjacent ramps on a road or natural bank, with a one- or two-layer rise. */
export function rampTerrace(
  layers: 1 | 2,
  surface = "road",
  turns: Rotation = 0,
  padding = 0,
): TacticalMap {
  const size = 7 + 2 * padding;
  const builder = new FixtureMapBuilder(size, size, layers + 1);
  /** Keeps terrain and connector endpoints together through each quarter turn. */
  const rotate = (x: number, y: number, z: number): TileCoord => {
    for (let i = 0; i < turns; i++) [x, z] = [size - 1 - z, x];
    return { x, y, z };
  };
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++)
      builder.tile(
        rotate(x, z >= 3 + padding ? layers : 0, z),
        surface === "road" && (x < 2 + padding || x > 4 + padding)
          ? "grass"
          : surface,
      );
  for (const x of [2, 3, 4])
    builder.connector(
      "ramp",
      rotate(x + padding, 0, 2 + padding),
      rotate(x + padding, layers, 3 + padding),
    );
  const map = builder.build();
  return {
    ...map,
    recipe: {
      ...map.recipe,
      params: { ...map.recipe.params, settlement: "town" },
    },
  };
}
