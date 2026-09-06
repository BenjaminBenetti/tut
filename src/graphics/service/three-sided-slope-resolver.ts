import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileIndex } from "../../mapgen/service/tile-index";
import type { TerrainSlopeAppearance } from "../model/terrain-slope-appearance";
import { terrainCornerLevels } from "./diagonal-slope-resolver";

/** N/E/S/W, with corners NW/NE/SE/SW on each edge and its neighbour. */
const EDGES = [
  { dx: 0, dz: -1, here: [0, 1], there: [3, 2] },
  { dx: 1, dz: 0, here: [1, 2], there: [0, 3] },
  { dx: 0, dz: 1, here: [3, 2], there: [0, 1] },
  { dx: -1, dz: 0, here: [0, 3], there: [1, 2] },
] as const;
const NATURAL = new Set(["grass", "dirt", "sand", "snow", "rock"]);

/**
 * Fits a three-high end and its opening as one closed surface (#849).
 *
 * Authored north-facing end:     mouth: two existing outer halves
 *         1 -- 0 -- 1                     0 ----- 0
 *         | \     / |                     | \   / |
 *         1 ------- 1                     1 - 0 - 1
 *
 * Only accepts a one-layer natural pocket whose unchanged perimeter already
 * meets this profile. In particular, both mouth flanks must contain selected
 * slopes; slopeShare=0, cliffs, opposite-high channels and four-high pits stay
 * untouched. Data and gameplay retain their original tiles and connectors.
 */
export function resolveThreeSidedSlopeAppearances(
  map: TacticalMap,
  index: TileIndex,
  occupied: ReadonlyMap<number, TerrainSlopeAppearance> = new Map(),
): ReadonlyMap<number, TerrainSlopeAppearance> {
  const result = new Map<number, TerrainSlopeAppearance>();
  if (map.recipe.params.slopeShare === 0) return result;
  const at = (x: number, z: number): Tile | undefined =>
    index
      .column(x, z)
      .reduce<Tile | undefined>(
        (ground, tile) => (tile.buildingId === undefined ? tile : ground),
        undefined,
      );
  const connectorTiles = new Set(
    map.connectors.flatMap((c) => [index.keyOf(c.from), index.keyOf(c.to)]),
  );
  const propTiles = new Set(map.props.map((p) => index.keyOf(p.tile)));
  const available = (tile: Tile | undefined): tile is Tile =>
    tile !== undefined &&
    tile.buildingId === undefined &&
    NATURAL.has(tile.surface) &&
    Object.keys(tile.walls).length === 0 &&
    !connectorTiles.has(index.keyOf(tile)) &&
    !occupied.has(index.keyOf(tile)) &&
    !result.has(index.keyOf(tile));
  for (const pocket of map.tiles) {
    if (
      !available(pocket) ||
      pocket.slope ||
      propTiles.has(index.keyOf(pocket)) ||
      at(pocket.x, pocket.z) !== pocket
    )
      continue;
    const neighbours = EDGES.map(({ dx, dz }) =>
      at(pocket.x + dx, pocket.z + dz),
    );
    if (neighbours.filter((t) => t?.y === pocket.y + 1).length !== 3) continue;
    const turns = neighbours.findIndex((t) => t?.y === pocket.y) as Rotation;
    if (turns < 0) continue;
    const mouth = neighbours[turns];
    if (!available(mouth) || mouth.slope || propTiles.has(index.keyOf(mouth)))
      continue;
    // Rotate the mouth's two high back corners into world orientation.
    const mouthCorners = [0, 0, 0, 0];
    mouthCorners[(2 + turns) % 4] = 1;
    mouthCorners[(3 + turns) % 4] = 1;
    const fits = [
      { tile: pocket, corners: [1, 1, 1, 1], other: mouth },
      { tile: mouth, corners: mouthCorners, other: pocket },
    ].every(({ tile, corners, other }) =>
      EDGES.every(({ dx, dz, here, there }) => {
        const neighbour = at(tile.x + dx, tile.z + dz);
        if (neighbour === other) return true; // Both share the same V, including its midpoint.
        if (!available(neighbour)) return false;
        const heights = terrainCornerLevels(neighbour, index);
        return here.every(
          (corner, i) => tile.y + (corners[corner] ?? 0) === heights[there[i]!],
        );
      }),
    );
    if (!fits) continue;
    result.set(index.keyOf(pocket), { kind: "three-sided", turns });
    result.set(index.keyOf(mouth), { kind: "three-sided-mouth", turns });
  }
  return result;
}
