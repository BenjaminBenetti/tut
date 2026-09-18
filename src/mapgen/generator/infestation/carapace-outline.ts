import { DIRECTIONS, type Direction } from "../../../core/model/direction";
import type { Rng } from "../../../core/model/rng";
import { stepGridPos } from "../../../core/service/grid-math";
import { CARAPACE_SITE_TUNING } from "../../data/carapace-site-tuning";
import { PropKindIds } from "../../data/props";
import type {
  CarapaceOutline,
  CarapaceWallCell,
} from "../../model/infestation-plan";
import type { Rotation } from "../../model/prop";
import type { ColumnCoord } from "../../model/road";
import type { TileCoord } from "../../model/tile-coord";

/** Traces a stepped perimeter, opens two broad gateways and grows an incomplete chamber divider. */
export function createCarapaceOutline(
  width: number,
  depth: number,
  rng: Rng,
): CarapaceOutline {
  const northeast = { x: rng.nextInt(1, 2), z: rng.nextInt(1, 2) };
  const southwest = { x: rng.nextInt(1, 2), z: rng.nextInt(1, 2) };
  const corners = [
    { x: 0, z: 0 },
    { x: width - 1 - northeast.x, z: 0 },
    { x: width - 1 - northeast.x, z: northeast.z },
    { x: width - 1, z: northeast.z },
    { x: width - 1, z: depth - 1 },
    { x: southwest.x, z: depth - 1 },
    { x: southwest.x, z: depth - 1 - southwest.z },
    { x: 0, z: depth - 1 - southwest.z },
  ];
  const walls = new Map<string, ColumnCoord>();
  for (let index = 0; index < corners.length; index++) {
    const from = corners[index]!;
    const to = corners[(index + 1) % corners.length]!;
    const distance = Math.abs(from.x - to.x) + Math.abs(from.z - to.z);
    for (let step = 0; step <= distance; step++) {
      const at = {
        x: from.x + Math.sign(to.x - from.x) * step,
        z: from.z + Math.sign(to.z - from.z) * step,
      };
      walls.set(columnKey(at), at);
    }
  }
  const outside = new Set<string>();
  const pending: ColumnCoord[] = [];
  for (let z = -1; z <= depth; z++)
    for (let x = -1; x <= width; x++)
      if (x === -1 || z === -1 || x === width || z === depth) {
        const at = { x, z };
        outside.add(columnKey(at));
        pending.push(at);
      }
  for (const at of pending)
    for (const direction of DIRECTIONS) {
      const next = stepColumn(at, direction);
      const key = columnKey(next);
      if (
        next.x < 0 ||
        next.z < 0 ||
        next.x >= width ||
        next.z >= depth ||
        outside.has(key) ||
        walls.has(key)
      )
        continue;
      outside.add(key);
      pending.push(next);
    }
  const inner: ColumnCoord[] = [];
  for (let z = 0; z < depth; z++)
    for (let x = 0; x < width; x++) {
      const at = { x, z };
      if (!outside.has(columnKey(at)) && !walls.has(columnKey(at)))
        inner.push(at);
    }
  const gateways: { outward: Direction; tiles: readonly ColumnCoord[] }[] = [
    {
      outward: "n",
      tiles: [
        { x: 2, z: 0 },
        { x: 3, z: 0 },
      ],
    },
    {
      outward: "s",
      tiles: [
        { x: width - 4, z: depth - 1 },
        { x: width - 3, z: depth - 1 },
      ],
    },
  ];
  for (const gate of gateways)
    for (const tile of gate.tiles) walls.delete(columnKey(tile));
  const dividerZ = Math.floor((depth - 2) / 2);
  const length = rng.nextInt(2, Math.min(3, width - 6));
  for (let x = 1; x <= length; x++) {
    const at = { x, z: dividerZ };
    walls.set(columnKey(at), at);
  }
  const rotation = rng.nextInt(0, 3) as Rotation;
  const transform = (tile: ColumnCoord): ColumnCoord =>
    rotateColumn(tile, width, depth, rotation);
  return {
    width: rotation % 2 === 0 ? width : depth,
    depth: rotation % 2 === 0 ? depth : width,
    walls: [...walls.values()].map(transform),
    courtyard: inner
      .filter((tile) => !walls.has(columnKey(tile)))
      .map(transform),
    gateways: gateways.map((gate) => ({
      tiles: gate.tiles.map(transform),
      outward: turnDirection(gate.outward, rotation),
      approach: gate.tiles.flatMap((tile) => {
        const outside = stepColumn(tile, gate.outward);
        const dx = outside.x - tile.x;
        const dz = outside.z - tile.z;
        return [-2, -1, 0, 1, 2].map((step) =>
          transform({ x: tile.x + dx * step, z: tile.z + dz * step }),
        );
      }),
    })),
  };
}

