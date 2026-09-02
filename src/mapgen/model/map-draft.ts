import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import type { IdGenerator } from "../../core/model/id-generator";
import { oppositeDirection, stepGridPos } from "../../core/service/grid-math";
import type { Building } from "./building";
import type { Connector, ConnectorKind } from "./connector";
import { CONNECTOR_RULES } from "./connector";
import type { Hook, HookKind, HookMeta } from "./hook";
import type { Lot } from "./lot";
import type { PassMask } from "./pass-mask";
import type { Prop, PropKindId, Rotation } from "./prop";
import type { RoadSegment } from "./road";
import type { SurfaceId } from "./surface";
import type { TileCoord } from "./tile-coord";
import type { WallKind, WallSet } from "./wall";

// ===========================================
// Types
// ===========================================

/**
 * A standable surface a pass added above or instead of the ground:
 * building floors, stair tiles, walkable roofs. Passability, walls and
 * cover are resolved at freeze time, so they are not stored here.
 */
export interface DraftTile {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  surface: SurfaceId;
  buildingId?: string;
  floorIndex?: number;
  roomId?: string;
}

/** Hook groups while placement is still in progress. */
export interface DraftHooks {
  readonly deployZones: Hook[];
  readonly objectives: Hook[];
  readonly edgeSpawns: Hook[];
  extraction?: Hook;
}

/** Which hook group a placer writes to. */
export type HookGroup = "deployZones" | "objectives" | "edgeSpawns";

const DIRECTION_INDEX: Readonly<Record<Direction, number>> = {
  n: 0,
  e: 1,
  s: 2,
  w: 3,
};

// ===========================================
// MapDraft
// ===========================================

/**
 * Mutable working state shared by every pass (ADR 0004 §7.2). Ground is a
 * dense per-column heightmap and surface layer so terrain, road and lot
 * passes can reshape it cheaply; everything a building adds is a sparse
 * `DraftTile`; walls, props, connectors and hooks are separate collections
 * keyed for mutation. The finalize pass freezes all of it into a
 * `TacticalMap`.
 *
 * ```
 *   ground    Int8Array level + SurfaceId per column, road / covered masks
 *   tiles     Map<key, DraftTile>          floors, stairs, roofs
 *   walls     Map<key * 4 + side, kind>    both sides written together
 *   props     Prop[] + Map<key, Prop>
 *   connectors, buildings, lots, roads, hooks
 * ```
 */
export class MapDraft {
  // ===========================================
  // Fields
  // ===========================================

  readonly width: number;
  readonly depth: number;
  /** Deterministic ids for everything the draft creates. */
  readonly ids: IdGenerator;
  readonly roads: RoadSegment[] = [];
  readonly lots: Lot[] = [];
  readonly buildings: Building[] = [];
  readonly connectors: Connector[] = [];
  readonly props: Prop[] = [];
  readonly hooks: DraftHooks = {
    deployZones: [],
    objectives: [],
    edgeSpawns: [],
  };

  private readonly groundLevel: Int8Array;
  private readonly groundSurface: SurfaceId[];
  private readonly roadMask: Uint8Array;
  private readonly coveredMask: Uint8Array;
  private readonly sparseTiles = new Map<number, DraftTile>();
  private readonly walls = new Map<number, WallKind>();
  private readonly propByTile = new Map<number, Prop>();

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Starts a flat draft at level 0 with every column on `defaultSurface`.
   */
  constructor(
    width: number,
    depth: number,
    ids: IdGenerator,
    defaultSurface: SurfaceId,
  ) {
    this.width = width;
    this.depth = depth;
    this.ids = ids;
    const columns = width * depth;
    this.groundLevel = new Int8Array(columns);
    this.groundSurface = new Array<SurfaceId>(columns).fill(defaultSurface);
    this.roadMask = new Uint8Array(columns);
    this.coveredMask = new Uint8Array(columns);
  }

  // ===========================================
  // Columns and ground
  // ===========================================

  /** True when the column lies on the map. */
  inBounds(x: number, z: number): boolean {
    return x >= 0 && x < this.width && z >= 0 && z < this.depth;
  }

  /** Ground level of the column. Throws off-map. */
  groundLevelAt(x: number, z: number): number {
    return this.groundLevel[this.columnIndex(x, z)] ?? 0;
  }

