import type { BiomeId } from "../../../content/model/biome-id";
import { DIRECTIONS, type Direction } from "../../../core/model/direction";
import { STOREY_LAYERS } from "../../../core/model/elevation";
import type { Rng } from "../../../core/model/rng";
import { rectContains, stepGridPos } from "../../../core/service/grid-math";
import { SurfaceIds } from "../../data/surfaces";
import type { Building, Room } from "../../model/building";
import type { MapDraft } from "../../model/map-draft";
import type { Rotation } from "../../model/prop";
import type { MapGenRegistries } from "../../model/registries";
import type {
  FurnishingGroup,
  RoomFurnishing,
} from "../../model/room-furnishing";
import type { TileCoord } from "../../model/tile-coord";
import { unreachableInteriorTiles } from "./building-reachability";

// ===========================================
// Placement vocabulary
// ===========================================

/** A position and the accessible side of its authored +Z-facing furniture. */
interface FurniturePosition {
  readonly tile: TileCoord;
  readonly front: Direction;
}

/** Rendering rotates clockwise by negative quarter turns around world Y. */
const FRONT_ROTATION: Readonly<Record<Direction, Rotation>> = {
  s: 0,
  w: 1,
  n: 2,
  e: 3,
};
const INWARD: Readonly<Record<Direction, Direction>> = {
  n: "s",
  e: "w",
  s: "n",
  w: "e",
};

// ===========================================
// Building furnishing
// ===========================================

/**
 * Furnishes buildings from room arrangements, preserving both circulation
 * and furniture access. Each room owns its random stream, so adding a new
 * arrangement to one room cannot reshuffle an unrelated floor.
 */
export function furnishBuildingInteriors(
  draft: MapDraft,
  biome: BiomeId,
  registries: MapGenRegistries,
  blocked: ReadonlySet<number>,
  rng: Rng,
): number {
  let placed = 0;
  for (const building of draft.buildings) {
    const entrance = building.entrances[0];
    if (entrance === undefined) continue;
    const connectors = draft.connectors.filter((connector) =>
      building.connectorIds.includes(connector.id),
    );
    const clearance = buildingClearance(draft, building, blocked);
    const topLevel =
      building.groundLevel + building.floors.length * STOREY_LAYERS;
    /** Rejects a placement that strands any surviving floor or roof tile. */
    const connected = (): boolean =>
      unreachableInteriorTiles(
        draft,
        building.id,
        connectors,
        entrance.tile,
        topLevel,
      ).length === 0;
    for (const floor of building.floors) {
      for (const room of floor.rooms) {
        const furnishing =
          room.kind === undefined
            ? undefined
            : registries.roomFurnishing.find(room.kind);
        if (furnishing === undefined) continue;
        placed += furnishRoom(
          draft,
          room,
          floor.y,
          furnishing,
          biome,
          registries,
          clearance,
          rng.fork(`${building.id}/${floor.index}/${room.id}`),
          connected,
        );
      }
    }
  }
  return placed;
}

/** Door thresholds, the step into each room, and space around stair landings. */
function buildingClearance(
  draft: MapDraft,
  building: Building,
  blocked: ReadonlySet<number>,
): Set<number> {
  const clearance = new Set(blocked);
  for (const tile of draft.tilesOfBuilding(building.id)) {
    for (const direction of DIRECTIONS) {
      if (draft.wallAt(tile, direction) !== "door") continue;
      clearance.add(draft.tileKey(tile));
      const approach = stepGridPos(tile, INWARD[direction]);
      const next = draft.getTile(approach);
      if (next?.roomId === tile.roomId) clearance.add(draft.tileKey(approach));
    }
  }
  for (const connector of draft.connectors) {
    if (!building.connectorIds.includes(connector.id)) continue;
    for (const landing of [connector.from, connector.to]) {
      clearance.add(draft.tileKey(landing));
      for (const direction of DIRECTIONS) {
        if (draft.wallAt(landing, direction) !== undefined) continue;
        const next = stepGridPos(landing, direction);
        if (draft.getTile(next)?.buildingId === building.id)
          clearance.add(draft.tileKey(next));
      }
    }
  }
  return clearance;
}

