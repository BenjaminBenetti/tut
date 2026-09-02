import type { Direction } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import type { Rng } from "../../core/model/rng";
import { oppositeDirection, rectContains } from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { Lot } from "../model/lot";
import type { MapDraft } from "../model/map-draft";
import type { ColumnCoord } from "../model/road";
import type { SettlementDefinition } from "../model/settlement-definition";

// ===========================================
// Constants
// ===========================================

/** Columns kept free between a lot and the map edge. */
const EDGE_MARGIN = 1;

/** Columns kept free between neighbouring lots. */
const LOT_GAP = 1;

/** Attempts per anchor before giving up on it. */
const SIZE_ATTEMPTS = 3;

/** A road column and the side of it a lot could sit on. */
interface Anchor {
  readonly column: ColumnCoord;
  /** Direction from the road toward the lot. */
  readonly side: Direction;
}

// ===========================================
// LotPass
// ===========================================

/**
 * Pass 4 of the settlement archetype (ADR 0004 §7.3). Parcels the land
 * beside roads into rectangular lots sized from the settlement, never
 * overlapping roads, sidewalks, water, other lots or a one-column margin
 * at the map edge, with a one-column gap between lots. Each lot is
 * flattened to the level of the corridor column in front of it and
 * records which side faces the road.
 *
 * ```
 *   ====== road ======
 *   ------ sidewalk --      (town / city only)
 *   [lot ] [lot  ] [lot]    frontage = n
 * ```
 */
export class LotPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "lots";
  readonly requires: readonly DraftCapability[] = ["roads"];
  readonly provides: readonly DraftCapability[] = ["lots"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Places lots along the road network up to the settlement's target. */
  run(context: GenerationContext): void {
    const { draft, params, rng, diagnostics } = context;
    const { settlement } = params;
    const target = rng.nextInt(
      settlement.buildingCount.min,
      settlement.buildingCount.max,
    );
    const anchors = rng.shuffle(collectAnchors(draft));
    const occupied = new Set<number>();
    const setback = settlement.sidewalks ? 1 : 0;

    for (const anchor of anchors) {
      if (draft.lots.length >= target) {
        break;
      }
      for (let attempt = 0; attempt < SIZE_ATTEMPTS; attempt++) {
        const rect = proposeRect(draft, settlement, anchor, setback, rng);
        if (rect !== undefined && fits(draft, rect, occupied)) {
          placeLot(draft, rect, anchor, occupied);
          break;
        }
      }
    }
    diagnostics.note(
      `${draft.lots.length} lots placed (target ${target}) from ${anchors.length} anchors`,
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Every (road column, perpendicular side) pair. A column on an x-running
 * road offers its north and south sides; a crossing offers all four.
 */
function collectAnchors(draft: MapDraft): Anchor[] {
  const anchors: Anchor[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (!draft.isRoad(x, z)) {
        continue;
      }
      const alongX = isRoadAt(draft, x + 1, z) || isRoadAt(draft, x - 1, z);
      const alongZ = isRoadAt(draft, x, z + 1) || isRoadAt(draft, x, z - 1);
      if (alongX) {
        anchors.push({ column: { x, z }, side: "n" });
        anchors.push({ column: { x, z }, side: "s" });
      }
      if (alongZ) {
        anchors.push({ column: { x, z }, side: "e" });
        anchors.push({ column: { x, z }, side: "w" });
      }
    }
  }
  return anchors;
}

/** Road check that tolerates off-map coordinates. */
function isRoadAt(draft: MapDraft, x: number, z: number): boolean {
  return draft.inBounds(x, z) && draft.isRoad(x, z);
}

/**
 * Proposes a lot rectangle beside the anchor: `width` along the road,
 * `depth` away from it, starting one setback beyond the road column.
 * Returns undefined when the rectangle would leave the map.
 */
function proposeRect(
  draft: MapDraft,
  settlement: SettlementDefinition,
  anchor: Anchor,
  setback: number,
  rng: Rng,
): Rect | undefined {
  const width = rng.nextInt(settlement.lotWidth.min, settlement.lotWidth.max);
  const depth = rng.nextInt(settlement.lotDepth.min, settlement.lotDepth.max);
  const { x, z } = anchor.column;
  let rect: Rect;
  switch (anchor.side) {
    case "n":
      rect = { x, z: z - setback - depth, w: width, d: depth };
      break;
    case "s":
      rect = { x, z: z + 1 + setback, w: width, d: depth };
      break;
    case "e":
      rect = { x: x + 1 + setback, z, w: depth, d: width };
      break;
    case "w":
      rect = { x: x - setback - depth, z, w: depth, d: width };
      break;
  }
  const inside =
    rect.x >= EDGE_MARGIN &&
    rect.z >= EDGE_MARGIN &&
    rect.x + rect.w <= draft.width - EDGE_MARGIN &&
    rect.z + rect.d <= draft.depth - EDGE_MARGIN;
  return inside ? rect : undefined;
}

/**
 * True when every column of the rectangle is free land and the gap
 * around it holds no other lot.
 */
function fits(
  draft: MapDraft,
  rect: Rect,
  occupied: ReadonlySet<number>,
): boolean {
  for (let z = rect.z - LOT_GAP; z < rect.z + rect.d + LOT_GAP; z++) {
    for (let x = rect.x - LOT_GAP; x < rect.x + rect.w + LOT_GAP; x++) {
      if (!draft.inBounds(x, z)) {
        continue;
      }
      if (occupied.has(z * draft.width + x)) {
        return false;
      }
      if (!rectContains(rect, x, z)) {
        continue;
      }
      const surface = draft.groundSurfaceAt(x, z);
      if (
        draft.isRoad(x, z) ||
        surface === SurfaceIds.WATER ||
        surface === SurfaceIds.SIDEWALK
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Records the lot, marks its columns occupied and flattens them to the
 * level of the corridor column directly in front of the anchor.
 */
function placeLot(
  draft: MapDraft,
  rect: Rect,
  anchor: Anchor,
  occupied: Set<number>,
): void {
  const level = draft.groundLevelAt(anchor.column.x, anchor.column.z);
  for (let z = rect.z; z < rect.z + rect.d; z++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      occupied.add(z * draft.width + x);
      draft.setGroundLevel(x, z, level);
    }
  }
  const lot: Lot = {
    id: draft.ids.nextId("lot"),
    rect,
    level,
    frontage: oppositeDirection(anchor.side),
  };
  draft.lots.push(lot);
}
