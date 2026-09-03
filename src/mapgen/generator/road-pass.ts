import { DIRECTIONS } from "../../core/model/direction";
import { SurfaceIds } from "../data/surfaces";
import type { DiagnosticSink } from "../model/diagnostics";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { ColumnCoord, RoadSegment } from "../model/road";
import type { RoadStyle } from "../model/settlement-definition";
import type { SurfaceId } from "../model/surface";
import { GridRoadBuilder } from "./road/grid-road-builder";
import type { RoadBuilder, RoadLine } from "./road/road-builder";
import { isDry } from "./road/road-builder";
import { StreetsRoadBuilder } from "./road/streets-road-builder";
import { TrailRoadBuilder } from "./road/trail-road-builder";

// ===========================================
// Constants
// ===========================================

/** Columns per levelled chunk when a road follows the terrain. */
const CHUNK_LENGTH = 8;

/** Columns beyond the outermost road that plat grading covers (the sidewalk). */
const PLAT_MARGIN = 1;

/** The shipped builder per road style. */
export const DEFAULT_ROAD_BUILDERS: Readonly<Record<RoadStyle, RoadBuilder>> = {
  trail: new TrailRoadBuilder(),
  streets: new StreetsRoadBuilder(),
  grid: new GridRoadBuilder(),
};

// ===========================================
// RoadPass
// ===========================================

/**
 * Pass 3 of the settlement archetype (ADR 0004 §7.3). Asks the builder for
 * the settlement's road style for line geometry, keeps the largest
 * connected network, levels each line (chunks within one level of each
 * other, or one grade for the whole network and the plat it encloses),
 * paints road and sidewalk surfaces, records `RoadSegment`s, and adds a
 * ramp wherever consecutive chunks differ by a level so the road itself
 * is always walkable.
 *
 * ```
 *   builder lines ─► drop wet/duplicate ─► largest component ─► level & paint ─► segments + ramps
 *                                                              └► grade plat (flat only)
 * ```
 */
export class RoadPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "roads";
  readonly requires: readonly DraftCapability[] = ["heightmap", "water"];
  readonly provides: readonly DraftCapability[] = ["roads"];
  private readonly builders: Readonly<Record<RoadStyle, RoadBuilder>>;

  // ===========================================
  // Construction
  // ===========================================

  /** Uses the shipped builders unless a test injects its own. */
  constructor(
    builders: Readonly<Record<RoadStyle, RoadBuilder>> = DEFAULT_ROAD_BUILDERS,
  ) {
    this.builders = builders;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Builds, levels and paints the road network. */
  run(context: GenerationContext): void {
    const { draft, params, rng, diagnostics } = context;
    const { settlement, biome } = params;
    const builder = this.builders[settlement.roadStyle];
    const rawLines = builder.build({
      draft,
      settlement,
      rng: rng.fork("layout"),
    });
    const lines = keepLargestNetwork(draft, rawLines, diagnostics);
    if (lines.length === 0) {
      diagnostics.note("no roads: no dry crossing available");
      return;
    }
    const surface = settlement.pavedRoads
      ? biome.roadSurface
      : biome.trailSurface;
    const flatLevel =
      builder.levelling === "flat" ? medianLevel(draft, lines) : undefined;
    for (const line of lines) {
      levelLine(draft, line, surface, flatLevel, diagnostics);
    }
    if (flatLevel !== undefined) {
      const graded = gradePlat(draft, lines, flatLevel);
      diagnostics.note(
        `graded ${graded} columns inside the plat to level ${flatLevel}`,
      );
    }
    if (settlement.sidewalks) {
      paintSidewalks(draft);
    }
    diagnostics.note(
      `${lines.length} road lines, ${draft.roads.length} segments, ` +
        `${countRoad(draft)} road columns`,
    );
  }
}

// ===========================================
// Network helpers
// ===========================================

/**
 * Drops wet or off-map columns, then keeps only the lines that belong to
 * the largest 4-connected component of road columns. A line that loses
 * columns is split at the gaps so every returned line stays connected.
 */