/** Tries ordered functional groups until the room's area budget is met. */
function furnishRoom(
  draft: MapDraft,
  room: Room,
  y: number,
  furnishing: RoomFurnishing,
  biome: BiomeId,
  registries: MapGenRegistries,
  clearance: Set<number>,
  rng: Rng,
  connected: () => boolean,
): number {
  if (Math.min(room.rect.w, room.rect.d) < (furnishing.minimumRoomWidth ?? 1))
    return 0;
  const quota = Math.min(
    furnishing.maxProps,
    Math.floor((room.rect.w * room.rect.d) / furnishing.tilesPerProp),
  );
  if (quota === 0) return 0;
  const groups = furnishing.arrangements?.length
    ? rng.pick(furnishing.arrangements).groups
    : [{ props: furnishing.props, zone: "wall" as const, count: quota }];
  let placed = 0;
  groups.forEach((group, index) => {
    if (placed >= quota) return;
    const kinds = group.props.filter((kind) => {
      const prop = registries.props.get(kind);
      return (
        prop.placements.includes("interior") &&
        (prop.biomes === undefined || prop.biomes.includes(biome))
      );
    });
    if (kinds.length === 0) return;
    const ownRng = rng.fork(`group-${index}`);
    const kind = ownRng.pick(kinds);
    const accepted: TileCoord[] = [];
    for (const candidate of furniturePositions(draft, room, y, group, ownRng)) {
      if (placed >= quota || accepted.length >= group.count) break;
      if (
        accepted.some(
          (tile) =>
            Math.abs(tile.x - candidate.tile.x) +
              Math.abs(tile.z - candidate.tile.z) <
            (group.spacing ?? 1),
        )
      )
        continue;
      const front = stepGridPos(candidate.tile, candidate.front);
      const rear = group.rearAccess
        ? stepGridPos(candidate.tile, INWARD[candidate.front])
        : undefined;
      if (
        !canPlaceFurniture(draft, room, candidate, front, clearance) ||
        (rear !== undefined &&
          !hasFurnitureAccess(
            draft,
            room,
            candidate.tile,
            INWARD[candidate.front],
          ))
      )
        continue;
      const prop = draft.addProp(
        kind,
        candidate.tile,
        FRONT_ROTATION[candidate.front],
      );
      if (!connected()) {
        draft.removeProp(prop.id);
        continue;
      }
      // Later groups may share this walking space, but cannot fill it.
      clearance.add(draft.tileKey(front));
      if (rear !== undefined) clearance.add(draft.tileKey(rear));
      accepted.push(candidate.tile);
      placed++;
    }
  });
  return placed;
}

/** A customer or staff position is a free floor cell inside the same room. */
function hasFurnitureAccess(
  draft: MapDraft,
  room: Room,
  tile: TileCoord,
  direction: Direction,
): boolean {
  const adjacent = stepGridPos(tile, direction);
  const floor = draft.getTile(adjacent);
  return (
    floor?.surface === SurfaceIds.FLOOR &&
    floor.roomId === room.id &&
    draft.propAt(adjacent) === undefined &&
    draft.wallAt(tile, direction) === undefined
  );
}

/** Furniture occupies a floor tile and faces a walkable tile in its own room. */
function canPlaceFurniture(
  draft: MapDraft,
  room: Room,
  candidate: FurniturePosition,
  front: TileCoord,
  clearance: ReadonlySet<number>,
): boolean {
  const tile = draft.getTile(candidate.tile);
  const approach = draft.getTile(front);
  return (
    tile?.surface === SurfaceIds.FLOOR &&
    tile.roomId === room.id &&
    approach?.surface === SurfaceIds.FLOOR &&
    approach.roomId === room.id &&
    rectContains(room.rect, front.x, front.z) &&
    !clearance.has(draft.tileKey(tile)) &&
    draft.propAt(tile) === undefined &&
    draft.propAt(front) === undefined &&
    draft.wallAt(tile, candidate.front) === undefined
  );
}

// ===========================================
// Geometric arrangements
// ===========================================

/** Candidate order encodes aligned furniture groups, never random floor scatter. */
function furniturePositions(
  draft: MapDraft,
  room: Room,
  y: number,
  group: FurnishingGroup,
  rng: Rng,
): FurniturePosition[] {
  return [
    group.zone,
    ...(group.fallbackZone === undefined ? [] : [group.fallbackZone]),
  ].flatMap((zone) => {
    switch (zone) {
      case "wall":
      case "corner":
        return wallPositions(draft, room, y, zone === "corner", rng);
      case "center":
        return centerPositions(room, y, rng);
      case "aisle":
        return aislePositions(room, y, rng);
      case "counter":
        return counterPositions(draft, room, y, rng);
    }
  });
}

