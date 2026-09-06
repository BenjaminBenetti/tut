import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { SETTLEMENT_DEFINITIONS } from "../../mapgen/data/settlements";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileIndex } from "../../mapgen/service/tile-index";
import type { RoadAppearance } from "../model/road-appearance";
import { ROAD_STYLES } from "../data/road-styles";
import { ROAD_MODELS, ROAD_VARIANTS } from "../data/map-model-table";
import type { ModelAssetId } from "../../content/data/model-ids";

/** A run this long is a road arm, rather than the width of today's 2–4 lane roads. */
const JUNCTION_EXTENT = 6;

type Extents = Readonly<Record<Direction, number>>;

/** Model-table entry for the tile's principal feature; the factory borrows additional parts. */
export function roadModelId(appearance: RoadAppearance): ModelAssetId {
  if (appearance.junction) return ROAD_VARIANTS[appearance.junction.kind];
  if (
    appearance.kerbs.length === 2 &&
    Math.abs(appearance.kerbs[0]! - appearance.kerbs[1]!) !== 2
  )
    return ROAD_MODELS.corner;
  if (appearance.kerbs.length > 0) return ROAD_MODELS.kerb;
  return appearance.line ? ROAD_MODELS.centre : ROAD_MODELS.lane;
}

/** Stable prototype key; position and elevation never allocate a new road prototype. */
export function roadAppearanceKey(appearance: RoadAppearance): string {
  const line = appearance.line;
  const junction = appearance.junction;
  return `${appearance.style}:${appearance.kerbs.join("")}:${line ? `${line.turns},${line.offset}` : ""}:${junction ? `${junction.kind},${junction.turns},${junction.x},${junction.z}` : ""}`;
}

/**
 * Fits a connected carriageway as one surface: kerbs only at its perimeter,
 * one divider across its width, and at most one mark per junction interior.
 * Small legacy one-tile junction fixtures retain the original road kit.
 */
export function resolveRoadAppearances(
  map: TacticalMap,
  index: TileIndex,
): ReadonlyMap<number, RoadAppearance> {
  const roads = map.tiles.filter((tile) => tile.surface === SurfaceIds.ROAD);
  const extents = new Map<number, Extents>();
  const at = (tile: Tile, side: Direction): Tile | undefined => {
    const neighbour = index.getAt(stepGridPos(tile, side));
    return neighbour?.surface === SurfaceIds.ROAD ? neighbour : undefined;
  };
  const span = (tile: Tile): Extents => {
    const key = index.keyOf(tile);
    let found = extents.get(key);
    if (found === undefined) {
      const lengths = { n: 0, e: 0, s: 0, w: 0 };
      for (const side of DIRECTIONS) {
        let next = at(tile, side);
        while (next !== undefined) {
          lengths[side]++;
          next = at(next, side);
        }
      }
      found = lengths;
      extents.set(key, found);
    }
    return found;
  };
  const isJunction = (tile: Tile): boolean => {
    const p = span(tile);
    return Math.min(p.e + p.w + 1, p.n + p.s + 1) >= JUNCTION_EXTENT;
  };
  const wide = wideRoadTiles(roads, index, at, span);
  const style = SETTLEMENT_DEFINITIONS[map.recipe.params.settlement].roadStyle;
  const profile = ROAD_STYLES[style];
  const result = new Map<number, RoadAppearance>();
  for (const tile of roads) {
    if (!wide.has(index.keyOf(tile))) continue;
    const kerbs = profile.kerbs
      ? (["s", "w", "n", "e"] as const).flatMap((side, turn) =>
          at(tile, side) === undefined &&
          index.getAt(stepGridPos(tile, side)) !== undefined
            ? [turn as Rotation]
            : [],
        )
      : [];
    const p = span(tile);
    let line: RoadAppearance["line"];
    let junction: RoadAppearance["junction"];
    if (profile.markings && isJunction(tile)) {
      const region = { n: 0, e: 0, s: 0, w: 0 };
      for (const side of DIRECTIONS) {
        let next = at(tile, side);
        while (next !== undefined && isJunction(next)) {
          region[side]++;
          next = at(next, side);
        }
      }
      const w = region.w + region.e + 1;
      const d = region.n + region.s + 1;
      const arms = DIRECTIONS.filter((side) => p[side] >= JUNCTION_EXTENT - 1);
      if (
        arms.length >= 3 &&
        region.w === Math.floor((w - 1) / 2) &&
        region.n === Math.floor((d - 1) / 2)
      ) {
        const missing = DIRECTIONS.find((side) => !arms.includes(side));
        junction = {
          kind: arms.length === 4 ? "cross" : "t",
          // The existing T is open to west/east/south, missing north.
          turns:
            missing === undefined
              ? 0
              : (DIRECTIONS.indexOf(missing) as Rotation),
          x: w / 2 - region.w - 0.5,
          z: d / 2 - region.n - 0.5,
        };
      }
    } else if (profile.markings) {
      const alongX = p.e + p.w >= p.n + p.s;
      const before = alongX ? p.n : p.w;
      const across = before + (alongX ? p.s : p.e) + 1;
      const length = alongX ? p.e + p.w + 1 : p.n + p.s + 1;
      if (
        length >= JUNCTION_EXTENT &&
        before === Math.floor((across - 1) / 2)
      ) {
        line = {
          turns: alongX ? 0 : 3,
          offset: across % 2 === 0 ? 0.5 : 0,
        };
      }
    }
    result.set(index.keyOf(tile), { style, kerbs, line, junction });
  }
  return result;
}

/** Carries the width decision through short end/corner tiles of the same road. */
function wideRoadTiles(
  roads: readonly Tile[],
  index: TileIndex,
  at: (tile: Tile, side: Direction) => Tile | undefined,
  span: (tile: Tile) => Extents,
): ReadonlySet<number> {
  const seen = new Set<number>();
  const wide = new Set<number>();
  for (const start of roads) {
    if (seen.has(index.keyOf(start))) continue;
    const component = [start];
    seen.add(index.keyOf(start));
    let carriageway = false;
    for (const tile of component) {
      const p = span(tile);
      const short = Math.min(p.e + p.w + 1, p.n + p.s + 1);
      const long = Math.max(p.e + p.w + 1, p.n + p.s + 1);
      carriageway ||=
        short >= 2 && short < JUNCTION_EXTENT && long >= JUNCTION_EXTENT;
      for (const side of DIRECTIONS) {
        const neighbour = at(tile, side);
        if (neighbour === undefined || seen.has(index.keyOf(neighbour)))
          continue;
        seen.add(index.keyOf(neighbour));
        component.push(neighbour);
      }
    }
    if (carriageway) for (const tile of component) wide.add(index.keyOf(tile));
  }
  return wide;
}
