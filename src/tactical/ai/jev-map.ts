import { TileIndex } from "../../mapgen/service/tile-index";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { Tile } from "../../mapgen/model/tile";
import type { WallKind } from "../../mapgen/model/wall";
import type { Connector, ConnectorKind } from "../../mapgen/model/connector";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { passMaskFor } from "../model/unit";
import type {
  JevMapLayer,
  JevMapMarker,
  JevMapWalls,
  JevWallRun,
} from "../model/jev-navigation";
import { DIRECTIONS } from "../../core/model/direction";

// ===========================================
// Legend and public projection
// ===========================================

const LEGEND = {
  f: "Unknown: no observed or remembered surface here. May be unexplored terrain or air; do not assume walkable ground.",
  ".": "Currently visible surface passable for this actor's movement class.",
  ",": "Remembered passable surface, currently out of sight; may have changed.",
  "#": "Currently visible surface blocked for this actor's movement class.",
  "%": "Remembered blocked surface, currently out of sight.",
  l: "Visible blocked obstacle providing low cover to adjacent tiles.",
  L: "Remembered low-cover obstacle, currently out of sight.",
  h: "Visible blocked obstacle providing high cover; blocks sight unless features says otherwise.",
  H: "Remembered high-cover obstacle, currently out of sight.",
  "~": "Visible passable rough or infested terrain; movement cost depends on the actor.",
  "=": "Remembered passable rough or infested terrain, currently out of sight.",
  "@": "The actor; marker.terrain preserves the surface underneath.",
  a: "Living ally; look up its id/name and footprint in actor or entities.",
  e: "Currently spotted living enemy; look up its id/name and footprint in entities.",
  O: "Unfinished mission objective. Its public location does not reveal terrain or hidden enemies.",
  n: "Currently visible living nest/spawner.",
  x: "Extraction tile; leaving requires an extract action.",
};