function keepLargestNetwork(
  draft: MapDraft,
  lines: readonly RoadLine[],
  diagnostics: DiagnosticSink,
): RoadLine[] {
  const key = (c: ColumnCoord): number => c.z * draft.width + c.x;
  const members = new Set<number>();
  for (const line of lines) {
    for (const column of line.columns) {
      if (isDry(draft, column.x, column.z)) {
        members.add(key(column));
      }
    }
  }
  const largest = largestComponent(draft, members);
  const dropped = members.size - largest.size;
  if (dropped > 0) {
    diagnostics.note(
      `dropped ${dropped} road columns outside the main network`,
    );
  }
  const kept: RoadLine[] = [];
  for (const line of lines) {
    let run: ColumnCoord[] = [];
    for (const column of line.columns) {
      if (largest.has(key(column))) {
        run.push(column);
      } else if (run.length > 0) {
        kept.push({ columns: run });
        run = [];
      }
    }
    if (run.length > 0) {
      kept.push({ columns: run });
    }
  }
  return kept;
}

/** The largest 4-connected component of a set of column keys. */
function largestComponent(
  draft: MapDraft,
  members: ReadonlySet<number>,
): ReadonlySet<number> {
  const seen = new Set<number>();
  let best = new Set<number>();
  for (const start of members) {
    if (seen.has(start)) {
      continue;
    }
    const component = new Set<number>([start]);
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) {
        break;
      }
      const x = current % draft.width;
      const z = Math.floor(current / draft.width);
      for (const direction of DIRECTIONS) {
        const nx = x + (direction === "e" ? 1 : direction === "w" ? -1 : 0);
        const nz = z + (direction === "s" ? 1 : direction === "n" ? -1 : 0);
        if (!draft.inBounds(nx, nz)) {
          continue;
        }
        const next = nz * draft.width + nx;
        if (members.has(next) && !seen.has(next)) {
          seen.add(next);
          component.add(next);
          stack.push(next);
        }
      }
    }
    if (component.size > best.size) {
      best = component;
    }
  }
  return best;
}

/** Median terrain level under all road columns, for flat grading. */
function medianLevel(draft: MapDraft, lines: readonly RoadLine[]): number {
  const levels = lines
    .flatMap((line) => line.columns)
    .map((c) => draft.groundLevelAt(c.x, c.z))
    .sort((a, b) => a - b);
  return levels[Math.floor(levels.length / 2)] ?? 0;
}

// ===========================================
// Levelling and painting
// ===========================================

/**
 * Levels one line chunk by chunk, marks its columns as road, paints the
 * surface, records segments and adds ramps between chunks of different
 * level. A line that starts beside an existing road adopts that road's
 * level so junctions are flat.
 */
function levelLine(
  draft: MapDraft,
  line: RoadLine,
  surface: SurfaceId,
  flatLevel: number | undefined,
  diagnostics: DiagnosticSink,
): void {
  let previous: { level: number; last: ColumnCoord } | undefined;
  const first = line.columns[0];
  const junction =
    first === undefined ? undefined : adjacentRoadLevel(draft, first);

  for (let start = 0; start < line.columns.length; start += CHUNK_LENGTH) {
    const chunk = line.columns.slice(start, start + CHUNK_LENGTH);
    const level =
      previous === undefined &&
      junction !== undefined &&
      flatLevel === undefined
        ? junction
        : chooseChunkLevel(draft, chunk, flatLevel, previous?.level);
    for (const column of chunk) {
      draft.setGroundLevel(column.x, column.z, level);
      draft.setGroundSurface(column.x, column.z, surface);
      draft.setRoad(column.x, column.z);
    }
    draft.roads.push({
      id: draft.ids.nextId("road"),
      columns: chunk,
      level,
    } satisfies RoadSegment);

    const last = chunk[chunk.length - 1];
    const head = chunk[0];
    if (previous !== undefined && head !== undefined) {
      const rise = level - previous.level;
      if (Math.abs(rise) === 1) {
        const lower = rise > 0 ? previous.last : head;
        const upper = rise > 0 ? head : previous.last;
        draft.addConnector(
          "ramp",
          { x: lower.x, y: Math.min(level, previous.level), z: lower.z },
          { x: upper.x, y: Math.max(level, previous.level), z: upper.z },
        );
      } else if (rise !== 0) {
        diagnostics.note(`road chunk steps ${rise} levels`, {
          x: head.x,
          y: level,
          z: head.z,
        });
      }
    }
    if (last !== undefined) {
      previous = { level, last };
    }
  }
}