  /** Sets the ground level of the column. */
  setGroundLevel(x: number, z: number, level: number): void {
    this.groundLevel[this.columnIndex(x, z)] = level;
  }

  /** Ground surface of the column. Throws off-map. */
  groundSurfaceAt(x: number, z: number): SurfaceId {
    return this.groundSurface[this.columnIndex(x, z)] ?? "";
  }

  /** Sets the ground surface of the column. */
  setGroundSurface(x: number, z: number, surface: SurfaceId): void {
    this.groundSurface[this.columnIndex(x, z)] = surface;
  }

  /** The coordinate of the column's ground tile. */
  groundCoord(x: number, z: number): TileCoord {
    return { x, y: this.groundLevelAt(x, z), z };
  }

  /** True when the road pass claimed the column. */
  isRoad(x: number, z: number): boolean {
    return this.roadMask[this.columnIndex(x, z)] === 1;
  }

  /** Marks or clears the column as road. */
  setRoad(x: number, z: number, isRoad = true): void {
    this.roadMask[this.columnIndex(x, z)] = isRoad ? 1 : 0;
  }

  /**
   * True when no ground tile should be emitted for the column because a
   * building floor sits on it.
   */
  isCovered(x: number, z: number): boolean {
    return this.coveredMask[this.columnIndex(x, z)] === 1;
  }

  /** Marks or clears the column as covered by a building. */
  setCovered(x: number, z: number, covered = true): void {
    this.coveredMask[this.columnIndex(x, z)] = covered ? 1 : 0;
  }

  // ===========================================
  // Sparse tiles
  // ===========================================

  /** Packs a coordinate into an integer key; `y` is unbounded. */
  tileKey(coord: TileCoord): number {
    return (coord.y * this.depth + coord.z) * this.width + coord.x;
  }

  /** Adds a sparse tile. Throws if one already exists at the coordinate. */
  addTile(tile: DraftTile): DraftTile {
    const key = this.tileKey(tile);
    if (this.sparseTiles.has(key)) {
      throw new Error(
        `Draft already has a tile at (${tile.x}, ${tile.y}, ${tile.z})`,
      );
    }
    this.sparseTiles.set(key, tile);
    return tile;
  }

  /** The sparse tile at the coordinate, if any. Ground is not included. */
  getTile(coord: TileCoord): DraftTile | undefined {
    return this.sparseTiles.get(this.tileKey(coord));
  }

  /** Removes the sparse tile at the coordinate, if any. */
  removeTile(coord: TileCoord): void {
    this.sparseTiles.delete(this.tileKey(coord));
  }

  /** Every sparse tile, in insertion order. */
  tiles(): IterableIterator<DraftTile> {
    return this.sparseTiles.values();
  }

  /** Sparse tiles belonging to a building. */
  tilesOfBuilding(buildingId: string): DraftTile[] {
    return [...this.sparseTiles.values()].filter(
      (tile) => tile.buildingId === buildingId,
    );
  }

  /**
   * True when something standable exists at the coordinate: a sparse tile,
   * or the uncovered ground of that column at that level.
   */
  hasSurfaceAt(coord: TileCoord): boolean {
    if (this.sparseTiles.has(this.tileKey(coord))) {
      return true;
    }
    return (
      this.inBounds(coord.x, coord.z) &&
      !this.isCovered(coord.x, coord.z) &&
      this.groundLevelAt(coord.x, coord.z) === coord.y
    );
  }

  /** Highest level anything occupies, ground included. */
  maxLevel(): number {
    let max = 0;
    for (const level of this.groundLevel) {
      max = Math.max(max, level);
    }
    for (const tile of this.sparseTiles.values()) {
      max = Math.max(max, tile.y);
    }
    return max;
  }

  // ===========================================
  // Walls
  // ===========================================

  /**
   * Sets or clears the wall on one edge and mirrors it on the far side, so
   * invariant I3 holds by construction. The neighbour need not exist yet;
   * walls are matched to tiles at freeze time.
   */
  setWall(coord: TileCoord, side: Direction, kind: WallKind | undefined): void {
    this.writeWall(coord, side, kind);
    const neighbour = stepGridPos(coord, side);
    if (this.inBounds(neighbour.x, neighbour.z)) {
      this.writeWall(neighbour, oppositeDirection(side), kind);
    }
  }

