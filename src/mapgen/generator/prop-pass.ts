import type { BiomeId } from "../../content/model/biome-id";
import { DIRECTIONS } from "../../core/model/direction";
import type { Rng } from "../../core/model/rng";
import { stepGridPos } from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import { CoverLevel } from "../model/cover";
import type {
  BiomeDefinition,
  VegetationEntry,
} from "../model/biome-definition";
import type { Building } from "../model/building";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { DraftTile, MapDraft } from "../model/map-draft";
import type { PropDefinition, Rotation } from "../model/prop";
import type { MapGenRegistries } from "../model/registries";
import type { ResolvedMapGenParams } from "../model/resolved-params";
import type { ColumnCoord } from "../model/road";
import type { TileCoord } from "../model/tile-coord";
import { isOpenGround, isRoadAt } from "../service/draft-queries";
import { unreachableInteriorTiles } from "./interior/building-reachability";
import type { Axis } from "./road/road-builder";

// ===========================================
// Constants
// ===========================================

/** Most props one storage room receives. */
const MAX_PROPS_PER_ROOM = 3;

/** Storage room tiles per interior prop. */
const TILES_PER_INTERIOR_PROP = 5;

/** Placement counts for the diagnostic note. */
interface PlacementCounts {
  vegetation: number;
  street: number;
  yard: number;
  interior: number;
}

// ===========================================
// PropPass
// ===========================================

/**
 * Pass 6 of the settlement archetype (ADR 0004 §4.4, §7.3). Scatters the
 * biome's vegetation on open ground, puts street props on straight road
 * columns that can be walked around, drops low-cover clutter in yards
 * beside buildings and sidewalks, and stacks crates and shelving in
 * storage rooms without cutting a building off. Never occupies an
 * entrance's threshold, a connector endpoint or a tile with a door.
 *
 * ```
 *   open ground   chance(total density) ─► weighted vegetation pick
 *   road columns  streetPropDensity per 100 ─► straight, bypassable only
 *   storage rooms area / 5, at most 3 ─► verified with a building BFS
 * ```
 */
export class PropPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "props";
  readonly requires: readonly DraftCapability[] = ["interiors"];
  readonly provides: readonly DraftCapability[] = ["props"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Places vegetation, street clutter and interior cover. */
  run(context: GenerationContext): void {
    const { draft, params, rng, registries, diagnostics } = context;
    const blocked = collectBlockedTiles(draft);
    const counts: PlacementCounts = {
      vegetation: 0,
      street: 0,
      yard: 0,
      interior: 0,
    };
    counts.vegetation = placeVegetation(
      draft,
      params.biome,
      registries,
      blocked,
      rng.fork("vegetation"),
    );
    counts.street = placeStreetProps(
      draft,
      params,
      registries,
      blocked,
      rng.fork("street"),
    );
    counts.yard = placeYardClutter(
      draft,
      params,
      registries,
      blocked,
      rng.fork("yard"),
    );
    counts.interior = placeInteriorProps(
      draft,
      params.biome,
      registries,
      blocked,
      rng.fork("interior"),
    );
    diagnostics.note(
      `${counts.vegetation} vegetation, ${counts.street} street, ` +
        `${counts.yard} yard, ${counts.interior} interior props`,
    );
  }
}

// ===========================================
// Blocked tiles
// ===========================================

/**
 * Tiles props must never take: every entrance and the ground tile
 * outside it, and both ends of every connector.
 */
function collectBlockedTiles(draft: MapDraft): ReadonlySet<number> {
  const blocked = new Set<number>();
  for (const building of draft.buildings) {
    for (const entrance of building.entrances) {
      blocked.add(draft.tileKey(entrance.tile));
      const outside = stepGridPos(entrance.tile, entrance.side);
      if (draft.inBounds(outside.x, outside.z)) {
        blocked.add(draft.tileKey(draft.groundCoord(outside.x, outside.z)));
      }
    }
  }
  for (const connector of draft.connectors) {
    blocked.add(draft.tileKey(connector.from));
    blocked.add(draft.tileKey(connector.to));
  }
  return blocked;
}

// ===========================================
// Vegetation
// ===========================================

/** Scatters the biome's ground props; returns how many were placed. */
function placeVegetation(
  draft: MapDraft,
  biome: BiomeDefinition,
  registries: MapGenRegistries,
  blocked: ReadonlySet<number>,
  rng: Rng,
): number {
  const entries = biome.vegetation.filter((entry) =>
    allowedIn(registries.props.get(entry.prop), biome.id, "ground"),
  );
  const total = entries.reduce((sum, entry) => sum + entry.density, 0) / 100;
  if (entries.length === 0 || total <= 0) {
    return 0;
  }
  let placed = 0;
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (!isOpenGround(draft, x, z)) {
        continue;
      }
      const coord = draft.groundCoord(x, z);
      if (blocked.has(draft.tileKey(coord)) || !rng.chance(total)) {
        continue;
      }
      const entry: VegetationEntry = rng.pickWeighted(
        entries,
        (e) => e.density,
      );
      draft.addProp(entry.prop, coord, randomRotation(rng));
      placed++;
    }
  }
  return placed;
}