/** Serving counters face the nearest doorway, leaving a staff space behind. */
function counterPositions(
  draft: MapDraft,
  room: Room,
  y: number,
  rng: Rng,
): FurniturePosition[] {
  const doors: TileCoord[] = [];
  const { x, z, w, d } = room.rect;
  for (let dz = 0; dz < d; dz++)
    for (let dx = 0; dx < w; dx++) {
      const tile = { x: x + dx, y, z: z + dz };
      if (DIRECTIONS.some((side) => draft.wallAt(tile, side) === "door"))
        doors.push(tile);
    }
  const candidates = centerPositions(room, y, rng).flatMap(({ tile }) => {
    const door = [...doors].sort(
      (a, b) =>
        Math.abs(a.x - tile.x) +
        Math.abs(a.z - tile.z) -
        Math.abs(b.x - tile.x) -
        Math.abs(b.z - tile.z),
    )[0];
    if (door === undefined) return [];
    const front: Direction =
      Math.abs(door.x - tile.x) > Math.abs(door.z - tile.z)
        ? door.x < tile.x
          ? "w"
          : "e"
        : door.z < tile.z
          ? "n"
          : "s";
    return [
      {
        tile,
        front,
        distance: Math.abs(door.x - tile.x) + Math.abs(door.z - tile.z),
      },
    ];
  });
  return candidates.sort((a, b) => a.distance - b.distance);
}

/** Wall runs face the room; corners need two enclosing edges. */
function wallPositions(
  draft: MapDraft,
  room: Room,
  y: number,
  cornersOnly: boolean,
  rng: Rng,
): FurniturePosition[] {
  const { x, z, w, d } = room.rect;
  const positions: FurniturePosition[] = [];
  for (const side of rng.shuffle(DIRECTIONS)) {
    const horizontal = side === "n" || side === "s";
    const length = horizontal ? w : d;
    const reverse = rng.chance(0.5);
    for (let i = 0; i < length; i++) {
      const offset = reverse ? length - i - 1 : i;
      const tile = {
        x: horizontal ? x + offset : side === "w" ? x : x + w - 1,
        y,
        z: horizontal ? (side === "n" ? z : z + d - 1) : z + offset,
      };
      const wall = draft.wallAt(tile, side);
      if (wall === undefined || wall === "door") continue;
      if (
        cornersOnly &&
        DIRECTIONS.filter((direction) => {
          const edge = draft.wallAt(tile, direction);
          return edge !== undefined && edge !== "door";
        }).length < 2
      )
        continue;
      positions.push({ tile, front: INWARD[side] });
    }
  }
  return positions;
}

/** Tables sit near the room centre with a perimeter route around them. */
function centerPositions(room: Room, y: number, rng: Rng): FurniturePosition[] {
  const { x, z, w, d } = room.rect;
  const front = rng.pick(DIRECTIONS);
  const positions: FurniturePosition[] = [];
  for (let dz = 1; dz < d - 1; dz++) {
    for (let dx = 1; dx < w - 1; dx++) {
      positions.push({ tile: { x: x + dx, y, z: z + dz }, front });
    }
  }
  const centerX = x + (w - 1) / 2;
  const centerZ = z + (d - 1) / 2;
  return rng
    .shuffle(positions)
    .sort(
      (a, b) =>
        Math.abs(a.tile.x - centerX) +
        Math.abs(a.tile.z - centerZ) -
        Math.abs(b.tile.x - centerX) -
        Math.abs(b.tile.z - centerZ),
    );
}

/**
 * Parallel shelf or workstation runs leave open edges and two-tile gaps
 * between rows. The clear end caps let squads change aisles freely.
 *
 *   . . . . . . .
 *   . S S S S S .
 *   . . . . . . .
 *   . . . . . . .
 *   . S S S S S .
 *   . . . . . . .
 */
function aislePositions(room: Room, y: number, rng: Rng): FurniturePosition[] {
  const { x, z, w, d } = room.rect;
  const alongX = w >= d;
  const length = alongX ? w : d;
  const depth = alongX ? d : w;
  const reverse = rng.chance(0.5);
  const front: Direction = alongX ? (reverse ? "n" : "s") : reverse ? "w" : "e";
  const positions: FurniturePosition[] = [];
  for (let across = 1; across < depth - 1; across += 3) {
    const cross = reverse ? depth - across - 1 : across;
    for (let along = 1; along < length - 1; along++) {
      positions.push({
        tile: {
          x: x + (alongX ? along : cross),
          y,
          z: z + (alongX ? cross : along),
        },
        front,
      });
    }
  }
  return positions;
}
