import { DIRECTIONS, type Direction } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import { SurfaceIds } from "../data/surfaces";
import type { MapDraft } from "../model/map-draft";
import type { Rotation } from "../model/prop";
import type { Slope, SlopeKind } from "../model/slope";
import type { TileCoord } from "../model/tile-coord";

// ===========================================
// Types
// ===========================================

/** A lower tile that could carry a slope piece, and the piece it would carry. */
interface Candidate {
  readonly lower: TileCoord;
  readonly slope: Slope;
}

// ===========================================
// Orientation tables
// ===========================================

/**
 * Quarter turns for a straight wedge whose high side is in `direction`,
 * on the stairs convention (`Slope.turns`): south 0, west 1, north 2,
 * east 3.
 */
const STRAIGHT_TURNS: Readonly<Record<Direction, Rotation>> = {
  s: 0,
  w: 1,
  n: 2,
  e: 3,
};

/**
 * Quarter turns for a corner from the pair of directions that are high
 * (inner) or that flank the high diagonal (outer). The pair is stored
 * sorted so either order looks up.
 */
const CORNER_TURNS: Readonly<Record<string, Rotation>> = {
  "s|w": 0,
  "n|w": 1,
  "e|n": 2,
  "e|s": 3,
};

// ===========================================
// SlopePass
// ===========================================

/**
 * Turns every natural one-level step into a walkable hillside (#799).
 *
 * A step is one layer between two ground columns, and its lower tile
 * takes the wedge whenever that tile is unpaved and carries no wall
 * (#847): a wall is what makes an edge man-made, and everything with
 * one — a building's mirrored wall, a parapet on a raised feature — keeps
 * it. Roads and pavements carry no wedge; the ramp pass bridges the
 * two-layer steps as before.
 *
 * The lower tile of a natural step becomes the slope piece, chosen from
 * its neighbourhood the way marching squares would:
 *
 * ```
 *   one high side              ─► straight, facing it
 *   two adjacent high sides    ─► inner corner (the terrace wraps the tile)
 *   no high side, one high     ─► outer corner (the terrace juts past it),
 *     diagonal flanked by two     only if both flanks are straights, so
 *     straights                   the run turns the corner whole
 *   anything else              ─► left as it was
 * ```
 *
 * A natural step is one layer (ADR 0008 §2.5): the terrain pass keeps
 * every natural edge to a single layer (I11), and a one-layer step is a
 * free walk for both classes, so a slope piece is shape only — no
 * connector, one derivation of walkability. `slopeShare` is therefore
 * visual: a run left bare is still walked, it just shows no wedge.
 *
 * Shape is read from geometry alone (#817): a high neighbour that carries
 * a prop is still high ground, and the terrace still turns there, so the
 * piece is chosen from levels and not from what can be stood on.
 *
 * `slopeShare` (the Map Lab knob) is drawn per run — a connected group
 * of candidate tiles along one edge — never per tile, so a run is all
 * slope or all cliff and no corner is orphaned.
 */
export class SlopePass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "slopes";
  readonly requires: readonly DraftCapability[] = ["props"];
  readonly provides: readonly DraftCapability[] = ["slopes"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Marks the slope pieces on every natural one-layer step. */
  run(context: GenerationContext): void {
    const { draft, params, rng, diagnostics } = context;
    const candidates = collectCandidates(draft);
    const naturalEdges = countNaturalEdgeTiles(draft);
    const runs = groupRuns(draft, candidates);

    const counts: Record<SlopeKind, number> = {
      straight: 0,
      inner: 0,
      outer: 0,
    };
    let cliffRuns = 0;
    const draw = rng.fork("runs");
    for (const run of runs) {
      for (const candidate of run) {
        draft.markNaturalEdge(candidate.lower.x, candidate.lower.z);
      }
      if (params.slopeShare < 1 && !draw.chance(params.slopeShare)) {
        cliffRuns++;
        continue;
      }
      for (const candidate of run) {
        draft.setSlope(candidate.lower.x, candidate.lower.z, candidate.slope);
        counts[candidate.slope.kind]++;
      }
    }
    // The share reads the knob back exactly: runs sloped over runs found.
    // Edge tiles with no wedge shape — a one-wide gully with high ground on
    // both sides, a pit walled on three — are cliffs by geometry, not by
    // the knob, and are reported apart so the number stays honest.
    const slopedRuns = runs.length - cliffRuns;
    const share =
      runs.length === 0 ? 100 : Math.round((100 * slopedRuns) / runs.length);
    const shaped = candidates.filter((c) => c.slope.kind !== "outer").length;
    const unshaped = Math.max(0, naturalEdges - shaped);
    diagnostics.note(
      `${String(counts.straight)} straight, ${String(counts.inner)} inner, ` +
        `${String(counts.outer)} outer slopes; ${String(slopedRuns)} of ` +
        `${String(runs.length)} natural edge runs sloped (${String(share)} %); ` +
        `${String(unshaped)} edge tiles have no wedge shape`,
    );
  }
}

