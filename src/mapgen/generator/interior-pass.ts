import { STOREY_LAYERS } from "../../core/model/elevation";
import { DIRECTIONS } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import type { Rng } from "../../core/model/rng";
import { rectContains, stepGridPos } from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import type { Building, Floor } from "../model/building";
import type { BuildingTemplate } from "../model/building-template";
import type { BuildingInteriorVariant } from "../model/building-room-program";
import { CONNECTOR_RULES, type Connector } from "../model/connector";
import type { DiagnosticSink } from "../model/diagnostics";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { TileCoord } from "../model/tile-coord";
import {
  type FloorPlan,
  partitionFloor,
  planFloor,
} from "./interior/room-partitioner";
import { placeStairs } from "./interior/stair-placer";
import { assignRoomPurposes } from "./interior/room-programmer";
import { selectInteriorVariant } from "./interior/interior-variant-selector";

// ===========================================
// Constants
// ===========================================

/** Exterior ladders only reach roofs this many storeys up. */
const MAX_LADDER_FLOORS = 2;

/** Most levels a ladder climbs from the ground column outside the wall. */
const MAX_LADDER_CLIMB = 2 * STOREY_LAYERS;

// ===========================================
// InteriorPass
// ===========================================

/**
 * Pass 5, part 2 (ADR 0004 §4.3, §4.5): rooms, stairs, roofs and ladders
 * for every shell the building pass raised. Entrance-oriented plans give
 * each building public, private and service spaces; generic templates use
 * recursive partitioning. Walkable roofs get `roof` tiles; one
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
    const variantUse = new Map<string, number>();
    draft.buildings.forEach((building, index) => {
      const template = registries.buildingTemplates.get(building.kind);
      const variant = selectInteriorVariant(
        template.interior.roomProgramVariants ?? [],
        variantUse,
        rng.fork(`${building.id}-identity`),
      );
      const furnished = furnish(
        draft,
        building,
        template,
        rng.fork(building.id),
        diagnostics,
        variant,
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
  variant?: BuildingInteriorVariant,
): Building {
  const footprint = building.footprint[0];
  const entrance = building.entrances[0];
  if (footprint === undefined || entrance === undefined) {
    return building;
  }
  // One plan per building: every floor shares the corridor, so the
  // stairs from one floor land in the corridor of the next (#829).
  const plan = planFloor(
    footprint,
    template.interior,
    rng.fork("plan"),
    entrance,
  );
  const floors = building.floors.map((floor) =>
    withRooms(
      draft,
      building,
      template,
      floor,
      footprint,
      plan,
      entrance.tile,
      rng,
      variant,
    ),
  );
  const roofY = building.groundLevel + building.floors.length * STOREY_LAYERS;
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
    const upperRooms = floors[i + 1]?.rooms ?? [];
    const flight = placeStairs(
      draft,
      building.id,
      connectors,
      fromY,
      toY,
      rooms,
      upperRooms,
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
  return {
    ...building,
    ...(variant === undefined ? {} : { interiorStyle: variant.id }),
    floors,
    connectorIds: connectors.map((c) => c.id),
  };
}

/** Partitions one floor and labels its rooms. */
function withRooms(
  draft: MapDraft,
  building: Building,
  template: BuildingTemplate,
  floor: Floor,
  footprint: Rect,
  plan: FloorPlan,
  entrance: TileCoord,
  rng: Rng,
  variant?: BuildingInteriorVariant,
): Floor {
  const rooms = partitionFloor(
    draft,
    building.id,
    floor.index,
    floor.y,
    footprint,
    plan,
    rng.fork(`rooms-${floor.index}`),
  );
  const groundFloor = floor.index === 0;
  return {
    ...floor,
    rooms: assignRoomPurposes(
      rooms,
      (variant ?? template.interior.roomPrograms)?.[
        groundFloor ? "ground" : "upper"
      ],
      entrance,
      groundFloor,
      rng.fork(`purposes-${floor.index}`),
    ),
  };
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
 * a column exists no more than `MAX_LADDER_CLIMB` levels below the roof;
 * a building on a ledge keeps its roof reachable through its stairs.
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
          // A ladder rises at least its rule's minimum (two layers): natural
          // ground can now sit one layer under a roof (#808), and a rung
          // that short breaks I4.
          roofY - draft.groundLevelAt(outside.x, outside.z) <
            CONNECTOR_RULES.ladder.minRise ||
          roofY - draft.groundLevelAt(outside.x, outside.z) > MAX_LADDER_CLIMB
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
