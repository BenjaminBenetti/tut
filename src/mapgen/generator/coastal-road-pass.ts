import { DIRECTIONS } from "../../core/model/direction";
import type { Direction } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { COASTAL_ROAD_TUNING } from "../data/coastal-road-tuning";
import { SurfaceIds } from "../data/surfaces";
import type { CoastalRoadTuning } from "../model/coastal-road-tuning";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { ColumnCoord } from "../model/road";
import { isRoadAt } from "../service/draft-queries";
import { waterEdges } from "./road/road-builder";

/** One lane's final road column, expressed relative to the coastal edge. */
interface LaneEnd {
  readonly lateral: number;
  readonly inward: number;
}

/**
 * Gives shore-facing paved streets a pedestrian quay at their existing
 * grade. Runs after lots/buildings/elevation so the small surface change
 * cannot shuffle accepted structures or planted high ground, and before
 * props, ramps and hooks so those passes see the actual vehicle space.
 *
 * ```
 *   water       ~~~~~~~~~~~~~
 *   barrier     =============
 *   apron       ppppppppppppp   existing dry road/pavement only
 *   approach    pp RRRR pp      carriageway ends before the barrier
 * ```
 */
export class CoastalRoadPass implements GenerationPass {
  // ===========================================
  // Fields and construction
  // ===========================================

  readonly id = "waterfronts";
  readonly requires: readonly DraftCapability[] = [
    "water",
    "roads",
    "interiors",
  ];
  readonly provides: readonly DraftCapability[] = ["waterfronts"];

  /** Uses the shipped apron depth unless a caller supplies another profile. */
  constructor(
    private readonly tuning: CoastalRoadTuning = COASTAL_ROAD_TUNING,
  ) {}

  // ===========================================
  // Public methods
  // ===========================================

  /** Converts terminal road rows to pavement and rails the water boundary. */
  run({ draft, params, diagnostics }: GenerationContext): void {
    if (!params.biome.hasShoreline || !params.settlement.pavedRoads) return;
    const { roadWidth, sidewalkWidth } = params.settlement;
    let ends = 0;
    let converted = 0;
    let barriers = 0;
    for (const edge of waterEdges(draft)) {
      const groups = findEnds(
        draft,
        edge,
        roadWidth,
        sidewalkWidth,
        this.tuning.apronDepth,
      );
      for (const lanes of groups) {
        const first = lanes[0]!;
        const last = lanes[lanes.length - 1]!;
        // The most inland lane determines a straight carriageway end,
        // even when the shoreline clipped individual lanes differently.
        const back =
          Math.max(...lanes.map((lane) => lane.inward)) +
          this.tuning.apronDepth -
          1;
        for (
          let lateral = first.lateral - sidewalkWidth;
          lateral <= last.lateral + sidewalkWidth;
          lateral++
        ) {
          for (let inward = 0; inward <= back; inward++) {
            const at = fromCoast(draft, edge, lateral, inward);
            if (!draft.inBounds(at.x, at.z) || draft.isCovered(at.x, at.z))
              continue;
            const surface = draft.groundSurfaceAt(at.x, at.z);
            if (surface !== SurfaceIds.ROAD && surface !== SurfaceIds.SIDEWALK)
              continue;
            if (
              lateral >= first.lateral &&
              lateral <= last.lateral &&
              surface === SurfaceIds.ROAD
            ) {
              draft.setRoad(at.x, at.z, false);
              draft.setGroundSurface(at.x, at.z, SurfaceIds.SIDEWALK);
              converted++;
            }
            const here = draft.groundCoord(at.x, at.z);
            for (const side of DIRECTIONS) {
              const next = stepGridPos(here, side);
              if (
                draft.inBounds(next.x, next.z) &&
                draft.groundSurfaceAt(next.x, next.z) === SurfaceIds.WATER &&
                draft.wallAt(here, side) === undefined
              ) {
                draft.setWall(here, side, "half");
                barriers++;
              }
            }
          }
        }
        ends++;
      }
    }
    if (converted > 0) {
      // Segments describe vehicle space too; retain their ids and grades.
      for (let i = draft.roads.length - 1; i >= 0; i--) {
        const segment = draft.roads[i]!;
        const columns = segment.columns.filter((c) => draft.isRoad(c.x, c.z));
        if (columns.length === 0) draft.roads.splice(i, 1);
        else if (columns.length !== segment.columns.length)
          draft.roads[i] = { ...segment, columns };
      }
    }
    diagnostics.note(
      `${ends} coastal street ends, ${converted} road columns returned to pavement, ${barriers} water-edge barriers`,
    );
  }
}

// ===========================================
// Coastal street recognition
// ===========================================

/**
 * Finds complete carriageways approaching the water. A shore-parallel
 * road has only its lane width inland; requiring a longer approach keeps
 * those sensible through streets intact. Short gaps may contain the
 * existing end pavement, never another road or a building.
 */
function findEnds(
  draft: MapDraft,
  edge: Direction,
  lanes: number,
  sidewalk: number,
  depth: number,
): LaneEnd[][] {
  const horizontal = edge === "n" || edge === "s";
  const lateralLength = horizontal ? draft.width : draft.depth;
  const inwardLength = horizontal ? draft.depth : draft.width;
  const groups: LaneEnd[][] = [];
  let current: LaneEnd[] = [];
  for (let lateral = 0; lateral < lateralLength; lateral++) {
    let shore = 0;
    while (shore < inwardLength) {
      const p = fromCoast(draft, edge, lateral, shore);
      if (draft.groundSurfaceAt(p.x, p.z) !== SurfaceIds.WATER) break;
      shore++;
    }
    let end: LaneEnd | undefined;
    if (shore > 0 && shore < inwardLength) {
      // A town street stops when its first lane reaches water; the
      // others can have several dry shoreline columns beyond their tip.
      // Search one carriageway's breadth to keep that whole end together.
      for (
        let inward = shore;
        inward <= shore + sidewalk + lanes - 1;
        inward++
      ) {
        const p = fromCoast(draft, edge, lateral, inward);
        if (!draft.inBounds(p.x, p.z) || draft.isCovered(p.x, p.z)) break;
        if (!isRoadAt(draft, p.x, p.z)) continue;
        let run = 0;
        while (inward + run < inwardLength) {
          const next = fromCoast(draft, edge, lateral, inward + run);
          if (!isRoadAt(draft, next.x, next.z)) break;
          run++;
        }
        if (run >= lanes + depth) end = { lateral, inward };
        break;
      }
    }
    if (end !== undefined) current.push(end);
    else if (current.length > 0) {
      if (current.length >= lanes) groups.push(current);
      current = [];
    }
  }
  if (current.length >= lanes) groups.push(current);
  return groups;
}

/** Maps coastal coordinates to a column, inward increasing away from water. */
function fromCoast(
  draft: MapDraft,
  edge: Direction,
  lateral: number,
  inward: number,
): ColumnCoord {
  switch (edge) {
    case "n":
      return { x: lateral, z: inward };
    case "s":
      return { x: lateral, z: draft.depth - 1 - inward };
    case "w":
      return { x: inward, z: lateral };
    case "e":
      return { x: draft.width - 1 - inward, z: lateral };
  }
}