// ===========================================
// Candidates
// ===========================================

/** Every lower tile of a natural step, with the piece its neighbourhood implies. */
function collectCandidates(draft: MapDraft): Candidate[] {
  const straightAt = new Map<number, Candidate>();
  const rest: Candidate[] = [];
  for (const key of naturalColumns(draft)) {
    const x = key % draft.width;
    const z = Math.floor(key / draft.width);
    const here = draft.groundCoord(x, z);
    const high = DIRECTIONS.filter((direction) =>
      isStepUp(draft, here, direction),
    );
    if (high.length === 1) {
      const direction = high[0];
      if (direction === undefined) continue;
      straightAt.set(key, {
        lower: here,
        slope: { kind: "straight", turns: STRAIGHT_TURNS[direction] },
      });
    } else if (high.length === 2 && adjacentPair(high)) {
      const turns = CORNER_TURNS[pairKey(high)];
      if (turns === undefined) continue;
      rest.push({ lower: here, slope: { kind: "inner", turns } });
    }
  }
  // Outer corners need their flanking straights to exist first.
  for (const key of naturalColumns(draft)) {
    if (straightAt.has(key)) continue;
    const x = key % draft.width;
    const z = Math.floor(key / draft.width);
    const here = draft.groundCoord(x, z);
    if (DIRECTIONS.some((d) => isStepUp(draft, here, d))) continue;
    const corner = outerCorner(draft, straightAt, here);
    if (corner !== undefined) rest.push(corner);
  }
  return [...straightAt.values(), ...rest];
}

/**
 * An outer corner: the terrace juts past this tile diagonally, and the two
 * tiles between it and the high diagonal are both straights climbing onto
 * the same terrace. Exactly one such diagonal, or nothing.
 */
function outerCorner(
  draft: MapDraft,
  straightAt: ReadonlyMap<number, Candidate>,
  here: TileCoord,
): Candidate | undefined {
  const pairs: readonly [Direction, Direction][] = [
    ["s", "w"],
    ["n", "w"],
    ["e", "n"],
    ["e", "s"],
  ];
  let found: Candidate | undefined;
  for (const [a, b] of pairs) {
    const sideA = stepGridPos(here, a);
    const sideB = stepGridPos(here, b);
    const diagonal = {
      x: sideA.x + (sideB.x - here.x),
      z: sideA.z + (sideB.z - here.z),
    };
    if (!draft.inBounds(diagonal.x, diagonal.z)) continue;
    const flankA = straightAt.get(
      diagonal.z * 0 + sideA.z * draft.width + sideA.x,
    );
    const flankB = straightAt.get(sideB.z * draft.width + sideB.x);
    if (flankA === undefined || flankB === undefined) continue;
    if (draft.isCovered(diagonal.x, diagonal.z)) continue;
    if (draft.groundSurfaceAt(diagonal.x, diagonal.z) === SurfaceIds.WATER)
      continue;
    if (draft.groundLevelAt(diagonal.x, diagonal.z) !== here.y + 1) continue;
    // Both flanks must climb onto the same terrace as the diagonal.
    if (draft.groundLevelAt(sideA.x, sideA.z) !== here.y) continue;
    if (draft.groundLevelAt(sideB.x, sideB.z) !== here.y) continue;
    const turns = CORNER_TURNS[pairKey([a, b])];
    if (turns === undefined) continue;
    if (found !== undefined) return undefined;
    found = { lower: here, slope: { kind: "outer", turns } };
  }
  return found;
}

// ===========================================
// Runs
// ===========================================

