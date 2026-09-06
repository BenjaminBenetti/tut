import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileIndex } from "../../mapgen/service/tile-index";
import type {
  TerrainCornerHeights,
  TerrainSlopeAppearance,
} from "../model/terrain-slope-appearance";
import { terrainSlopeRise } from "./terrain-slope-rise";

/** Map-data high diagonals, on the existing corner quarter-turn convention. */
const HIGH_DIAGONALS = [
  [-1, 1],
  [-1, -1],
  [1, -1],
  [1, 1],
] as const;
const CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;
const NATURAL_SURFACES = new Set(["grass", "dirt", "sand", "snow", "rock"]);

/** Existing rendered corner heights, in world layers, including older scaled slopes. */
export function terrainCornerLevels(
  tile: Tile,
  index: TileIndex,
): TerrainCornerHeights {
  const slope = tile.slope;
  if (!slope) return [tile.y, tile.y, tile.y, tile.y];
  const rise = terrainSlopeRise(tile, index);
  const turns = (slope.turns + (slope.kind === "straight" ? 0 : 1)) % 4;
  return CORNERS.map(([cx, cz]) => {
    let x = cx - 0.5,
      z = cz - 0.5;
    for (let i = 0; i < turns; i++) [x, z] = [z, -x];
    const u = x + 0.5,
      v = z + 0.5;
    return (
      tile.y +
      rise *
        (slope.kind === "straight"
          ? v
          : slope.kind === "inner"
            ? Math.max(u, v)
            : Math.min(u, v))
    );
  }) as unknown as TerrainCornerHeights;
}

/**
 * Replaces aligned outer-corner chains by one diagonal plane. Its two
 * half-height side vertices are shared with the incident ground tiles,
 * so those tiles receive transition caps instead of exposing new seams.
 * Map heights, slope metadata and traversal remain unchanged.
 */