// ===========================================
// Street props
// ===========================================

/**
 * Places street clutter on straight road columns that keep a same-level
 * open neighbour to walk around; returns how many were placed.
 */
function placeStreetProps(
  draft: MapDraft,
  params: ResolvedMapGenParams,
  registries: MapGenRegistries,
  blocked: ReadonlySet<number>,
  rng: Rng,
): number {
  const kinds = registries.props.values.filter((prop) =>
    allowedIn(prop, params.biome.id, "road"),
  );
  const columns = roadColumns(draft);
  const target = Math.round(
    (params.settlement.streetPropDensity / 100) * columns.length,
  );
  if (kinds.length === 0 || target === 0) {
    return 0;
  }
  let placed = 0;
  for (const column of rng.shuffle(columns)) {
    if (placed >= target) {
      break;
    }
    const coord = draft.groundCoord(column.x, column.z);
    const axis = roadAxis(draft, column);
    if (
      axis === undefined ||
      blocked.has(draft.tileKey(coord)) ||
      draft.propAt(coord) !== undefined ||
      !isStraightRoad(draft, column, axis) ||
      !hasWayAround(draft, column, axis) ||
      hasAdjacentProp(draft, coord)
    ) {
      continue;
    }
    draft.addProp(rng.pick(kinds).id, coord, axis === "x" ? 0 : 1);
    placed++;
  }
  return placed;
}

/**
 * The one axis along which the column has road on both sides, if any.
 * A crossing (road both ways) and a road end have none.
 */
function roadAxis(draft: MapDraft, column: ColumnCoord): Axis | undefined {
  const { x, z } = column;
  const alongX = isRoadAt(draft, x + 1, z) && isRoadAt(draft, x - 1, z);
  const alongZ = isRoadAt(draft, x, z + 1) && isRoadAt(draft, x, z - 1);
  if (alongX === alongZ) {
    return undefined;
  }
  return alongX ? "x" : "z";
}

/** The two columns beside the column, perpendicular to the axis. */
function acrossNeighbours(column: ColumnCoord, axis: Axis): ColumnCoord[] {
  const { x, z } = column;
  return axis === "x"
    ? [
        { x, z: z - 1 },
        { x, z: z + 1 },
      ]
    : [
        { x: x - 1, z },
        { x: x + 1, z },
      ];
}

/**
 * Road columns on a straight stretch: any road beside the column is a
 * parallel lane of the same stretch, never a crossing or a branching
 * street. Holds for one-lane trails and multi-lane city streets alike.
 */
function isStraightRoad(
  draft: MapDraft,
  column: ColumnCoord,
  axis: Axis,
): boolean {
  return acrossNeighbours(column, axis).every(
    (next) =>
      !isRoadAt(draft, next.x, next.z) || roadAxis(draft, next) === axis,
  );
}

/**
 * A prop-free column beside the road at the road's level (sidewalk, open
 * ground or the other lane) so units can step around the clutter.
 */
function hasWayAround(
  draft: MapDraft,
  column: ColumnCoord,
  axis: Axis,
): boolean {
  const level = draft.groundLevelAt(column.x, column.z);
  return acrossNeighbours(column, axis).some(
    (next) =>
      draft.inBounds(next.x, next.z) &&
      !draft.isCovered(next.x, next.z) &&
      draft.groundSurfaceAt(next.x, next.z) !== SurfaceIds.WATER &&
      draft.groundLevelAt(next.x, next.z) === level &&
      draft.propAt(draft.groundCoord(next.x, next.z)) === undefined,
  );
}

// ===========================================
// Yard clutter
// ===========================================

/**
 * Drops low-cover props on open columns that touch a building or a
 * sidewalk, at the settlement's yard density; returns how many were
 * placed. This is where infantry finds cover between the road and the
 * walls.
 */
function placeYardClutter(
  draft: MapDraft,
  params: ResolvedMapGenParams,
  registries: MapGenRegistries,
  blocked: ReadonlySet<number>,
  rng: Rng,
): number {
  const kinds = registries.props.values.filter(
    (prop) =>
      allowedIn(prop, params.biome.id, "ground") &&
      prop.cover === CoverLevel.LOW,
  );
  const yards: ColumnCoord[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (isOpenGround(draft, x, z) && touchesBuildingOrSidewalk(draft, x, z)) {
        yards.push({ x, z });
      }
    }
  }
  const target = Math.round(
    (params.settlement.yardPropDensity / 100) * yards.length,
  );
  if (kinds.length === 0 || target === 0) {
    return 0;
  }
  let placed = 0;
  for (const column of rng.shuffle(yards)) {
    if (placed >= target) {
      break;
    }
    const coord = draft.groundCoord(column.x, column.z);
    if (
      blocked.has(draft.tileKey(coord)) ||
      draft.propAt(coord) !== undefined
    ) {
      continue;
    }
    draft.addProp(rng.pick(kinds).id, coord, randomRotation(rng));
    placed++;
  }
  return placed;
}