  /** The wall on one edge of a tile, if any. */
  wallAt(coord: TileCoord, side: Direction): WallKind | undefined {
    return this.walls.get(this.wallKey(coord, side));
  }

  /** All four edges of a tile as a `WallSet` (missing keys for no wall). */
  wallsAt(coord: TileCoord): WallSet {
    const set: Partial<Record<Direction, WallKind>> = {};
    for (const side of DIRECTIONS) {
      const kind = this.wallAt(coord, side);
      if (kind !== undefined) {
        set[side] = kind;
      }
    }
    return set;
  }

  // ===========================================
  // Props
  // ===========================================

  /** Places a prop. Throws if the tile already holds one. */
  addProp(kind: PropKindId, coord: TileCoord, rotation: Rotation = 0): Prop {
    const key = this.tileKey(coord);
    if (this.propByTile.has(key)) {
      throw new Error(
        `Tile (${coord.x}, ${coord.y}, ${coord.z}) already has a prop`,
      );
    }
    const prop: Prop = {
      id: this.ids.nextId("prop"),
      kind,
      tile: { x: coord.x, y: coord.y, z: coord.z },
      rotation,
    };
    this.props.push(prop);
    this.propByTile.set(key, prop);
    return prop;
  }

  /** The prop on the tile, if any. */
  propAt(coord: TileCoord): Prop | undefined {
    return this.propByTile.get(this.tileKey(coord));
  }

  /** Removes a prop by id; a no-op for unknown ids. */
  removeProp(id: string): void {
    const index = this.props.findIndex((prop) => prop.id === id);
    if (index === -1) {
      return;
    }
    const [prop] = this.props.splice(index, 1);
    if (prop !== undefined) {
      this.propByTile.delete(this.tileKey(prop.tile));
    }
  }

  // ===========================================
  // Connectors and hooks
  // ===========================================

  /** Adds a connector with the kind's pass mask. */
  addConnector(
    kind: ConnectorKind,
    from: TileCoord,
    to: TileCoord,
    buildingId?: string,
  ): Connector {
    const connector: Connector = {
      id: this.ids.nextId(kind),
      kind,
      from: { x: from.x, y: from.y, z: from.z },
      to: { x: to.x, y: to.y, z: to.z },
      pass: CONNECTOR_RULES[kind].pass,
      ...(buildingId === undefined ? {} : { buildingId }),
    };
    this.connectors.push(connector);
    return connector;
  }

  /** Adds a hook to one of the groups and returns it. */
  addHook(
    group: HookGroup,
    kind: HookKind,
    tiles: readonly TileCoord[],
    requiredPass: PassMask,
    meta?: HookMeta,
  ): Hook {
    const hook = this.createHook(kind, tiles, requiredPass, meta);
    this.hooks[group].push(hook);
    return hook;
  }

  /** Sets the extraction hook and returns it. */
  setExtraction(
    tiles: readonly TileCoord[],
    requiredPass: PassMask,
    meta?: HookMeta,
  ): Hook {
    const hook = this.createHook("extraction", tiles, requiredPass, meta);
    this.hooks.extraction = hook;
    return hook;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Packs a column into an array index; throws off-map. */
  private columnIndex(x: number, z: number): number {
    if (!this.inBounds(x, z)) {
      throw new Error(
        `Column (${x}, ${z}) is outside ${this.width}×${this.depth}`,
      );
    }
    return z * this.width + x;
  }

  /** Packs a tile edge into a wall map key. */
  private wallKey(coord: TileCoord, side: Direction): number {
    return this.tileKey(coord) * 4 + DIRECTION_INDEX[side];
  }

  /** Writes one side of a wall without mirroring. */
  private writeWall(
    coord: TileCoord,
    side: Direction,
    kind: WallKind | undefined,
  ): void {
    const key = this.wallKey(coord, side);
    if (kind === undefined) {
      this.walls.delete(key);
    } else {
      this.walls.set(key, kind);
    }
  }

  /** Builds a hook record with a fresh id and copied tiles. */
  private createHook(
    kind: HookKind,
    tiles: readonly TileCoord[],
    requiredPass: PassMask,
    meta?: HookMeta,
  ): Hook {
    return {
      id: this.ids.nextId("hook"),
      kind,
      tiles: tiles.map((tile) => ({ x: tile.x, y: tile.y, z: tile.z })),
      requiredPass,
      ...(meta === undefined ? {} : { meta }),
    };
  }
}