export function resolveDiagonalSlopeAppearances(
  map: TacticalMap,
  index: TileIndex,
): ReadonlyMap<number, TerrainSlopeAppearance> {
  const ground = new Map<number, Tile>();
  const key = (x: number, z: number): number => z * map.width + x;
  for (const tile of map.tiles) {
    if (tile.buildingId !== undefined) continue;
    const previous = ground.get(key(tile.x, tile.z));
    if (!previous || previous.y < tile.y) ground.set(key(tile.x, tile.z), tile);
  }
  const at = (x: number, z: number): Tile | undefined =>
    x < 0 || z < 0 || x >= map.width || z >= map.depth
      ? undefined
      : ground.get(key(x, z));
  const vertexKey = (x: number, z: number): number => z * (map.width + 1) + x;
  const oldCorners = new Map<number, TerrainCornerHeights>();
  const corners = (tile: Tile): TerrainCornerHeights => {
    const k = key(tile.x, tile.z);
    let value = oldCorners.get(k);
    if (!value) {
      value = terrainCornerLevels(tile, index);
      oldCorners.set(k, value);
    }
    return value;
  };
  const connectorTiles = new Set(
    map.connectors.flatMap((c) => [
      key(c.from.x, c.from.z),
      key(c.to.x, c.to.z),
    ]),
  );
  const editable = (tile: Tile): boolean =>
    NATURAL_SURFACES.has(tile.surface) &&
    Object.keys(tile.walls).length === 0 &&
    !connectorTiles.has(key(tile.x, tile.z));
  const incident = (vx: number, vz: number): (Tile | undefined)[] =>
    CORNERS.map(([dx, dz]) => at(vx - dx, vz - dz));
  const cornerAt = (tile: Tile, vx: number, vz: number): number =>
    CORNERS.findIndex(([dx, dz]) => tile.x + dx === vx && tile.z + dz === vz);
  const result = new Map<number, TerrainSlopeAppearance>();
  const changes = new Map<
    number,
    { x: number; z: number; height: number; diagonal: 0 | 1 }
  >();
  const fixedCorners = new Map<number, number>();
  const seen = new Set<number>();
  for (const tile of ground.values()) {
    if (tile.slope?.kind !== "outer" || seen.has(key(tile.x, tile.z))) continue;
    const turns = tile.slope.turns;
    const [dx, dz] = HIGH_DIAGONALS[turns];
    const matches = (
      candidate: Tile | undefined,
      level: number,
    ): candidate is Tile =>
      candidate?.y === level &&
      candidate.slope?.kind === "outer" &&
      candidate.slope.turns === turns;
    // Find the low end first, so map iteration order does not decide the chain.
    let start = tile;
    for (;;) {
      const previous = at(start.x - dx, start.z - dz);
      if (!matches(previous, start.y - 1)) break;
      start = previous;
    }
    const chain: Tile[] = [];
    let next: Tile | undefined = start;
    while (next) {
      chain.push(next);
      seen.add(key(next.x, next.z));
      const upper = at(next.x + dx, next.z + dz);
      next = matches(upper, next.y + 1) ? upper : undefined;
    }
    if (
      chain.length < 2 ||
      chain.some((t) => !editable(t) || terrainSlopeRise(t, index) !== 1)
    )
      continue;
    const chainKeys = new Set(chain.map((t) => key(t.x, t.z)));
    const proposals = new Map<
      number,
      { x: number; z: number; height: number; previous: number }
    >();
    let valid = true;
    for (const core of chain) {
      const old = corners(core);
      for (const [i, [cx, cz]] of CORNERS.entries()) {
        const vx = core.x + cx,
          vz = core.z + cz;
        const fraction = ((dx > 0 ? cx : 1 - cx) + (dz > 0 ? cz : 1 - cz)) / 2;
        const height = core.y + fraction;
        const k = vertexKey(vx, vz);
        const fixed = fixedCorners.get(k);
        if (fixed !== undefined && fixed !== height) valid = false;
        if (height === old[i]) continue;
        const proposal = proposals.get(k);
        if (proposal && proposal.height !== height) valid = false;
        proposals.set(k, { x: vx, z: vz, height, previous: old[i]! });
      }
    }
    for (const proposal of proposals.values()) {
      for (const neighbour of incident(proposal.x, proposal.z)) {
        if (
          !neighbour ||
          !editable(neighbour) ||
          (neighbour.slope?.kind === "outer" &&
            !chainKeys.has(key(neighbour.x, neighbour.z)))
        ) {
          valid = false;
          continue;
        }
        // Preserve existing cliffs/retaining edges and isolated corners; this
        // transition only joins surfaces that already shared this vertex.
        const old =
          corners(neighbour)[cornerAt(neighbour, proposal.x, proposal.z)]!;
        if (old !== proposal.previous || neighbour.y > proposal.height)
          valid = false;
      }
    }
    if (!valid) continue;
    for (const core of chain) {
      result.set(index.keyOf(core), { kind: "diagonal", turns });
      for (const [cx, cz] of CORNERS) {
        const fraction = ((dx > 0 ? cx : 1 - cx) + (dz > 0 ? cz : 1 - cz)) / 2;
        fixedCorners.set(
          vertexKey(core.x + cx, core.z + cz),
          core.y + fraction,
        );
      }
    }
    for (const [k, proposal] of proposals)
      changes.set(k, { ...proposal, diagonal: ((turns + 1) % 2) as 0 | 1 });
  }
  const caps = new Map<
    number,
    { tile: Tile; corners: number[]; diagonal: 0 | 1 }
  >();
  for (const change of changes.values())
    for (const neighbour of incident(change.x, change.z)) {
      if (!neighbour || result.has(index.keyOf(neighbour))) continue;
      const k = index.keyOf(neighbour);
      let cap = caps.get(k);
      if (!cap) {
        cap = {
          tile: neighbour,
          corners: [...corners(neighbour)],
          diagonal: change.diagonal,
        };
        caps.set(k, cap);
      }
      cap.corners[cornerAt(neighbour, change.x, change.z)] = change.height;
    }
  for (const [k, cap] of caps)
    result.set(k, {
      kind: "transition",
      diagonal: cap.diagonal,
      corners: cap.corners.map(
        (height) => height - cap.tile.y,
      ) as unknown as TerrainCornerHeights,
    });
  return result;
}
