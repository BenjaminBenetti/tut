import { DIRECTIONS } from "../../../core/model/direction";
import type { Rng } from "../../../core/model/rng";
import { stepGridPos } from "../../../core/service/grid-math";
import { SurfaceIds } from "../../data/surfaces";
import type { Room } from "../../model/building";
import type { Connector } from "../../model/connector";
import type { DraftTile, MapDraft } from "../../model/map-draft";
import type { TileCoord } from "../../model/tile-coord";
import { unreachableInteriorTiles } from "./building-reachability";

// ===========================================
// Constants
// ===========================================

/** Candidate placements tried before giving up on a level. */
const MAX_ATTEMPTS = 24;

/** A stair tile, its landing one level up and the stairwell hole. */
interface StairCandidate {
  readonly from: DraftTile;
  readonly landing: DraftTile;
  readonly hole: DraftTile;
}

// ===========================================
// Stair placement
// ===========================================

/**
 * Places one flight of stairs from level `fromY` to `toY` inside a
 * building (ADR 0004 §4.3): the stair tile stays on the lower level with
 * surface `stairs`, the cell directly above it becomes the stairwell hole
 * (its tile is removed) and the connector lands on a horizontally
 * adjacent tile of the upper level.
 *
 * ```
 *   toY    [ ][ ][L][H][ ]      L landing, H hole (no tile)
 *   fromY  [ ][ ][ ][S][ ]      S stair tile
 * ```
 *
 * Candidates are rejected when the stair tile or landing has a door, sits
 * on the entrance, or lies in a room narrower than two tiles, and when the
 * hole would cut the upper floor off. Returns the connector, or undefined
 * when no candidate works.
 */
export function placeStairs(
  draft: MapDraft,
  buildingId: string,
  connectors: readonly Connector[],
  fromY: number,
  toY: number,
  rooms: readonly Room[],
  entrance: TileCoord,
  rng: Rng,
): Connector | undefined {
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const candidates = rng.shuffle(
    collectCandidates(draft, buildingId, fromY, toY, roomsById, entrance),
  );
  for (const candidate of candidates.slice(0, MAX_ATTEMPTS)) {
    const connector = tryCandidate(
      draft,
      buildingId,
      connectors,
      candidate,
      toY,
      entrance,
    );
    if (connector !== undefined) {
      return connector;
    }
  }
  return undefined;
}

// ===========================================
// Helpers
// ===========================================

/** Every geometrically valid (stair, landing, hole) triple. */
function collectCandidates(
  draft: MapDraft,
  buildingId: string,
  fromY: number,
  toY: number,
  roomsById: ReadonlyMap<string, Room>,
  entrance: TileCoord,
): StairCandidate[] {
  const candidates: StairCandidate[] = [];
  for (const from of draft.tilesOfBuilding(buildingId)) {
    if (
      from.y !== fromY ||
      !isPlainFloor(draft, from) ||
      isAt(from, entrance)
    ) {
      continue;
    }
    const room =
      from.roomId === undefined ? undefined : roomsById.get(from.roomId);
    if (room !== undefined && (room.rect.w < 2 || room.rect.d < 2)) {
      continue;
    }
    const hole = draft.getTile({ x: from.x, y: toY, z: from.z });
    if (hole?.buildingId !== buildingId || hasDoor(draft, hole)) {
      continue;
    }
    for (const direction of DIRECTIONS) {
      const landing = draft.getTile(
        stepGridPos({ ...from, y: toY }, direction),
      );
      if (
        landing?.buildingId === buildingId &&
        isLandingSurface(landing) &&
        !hasDoor(draft, landing)
      ) {
        candidates.push({ from, landing, hole });
      }
    }
  }
  return candidates;
}

/**
 * Applies the candidate, checks the building stays connected up to `toY`,
 * and reverts if it does not.
 */
function tryCandidate(
  draft: MapDraft,
  buildingId: string,
  connectors: readonly Connector[],
  candidate: StairCandidate,
  toY: number,
  entrance: TileCoord,
): Connector | undefined {
  const { from, landing, hole } = candidate;
  draft.removeTile(hole);
  from.surface = SurfaceIds.STAIRS;
  const connector = draft.addConnector("stairs", from, landing, buildingId);
  const cutOff = unreachableInteriorTiles(
    draft,
    buildingId,
    [...connectors, connector],
    entrance,
    toY,
  );
  if (cutOff.length === 0) {
    return connector;
  }
  draft.connectors.pop();
  from.surface = SurfaceIds.FLOOR;
  draft.addTile(hole);
  return undefined;
}

/** A floor tile that has not already become stairs and carries no door. */
function isPlainFloor(draft: MapDraft, tile: DraftTile): boolean {
  return tile.surface === SurfaceIds.FLOOR && !hasDoor(draft, tile);
}

/** Landings may be floors or walkable roofs. */
function isLandingSurface(tile: DraftTile): boolean {
  return tile.surface === SurfaceIds.FLOOR || tile.surface === SurfaceIds.ROOF;
}

/** True when any edge of the tile holds a door. */
function hasDoor(draft: MapDraft, tile: TileCoord): boolean {
  return DIRECTIONS.some(
    (direction) => draft.wallAt(tile, direction) === "door",
  );
}

/** Coordinate equality. */
function isAt(tile: TileCoord, coord: TileCoord): boolean {
  return tile.x === coord.x && tile.y === coord.y && tile.z === coord.z;
}