/** Encode the entire perceived map; all geometry comes from faction-filtered, remembered terrain. */
export function jevNavigation(
  view: TacticalState,
  actor: Unit,
  objectives: readonly JevMapMarker[],
): Readonly<Record<string, unknown>> {
  const { width, depth, levels } = view.map;
  const index = new TileIndex(view.map);
  const visible = new Set(view.vision[actor.team].visible);
  const markers: JevMapMarker[] = [
    ...view.extraction.map((position, i) => ({
      symbol: "x",
      id: `extraction-${String(i)}`,
      position,
    })),
    ...view.spawners
      .filter((nest) => !nest.destroyed && nest.hp > 0)
      .map((nest) => ({ symbol: "n", id: nest.id, position: nest.pos })),
    ...objectives,
    ...view.units
      .filter((unit) => unit.hp > 0 && unit.id !== actor.id)
      .map((unit) => ({
        symbol: unit.team === actor.team ? "a" : "e",
        id: unit.id,
        position: unit.pos,
        footprint: view.templates[unit.templateId]?.footprint ?? 1,
      })),
    {
      symbol: "@",
      id: actor.id,
      position: actor.pos,
      footprint: view.templates[actor.templateId]?.footprint ?? 1,
    },
  ];
  const layers: JevMapLayer[] = [];
  for (let y = 0; y < levels; y++) {
    const tiles = view.map.tiles.filter((tile) => tile.y === y);
    const points = markers.filter((marker) => marker.position.y === y);
    if (!tiles.length && !points.length) {
      layers.push({ y, fill: "f", markers: [], walls: {}, features: {} });
      continue;
    }
    const grid = Array.from({ length: depth }, () =>
      Array<string>(width).fill("f"),
    );
    const coverOverrides: Partial<Record<0 | 1 | 2, string[]>> = {};
    const sightOverrides: Partial<Record<"true" | "false", string[]>> = {};
    for (const tile of tiles) {
      const symbol = terrainSymbol(tile, actor, visible.has(index.keyOf(tile)));
      grid[tile.z]![tile.x] = symbol;
      const impliedCover =
        symbol.toLowerCase() === "h" ? 2 : symbol.toLowerCase() === "l" ? 1 : 0;
      const impliedOpacity = impliedCover === 2;
      const position = `${String(tile.x)},${String(tile.z)}`;
      if (tile.coverProvided !== impliedCover)
        (coverOverrides[tile.coverProvided] ??= []).push(position);
      if (tile.blocksLos !== impliedOpacity)
        (sightOverrides[tile.blocksLos ? "true" : "false"] ??= []).push(
          position,
        );
    }
    const described = points
      .filter((marker) => index.inBounds(marker.position))
      .map((marker) => ({
        ...marker,
        terrain: terrainAt(
          actor,
          marker.position.x,
          y,
          marker.position.z,
          index,
          visible,
        ),
      }));
    // Markers do not modify visibility or erase the recorded terrain underneath.
    for (const marker of described)
      for (let dz = 0; dz < (marker.footprint ?? 1); dz++)
        for (let dx = 0; dx < (marker.footprint ?? 1); dx++) {
          const x = marker.position.x + dx;
          const z = marker.position.z + dz;
          if (x < width && z < depth) grid[z]![x] = marker.symbol;
        }
    layers.push({
      y,
      fill: "f",
      ...rowSpans(grid),
      markers: described,
      walls: describeWalls(wallRuns(tiles, index, visible), width),
      features: {
        ...(Object.keys(coverOverrides).length
          ? { cover_provided: coverOverrides }
          : {}),
        ...(Object.keys(sightOverrides).length
          ? { blocks_sight: sightOverrides }
          : {}),
      },
    });
  }
  return {
    format: "ascii-layers",
    width,
    depth,
    coordinates:
      "Zero-based x increases right; z increases down; y is elevation. Each layer covers the full width and depth, filled with f by default. rows keys are z; character index plus row_start_x[z] (default 0) is x. Omitted rows and characters outside a row are f. Only fog padding is omitted; every known tile and marker is included. x_digits labels global columns. n means z-1, e x+1, s z+1, w x-1.",
    x_digits: Array.from({ length: String(width - 1).length }, (_, digit) =>
      Array.from(
        { length: width },
        (_, x) => String(x).padStart(String(width - 1).length, "0")[digit],
      ).join(""),
    ),
    scope:
      "Full map bounds with shared faction knowledge only. Remembered terrain may be stale. Map glyphs describe terrain for this actor; living unit footprints, wall edges and elevation links also constrain movement. Markers may overlap; their records retain every id and the underlying anchor terrain. Public objectives or extraction markers over f do not reveal the surface. Unmarked terrain is not proof that no hidden enemy is there.",
    legend: LEGEND,
    wall_rules:
      "walls contains two ASCII edge maps on this layer. vertical: row key is tile z, character index is boundary x (0..width); a glyph at x,z separates tiles (x-1,z) and (x,z). horizontal: row key is boundary z (0..depth), character index is tile x; a glyph at x,z separates tiles (x,z-1) and (x,z). Lowercase s=solid, d=door, w=window, h=half wall are visible; uppercase S/D/W/H are remembered and may be stale. Spaces, missing rows and trailing characters mean no known wall. Solid/windows block movement; doors/half allow infantry but block mechs. Solid/doors block sight, windows/half permit sight; half walls give low cover. Walls are bidirectional.",
    feature_rules:
      "features groups 'x,z' coordinate strings on this layer by property and value, overriding the terrain glyph: cover_provided 0=none, 1=low, 2=high; blocks_sight true/false. Connectors group by usable/blocked for this actor, then kind; each string is 'fromX,fromY,fromZ -> toX,toY,toZ'.",
    elevation_rules:
      "Adjacent surfaces one y-layer apart can be walked between when otherwise legal. Rises of two or more layers require a listed connector or a legal jump action. Two layers make one storey. Same x,z on different layers are different tiles; do not treat a roof as ground.",
    layers,
    connectors: describeConnectors(view.map.connectors, actor),
  };
}

// ===========================================
// Compact map descriptions
// ===========================================

/** Drop only redundant fog padding; offsets reconstruct every cell in the full map bounds. */
function rowSpans(
  grid: readonly (readonly string[])[],
): Pick<JevMapLayer, "rows" | "row_start_x"> {
  const rows: Record<string, string> = {};
  const offsets: Record<string, number> = {};
  for (const [z, cells] of grid.entries()) {
    const row = cells.join("");
    const start = row.search(/[^f]/);
    if (start < 0) continue;
    rows[String(z)] = row.slice(start).replace(/f+$/, "");
    if (start) offsets[String(z)] = start;
  }
  return {
    rows,
    ...(Object.keys(offsets).length ? { row_start_x: offsets } : {}),
  };
}

/** Draw known walls once on their shared boundary; sparse blank padding carries no wall facts. */
function describeWalls(
  runs: readonly JevWallRun[],
  width: number,
): JevMapWalls {
  const vertical: Record<string, string[]> = {};
  const horizontal: Record<string, string[]> = {};
  const symbols: Readonly<Record<WallKind, string>> = {
    solid: "s",
    door: "d",
    window: "w",
    half: "h",
  };
  for (const run of runs) {
    const symbol =
      run.knowledge === "visible"
        ? symbols[run.kind]
        : symbols[run.kind].toUpperCase();
    if (run.from.x === run.to.x) {
      for (let z = run.from.z; z < run.to.z; z++)
        (vertical[String(z)] ??= Array<string>(width + 1).fill(" "))[
          run.from.x
        ] = symbol;
    } else {
      const row = (horizontal[String(run.from.z)] ??=
        Array<string>(width).fill(" "));
      for (let x = run.from.x; x < run.to.x; x++) row[x] = symbol;
    }
  }
  return {
    ...(Object.keys(vertical).length
      ? {
          vertical: Object.fromEntries(
            Object.entries(vertical).map(([z, row]) => [
              z,
              row.join("").trimEnd(),
            ]),
          ),
        }
      : {}),
    ...(Object.keys(horizontal).length
      ? {
          horizontal: Object.fromEntries(
            Object.entries(horizontal).map(([z, row]) => [
              z,
              row.join("").trimEnd(),
            ]),
          ),
        }
      : {}),
  };
}

