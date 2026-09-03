import { DIRECTIONS } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import type { Rng } from "../../core/model/rng";
import { rectContains, stepGridPos } from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import type { Building, Floor, Room } from "../model/building";
import type { BuildingTemplate } from "../model/building-template";
import type { Connector } from "../model/connector";
import type { DiagnosticSink } from "../model/diagnostics";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { TileCoord } from "../model/tile-coord";
import { partitionFloor } from "./interior/room-partitioner";
import { placeStairs } from "./interior/stair-placer";

// ===========================================
// Constants
// ===========================================

/** Exterior ladders only reach roofs this many storeys up. */
const MAX_LADDER_FLOORS = 2;

// ===========================================
// InteriorPass
// ===========================================

/**
 * Pass 5, part 2 (ADR 0004 §4.3, §4.5): rooms, stairs, roofs and ladders
 * for every shell the building pass raised. Each floor is bisected into
 * rooms with doors in the cuts; walkable roofs get `roof` tiles; one
 * flight of stairs joins every consecutive pair of levels (roof
 * included), verified to keep the building connected; walkable roofs up
 * to two storeys up also get an exterior ladder where a free ground
 * column touches the wall.
 *
 * ```
 *   roof   [#][#][L][ ][#]      L landing of the top flight
 *   floor1 [_][_][_][S][_]      S stairs up, hole above
 *   floor0 [_][d][_][_][S]      d interior door, entrance on the front
 * ```
 */
export class InteriorPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "interiors";
  readonly requires: readonly DraftCapability[] = ["buildings"];
  readonly provides: readonly DraftCapability[] = ["interiors"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Furnishes every building in place. */
  run(context: GenerationContext): void {
    const { draft, rng, registries, diagnostics } = context;
    let stairs = 0;
    let ladders = 0;
    draft.buildings.forEach((building, index) => {
      const template = registries.buildingTemplates.get(building.kind);
      const furnished = furnish(
        draft,
        building,
        template,
        rng.fork(building.id),
        diagnostics,
      );
      draft.buildings[index] = furnished;
      stairs += furnished.connectorIds.length;
      ladders += draft.connectors.filter(
        (c) => c.kind === "ladder" && c.buildingId === building.id,
      ).length;
    });
    diagnostics.note(
      `${draft.buildings.length} buildings furnished, ${stairs} building connectors (${ladders} ladders)`,
    );
  }
}

// ===========================================
// Furnishing
// ===========================================

/** Rooms, roof, stairs and ladder for one building; returns the new record. */
function furnish(
  draft: MapDraft,
  building: Building,
  template: BuildingTemplate,
  rng: Rng,
  diagnostics: DiagnosticSink,
): Building {
  const footprint = building.footprint[0];
  const entrance = building.entrances[0];
  if (footprint === undefined || entrance === undefined) {
    return building;
  }
  const floors = building.floors.map((floor) =>
    withRooms(draft, building, template, floor, footprint, entrance.tile, rng),
  );
  const roofY = building.groundLevel + building.floors.length;
  if (building.roof.walkable) {
    addRoof(draft, building.id, footprint, roofY);
  }

  const levels = floors.map((floor) => floor.y);
  if (building.roof.walkable) {
    levels.push(roofY);
  }
  const connectors: Connector[] = [];
  for (let i = 0; i + 1 < levels.length; i++) {
    const fromY = levels[i];
    const toY = levels[i + 1];
    if (fromY === undefined || toY === undefined) {
      break;
    }
    const rooms = floors[i]?.rooms ?? [];
    const flight = placeStairs(
      draft,
      building.id,
      connectors,
      fromY,
      toY,
      rooms,
      entrance.tile,
      rng.fork(`stairs-${i}`),
    );
    if (flight === undefined) {
      diagnostics.note(`no stairs fit in ${building.id} from level ${fromY}`, {
        x: footprint.x,
        y: fromY,
        z: footprint.z,
      });
      break;
    }
    connectors.push(flight);
  }
  if (building.roof.walkable && building.floors.length <= MAX_LADDER_FLOORS) {
    const ladder = addLadder(
      draft,
      building.id,
      footprint,
      roofY,
      rng.fork("ladder"),
    );
    if (ladder !== undefined) {
      connectors.push(ladder);
    }
  }
  return { ...building, floors, connectorIds: connectors.map((c) => c.id) };
}

/** Partitions one floor and labels its rooms. */
function withRooms(
  draft: MapDraft,
  building: Building,
  template: BuildingTemplate,
  floor: Floor,
  footprint: Rect,
  entrance: TileCoord,
  rng: Rng,
): Floor {
  const rooms = partitionFloor(
    draft,
    building.id,
    floor.index,
    floor.y,
    footprint,
    template.minRoomSize,
    rng.fork(`rooms-${floor.index}`),
  ).map((room): Room => ({
    ...room,
    kind: roomKind(room, floor, entrance, template),
  }));
  return { ...floor, rooms };
}

/**
 * Warehouses are storage throughout; elsewhere the entrance room is the
 * hall, a shop's other ground-floor rooms are storage, the rest are rooms.
 */
function roomKind(
  room: Room,
  floor: Floor,
  entrance: TileCoord,
  template: BuildingTemplate,
): string {
  if (template.id === "warehouse") {
    return "storage";
  }
  const groundFloor = floor.y === entrance.y;
  if (groundFloor && rectContains(room.rect, entrance.x, entrance.z)) {
    return "hall";
  }
  return groundFloor && template.id === "shop" ? "storage" : "room";
}

/** Adds walkable roof tiles over the whole footprint. */
function addRoof(
  draft: MapDraft,
  buildingId: string,
  footprint: Rect,
  roofY: number,
): void {
  for (let z = footprint.z; z < footprint.z + footprint.d; z++) {
    for (let x = footprint.x; x < footprint.x + footprint.w; x++) {
      draft.addTile({ x, y: roofY, z, surface: SurfaceIds.ROOF, buildingId });
    }
  }
}

/**
 * Adds an exterior ladder from a free ground column beside the building
 * up to a roof tile across the wall (never the stairwell hole), when such
 * a column exists.
 */
function addLadder(
  draft: MapDraft,
  buildingId: string,
  footprint: Rect,
  roofY: number,
  rng: Rng,
): Connector | undefined {
  const options: { ground: TileCoord; roof: TileCoord }[] = [];
  for (let z = footprint.z; z < footprint.z + footprint.d; z++) {
    for (let x = footprint.x; x < footprint.x + footprint.w; x++) {
      for (const direction of DIRECTIONS) {
        const outside = stepGridPos({ x, y: roofY, z }, direction);
        if (
          draft.getTile({ x, y: roofY, z }) === undefined ||
          rectContains(footprint, outside.x, outside.z) ||
          !draft.inBounds(outside.x, outside.z) ||
          draft.isCovered(outside.x, outside.z) ||
          draft.groundSurfaceAt(outside.x, outside.z) === SurfaceIds.WATER ||
          draft.groundLevelAt(outside.x, outside.z) >= roofY
        ) {
          continue;
        }
        options.push({
          ground: draft.groundCoord(outside.x, outside.z),
          roof: { x, y: roofY, z },
        });
      }
    }
  }
  if (options.length === 0) {
    return undefined;
  }
  const choice = rng.pick(options);
  return draft.addConnector("ladder", choice.ground, choice.roof, buildingId);
}
