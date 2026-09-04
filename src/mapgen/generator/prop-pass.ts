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

/** Placement counts for the diagnostic note. */
interface PlacementCounts {
  vegetation: number;
  street: number;
  yard: number;
  interior: number;
}

// ===========================================
// Configuration
// ===========================================

/**
 * One kind of placement a prop pass performs.
 *
 * Each draws from its own labelled RNG fork, so dropping one never
 * reroutes another's random stream. They are *not* independent of each
 * other on the map: `vegetation`, `street` and `yard` compete for the
 * same open ground, so dropping one leaves tiles free that the others
 * take — measured, dropping vegetation raises yard barriers from 6 to 8
 * on a temperate town. Only `interior` is fully independent, because it
 * works inside buildings where no outdoor placement can reach.
 */
export type PropPlacementKind = "vegetation" | "street" | "yard" | "interior";

/** Every placement, in the order a settlement runs them. */
export const ALL_PROP_PLACEMENTS: readonly PropPlacementKind[] = [
  "vegetation",
  "street",
  "yard",
  "interior",
];

/**
 * What each placement needs to exist before it can run. The pass declares
 * the union of these, so an archetype that wants only vegetation does not
 * inherit a requirement for buildings it will never raise (#714).
 */
const REQUIRED_BY_PLACEMENT: Readonly<
  Record<PropPlacementKind, DraftCapability>
> = {
  vegetation: "heightmap",
  street: "roads",
  yard: "buildings",
  interior: "interiors",
};

/** How to configure a prop pass; the default is a settlement's four. */
export interface PropPassOptions {
  /**
   * Pass id, which also seeds its RNG fork. Defaults to `"props"`; give a
   * differently configured pass a different id, and note that changing an
   * id rerolls that pass's placements.
   */
  readonly id?: string;
  /** Which placements to run. Defaults to every one. */
  readonly placements?: readonly PropPlacementKind[];
}

// ===========================================
// PropPass
// ===========================================

/**
 * Pass 6 of the settlement archetype (ADR 0004 §4.4, §7.3). Scatters the
 * biome's vegetation on open ground, puts street props on straight road
 * columns that can be walked around, drops low-cover clutter in yards
 * beside buildings and sidewalks, and furnishes every room from its
 * kind's `RoomFurnishing` without cutting a building off. Never occupies
 * an entrance's threshold, a connector endpoint or a tile with a door.
 *
 * ```
 *   open ground   chance(total density) ─► weighted vegetation pick
 *   road columns  streetPropDensity per 100 ─► straight, bypassable only
 *   rooms         area / tilesPerProp, at most maxProps ─► verified with a building BFS
 * ```
 */
