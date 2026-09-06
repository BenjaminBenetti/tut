import { DIRECTIONS } from "../../core/model/direction";
import type { Direction } from "../../core/model/direction";
import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { WallKind } from "../../mapgen/model/wall";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { wallFamilyFor } from "../data/map-model-table";
import type { WallFamily } from "../data/map-model-table";

/** A small facade and courtyard, with a ladder whose foot may start halfway up a storey. */
export function ladderFacade(
  layers: number,
  family: WallFamily = "concrete",
  turns: Rotation = 0,
): TacticalMap {
  const size = 7;
  const roof = Math.ceil(layers / 2) * 2;
  const foot = roof - layers;
  const buildingId = Array.from({ length: 30 }, (_, i) => `building-${i}`).find(
    (id) => wallFamilyFor(id) === family,
  )!;
  const builder = new FixtureMapBuilder(size, size, roof + 1).fillGround(
    foot,
    "sidewalk",
  );
  for (let z = 2; z <= 4; z++)
    for (let x = 2; x <= 4; x++) {
      builder.removeTile({ x, y: foot, z });
      for (let y = 0; y <= roof; y += 2)
        builder.tile({ x, y, z }, y === roof ? "roof" : "floor", {
          buildingId,
          floorIndex: y / 2,
        });
    }
  for (let y = 0; y < roof; y += 2)
    for (let n = 2; n <= 4; n++) {
      builder.wall({ x: n, y, z: 2 }, "n", "solid");
      builder.wall({ x: n, y, z: 4 }, "s", "solid");
      builder.wall({ x: 2, y, z: n }, "w", "solid");
      builder.wall({ x: 4, y, z: n }, "e", "solid");
    }
  builder.connector(
    "ladder",
    { x: 3, y: foot, z: 1 },
    { x: 3, y: roof, z: 2 },
    buildingId,
  );
  const map = builder.build();
  /** Rotates the facade, endpoints and mirrored wall ownership as one neighbourhood. */
  const rotate = (tile: TileCoord): TileCoord => {
    let { x, z } = tile;
    for (let i = 0; i < turns; i++) [x, z] = [size - 1 - z, x];
    return { x, y: tile.y, z };
  };
  /** Preserves typed wall kinds while rotating their compass edges. */
  const rotateWalls = (walls: Tile["walls"]): Tile["walls"] => {
    const rotated: Partial<Record<Direction, WallKind>> = {};
    for (const side of DIRECTIONS) {
      const kind = walls[side];
      if (kind !== undefined)
        rotated[DIRECTIONS[(DIRECTIONS.indexOf(side) + turns) % 4]!] = kind;
    }
    return rotated;
  };
  return {
    ...map,
    tiles: map.tiles.map((t) => ({
      ...t,
      ...rotate(t),
      // Give both copies of each mirrored fixture wall the same facade family.
      buildingId: Object.keys(t.walls).length ? buildingId : t.buildingId,
      walls: rotateWalls(t.walls),
    })),
    connectors: map.connectors.map((c) => ({
      ...c,
      from: rotate(c.from),
      to: rotate(c.to),
    })),
  };
}