/**
 * Picks a chunk's level: the flat grade when there is one; otherwise the
 * level an existing road column in the chunk already has; otherwise the
 * rounded mean terrain level, kept within one level of the previous
 * chunk. A line's first chunk beside an existing road takes that road's
 * level exactly (handled by the caller) so junctions need no ramp.
 */
function chooseChunkLevel(
  draft: MapDraft,
  chunk: readonly ColumnCoord[],
  flatLevel: number | undefined,
  anchor: number | undefined,
): number {
  if (flatLevel !== undefined) {
    return flatLevel;
  }
  const existing = chunk.find((c) => draft.isRoad(c.x, c.z));
  if (existing !== undefined) {
    return draft.groundLevelAt(existing.x, existing.z);
  }
  const mean =
    chunk.reduce((sum, c) => sum + draft.groundLevelAt(c.x, c.z), 0) /
    chunk.length;
  const level = Math.round(mean);
  if (anchor === undefined) {
    return level;
  }
  return Math.max(anchor - 1, Math.min(anchor + 1, level));
}

/** Level of a road column 4-adjacent to the column, if any. */
function adjacentRoadLevel(
  draft: MapDraft,
  column: ColumnCoord,
): number | undefined {
  for (const direction of DIRECTIONS) {
    const x = column.x + (direction === "e" ? 1 : direction === "w" ? -1 : 0);
    const z = column.z + (direction === "s" ? 1 : direction === "n" ? -1 : 0);
    if (draft.inBounds(x, z) && draft.isRoad(x, z)) {
      return draft.groundLevelAt(x, z);
    }
  }
  return undefined;
}

/**
 * Grades every dry column inside the road network's bounding box, plus
 * the sidewalk column beyond it, to the flat level, the way a city plat
 * is graded before anything is built on it. Terrain outside the plat
 * keeps its noise, so cliffs and ramps stay at the map margin. Returns
 * how many columns changed level.
 *
 * ```
 *   ^^^^^^^^^^^^^^^^^^      margin keeps the terrain
 *   ^ ==+====+====+== ^
 *   ^   |    |    |   ^     everything between the outermost roads
 *   ^ ==+====+====+== ^     (and one column beyond) is one level
 *   ^^^^^^^^^^^^^^^^^^
 * ```
 */
function gradePlat(
  draft: MapDraft,
  lines: readonly RoadLine[],
  level: number,
): number {
  let minX = draft.width;
  let maxX = -1;
  let minZ = draft.depth;
  let maxZ = -1;
  for (const line of lines) {
    for (const column of line.columns) {
      minX = Math.min(minX, column.x);
      maxX = Math.max(maxX, column.x);
      minZ = Math.min(minZ, column.z);
      maxZ = Math.max(maxZ, column.z);
    }
  }
  if (maxX < 0) {
    return 0;
  }
  let graded = 0;
  for (let z = minZ - PLAT_MARGIN; z <= maxZ + PLAT_MARGIN; z++) {
    for (let x = minX - PLAT_MARGIN; x <= maxX + PLAT_MARGIN; x++) {
      if (isDry(draft, x, z) && draft.groundLevelAt(x, z) !== level) {
        draft.setGroundLevel(x, z, level);
        graded++;
      }
    }
  }
  return graded;
}

/**
 * Turns every dry, non-road column beside a road into sidewalk at the
 * road's level, widening the flat corridor lots front onto.
 */
function paintSidewalks(draft: MapDraft): void {
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (!draft.isRoad(x, z)) {
        continue;
      }
      const level = draft.groundLevelAt(x, z);
      for (const direction of DIRECTIONS) {
        const nx = x + (direction === "e" ? 1 : direction === "w" ? -1 : 0);
        const nz = z + (direction === "s" ? 1 : direction === "n" ? -1 : 0);
        if (
          isDry(draft, nx, nz) &&
          !draft.isRoad(nx, nz) &&
          draft.groundSurfaceAt(nx, nz) !== SurfaceIds.SIDEWALK
        ) {
          draft.setGroundSurface(nx, nz, SurfaceIds.SIDEWALK);
          draft.setGroundLevel(nx, nz, level);
        }
      }
    }
  }
}

/** Number of road columns on the draft. */
function countRoad(draft: MapDraft): number {
  let count = 0;
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (draft.isRoad(x, z)) {
        count++;
      }
    }
  }
  return count;
}
