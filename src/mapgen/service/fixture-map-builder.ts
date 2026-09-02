import type { Direction } from "../../core/model/direction";
import { oppositeDirection, stepGridPos } from "../../core/service/grid-math";
import { PROP_DEFINITIONS } from "../data/props";
import { SURFACE_DEFINITIONS, SurfaceIds } from "../data/surfaces";
import type { Building } from "../model/building";
import type { Connector, ConnectorKind } from "../model/connector";
import { CONNECTOR_RULES } from "../model/connector";
import type { CoverLevel } from "../model/cover";
import { CoverLevel as Cover } from "../model/cover";
import type { Hook, HookKind, HookMeta } from "../model/hook";
import { HookKinds } from "../model/hook";
import type { HookRequirement, MapRecipe } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import type { Prop, PropKindId, Rotation } from "../model/prop";
import type { SurfaceId } from "../model/surface";
import type { TacticalMap } from "../model/tactical-map";
import { TACTICAL_MAP_VERSION } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";
import type { WallKind } from "../model/wall";
import { createRegistry } from "./definition-registry";

// ===========================================
// Types
// ===========================================

/** Working copy of a tile while the fixture is being assembled. */
interface MutableTile {
  x: number;
  y: number;
  z: number;
  surface: SurfaceId;
  pass: PassMask;
  walls: Partial<Record<Direction, WallKind>>;
  propId?: string;
  coverProvided: CoverLevel;
  buildingId?: string;
  floorIndex?: number;
  roomId?: string;
}

const SURFACES = createRegistry("surface", SURFACE_DEFINITIONS);
const PROPS = createRegistry("prop", PROP_DEFINITIONS);

// ===========================================
// FixtureMapBuilder
// ===========================================

/**
 * Hand-builds small `TacticalMap`s for tests and examples. It applies the
 * same denormalisation rules the finalize pass will (surface default pass,
 * prop tiles impassable with the prop's cover, walls mirrored) so a fixture
 * is valid by construction unless a test breaks it on purpose.
 *
 * Not used by the generator itself; `MapDraft` (#20) is the real working
 * model. Kept small on purpose.
 */
export class FixtureMapBuilder {
  // ===========================================
  // Fields
  // ===========================================

  private readonly width: number;
  private readonly depth: number;
  private readonly levels: number;
  private readonly tiles = new Map<string, MutableTile>();
  private readonly buildings: Building[] = [];
  private readonly connectors: Connector[] = [];
  private readonly props: Prop[] = [];
  private readonly deployZones: Hook[] = [];
  private readonly objectives: Hook[] = [];
  private readonly edgeSpawns: Hook[] = [];
  private extractionHook: Hook | undefined;
  private requirements: readonly HookRequirement[] = [];
  private nextId = 1;

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Starts an empty fixture of the given size. Nothing is placed until a
   * method adds it.
   */
  constructor(width: number, depth: number, levels: number) {
    this.width = width;
    this.depth = depth;
    this.levels = levels;
  }

  // ===========================================
  // Tiles
  // ===========================================

  /**
   * Adds a ground tile on every column at the level, replacing any tile
   * already there.
   */
  fillGround(y = 0, surface: SurfaceId = SurfaceIds.GRASS): this {
    for (let z = 0; z < this.depth; z++) {
      for (let x = 0; x < this.width; x++) {
        this.tile({ x, y, z }, surface);
      }
    }
    return this;
  }

  /**
   * Adds or replaces a tile with the surface's default passability and no
   * walls, then applies the overrides.
   */
  tile(
    coord: TileCoord,
    surface: SurfaceId,
    overrides: Partial<Omit<Tile, "x" | "y" | "z" | "walls">> = {},
  ): this {
    const definition = SURFACES.find(surface);
    const tile: MutableTile = {
      x: coord.x,
      y: coord.y,
      z: coord.z,
      surface,
      pass: definition?.defaultPass ?? PassMask.ALL,
      walls: {},
      coverProvided: Cover.NONE,
      ...overrides,
    };
    this.tiles.set(keyOf(coord), tile);
    return this;
  }

  /** Removes the tile at the coordinate, if any. */
  removeTile(coord: TileCoord): this {
    this.tiles.delete(keyOf(coord));
    return this;
  }

  /**
   * Replaces fields on an existing tile. Throws if there is no tile, so a
   * test never silently edits nothing.
   */
  patchTile(
    coord: TileCoord,
    patch: Partial<Omit<Tile, "x" | "y" | "z" | "walls">>,
  ): this {
    Object.assign(this.mustGet(coord), patch);
    return this;
  }

  /**
   * Puts a wall on one edge of a tile and mirrors it on the neighbour at
   * the same level when that tile exists. Pass `undefined` to clear.
   */
  wall(coord: TileCoord, side: Direction, kind: WallKind | undefined): this {
    this.setWall(this.mustGet(coord), side, kind);
    const neighbour = this.tiles.get(keyOf(stepGridPos(coord, side)));
    if (neighbour !== undefined) {
      this.setWall(neighbour, oppositeDirection(side), kind);
    }
    return this;
  }

