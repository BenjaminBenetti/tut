import type { Rng } from "../../../core/model/rng";
import type { MapDraft } from "../../model/map-draft";
import type { PlatformLayout } from "../../model/platform-layout";
import type { PropKindId, Rotation } from "../../model/prop";
import type { MapGenRegistries } from "../../model/registries";
import type { ColumnCoord } from "../../model/road";
import { isPassableGround } from "../../service/draft-queries";
import { propPlacementTiles } from "../../service/prop-footprint";
import { joinCarapaceCells } from "../infestation/carapace-outline";
import { NEIGHBOURS_4 } from "./platform-raster";

// ===========================================
// Constants
// ===========================================

/** Rounds of prop removal allowed to reopen cut-off pockets. */
const REOPEN_ROUNDS = 12;

// ===========================================
// PlatformPropStamp
// ===========================================

/**
 * Places props on a spore platform's deck (#1179), refusing void, main
 * routes, kept-clear pads, the landing site, uneven footprints and each
 * other. Every dressing of either stage stamps through it, so nothing
 * ever stands on a route a mech or brute must walk.
 */
export class PlatformPropStamp {
  // ===========================================
  // Construction
  // ===========================================

  /** Stamps onto `draft` by its platform `layout`. */
  constructor(
    private readonly draft: MapDraft,
    private readonly registries: Pick<MapGenRegistries, "props">,
    private readonly layout: PlatformLayout,
  ) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Places `kind` anchored at the column when its whole footprint is
   * level, free deck; with `spaced`, nothing else may stand beside it
   * either. Returns whether it was placed.
   */
  place(
    kind: PropKindId,
    anchor: ColumnCoord,
    rotation: Rotation,
    spaced: boolean,
  ): boolean {
    const { draft } = this;
    if (!draft.inBounds(anchor.x, anchor.z)) return false;
    const tile = draft.groundCoord(anchor.x, anchor.z);
    const cells = propPlacementTiles(
      tile,
      this.registries.props.get(kind),
      rotation,
    );
    for (const cell of cells) {
      if (!this.free(cell.x, cell.z)) return false;
      if (draft.groundLevelAt(cell.x, cell.z) !== tile.y) return false;
      if (spaced && this.crowded(cell.x, cell.z)) return false;
    }
    draft.addProp(kind, tile, rotation, cells);
    return true;
  }

  /**
   * Joins a run of columns into carapace wall pieces with the infestation
   * kit's joiner and stamps each that fits. Returns how many stood.
   */
  placeWall(run: readonly ColumnCoord[], rng: Rng): number {
    const { draft } = this;
    const tiles = run
      .filter((column) => draft.inBounds(column.x, column.z))
      .map((column) => draft.groundCoord(column.x, column.z));
    let placed = 0;
    for (const cell of joinCarapaceCells(tiles, rng)) {
      if (this.place(cell.kind, cell.tile, cell.rotation, false)) placed++;
    }
    return placed;
  }

  /** Free deck: on the platform, off every route and kept-clear pad, passable. */
  free(x: number, z: number): boolean {
    const { draft, layout } = this;
    if (!draft.inBounds(x, z)) return false;
    const i = z * draft.width + x;
    return (
      layout.deck[i] === 1 &&
      layout.route[i] !== 1 &&
      layout.keepClear[i] !== 1 &&
      !draft.isLandingReserved(x, z) &&
      isPassableGround(draft, x, z)
    );
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** True when a prop already stands on one of the eight neighbours. */
  private crowded(x: number, z: number): boolean {
    const { draft } = this;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!draft.inBounds(x + dx, z + dz)) continue;
        if (draft.propAt(draft.groundCoord(x + dx, z + dz)) !== undefined) {
          return true;
        }
      }
    }
    return false;
  }
}

// ===========================================
// Pockets
// ===========================================

/**
 * Lifts props until every passable deck column joins `origin` again over
 * free steps (one layer at most), so no dressing seals a pocket of deck
 * off from the routes. Returns how many props were lifted.
 */
export function reopenPlatformPockets(
  draft: MapDraft,
  layout: PlatformLayout,
  origin: ColumnCoord,
): number {
  let lifted = 0;
  for (let round = 0; round < REOPEN_ROUNDS; round++) {
    const reached = floodDeck(draft, layout, origin);
    const blockers = new Set<string>();
    for (let i = 0; i < reached.length; i++) {
      if (reached[i] === 1 || layout.deck[i] !== 1) continue;
      const x = i % draft.width;
      const z = Math.floor(i / draft.width);
      if (!isPassableGround(draft, x, z)) continue;
      for (const [dx, dz] of NEIGHBOURS_4) {
        if (!draft.inBounds(x + dx, z + dz)) continue;
        const prop = draft.propAt(draft.groundCoord(x + dx, z + dz));
        if (prop !== undefined) blockers.add(prop.id);
      }
    }
    if (blockers.size === 0) return lifted;
    for (const id of blockers) {
      draft.removeProp(id);
      lifted++;
    }
  }
  return lifted;
}

/** Deck reached from `origin` over passable columns, one layer per step at most. */
function floodDeck(
  draft: MapDraft,
  layout: PlatformLayout,
  origin: ColumnCoord,
): Uint8Array {
  const reached = new Uint8Array(draft.width * draft.depth);
  const start = origin.z * draft.width + origin.x;
  reached[start] = 1;
  const queue = [start];
  // The queue grows as it is walked; for-of sees every pushed column.
  for (const u of queue) {
    const ux = u % draft.width;
    const uz = Math.floor(u / draft.width);
    const level = draft.groundLevelAt(ux, uz);
    for (const [dx, dz] of NEIGHBOURS_4) {
      const x = ux + dx;
      const z = uz + dz;
      if (!draft.inBounds(x, z)) continue;
      const v = z * draft.width + x;
      if (reached[v] === 1 || layout.deck[v] !== 1) continue;
      if (!isPassableGround(draft, x, z)) continue;
      if (Math.abs(draft.groundLevelAt(x, z) - level) > 1) continue;
      reached[v] = 1;
      queue.push(v);
    }
  }
  return reached;
}
