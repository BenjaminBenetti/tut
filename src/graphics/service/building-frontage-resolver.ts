import { DIRECTIONS } from "../../core/model/direction";
import type { Direction } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
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

/**
 * Adds use cues to existing exterior walls. It does not alter the map, replace
 * a wall, create cover or invent a doorway. Owner tiles carry the attachment
 * through fog, unit reveal and per-storey cuts like the wall itself.
 */
export function resolveBuildingFrontages(
  map: TacticalMap,
  index: TileIndex,
): readonly ModelPlacement[] {
  if (map.recipe.params.settlement === "rural") return [];
  const result: ModelPlacement[] = [];
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
    const style = BUILDING_FRONTAGE_STYLES[building.kind];
    if (!style) continue;
    for (const entrance of building.entrances) {
      const tile = index.getAt(entrance.tile);
      if (tile?.walls[entrance.side] !== "door") continue;
      for (const module of style.entrances) {
        if (
          clearMount(
            building,
            tile,
            entrance.side,
            module,
            index,
            ladders,
            propTops,
          )
        ) {
          result.push(mount(module, tile, entrance.side));
          break;
        }
      }
      if (style.sharedMail) {
        for (const offset of [-1, 1, -2, 2]) {
          const next = index.getAt(alongWall(tile, entrance.side, offset));
          if (
            next?.walls[entrance.side] === "solid" &&
            clearMount(
              building,
              next,
              entrance.side,
              MAILBOX_MODULE,
              index,
              ladders,
              propTops,
            )
          ) {
            result.push(mount(MAILBOX_MODULE, next, entrance.side));
            break;
          }
        }
      }
    }
    if (!style.domesticWindows) continue;
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
              if (
                tile.walls[side] === "window" &&
                clearMount(
                  building,
                  tile,
                  side,
                  DOMESTIC_WINDOW_MODULE,
                  index,
                  ladders,
                  propTops,
                )
              ) {
                result.push(mount(DOMESTIC_WINDOW_MODULE, tile, side));
              }
            }
          }
        }
      }
    }
  }
  return result;
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
