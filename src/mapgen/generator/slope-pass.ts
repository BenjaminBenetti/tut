import { STOREY_LAYERS } from "../../core/model/elevation";
import { DIRECTIONS, type Direction } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { Rotation } from "../model/prop";
import type { Slope, SlopeKind } from "../model/slope";
import type { TileCoord } from "../model/tile-coord";
import { buildGroundComponents } from "../service/ground-components";

// ===========================================
// Types
// ===========================================

/** A lower tile that could carry a slope piece, and the piece it would carry. */
interface Candidate {
  readonly lower: TileCoord;
  readonly slope: Slope;
  /** Upper tiles the piece walks onto; empty for an outer corner. */
  readonly uppers: readonly TileCoord[];
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
 * The terrain pass records the level it gave each column; a step is
 * natural when both columns still sit at that level and neither lies
 * in a lot. Everything a later pass graded, lifted or dug — road plats,
 * plazas, embankments, lots — keeps its retaining wall, and the ramp pass
 * bridges those as before.
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
 * Transitional engine conversion (#807): terrain still steps by a whole
 * storey, so straight and inner pieces retain ramps to their upper tiles.
 * The mapgen child of ADR 0008 replaces these with natural one-layer steps
 * and removes the ramps; ReachabilityService already walks those freely.
 * Outer pieces are shape only: the two flanking straights carry traversal.
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

  /** Marks the slope pieces and adds their connectors. */
  run(context: GenerationContext): void {
    const { draft, params, rng, diagnostics } = context;
    const { nodes } = buildGroundComponents(draft);
    const candidates = collectCandidates(draft, nodes);
    const naturalEdges = countNaturalEdgeTiles(draft, nodes);
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
        for (const upper of candidate.uppers) {
          draft.addConnector("ramp", candidate.lower, upper);
        }
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
function collectCandidates(
  draft: MapDraft,
  nodes: ReadonlySet<number>,
): Candidate[] {
  const straightAt = new Map<number, Candidate>();
  const rest: Candidate[] = [];
  for (const key of nodes) {
    const x = key % draft.width;
    const z = Math.floor(key / draft.width);
    if (!isNatural(draft, x, z)) {
      continue;
    }
    const here = draft.groundCoord(x, z);
    const high = DIRECTIONS.filter((direction) =>
      isNaturalStepUp(draft, nodes, here, direction),
    );
    if (high.length === 1) {
      const direction = high[0];
      if (direction === undefined) continue;
      const upper = draft.groundCoord(
        stepGridPos(here, direction).x,
        stepGridPos(here, direction).z,
      );
      straightAt.set(key, {
        lower: here,
        slope: { kind: "straight", turns: STRAIGHT_TURNS[direction] },
        uppers: [upper],
      });
    } else if (high.length === 2 && adjacentPair(high)) {
      const turns = CORNER_TURNS[pairKey(high)];
      if (turns === undefined) continue;
      rest.push({
        lower: here,
        slope: { kind: "inner", turns },
        uppers: high.map((direction) => {
          const step = stepGridPos(here, direction);
          return draft.groundCoord(step.x, step.z);
        }),
      });
    }
  }
  // Outer corners need their flanking straights to exist first.
  for (const key of nodes) {
    if (straightAt.has(key)) continue;
    const x = key % draft.width;
    const z = Math.floor(key / draft.width);
    if (!isNatural(draft, x, z)) continue;
    const here = draft.groundCoord(x, z);
    if (DIRECTIONS.some((d) => isNaturalStepUp(draft, nodes, here, d)))
      continue;
    const corner = outerCorner(draft, nodes, straightAt, here);
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
  nodes: ReadonlySet<number>,
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
    const diagonalKey = diagonal.z * draft.width + diagonal.x;
    if (!nodes.has(diagonalKey) || !isNatural(draft, diagonal.x, diagonal.z))
      continue;
    if (draft.groundLevelAt(diagonal.x, diagonal.z) !== here.y + STOREY_LAYERS)
      continue;
    // Both flanks must climb onto the same terrace as the diagonal.
    if (draft.groundLevelAt(sideA.x, sideA.z) !== here.y) continue;
    if (draft.groundLevelAt(sideB.x, sideB.z) !== here.y) continue;
    const turns = CORNER_TURNS[pairKey([a, b])];
    if (turns === undefined) continue;
    if (found !== undefined) return undefined;
    found = { lower: here, slope: { kind: "outer", turns }, uppers: [] };
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
 * A column still at its terrain level, clear of every lot by a column, and
 * carrying no wall. A building at its lot's edge mirrors its wall onto the
 * ground tile outside (I3), and a step against a lot is a retaining wall by
 * the ruling, so both count as man-made here.
 */
function isNatural(draft: MapDraft, x: number, z: number): boolean {
  const natural = draft.naturalLevelAt(x, z);
  if (natural < 0 || natural !== draft.groundLevelAt(x, z)) {
    return false;
  }
  if (Object.keys(draft.wallsAt(draft.groundCoord(x, z))).length > 0) {
    return false;
  }
  return !draft.lots.some(({ rect }) => {
    return (
      x >= rect.x - 1 &&
      x <= rect.x + rect.w &&
      z >= rect.z - 1 &&
      z <= rect.z + rect.d
    );
  });
}

/** The neighbour in `direction` is walkable, natural and exactly one level up. */
function isNaturalStepUp(
  draft: MapDraft,
  nodes: ReadonlySet<number>,
  here: TileCoord,
  direction: Direction,
): boolean {
  const next = stepGridPos(here, direction);
  if (!draft.inBounds(next.x, next.z)) return false;
  if (!nodes.has(next.z * draft.width + next.x)) return false;
  if (!isNatural(draft, next.x, next.z)) return false;
  return draft.groundLevelAt(next.x, next.z) === here.y + STOREY_LAYERS;
}

/** Lower tiles of natural steps, whatever piece (or none) they get: the knob's denominator. */
function countNaturalEdgeTiles(
  draft: MapDraft,
  nodes: ReadonlySet<number>,
): number {
  let count = 0;
  for (const key of nodes) {
    const x = key % draft.width;
    const z = Math.floor(key / draft.width);
    if (!isNatural(draft, x, z)) continue;
    const here = draft.groundCoord(x, z);
    if (DIRECTIONS.some((d) => isNaturalStepUp(draft, nodes, here, d))) count++;
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
