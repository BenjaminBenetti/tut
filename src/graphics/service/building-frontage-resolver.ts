import { wallPart } from "../model/map-part";
import { DIRECTIONS } from "../../core/model/direction";
import type { Direction } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { hashSeed } from "../../core/service/seed-hash";
import type { Building } from "../../mapgen/model/building";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Rotation } from "../../mapgen/model/prop";
import type { TileIndex } from "../../mapgen/service/tile-index";
import {
  BUILDING_FRONTAGE_STYLES,
  DOMESTIC_WINDOW_MODULE,
  MAILBOX_MODULE,
  SHUTTER_WINDOW_MODULE,
} from "../data/building-frontage-styles";
import type { BuildingFrontageModule } from "../model/building-frontage-style";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { tileTop } from "../view/tactical-map-view";
import type { ModelPlacement } from "./map-model-resolver";
import { propTiles } from "../../mapgen/service/prop-footprint";
import {
  propAppearanceScale,
  propModelVariation,
} from "./prop-appearance-resolver";

/** +Z faces outdoors at zero turns; placementMatrix turns clockwise about Y. */
const OUTWARD_TURNS: Readonly<Record<Direction, Rotation>> = {
  s: 0,
  w: 1,
  n: 2,
  e: 3,
};

/** World bounds of accepted attachments, preventing overlapping entrances and facing canopies. */
interface MountBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Adds use cues to existing exterior walls. It does not alter the map, replace
 * a wall, create cover or invent a doorway. Owner tiles carry the attachment
 * through fog, unit reveal and per-storey cuts like the wall itself.
 */
export function resolveBuildingFrontages(
  map: TacticalMap,
  index: TileIndex,
): readonly ModelPlacement[] {
  const result: ModelPlacement[] = [];
  const occupied: MountBounds[] = [];
  const ladders = map.connectors.filter((c) => c.kind === "ladder");
  const propTops = new Map<string, number>();
  for (const prop of map.props) {
    const id = propModelVariation(prop, map.recipe.seed)?.modelId;
    if (!id) continue;
    for (const tile of propTiles(prop)) {
      const key = `${tile.x},${tile.z}`;
      propTops.set(
        key,
        Math.max(
          propTops.get(key) ?? -Infinity,
          tileTop(prop.tile.y) +
            MODEL_MANIFEST[id].height *
              (propAppearanceScale(prop, map.recipe.seed).scaleY ?? 1),
        ),
      );
    }
  }
  for (const building of map.buildings) {
    const style = Object.hasOwn(BUILDING_FRONTAGE_STYLES, building.kind)
      ? BUILDING_FRONTAGE_STYLES[building.kind]
      : undefined;
    if (!style) continue;
    const utilityAlongX =
      hashSeed(`${map.recipe.seed}:${building.id}:service-sides`) % 2 === 0;
    for (const entrance of building.entrances) {
      const tile = index.getAt(entrance.tile);
      if (tile?.walls[entrance.side] !== "door") continue;
      const entrances =
        (building.interiorStyle === undefined ||
        style.entrancesByInteriorStyle === undefined ||
        !Object.hasOwn(style.entrancesByInteriorStyle, building.interiorStyle)
          ? undefined
          : style.entrancesByInteriorStyle[building.interiorStyle]) ??
        style.entranceVariants?.[
          hashSeed(`${map.recipe.seed}:${building.id}:entrance`) %
            style.entranceVariants.length
        ] ??
        style.entrances;
      for (const module of entrances) {
        if (tryMount(module, tile, entrance.side)) break;
      }
      if (style.sharedMail) {
        for (const offset of [-1, 1, -2, 2]) {
          const next = index.getAt(alongWall(tile, entrance.side, offset));
          if (
            next?.walls[entrance.side] === "solid" &&
            tryMount(MAILBOX_MODULE, next, entrance.side)
          ) {
            break;
          }
        }
      }
    }
    if (!style.domesticWindows && !style.wallUtility) continue;
    const windows = new Set<string>();
    for (const rect of building.footprint) {
      for (const floor of building.floors) {
        if (floor.index === 0) continue;
        for (let z = rect.z; z < rect.z + rect.d; z++) {
          for (let x = rect.x; x < rect.x + rect.w; x++) {
            const tile = index.getAt({ x, y: floor.y, z });
            if (!tile) continue;
            for (const side of DIRECTIONS) {
              const key = `${x},${floor.y},${z},${side}`;
              if (windows.has(key)) continue;
              windows.add(key);
              const windowModule =
                hashSeed(`${map.recipe.seed}:${building.id}:${side}:window`) %
                  2 ===
                0
                  ? DOMESTIC_WINDOW_MODULE
                  : SHUTTER_WINDOW_MODULE;
              if (style.domesticWindows && tile.walls[side] === "window") {
                tryMount(windowModule, tile, side);
              }
              const along = side === "n" || side === "s" ? tile.x : tile.z;
              if (
                style.wallUtility &&
                (side === "n" || side === "s") === utilityAlongX &&
                tile.walls[side] === "solid" &&
                (along + hashSeed(`${building.id}:${side}:utility`)) % 5 === 0
              )
                tryMount(style.wallUtility, tile, side);
            }
          }
        }
      }
    }

    /** Accepts an unobstructed mount and remembers its occupied visual volume. */
    function tryMount(
      module: BuildingFrontageModule,
      tile: Tile,
      side: Direction,
    ): boolean {
      if (!clearMount(building, tile, side, module, index, ladders, propTops))
        return false;
      const placement = mount(module, tile, side);
      const bounds = mountBounds(module, placement, side);
      if (occupied.some((other) => overlaps(bounds, other))) return false;
      occupied.push(bounds);
      result.push(onWall(placement, tile, side, index));
      return true;
    }
  }
  return result;
}