/** Connected groups of candidates (8-neighbourhood), each a run along one edge. */
function groupRuns(
  draft: MapDraft,
  candidates: readonly Candidate[],
): Candidate[][] {
  const byKey = new Map<number, Candidate>();
  for (const c of candidates) byKey.set(c.lower.z * draft.width + c.lower.x, c);
  const seen = new Set<number>();
  const runs: Candidate[][] = [];
  for (const [key, start] of byKey) {
    if (seen.has(key)) continue;
    const run: Candidate[] = [];
    const queue = [start];
    seen.add(key);
    for (const current of queue) {
      run.push(current);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const x = current.lower.x + dx;
          const z = current.lower.z + dz;
          if (!draft.inBounds(x, z)) continue;
          const k = z * draft.width + x;
          const next = byKey.get(k);
          if (next === undefined || seen.has(k)) continue;
          seen.add(k);
          queue.push(next);
        }
      }
    }
    runs.push(run);
  }
  return runs;
}

// ===========================================
// Predicates
// ===========================================

/**
 * Ground that carries a wedge when it faces a one-layer step: any unpaved
 * ground column with no wall on it and no connector standing on it.
 *
 * This used to demand terrain still at its natural level and a column's
 * clearance from every lot, on the premise that graded ground keeps a
 * retaining wall. QA's #813 catalogue measured the premise: of the tiles
 * the rule excluded, one in eight had a wall, and the rest were bare
 * blocks of earth beside plots, yards and the city plat, in runs of up
 * to forty-one (#847). A wall is the man-made edge; where there is none,
 * a wedge is the geometry the hillside already has a few tiles away.
 * Roads and pavements stay out: the kit has no paved wedge, and a road
 * that meets higher ground is the road pass's kerb to draw.
 */
function isWedgeGround(draft: MapDraft, x: number, z: number): boolean {
  if (draft.isLandingReserved(x, z)) return false;
  const surface = draft.groundSurfaceAt(x, z);
  if (
    surface === SurfaceIds.WATER ||
    surface === SurfaceIds.ROAD ||
    surface === SurfaceIds.SIDEWALK
  ) {
    return false;
  }
  if (Object.keys(draft.wallsAt(draft.groundCoord(x, z))).length > 0) {
    return false;
  }
  // A connector's foot or head is a man-made thing standing here — a
  // ladder placed before this pass, say — and no connector ever starts
  // on a slope tile (ADR 0004 I10).
  return !draft.connectors.some(
    (c) => (c.from.x === x && c.from.z === z) || (c.to.x === x && c.to.z === z),
  );
}

/**
 * The neighbour in `direction` is ground exactly one layer up. Geometry
 * only (#817): a prop on it does not unmake the terrace, and neither does
 * a graded plat — a natural tile half a step under a road plat still
 * meets it with a wedge. Only water and a building's footprint are not
 * ground to climb onto. Which tiles *carry* a wedge is `isWedgeGround`'s
 * call, made about the lower tile alone.
 */
function isStepUp(
  draft: MapDraft,
  here: TileCoord,
  direction: Direction,
): boolean {
  const next = stepGridPos(here, direction);
  if (!draft.inBounds(next.x, next.z)) return false;
  if (draft.isCovered(next.x, next.z)) return false;
  if (draft.groundSurfaceAt(next.x, next.z) === SurfaceIds.WATER) return false;
  return draft.groundLevelAt(next.x, next.z) === here.y + 1;
}

/** Every natural column, as ground-graph keys. */
function naturalColumns(draft: MapDraft): number[] {
  const keys: number[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (isWedgeGround(draft, x, z)) keys.push(z * draft.width + x);
    }
  }
  return keys;
}

/** Lower tiles of natural steps, whatever piece (or none) they get: the knob's denominator. */
function countNaturalEdgeTiles(draft: MapDraft): number {
  let count = 0;
  for (const key of naturalColumns(draft)) {
    const x = key % draft.width;
    const z = Math.floor(key / draft.width);
    const here = draft.groundCoord(x, z);
    if (DIRECTIONS.some((d) => isStepUp(draft, here, d))) count++;
  }
  return count;
}

/** True for two directions at right angles; false for an opposite pair. */
function adjacentPair(pair: readonly Direction[]): boolean {
  const [a, b] = pair;
  if (a === undefined || b === undefined) return false;
  return !(
    (a === "n" && b === "s") ||
    (a === "s" && b === "n") ||
    (a === "e" && b === "w") ||
    (a === "w" && b === "e")
  );
}

/** The `CORNER_TURNS` key for a pair of directions, whichever order they came in. */
function pairKey(pair: readonly Direction[]): string {
  return [...pair].sort().join("|");
}
