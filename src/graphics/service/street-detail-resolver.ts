import { DIRECTIONS, type Direction } from "../../core/model/direction";
import { directionOffset, stepGridPos } from "../../core/service/grid-math";
import { hashSeed } from "../../core/service/seed-hash";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileIndex } from "../../mapgen/service/tile-index";
import type { Rotation } from "../../mapgen/model/prop";
import { ENVIRONMENT_DETAIL_STYLE } from "../data/environment-detail-style";
import { tileTop } from "../view/tactical-map-view";
import type { ModelPlacement } from "./map-model-resolver";

/** The lamp arm is authored along +X, facing the street. */
const STREET_TURNS: Readonly<Record<Direction, Rotation>> = {
  e: 0,
  s: 1,
  w: 2,
  n: 3,
};

/**
 * Reuses the authored municipal kit along straight pavement. These slender
 * fixtures sit at the curb inside their owner tile; they do not create cover
 * or block movement. Owner tiles supply fog and level visibility normally.
 */
export function resolveStreetDetails(
  map: TacticalMap,
  index: TileIndex,
): readonly ModelPlacement[] {
  if (map.recipe.params.settlement === "rural") return [];
  const protectedTiles = protectedStreetTiles(map, index);
  const result: ModelPlacement[] = [];
  const style = ENVIRONMENT_DETAIL_STYLE;
  const phase = hashSeed(`${map.recipe.seed}:street-furniture`);
  for (const tile of map.tiles) {
    if (
      tile.surface !== SurfaceIds.SIDEWALK ||
      tile.buildingId ||
      tile.propId ||
      tile.naturalEdge ||
      tile.slope ||
      protectedTiles.has(index.keyOf(tile)) ||
      Object.values(tile.walls).some((wall) => wall !== undefined)
    )
      continue;
    const sides = DIRECTIONS.filter(
      (side) =>
        index.getAt(stepGridPos(tile, side))?.surface === SurfaceIds.ROAD,
    );
    const side = sides.length === 1 ? sides[0] : undefined;
    if (!side || !straightCurb(tile, side, index)) continue;
    const along = side === "n" || side === "s" ? tile.x : tile.z;
    const across = side === "n" || side === "s" ? tile.z : tile.x;
    const lamp = (along + phase + across) % style.lampSpacing === 0;
    const hydrant = (along + phase + across) % style.hydrantSpacing === 4;
    if (!lamp && !hydrant) continue;
    const offset = directionOffset(side);
    result.push({
      modelId: lamp ? "prop.lamp-post" : "prop.hydrant",
      level: tile.y,
      position: {
        x: tile.x + 0.5 + offset.x * style.curbOffset,
        y: tileTop(tile.y),
        z: tile.z + 0.5 + offset.z * style.curbOffset,
      },
      turns: STREET_TURNS[side],
      tile: { x: tile.x, y: tile.y, z: tile.z },
    });
  }
  return result;
}

/** A two-tile margin around bends, junctions and pavement ends stays clear. */
function straightCurb(tile: Tile, side: Direction, index: TileIndex): boolean {
  const road = directionOffset(side);
  return [-2, -1, 0, 1, 2].every((distance) => {
    const here = index.get(
      tile.x + road.z * distance,
      tile.y,
      tile.z + road.x * distance,
    );
    return (
      here?.surface === SurfaceIds.SIDEWALK &&
      index.get(here.x + road.x, here.y, here.z + road.z)?.surface ===
        SurfaceIds.ROAD
    );
  });
}

/** Keep the immediate surroundings of entrances, connectors and hooks free of furniture. */
function protectedStreetTiles(
  map: TacticalMap,
  index: TileIndex,
): ReadonlySet<number> {
  const anchors = [
    ...map.buildings.flatMap((building) =>
      building.entrances.flatMap((entrance) => [
        entrance.tile,
        stepGridPos(entrance.tile, entrance.side),
      ]),
    ),
    ...map.connectors.flatMap((connector) => [connector.from, connector.to]),
    ...map.hooks.deployZones.flatMap((hook) => hook.tiles),
    ...map.hooks.objectives.flatMap((hook) => hook.tiles),
    ...map.hooks.edgeSpawns.flatMap((hook) => hook.tiles),
    ...(map.hooks.extraction?.tiles ?? []),
  ];
  const protectedTiles = new Set<number>();
  for (const { clearance } of map.dropships ?? [])
    for (let x = clearance.x; x < clearance.x + clearance.w; x++)
      for (let z = clearance.z; z < clearance.z + clearance.d; z++)
        for (const tile of index.column(x, z))
          protectedTiles.add(index.keyOf(tile));
  for (const anchor of anchors)
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const tile = index.get(anchor.x + dx, anchor.y, anchor.z + dz);
        if (tile) protectedTiles.add(index.keyOf(tile));
      }
  return protectedTiles;
}
