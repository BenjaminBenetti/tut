import { STOREY_LAYERS } from "../../core/model/elevation";
import { DIRECTIONS } from "../../core/model/direction";
import { oppositeDirection, stepGridPos } from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { TileCoord } from "../model/tile-coord";

// ===========================================
// Constants
// ===========================================

/** A paved edge this many layers tall or taller gets a kerb wall (ADR 0008: two layers need a connector). */
const KERB_RISE = STOREY_LAYERS;

// ===========================================
// KerbPass
// ===========================================

/**
 * Walls every paved edge that drops two or more layers and has nothing
 * built on it (#863, from QA's #813 rescale exhibit K2).
 *
 * Roads and pavements sit on levelled ground, so where a street meets
 * the hillside it cut into, the yard beside it, or its own seam, the
 * edge can fall a full storey in one tile. A one-layer paved step reads
 * as a kerb and is left alone (exhibit K1); a two-layer one read as a
 * slab overhanging a void. The ramp pass and the road pass join such
 * edges with ramps where a route belongs; everything else gets a half
 * wall on the high side — the parapet primitive raised features already
 * use — so no paved edge of two or more layers ships bare.
 *
 * ```
 *   level 4 ┃ sidewalk ┃
 *           ┣━━ half ━━┫   ← kerb wall on the high tile's edge; the draft
 *   level 2 │   road   │      mirrors only at the same layer, so readers
 *                            of the edge look from both sides
 * ```
 *
 * Runs after ramps so a ramped edge keeps its ramp; two-layer edges are
 * impassable without a connector either way, so a kerb wall changes no
 * route. Half walls give cover and do not block sight. The wall stands on
 * the high side by preference, at the foot when the high tile is a
 * wedge, and the draft mirrors walls only at the same layer, so readers
 * of the edge look from both sides.
 */
export class KerbPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "kerbs";
  readonly requires: readonly DraftCapability[] = ["ramps"];
  readonly provides: readonly DraftCapability[] = ["kerbs"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Walls the bare paved edges of two or more layers. */
  run(context: GenerationContext): void {
    const { draft, diagnostics } = context;
    let walls = 0;
    for (let z = 0; z < draft.depth; z++) {
      for (let x = 0; x < draft.width; x++) {
        if (draft.isCovered(x, z)) {
          continue;
        }
        const here = draft.groundCoord(x, z);
        for (const direction of DIRECTIONS) {
          const next = stepGridPos(here, direction);
          if (
            !draft.inBounds(next.x, next.z) ||
            draft.isCovered(next.x, next.z)
          ) {
            continue;
          }
          const high = draft.groundCoord(next.x, next.z);
          if (high.y - here.y < KERB_RISE) {
            continue;
          }
          if (!isPaved(draft, here) && !isPaved(draft, high)) {
            continue;
          }
          // Across a two-layer edge the draft's mirror finds air, so a
          // wall lives on whichever tile it was set on; read both.
          if (
            draft.wallAt(here, direction) !== undefined ||
            draft.wallAt(high, oppositeDirection(direction)) !== undefined ||
            joined(draft, here, high)
          ) {
            continue;
          }
          // On the high side by preference; a high tile that is itself a
          // wedge for a one-layer step elsewhere keeps its wedge clean
          // (ADR 0004 I10) and the wall stands at the foot instead.
          if (draft.slopeAt(high.x, high.z) === undefined) {
            draft.setWall(high, oppositeDirection(direction), "half");
          } else {
            draft.setWall(here, direction, "half");
          }
          walls++;
        }
      }
    }
    diagnostics.note(
      `${String(walls)} kerb walls on paved edges of ${String(KERB_RISE)}+ layers`,
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/** Roads and pavements; trails are dirt and take wedges like ground. */
function isPaved(draft: MapDraft, at: TileCoord): boolean {
  const surface = draft.groundSurfaceAt(at.x, at.z);
  return surface === SurfaceIds.ROAD || surface === SurfaceIds.SIDEWALK;
}

/** True when a connector already joins the two tiles, either way round. */
function joined(draft: MapDraft, a: TileCoord, b: TileCoord): boolean {
  return draft.connectors.some(
    (c) =>
      (sameColumn(c.from, a) && sameColumn(c.to, b)) ||
      (sameColumn(c.from, b) && sameColumn(c.to, a)),
  );
}

/** Same ground column, whatever the layer. */
function sameColumn(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.z === b.z;
}
