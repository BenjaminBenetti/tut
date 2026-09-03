import { DIRECTIONS } from "../../core/model/direction";
import {
  manhattanDistance,
  oppositeDirection,
  rectContains,
} from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import type { Building } from "../model/building";
import { CONNECTOR_RULES } from "../model/connector";
import { CoverLevel } from "../model/cover";
import type { Hook } from "../model/hook";
import { allHooks } from "../model/hook";
import type { UnitClass } from "../model/pass-mask";
import { allows, classesIn, PassMask } from "../model/pass-mask";
import type { MapGenRegistries } from "../model/registries";
import type { TacticalMap } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";
import { ReachabilityService } from "./reachability-service";
import { TileIndex } from "./tile-index";

// ===========================================
// Types
// ===========================================

/** Invariant ids from ADR 0004 §6. */
export type InvariantId = "I1" | "I2" | "I3" | "I4" | "I5" | "I6" | "I7" | "I8";

/** One broken invariant, with the tile it concerns when there is one. */
export interface Violation {
  readonly invariant: InvariantId;
  readonly message: string;
  readonly at?: TileCoord;
}

/** The registries validation needs. */
export type ValidatorRegistries = Pick<MapGenRegistries, "props">;

/** Deploy zones need this many mech-passable tiles (I6). */
export const MIN_DEPLOY_MECH_TILES = 4;

/** Deploy zones need this many infantry-passable tiles (I6). */
export const MIN_DEPLOY_INFANTRY_TILES = 8;

// ===========================================
// Entry point
// ===========================================

/**
 * Checks invariants I1–I8 of ADR 0004 §6 and returns every violation
 * found (empty when the map is valid). I1 failures stop the run, since
 * nothing else can be indexed; every other check runs to completion so a
 * bad generator pass shows all of its damage at once.
 */
export function validateTacticalMap(
  map: TacticalMap,
  registries: ValidatorRegistries,
): readonly Violation[] {
  return new MapValidator(map, registries).run();
}

// ===========================================
// MapValidator
// ===========================================

/** Stateful single-run checker behind `validateTacticalMap`. */
class MapValidator {
  // ===========================================
  // Fields
  // ===========================================

  private readonly map: TacticalMap;
  private readonly registries: ValidatorRegistries;
  private readonly violations: Violation[] = [];
  private index: TileIndex | undefined;
  private reach: ReachabilityService | undefined;

  // ===========================================
  // Construction
  // ===========================================