export class PropPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: string;
  readonly requires: readonly DraftCapability[];
  readonly provides: readonly DraftCapability[] = ["props"];

  /** Which placements this instance runs. */
  private readonly placements: ReadonlySet<PropPlacementKind>;

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Builds a prop pass. With no arguments it is the settlement's pass:
   * id `"props"`, all four placements, byte-identical to what it was
   * before it became configurable.
   */
  constructor(options: PropPassOptions = {}) {
    this.id = options.id ?? "props";
    this.placements = new Set(options.placements ?? ALL_PROP_PLACEMENTS);
    this.requires = [
      ...new Set(
        [...this.placements].map(
          (placement) => REQUIRED_BY_PLACEMENT[placement],
        ),
      ),
    ];
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Runs each configured placement. A skipped one draws nothing, and the
   * others keep their own streams; the outdoor placements will, however,
   * spread into ground the skipped one would have taken.
   */
  run(context: GenerationContext): void {
    const { draft, params, rng, registries, diagnostics } = context;
    const blocked = collectBlockedTiles(draft);
    const counts: PlacementCounts = {
      vegetation: 0,
      street: 0,
      yard: 0,
      interior: 0,
    };
    if (this.placements.has("vegetation")) {
      counts.vegetation = placeVegetation(
        draft,
        params.biome,
        registries,
        blocked,
        rng.fork("vegetation"),
      );
    }
    if (this.placements.has("street")) {
      counts.street = placeStreetProps(
        draft,
        params,
        registries,
        blocked,
        rng.fork("street"),
      );
    }
    if (this.placements.has("yard")) {
      counts.yard = placeYardClutter(
        draft,
        params,
        registries,
        blocked,
        rng.fork("yard"),
      );
    }
    if (this.placements.has("interior")) {
      counts.interior = placeInteriorProps(
        draft,
        params.biome,
        registries,
        blocked,
        rng.fork("interior"),
      );
    }
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

/** Columns a cluster may grow into, as manhattan distance from its seed. */
const CLUSTER_RADIUS = 2;

/**
 * Scatters the biome's ground props; returns how many were placed.
 * Every open column rolls once against the biome's total density. A
 * kind with a `cluster` range is seeded at `density / mean cluster size`
 * and grown to a rolled size around the seed, so its expected count per
 * 100 columns is still its density; other kinds land as singletons.
 *
 * ```
 *   . . T . .      T seed, t grown within CLUSTER_RADIUS
 *   . t T t .      expected props = seeds × mean size = density
 *   . . t . .
 * ```
 */
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
  const seedRate = (entry: VegetationEntry): number =>
    entry.density / meanClusterSize(entry);
  const total = entries.reduce((sum, entry) => sum + seedRate(entry), 0) / 100;
  if (entries.length === 0 || total <= 0) {
    return 0;
  }
  const free = (x: number, z: number): boolean =>
    isOpenGround(draft, x, z) &&
    !blocked.has(draft.tileKey(draft.groundCoord(x, z))) &&
    draft.propAt(draft.groundCoord(x, z)) === undefined;
  let placed = 0;
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (!free(x, z) || !rng.chance(total)) {
        continue;
      }
      const entry: VegetationEntry = rng.pickWeighted(entries, seedRate);
      draft.addProp(entry.prop, draft.groundCoord(x, z), randomRotation(rng));
      placed++;
      if (entry.cluster === undefined) {
        continue;
      }
      const size = rng.nextInt(entry.cluster.min, entry.cluster.max);
      const around = rng.shuffle(clusterColumns(draft, x, z, free));
      for (const column of around.slice(0, size - 1)) {
        draft.addProp(
          entry.prop,
          draft.groundCoord(column.x, column.z),
          randomRotation(rng),
        );
        placed++;
      }
    }
  }
  return placed;
}

/** Mean of a kind's cluster size, or 1 for singletons. */
function meanClusterSize(entry: VegetationEntry): number {
  return entry.cluster === undefined
    ? 1
    : (entry.cluster.min + entry.cluster.max) / 2;
}

/** Free columns within `CLUSTER_RADIUS` of the seed, in scan order. */
function clusterColumns(
  draft: MapDraft,
  x: number,
  z: number,
  free: (x: number, z: number) => boolean,
): ColumnCoord[] {
  const columns: ColumnCoord[] = [];
  for (let dz = -CLUSTER_RADIUS; dz <= CLUSTER_RADIUS; dz++) {
    for (let dx = -CLUSTER_RADIUS; dx <= CLUSTER_RADIUS; dx++) {
      const distance = Math.abs(dx) + Math.abs(dz);
      if (
        distance === 0 ||
        distance > CLUSTER_RADIUS ||
        !draft.inBounds(x + dx, z + dz) ||
        !free(x + dx, z + dz)
      ) {
        continue;
      }
      columns.push({ x: x + dx, z: z + dz });
    }
  }
  return columns;
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
 * Furnishes every room from its kind's `RoomFurnishing` (rooms of a kind
 * with no entry stay bare), reverting any prop that would cut part of
 * the building off; returns how many stayed.
 */
function placeInteriorProps(
  draft: MapDraft,
  biome: BiomeDefinition,
  registries: MapGenRegistries,
  blocked: ReadonlySet<number>,
  rng: Rng,
): number {
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
        const furnishing =
          room.kind === undefined
            ? undefined
            : registries.roomFurnishing.find(room.kind);
        if (furnishing === undefined) {
          continue;
        }
        const kinds = furnishing.props.filter((kind) =>
          allowedIn(registries.props.get(kind), biome.id, "interior"),
        );
        if (kinds.length === 0) {
          continue;
        }
        const candidates = rng.shuffle(
          roomTiles(draft, building, floor.y, room.rect, blocked),
        );
        const quota = Math.min(
          furnishing.maxProps,
          Math.floor((room.rect.w * room.rect.d) / furnishing.tilesPerProp),
        );
        for (const tile of candidates.slice(0, quota)) {
          const prop = draft.addProp(
            rng.pick(kinds),
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
function roomTiles(
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