/** Derives each piece and yaw from its actual cardinal neighbours, including clipped ends. */
export function joinCarapaceCells(
  tiles: readonly TileCoord[],
  rng: Rng,
): readonly CarapaceWallCell[] {
  const keys = new Set(tiles.map(columnKey));
  return tiles.map((tile) => {
    const joins = DIRECTIONS.filter((direction) =>
      keys.has(columnKey(stepGridPos(tile, direction))),
    );
    let kind: string;
    let ports: readonly Direction[];
    if (joins.length >= 3) {
      kind = PropKindIds.INFESTED_CARAPACE_WALL_FORK;
      ports = ["w", "e", "n"];
    } else if (joins.length === 1) {
      kind = PropKindIds.INFESTED_CARAPACE_WALL_END;
      ports = ["w"];
    } else if (
      joins.length === 2 &&
      (DIRECTIONS.indexOf(joins[0]!) + 2) % 4 !== DIRECTIONS.indexOf(joins[1]!)
    ) {
      kind = PropKindIds.INFESTED_CARAPACE_WALL_CURVE;
      ports = ["n", "e"];
    } else {
      const choice = rng.fork(columnKey(tile)).nextInt(0, 99);
      const threshold = CARAPACE_SITE_TUNING.straightStyleThresholds;
      kind =
        choice < threshold.spine
          ? PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS
          : choice < threshold.broken
            ? PropKindIds.INFESTED_CARAPACE_WALL_BROKEN
            : choice < threshold.overlap
              ? PropKindIds.INFESTED_CARAPACE_WALL_OVERLAP
              : choice < threshold.ribbed
                ? PropKindIds.INFESTED_CARAPACE_WALL_RIBBED
                : PropKindIds.INFESTED_CARAPACE_WALL_RIDGE;
      ports = ["w", "e"];
    }
    const rotation =
      ([0, 1, 2, 3] as const).find((turns) =>
        ports.every((port) => joins.includes(turnDirection(port, turns))),
      ) ?? 0;
    return { tile, kind, rotation, joins };
  });
}

/** Clockwise quarter turns match the map's negative-Y renderer yaw. */
export function turnDirection(
  direction: Direction,
  turns: Rotation,
): Direction {
  return DIRECTIONS[
    (DIRECTIONS.indexOf(direction) + turns) % DIRECTIONS.length
  ]!;
}

/** A column key shared by topology, clipping and the courtyard flood fill. */
export function columnKey(tile: ColumnCoord): string {
  return `${tile.x}:${tile.z}`;
}

/** Rotates a local contour while retaining a nonnegative bounding rectangle. */
function rotateColumn(
  tile: ColumnCoord,
  width: number,
  depth: number,
  rotation: Rotation,
): ColumnCoord {
  if (rotation === 1) return { x: depth - 1 - tile.z, z: tile.x };
  if (rotation === 2) return { x: width - 1 - tile.x, z: depth - 1 - tile.z };
  if (rotation === 3) return { x: tile.z, z: width - 1 - tile.x };
  return tile;
}

/** Cardinal neighbour of a two-dimensional outline cell. */
export function stepColumn(
  tile: ColumnCoord,
  direction: Direction,
): ColumnCoord {
  const next = stepGridPos({ ...tile, y: 0 }, direction);
  return { x: next.x, z: next.z };
}