  /** Binds the map and registries for one validation run. */
  constructor(map: TacticalMap, registries: ValidatorRegistries) {
    this.map = map;
    this.registries = registries;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Runs every check and returns the collected violations. */
  run(): readonly Violation[] {
    this.checkBounds();
    if (this.violations.length > 0) {
      return this.violations;
    }
    this.index = new TileIndex(this.map);
    this.reach = new ReachabilityService(this.index, this.map.connectors);
    this.checkProps();
    this.checkWalls();
    this.checkConnectors();
    this.checkBuildings();
    this.checkHooks();
    this.checkReachability();
    this.checkRecipe();
    return this.violations;
  }

  // ===========================================
  // I1: bounds and uniqueness
  // ===========================================

  /** Every tile in bounds, coordinates unique, `levels` covers them. */
  private checkBounds(): void {
    const { width, depth, levels } = this.map;
    if (width < 1 || depth < 1 || levels < 1) {
      this.fail(
        "I1",
        `Map dimensions must be positive: ${width}×${depth}×${levels}`,
      );
      return;
    }
    const seen = new Set<string>();
    for (const tile of this.map.tiles) {
      const inBounds =
        Number.isInteger(tile.x) &&
        Number.isInteger(tile.y) &&
        Number.isInteger(tile.z) &&
        tile.x >= 0 &&
        tile.x < width &&
        tile.z >= 0 &&
        tile.z < depth &&
        tile.y >= 0 &&
        tile.y < levels;
      if (!inBounds) {
        this.fail("I1", `Tile outside ${width}×${depth}×${levels}`, tile);
        continue;
      }
      const key = `${tile.x},${tile.y},${tile.z}`;
      if (seen.has(key)) {
        this.fail("I1", "Duplicate tile coordinate", tile);
      }
      seen.add(key);
    }
  }

  // ===========================================
  // I2: props and cover
  // ===========================================

  /** Prop tiles are impassable and carry the prop's cover; nothing else does. */
  private checkProps(): void {
    const index = this.requireIndex();
    const propsById = new Map(this.map.props.map((prop) => [prop.id, prop]));
    if (propsById.size !== this.map.props.length) {
      this.fail("I2", "Duplicate prop id");
    }
    for (const prop of this.map.props) {
      const tile = index.getAt(prop.tile);
      if (tile === undefined) {
        this.fail("I2", `Prop ${prop.id} sits on a missing tile`, prop.tile);
      } else if (tile.propId !== prop.id) {
        this.fail(
          "I2",
          `Prop ${prop.id}'s tile does not point back at it`,
          tile,
        );
      }
    }
    for (const tile of this.map.tiles) {
      if (tile.propId === undefined) {
        if (tile.coverProvided !== CoverLevel.NONE) {
          this.fail("I2", "Tile without a prop provides cover", tile);
        }
        if (tile.blocksLos) {
          this.fail("I2", "Tile without a prop blocks line of sight", tile);
        }
        continue;
      }
      const prop = propsById.get(tile.propId);
      if (prop === undefined) {
        this.fail("I2", `Tile references unknown prop ${tile.propId}`, tile);
        continue;
      }
      if (
        prop.tile.x !== tile.x ||
        prop.tile.y !== tile.y ||
        prop.tile.z !== tile.z
      ) {
        this.fail(
          "I2",
          `Prop ${prop.id} is recorded on a different tile`,
          tile,
        );
      }
      if (tile.pass !== PassMask.NONE) {
        this.fail("I2", "Tile with a prop is passable", tile);
      }
      const definition = this.registries.props.find(prop.kind);
      if (definition === undefined) {
        this.fail("I2", `Unknown prop kind "${prop.kind}"`, tile);
      } else if (tile.coverProvided !== definition.cover) {
        this.fail(
          "I2",
          `Cover ${tile.coverProvided} does not match ${prop.kind}`,
          tile,
        );
      } else if (tile.blocksLos !== definition.blocksLos) {
        this.fail(
          "I2",
          `blocksLos ${String(tile.blocksLos)} does not match ${prop.kind}`,
          tile,
        );
      }
    }
  }

  // ===========================================
  // I3: wall symmetry
  // ===========================================

  /** A wall on one side of an edge appears identically on the other. */
  private checkWalls(): void {
    const index = this.requireIndex();
    const reported = new Set<string>();
    for (const tile of this.map.tiles) {
      for (const direction of DIRECTIONS) {
        const neighbour = index.neighbour(tile, direction);
        if (neighbour === undefined) {
          continue;
        }
        const mine = tile.walls[direction];
        const theirs = neighbour.walls[oppositeDirection(direction)];
        if (mine === theirs) {
          continue;
        }
        const a = index.keyOf(tile);
        const b = index.keyOf(neighbour);
        const pairKey = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (!reported.has(pairKey)) {
          reported.add(pairKey);
          this.fail(
            "I3",
            `Wall ${direction} is "${mine ?? "none"}" here but "${theirs ?? "none"}" on the neighbour`,
            tile,
          );
        }
      }
    }
  }

  // ===========================================
  // I4: connectors
  // ===========================================

  /** Connectors join existing tiles with the kind's rise and pass. */
  private checkConnectors(): void {
    const index = this.requireIndex();
    const buildingIds = new Set(this.map.buildings.map((b) => b.id));
    const ids = new Set<string>();
    for (const connector of this.map.connectors) {
      if (ids.has(connector.id)) {
        this.fail("I4", `Duplicate connector id ${connector.id}`);
      }
      ids.add(connector.id);
      const rule = CONNECTOR_RULES[connector.kind];
      const from = index.getAt(connector.from);
      const to = index.getAt(connector.to);
      if (from === undefined || to === undefined) {
        this.fail(
          "I4",
          `Connector ${connector.id} references a missing tile`,
          connector.from,
        );
        continue;
      }
      const rise = to.y - from.y;
      if (rise < rule.minRise || rise > rule.maxRise) {
        this.fail(
          "I4",
          `${connector.kind} ${connector.id} rises ${rise} levels`,
          from,
        );
      }
      if (manhattanDistance(from, to) !== 1) {
        this.fail(
          "I4",
          `Connector ${connector.id} endpoints are not adjacent`,
          from,
        );
      }
      if (connector.pass !== rule.pass) {
        this.fail(
          "I4",
          `${connector.kind} ${connector.id} has pass ${connector.pass}`,
          from,
        );
      }
      if (connector.kind === "stairs" && from.surface !== SurfaceIds.STAIRS) {
        this.fail(
          "I4",
          `Stairs ${connector.id} start on "${from.surface}"`,
          from,
        );
      }
      if (
        connector.buildingId !== undefined &&
        !buildingIds.has(connector.buildingId)
      ) {
        this.fail(
          "I4",
          `Connector ${connector.id} names unknown building ${connector.buildingId}`,
          from,
        );
      }
    }
  }

  // ===========================================
  // I5: buildings
  // ===========================================

  /** Buildings are structurally sound and every floor is reachable. */
  private checkBuildings(): void {
    const index = this.requireIndex();
    const buildingsById = new Map<string, Building>();
    for (const building of this.map.buildings) {
      if (buildingsById.has(building.id)) {
        this.fail("I5", `Duplicate building id ${building.id}`);
      }
      buildingsById.set(building.id, building);
    }
    const tilesByBuilding = new Map<string, Tile[]>();
    for (const tile of this.map.tiles) {
      if (tile.buildingId === undefined) {
        continue;
      }
      if (!buildingsById.has(tile.buildingId)) {
        this.fail(
          "I5",
          `Tile references unknown building ${tile.buildingId}`,
          tile,
        );
        continue;
      }
      const list = tilesByBuilding.get(tile.buildingId);
      if (list === undefined) {
        tilesByBuilding.set(tile.buildingId, [tile]);
      } else {
        list.push(tile);
      }
    }
    const connectorIds = new Set(this.map.connectors.map((c) => c.id));
    for (const building of buildingsById.values()) {
      this.checkBuilding(
        building,
        tilesByBuilding.get(building.id) ?? [],
        index,
        connectorIds,
      );
    }
  }

  /** Checks one building's floors, entrances, tiles and reachability. */
  private checkBuilding(
    building: Building,
    tiles: readonly Tile[],
    index: TileIndex,
    connectorIds: ReadonlySet<string>,
  ): void {
    const label = `Building ${building.id}`;
    if (building.floors.length === 0) {
      this.fail("I5", `${label} has no floors`);
      return;
    }
    if (building.footprint.length === 0) {
      this.fail("I5", `${label} has no footprint`);
    }
    building.floors.forEach((floor, i) => {
      if (floor.index !== i || floor.y !== building.groundLevel + i) {
        this.fail(
          "I5",
          `${label} floor ${i} is mis-numbered or at the wrong level`,
        );
      }
    });
    const roofLevel = building.groundLevel + building.floors.length;

    if (building.entrances.length === 0) {
      this.fail("I5", `${label} has no entrance`);
    }
    for (const entrance of building.entrances) {
      const tile = index.getAt(entrance.tile);
      if (tile?.buildingId !== building.id) {
        this.fail(
          "I5",
          `${label} entrance is not on one of its tiles`,
          entrance.tile,
        );
      } else if (tile.y !== building.groundLevel) {
        this.fail(
          "I5",
          `${label} entrance is not on the ground floor`,
          entrance.tile,
        );
      } else if (tile.walls[entrance.side] !== "door") {
        this.fail(
          "I5",
          `${label} entrance has no door on side ${entrance.side}`,
          entrance.tile,
        );
      }
    }
    for (const id of building.connectorIds) {
      if (!connectorIds.has(id)) {
        this.fail("I5", `${label} names unknown connector ${id}`);
      }
    }

    const perFloor = new Map<number, number>();
    for (const tile of tiles) {
      const inFootprint = building.footprint.some((rect) =>
        rectContains(rect, tile.x, tile.z),
      );
      if (!inFootprint) {
        this.fail("I5", `${label} tile lies outside its footprint`, tile);
      }
      if (allows(tile.pass, PassMask.MECH)) {
        this.fail("I5", `${label} tile is mech-passable`, tile);
      }
      const isRoof = tile.surface === SurfaceIds.ROOF;
      if (isRoof) {
        if (!building.roof.walkable || tile.y !== roofLevel) {
          this.fail("I5", `${label} has a roof tile it should not have`, tile);
        }
        continue;
      }
      if (
        tile.floorIndex === undefined ||
        tile.y !== building.groundLevel + tile.floorIndex
      ) {
        this.fail(
          "I5",
          `${label} tile has a floorIndex inconsistent with its level`,
          tile,
        );
        continue;
      }
      perFloor.set(tile.floorIndex, (perFloor.get(tile.floorIndex) ?? 0) + 1);
    }
    for (const floor of building.floors) {
      if ((perFloor.get(floor.index) ?? 0) === 0) {
        this.fail("I5", `${label} floor ${floor.index} has no tiles`);
      }
    }
    if (
      building.roof.walkable &&
      !tiles.some((t) => t.surface === SurfaceIds.ROOF)
    ) {
      this.fail("I5", `${label} claims a walkable roof but has no roof tiles`);
    }

    this.checkBuildingReachability(building, tiles, label);
  }

  /**
   * Every infantry-passable tile of the building is reachable from its
   * ground floor using only the building's own tiles and connectors.
   */
  private checkBuildingReachability(
    building: Building,
    tiles: readonly Tile[],
    label: string,
  ): void {
    if (tiles.length === 0) {
      return;
    }
    const own = new Set(building.connectorIds);
    const subIndex = new TileIndex({ ...this.map, tiles });
    const reach = new ReachabilityService(
      subIndex,
      this.map.connectors.filter((c) => own.has(c.id)),
    );
    const groundFloor = tiles.filter((t) => t.y === building.groundLevel);
    const reachable = reach.reachableFrom(groundFloor, PassMask.INFANTRY);
    for (const tile of tiles) {
      if (
        allows(tile.pass, PassMask.INFANTRY) &&
        !reachable.has(subIndex.keyOf(tile))
      ) {
        this.fail(
          "I5",
          `${label} tile is not reachable from its ground floor`,
          tile,
        );
      }
    }
  }

  // ===========================================
  // I6: hooks
  // ===========================================

  /** Hook tiles exist and admit the required classes; zones are sane. */
  private checkHooks(): void {
    const index = this.requireIndex();
    const reach = this.requireReach();
    const hooks = this.map.hooks;
    const ids = new Set<string>();
    for (const hook of allHooks(hooks)) {
      if (ids.has(hook.id)) {
        this.fail("I6", `Duplicate hook id ${hook.id}`);
      }
      ids.add(hook.id);
      if (hook.tiles.length === 0) {
        this.fail("I6", `Hook ${hook.id} (${hook.kind}) has no tiles`);
      }
      for (const coord of hook.tiles) {
        const tile = index.getAt(coord);
        if (tile === undefined) {
          this.fail("I6", `Hook ${hook.id} names a missing tile`, coord);
        } else if (!allows(tile.pass, hook.requiredPass)) {
          this.fail(
            "I6",
            `Hook ${hook.id} tile does not admit its required classes`,
            coord,
          );
        }
      }
    }
    if (hooks.deployZones.length === 0) {
      this.fail("I6", "Map has no deploy zone");
    }
    if (hooks.edgeSpawns.length === 0) {
      this.fail("I6", "Map has no edge spawn zone");
    }
    for (const zone of hooks.edgeSpawns) {
      for (const coord of zone.tiles) {
        const onEdge =
          coord.x === 0 ||
          coord.z === 0 ||
          coord.x === this.map.width - 1 ||
          coord.z === this.map.depth - 1;
        if (!onEdge) {
          this.fail(
            "I6",
            `Edge spawn ${zone.id} tile is not on the boundary`,
            coord,
          );
        }
      }
    }
    for (const zone of hooks.deployZones) {
      this.checkDeployZone(zone, index, reach);
    }
  }

  /** A deploy zone has enough tiles per class and each class's tiles connect. */
  private checkDeployZone(
    zone: Hook,
    index: TileIndex,
    reach: ReachabilityService,
  ): void {
    const tiles = zone.tiles
      .map((coord) => index.getAt(coord))
      .filter((tile): tile is Tile => tile !== undefined);
    const mech = tiles.filter((t) => allows(t.pass, PassMask.MECH)).length;
    const infantry = tiles.filter((t) =>
      allows(t.pass, PassMask.INFANTRY),
    ).length;
    if (mech < MIN_DEPLOY_MECH_TILES) {
      this.fail(
        "I6",
        `Deploy zone ${zone.id} has ${mech} mech tiles, needs ${MIN_DEPLOY_MECH_TILES}`,
      );
    }
    if (infantry < MIN_DEPLOY_INFANTRY_TILES) {
      this.fail(
        "I6",
        `Deploy zone ${zone.id} has ${infantry} infantry tiles, needs ${MIN_DEPLOY_INFANTRY_TILES}`,
      );
    }
    for (const unitClass of [PassMask.INFANTRY, PassMask.MECH] as const) {
      if (!reach.isConnected(zone.tiles, unitClass)) {
        this.fail(
          "I6",
          `Deploy zone ${zone.id} is not connected for class ${unitClass}`,
        );
      }
    }
  }

  // ===========================================
  // I7: reachability
  // ===========================================

  /** Every hook is reachable from a deploy zone by each required class. */
  private checkReachability(): void {
    const reach = this.requireReach();
    const origins = this.map.hooks.deployZones.flatMap((zone) => zone.tiles);
    const reachableByClass = new Map<UnitClass, ReadonlySet<number>>();
    for (const hook of allHooks(this.map.hooks)) {
      for (const unitClass of classesIn(hook.requiredPass)) {
        let reachable = reachableByClass.get(unitClass);
        if (reachable === undefined) {
          reachable = reach.reachableFrom(origins, unitClass);
          reachableByClass.set(unitClass, reachable);
        }
        if (!reach.anyReachable(reachable, hook.tiles)) {
          this.fail(
            "I7",
            `Hook ${hook.id} (${hook.kind}) is unreachable for class ${unitClass}`,
            hook.tiles[0],
          );
        }
      }
    }
  }

  // ===========================================
  // I8: recipe satisfaction
  // ===========================================

  /** The map carries exactly what the recipe asked for. */
  private checkRecipe(): void {
    const hooks = allHooks(this.map.hooks);
    const deployTiles = this.map.hooks.deployZones.flatMap(
      (zone) => zone.tiles,
    );
    for (const requirement of this.map.recipe.params.hooks) {
      const matching = hooks.filter((hook) => hook.kind === requirement.kind);
      if (matching.length !== requirement.count) {
        this.fail(
          "I8",
          `Recipe wants ${requirement.count} "${requirement.kind}" hooks, map has ${matching.length}`,
        );
      }
      const minDistance = requirement.minDistanceFromDeploy;
      if (minDistance === undefined) {
        continue;
      }
      for (const hook of matching) {
        for (const coord of hook.tiles) {
          const nearest = Math.min(
            ...deployTiles.map((deploy) => manhattanDistance(coord, deploy)),
          );
          if (nearest < minDistance) {
            this.fail(
              "I8",
              `Hook ${hook.id} is ${nearest} from a deploy zone, recipe wants ${minDistance}`,
              coord,
            );
            break;
          }
        }
      }
    }
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Records a violation. */
  private fail(invariant: InvariantId, message: string, at?: TileCoord): void {
    this.violations.push(
      at === undefined
        ? { invariant, message }
        : { invariant, message, at: { x: at.x, y: at.y, z: at.z } },
    );
  }

  /** The index, which exists once I1 has passed. */
  private requireIndex(): TileIndex {
    if (this.index === undefined) {
      throw new Error("Index requested before bounds check");
    }
    return this.index;
  }

  /** The reachability service, which exists once I1 has passed. */
  private requireReach(): ReachabilityService {
    if (this.reach === undefined) {
      throw new Error("Reachability requested before bounds check");
    }
    return this.reach;
  }
}