/** Bounds use the authored rear wall pivot and extend only toward the outdoors. */
function mountBounds(
  module: BuildingFrontageModule,
  placement: ModelPlacement,
  side: Direction,
): MountBounds {
  const { x, y, z } = placement.position;
  const asset = MODEL_MANIFEST[module.modelId];
  const depth = asset.footprint.d;
  const halfWidth = module.width / 2;
  return {
    minX: side === "w" ? x - depth : side === "e" ? x : x - halfWidth,
    maxX: side === "e" ? x + depth : side === "w" ? x : x + halfWidth,
    minY: y,
    maxY: y + asset.height,
    minZ: side === "n" ? z - depth : side === "s" ? z : z - halfWidth,
    maxZ: side === "s" ? z + depth : side === "n" ? z : z + halfWidth,
  };
}

/** Touching edges are allowed; intersecting attachment volumes are not. */
function overlaps(a: MountBounds, b: MountBounds): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

/**
 * The placement stamped with the wall it hangs on (#1121), so a door
 * canopy or a window box falls with its wall when a blast opens it.
 */
function onWall(
  placement: ModelPlacement,
  tile: Tile,
  side: Direction,
  index: TileIndex,
): ModelPlacement {
  return { ...placement, part: wallPart(index.keyOf(tile), side) };
}

/** A coordinate offset along a facade without moving across its wall. */
function alongWall(
  tile: TileCoord,
  side: Direction,
  offset: number,
): TileCoord {
  return {
    ...tile,
    x: tile.x + (side === "n" || side === "s" ? offset : 0),
    z: tile.z + (side === "e" || side === "w" ? offset : 0),
  };
}

/** True inside the union, so an L-shaped footprint cannot decorate an internal seam. */
function contains(building: Building, tile: TileCoord): boolean {
  return building.footprint.some(
    (r) =>
      tile.x >= r.x &&
      tile.x < r.x + r.w &&
      tile.z >= r.z &&
      tile.z < r.z + r.d,
  );
}

/** Avoid corners, another building, raised ground and the whole vertical ladder route. */
function clearMount(
  building: Building,
  tile: Tile,
  side: Direction,
  module: BuildingFrontageModule,
  index: TileIndex,
  ladders: TacticalMap["connectors"],
  propTops: ReadonlyMap<string, number>,
): boolean {
  const reach = Math.ceil(Math.max(0, module.width / 2 - 0.5));
  for (let offset = -reach; offset <= reach; offset++) {
    const support = index.getAt(alongWall(tile, side, offset));
    if (support?.buildingId !== building.id || !support.walls[side])
      return false;
    const outside = stepGridPos(support, side);
    if (!index.inBounds(outside) || contains(building, outside)) return false;
    if (
      (propTops.get(`${outside.x},${outside.z}`) ?? -Infinity) >
      tileTop(tile.y) + module.mountHeight
    )
      return false;
    if (
      index
        .column(outside.x, outside.z)
        .some(
          (t) =>
            t.y >= tile.y &&
            (t.buildingId !== undefined ||
              (t.surface !== "roof" && t.y > tile.y)),
        )
    )
      return false;
    if (
      ladders.some(
        (c) =>
          [c.from, c.to].some((p) => p.x === outside.x && p.z === outside.z) &&
          c.from.y <= tile.y &&
          c.to.y >= tile.y,
      )
    )
      return false;
  }
  return true;
}

/** Attach just inside the wall's exterior face, pointing away from the room. */
function mount(
  module: BuildingFrontageModule,
  tile: Tile,
  side: Direction,
): ModelPlacement {
  const outward = stepGridPos({ x: 0, y: 0, z: 0 }, side);
  return {
    modelId: module.modelId,
    level: tile.y,
    position: {
      x: tile.x + 0.5 + outward.x * 0.545,
      y: tileTop(tile.y) + module.mountHeight,
      z: tile.z + 0.5 + outward.z * 0.545,
    },
    turns: OUTWARD_TURNS[side],
    tile: { x: tile.x, y: tile.y, z: tile.z },
  };
}