/** True when a 4-neighbour is a building footprint or a sidewalk. */
function touchesBuildingOrSidewalk(
  draft: MapDraft,
  x: number,
  z: number,
): boolean {
  return DIRECTIONS.some((direction) => {
    const next = stepGridPos({ x, y: 0, z }, direction);
    return (
      draft.inBounds(next.x, next.z) &&
      (draft.isCovered(next.x, next.z) ||
        draft.groundSurfaceAt(next.x, next.z) === SurfaceIds.SIDEWALK)
    );
  });
}

// ===========================================
// Interior props
// ===========================================

/**
 * Fills storage rooms with crates and shelving, reverting any prop that
 * would cut part of the building off; returns how many stayed.
 */
function placeInteriorProps(
  draft: MapDraft,
  biome: BiomeDefinition,
  registries: MapGenRegistries,
  blocked: ReadonlySet<number>,
  rng: Rng,
): number {
  const kinds = registries.props.values.filter((prop) =>
    allowedIn(prop, biome.id, "interior"),
  );
  if (kinds.length === 0) {
    return 0;
  }
  let placed = 0;
  for (const building of draft.buildings) {
    const entrance = building.entrances[0];
    if (entrance === undefined) {
      continue;
    }
    const own = draft.connectors.filter((c) =>
      building.connectorIds.includes(c.id),
    );
    const topLevel = building.groundLevel + building.floors.length;
    for (const floor of building.floors) {
      for (const room of floor.rooms) {
        if (room.kind !== "storage") {
          continue;
        }
        const candidates = rng.shuffle(
          storageTiles(draft, building, floor.y, room.rect, blocked),
        );
        const quota = Math.min(
          MAX_PROPS_PER_ROOM,
          Math.floor((room.rect.w * room.rect.d) / TILES_PER_INTERIOR_PROP),
        );
        for (const tile of candidates.slice(0, quota)) {
          const prop = draft.addProp(
            rng.pick(kinds).id,
            tile,
            randomRotation(rng),
          );
          const cutOff = unreachableInteriorTiles(
            draft,
            building.id,
            own,
            entrance.tile,
            topLevel,
          );
          if (cutOff.length > 0) {
            draft.removeProp(prop.id);
          } else {
            placed++;
          }
        }
      }
    }
  }
  return placed;
}

/** Floor tiles of a room that may hold a prop. */
function storageTiles(
  draft: MapDraft,
  building: Building,
  y: number,
  rect: { x: number; z: number; w: number; d: number },
  blocked: ReadonlySet<number>,
): DraftTile[] {
  const tiles: DraftTile[] = [];
  for (let z = rect.z; z < rect.z + rect.d; z++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const tile = draft.getTile({ x, y, z });
      if (
        tile?.buildingId === building.id &&
        tile.surface === SurfaceIds.FLOOR &&
        !blocked.has(draft.tileKey(tile)) &&
        !hasDoor(draft, tile) &&
        draft.propAt(tile) === undefined
      ) {
        tiles.push(tile);
      }
    }
  }
  return tiles;
}

// ===========================================
// Shared helpers
// ===========================================

/** True when the definition may be used in the biome for the placement. */
function allowedIn(
  prop: PropDefinition,
  biome: BiomeId,
  placement: PropDefinition["placements"][number],
): boolean {
  return (
    prop.placements.includes(placement) &&
    (prop.biomes === undefined || prop.biomes.includes(biome))
  );
}

/** True when a 4-neighbour at the same level already holds a prop. */
function hasAdjacentProp(draft: MapDraft, coord: TileCoord): boolean {
  return DIRECTIONS.some((direction) => {
    const next = stepGridPos(coord, direction);
    return draft.inBounds(next.x, next.z) && draft.propAt(next) !== undefined;
  });
}

/** True when any edge of the tile holds a door. */
function hasDoor(draft: MapDraft, tile: TileCoord): boolean {
  return DIRECTIONS.some(
    (direction) => draft.wallAt(tile, direction) === "door",
  );
}

/** Every road column on the draft. */
function roadColumns(draft: MapDraft): ColumnCoord[] {
  const columns: ColumnCoord[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (draft.isRoad(x, z)) {
        columns.push({ x, z });
      }
    }
  }
  return columns;
}

/** A uniformly random quarter turn. */
function randomRotation(rng: Rng): Rotation {
  return rng.pick<Rotation>([0, 1, 2, 3]);
}