/** Retain every known elevation link without repeating kind, permissions and coordinate field names. */
function describeConnectors(
  connectors: readonly Connector[],
  actor: Unit,
): Readonly<Record<string, unknown>> {
  const groups: Partial<
    Record<"usable" | "blocked", Partial<Record<ConnectorKind, string[]>>>
  > = {};
  for (const { kind, from, to, pass } of connectors) {
    const permission =
      (pass & passMaskFor(actor.passClass)) !== 0 ? "usable" : "blocked";
    const kinds = (groups[permission] ??= {});
    (kinds[kind] ??= []).push(
      `${String(from.x)},${String(from.y)},${String(from.z)} -> ${String(to.x)},${String(to.y)},${String(to.z)}`,
    );
  }
  return groups;
}

// ===========================================
// Perceived terrain and boundaries
// ===========================================

/** Only actor movement-class permissions and remembered tile properties determine terrain glyphs. */
function terrainSymbol(tile: Tile, actor: Unit, visible: boolean): string {
  if ((tile.pass & passMaskFor(actor.passClass)) === 0) {
    if (tile.coverProvided === 2) return visible ? "h" : "H";
    if (tile.coverProvided === 1) return visible ? "l" : "L";
    return visible ? "#" : "%";
  }
  if ((tile.mechMoveCost ?? 1) > 1 || tile.surface === SurfaceIds.INFESTED)
    return visible ? "~" : "=";
  return visible ? "." : ",";
}

/** Resolve a marker's underlying terrain before any overlapping glyphs are painted. */
function terrainAt(
  actor: Unit,
  x: number,
  y: number,
  z: number,
  index: TileIndex,
  visible: ReadonlySet<number>,
): string {
  const tile = index.get(x, y, z);
  return tile
    ? terrainSymbol(tile, actor, visible.has(index.keyOf(tile)))
    : "f";
}

/** Deduplicate mirrored edges, prefer current observations, then merge contiguous matching wall segments. */
function wallRuns(
  tiles: readonly Tile[],
  index: TileIndex,
  visible: ReadonlySet<number>,
): JevWallRun[] {
  const edges = new Map<
    string,
    {
      along: "x" | "z";
      fixed: number;
      start: number;
      kind?: WallKind;
      seen: boolean;
    }
  >();
  for (const tile of tiles)
    for (const side of DIRECTIONS) {
      const along = side === "n" || side === "s" ? "x" : "z";
      const fixed =
        along === "x"
          ? tile.z + Number(side === "s")
          : tile.x + Number(side === "e");
      const start = along === "x" ? tile.x : tile.z;
      const key = `${along}:${String(fixed)}:${String(start)}`;
      const seen = visible.has(index.keyOf(tile));
      if (!edges.has(key) || seen)
        edges.set(key, { along, fixed, start, kind: tile.walls[side], seen });
    }
  const families = new Map<
    string,
    {
      along: "x" | "z";
      fixed: number;
      kind: WallKind;
      seen: boolean;
      starts: number[];
    }
  >();
  for (const edge of edges.values()) {
    if (!edge.kind) continue;
    const key = `${edge.along}:${String(edge.fixed)}:${edge.kind}:${String(edge.seen)}`;
    const family = families.get(key) ?? {
      ...edge,
      kind: edge.kind,
      starts: [],
    };
    family.starts.push(edge.start);
    families.set(key, family);
  }
  const result: JevWallRun[] = [];
  for (const family of families.values()) {
    const starts = family.starts.sort((a, b) => a - b);
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i]!;
      let end = start + 1;
      while (starts[i + 1] === end) {
        i++;
        end++;
      }
      result.push({
        kind: family.kind,
        from:
          family.along === "x"
            ? { x: start, z: family.fixed }
            : { x: family.fixed, z: start },
        to:
          family.along === "x"
            ? { x: end, z: family.fixed }
            : { x: family.fixed, z: end },
        knowledge: family.seen ? "visible" : "remembered",
      });
    }
  }
  return result;
}