  /**
   * Puts a wall on one side only, deliberately breaking symmetry for
   * validator tests.
   */
  wallOneSided(coord: TileCoord, side: Direction, kind: WallKind): this {
    this.setWall(this.mustGet(coord), side, kind);
    return this;
  }

  // ===========================================
  // Props, connectors, buildings
  // ===========================================

  /**
   * Places a prop on an existing tile: the tile becomes impassable and
   * grants the prop's cover.
   */
  prop(kind: PropKindId, coord: TileCoord, rotation: Rotation = 0): this {
    const tile = this.mustGet(coord);
    const id = this.id("p");
    tile.propId = id;
    tile.pass = PassMask.NONE;
    tile.coverProvided = PROPS.get(kind).cover;
    this.props.push({ id, kind, tile: { ...coord }, rotation });
    return this;
  }

  /** Adds a connector with the kind's default pass mask. Returns its id. */
  connector(
    kind: ConnectorKind,
    from: TileCoord,
    to: TileCoord,
    buildingId?: string,
  ): string {
    const id = this.id("c");
    this.connectors.push({
      id,
      kind,
      from: { ...from },
      to: { ...to },
      pass: CONNECTOR_RULES[kind].pass,
      ...(buildingId === undefined ? {} : { buildingId }),
    });
    return id;
  }

  /** Adds a building record as given; tiles are the caller's business. */
  building(building: Building): this {
    this.buildings.push(building);
    return this;
  }

  // ===========================================
  // Hooks and recipe
  // ===========================================

  /** Adds a deploy zone over the tiles (ALL classes). */
  deploy(tiles: readonly TileCoord[]): this {
    this.deployZones.push(this.hook(HookKinds.DEPLOY, tiles, PassMask.ALL));
    return this;
  }

  /** Adds an objective hook of any kind. */
  objective(
    kind: HookKind,
    tiles: readonly TileCoord[],
    requiredPass: PassMask = PassMask.INFANTRY,
    meta?: HookMeta,
  ): this {
    this.objectives.push(this.hook(kind, tiles, requiredPass, meta));
    return this;
  }

  /** Adds an edge spawn zone (infantry, since bugs walk). */
  edgeSpawn(tiles: readonly TileCoord[]): this {
    this.edgeSpawns.push(
      this.hook(HookKinds.EDGE_SPAWN, tiles, PassMask.INFANTRY),
    );
    return this;
  }

  /** Sets the extraction hook; defaults to the first deploy zone's tiles. */
  extraction(tiles: readonly TileCoord[]): this {
    this.extractionHook = this.hook(HookKinds.EXTRACTION, tiles, PassMask.ALL);
    return this;
  }

  /** Sets the hook requirements recorded in the recipe (invariant I8). */
  requires(requirements: readonly HookRequirement[]): this {
    this.requirements = requirements;
    return this;
  }

  // ===========================================
  // Build
  // ===========================================

  /** Freezes the fixture into a plain `TacticalMap`. */
  build(): TacticalMap {
    const tiles: Tile[] = [...this.tiles.values()].map((tile) => ({
      ...tile,
      walls: { ...tile.walls },
    }));
    const extraction =
      this.extractionHook ??
      this.hook(
        HookKinds.EXTRACTION,
        this.deployZones[0]?.tiles ?? [],
        PassMask.ALL,
      );
    const recipe: MapRecipe = {
      seed: "fixture",
      params: {
        archetype: "settlement",
        biome: "temperate",
        settlement: "rural",
        size: { width: this.width, depth: this.depth },
        hooks: this.requirements,
      },
    };
    return {
      version: TACTICAL_MAP_VERSION,
      recipe,
      width: this.width,
      depth: this.depth,
      levels: this.levels,
      tiles,
      buildings: [...this.buildings],
      connectors: [...this.connectors],
      props: [...this.props],
      hooks: {
        deployZones: [...this.deployZones],
        objectives: [...this.objectives],
        edgeSpawns: [...this.edgeSpawns],
        extraction,
      },
    };
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Returns the working tile or throws. */
  private mustGet(coord: TileCoord): MutableTile {
    const tile = this.tiles.get(keyOf(coord));
    if (tile === undefined) {
      throw new Error(
        `Fixture has no tile at (${coord.x}, ${coord.y}, ${coord.z})`,
      );
    }
    return tile;
  }

  /** Sets or clears one wall on a working tile. */
  private setWall(
    tile: MutableTile,
    side: Direction,
    kind: WallKind | undefined,
  ): void {
    if (kind === undefined) {
      delete tile.walls[side];
    } else {
      tile.walls[side] = kind;
    }
  }

  /** Creates a hook record with a fresh id. */
  private hook(
    kind: HookKind,
    tiles: readonly TileCoord[],
    requiredPass: PassMask,
    meta?: HookMeta,
  ): Hook {
    return {
      id: this.id(`h-${kind}`),
      kind,
      tiles: tiles.map((tile) => ({ ...tile })),
      requiredPass,
      ...(meta === undefined ? {} : { meta }),
    };
  }

  /** Sequential ids so fixtures are stable across runs. */
  private id(prefix: string): string {
    return `${prefix}${this.nextId++}`;
  }
}

/** Map key for a coordinate. */
function keyOf(coord: TileCoord): string {
  return `${coord.x},${coord.y},${coord.z}`;
}
