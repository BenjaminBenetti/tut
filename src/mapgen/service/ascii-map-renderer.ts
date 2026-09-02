import { HookKinds } from "../model/hook";
import { CoverLevel } from "../model/cover";
import type { TacticalMap } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";
import { TileIndex } from "./tile-index";

// ===========================================
// Options and legend
// ===========================================

/** How to render. */
export interface AsciiRenderOptions {
  /**
   * Render exactly this level; columns with no tile there show `.`.
   * Omit for a top-down composite showing each column's highest tile.
   */
  readonly level?: number;
}

/** Glyph per surface id; unknown surfaces render as `?`. */
const SURFACE_GLYPHS: Readonly<Record<string, string>> = {
  grass: '"',
  dirt: ",",
  sand: ":",
  snow: "*",
  rock: "^",
  road: "=",
  sidewalk: "-",
  water: "~",
  floor: "_",
  roof: "#",
  stairs: ">",
};

/** Glyph per hook kind; unknown kinds render as `!`. */
const HOOK_GLYPHS: Readonly<Record<string, string>> = {
  [HookKinds.DEPLOY]: "D",
  [HookKinds.EGG_SPAWNER]: "E",
  [HookKinds.EDGE_SPAWN]: "S",
  [HookKinds.EXTRACTION]: "X",
};

const EMPTY_GLYPH = ".";
const UNKNOWN_SURFACE_GLYPH = "?";
const UNKNOWN_HOOK_GLYPH = "!";
const RAMP_GLYPH = "/";
const LADDER_GLYPH = "L";

/** Human-readable legend for the glyphs, for the preview and debug output. */
export const ASCII_LEGEND = [
  'surfaces  " grass  , dirt  : sand  * snow  ^ rock  = road  - sidewalk  ~ water',
  "          _ floor  # roof  > stairs  . nothing  ? unknown",
  "props     O high cover  o low cover  i no cover",
  "links     / ramp (lower end)  L ladder (lower end)",
  "hooks     D deploy  E egg spawner  S edge spawn  X extraction  ! other",
  "north is up; x grows to the right, z grows downward",
].join("\n");

// ===========================================
// Renderer
// ===========================================

/**
 * Renders a map as one character per column, rows from north (z = 0) to
 * south. Precedence per column: hook, then prop, then connector, then
 * surface. Pure and fast enough for tests across hundreds of seeds.
 *
 * ```
 *   "==""     grass, road, road, grass
 *   "=_D"     grass, road, building floor, deploy tile
 * ```
 */
export function renderAscii(
  map: TacticalMap,
  options: AsciiRenderOptions = {},
): string {
  const index = new TileIndex(map);
  const level = options.level;
  const overlays = buildOverlays(map, level);
  const rows: string[] = [];
  for (let z = 0; z < map.depth; z++) {
    let row = "";
    for (let x = 0; x < map.width; x++) {
      const tile =
        level === undefined ? topTile(index, x, z) : index.get(x, level, z);
      row += glyphFor(tile, overlays.get(columnKey(map, x, z)));
    }
    rows.push(row);
  }
  return rows.join("\n");
}

// ===========================================
// Helpers
// ===========================================

/** Hook and connector glyphs keyed by column, hooks winning. */
function buildOverlays(
  map: TacticalMap,
  level: number | undefined,
): ReadonlyMap<number, string> {
  const overlays = new Map<number, string>();
  const visible = (coord: TileCoord): boolean =>
    level === undefined || coord.y === level;

  for (const connector of map.connectors) {
    if (connector.kind === "stairs" || !visible(connector.from)) {
      continue;
    }
    overlays.set(
      columnKey(map, connector.from.x, connector.from.z),
      connector.kind === "ramp" ? RAMP_GLYPH : LADDER_GLYPH,
    );
  }
  // Later groups win: extraction < deploy < edge spawns < objectives.
  const hooks = [
    map.hooks.extraction,
    ...map.hooks.deployZones,
    ...map.hooks.edgeSpawns,
    ...map.hooks.objectives,
  ];
  for (const hook of hooks) {
    const glyph = HOOK_GLYPHS[hook.kind] ?? UNKNOWN_HOOK_GLYPH;
    for (const coord of hook.tiles) {
      if (visible(coord)) {
        overlays.set(columnKey(map, coord.x, coord.z), glyph);
      }
    }
  }
  return overlays;
}

/** Highest tile in a column, or undefined for an empty column. */
function topTile(index: TileIndex, x: number, z: number): Tile | undefined {
  const column = index.column(x, z);
  return column[column.length - 1];
}

/** Picks the glyph for one cell. */
function glyphFor(tile: Tile | undefined, overlay: string | undefined): string {
  if (overlay !== undefined) {
    return overlay;
  }
  if (tile === undefined) {
    return EMPTY_GLYPH;
  }
  if (tile.propId !== undefined) {
    return propGlyph(tile);
  }
  return SURFACE_GLYPHS[tile.surface] ?? UNKNOWN_SURFACE_GLYPH;
}

/** Glyph for the prop occupying a tile, by the cover it provides. */
function propGlyph(tile: Tile): string {
  switch (tile.coverProvided) {
    case CoverLevel.HIGH:
      return "O";
    case CoverLevel.LOW:
      return "o";
    default:
      return "i";
  }
}

/** Packs a column into an integer key. */
function columnKey(map: TacticalMap, x: number, z: number): number {
  return z * map.width + x;
}
