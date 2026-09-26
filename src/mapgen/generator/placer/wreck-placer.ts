import { manhattanDistance } from "../../../core/service/grid-math";
import type { GenerationContext } from "../../model/generation-pass";
import type { HookMeta } from "../../model/hook";
import { HookKinds } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { HookRequirement } from "../../model/map-recipe";
import { PassMask } from "../../model/pass-mask";
import { isOpenGround, isPassableGround } from "../../service/draft-queries";
import type { LevelSquare } from "./placer-support";
import {
  firstNonEmpty,
  hookTileKeys,
  hookTiles,
  levelSquares,
  reachableFromDeploy,
  snapshotDraft,
} from "./placer-support";

// ===========================================
// Constants
// ===========================================

/** The wreck's side when the requirement names none: a mech chassis. */
export const DEFAULT_WRECK_FOOTPRINT = 3;

/**
 * Fewest manhattan tiles between the wreck and any hook already placed.
 * A wreck on a nest is stripped under its hatchlings; a few tiles off,
 * the squad has a turn to see them coming.
 */
export const WRECK_SPREAD_FROM_HOOKS = 4;

// ===========================================
// Types
// ===========================================

/** A candidate square: its ground tiles and its nearest deploy distance. */
type Square = LevelSquare;

// ===========================================
// WreckPlacer
// ===========================================

/**
 * Places a lost mech's wreck (arc §6.6): one square zone `footprint`
 * tiles a side on level ground, off the map edge and on no hook tile, at
 * least `minDistanceFromDeploy` from the drop ship, which an infantry
 * squad can walk to. Tiers widen until one holds a square:
 *
 * ```
 *   level square, off the boundary, clear of hook tiles, >= minDistance from deploy
 *     1. open ground, reachable, spread from hooks, nearest <= maxNearest ──► preferred
 *     2. open ground, reachable, spread from hooks
 *     3. open ground, reachable
 *     4. passable ground (road, sidewalk), reachable    ──► a dense city block
 *     5. open ground                                    ──► last resort; I7 reports it
 *   rng.shuffle(pool)[0]
 * ```
 *
 * "Reachable" is some tile of the square an infantry squad can reach
 * from a deploy zone, which is what I7 asks of the hook. The requirement
 * asks for one; a board with no level square at all places none and says
 * so, and I8 reports it.
 *
 * ```
 *   meta { footprint: 3 }
 * ```
 */
export class WreckPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.WRECK;
  /** After the spawners and edge spawns, so it keeps clear of them. */
  readonly priority = 12;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` wreck zones to the objectives; the wreck map asks for one. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, params, registries, rng, diagnostics } = context;
    const footprint = footprintOf(requirement.meta);
    const snapshot = snapshotDraft(draft, params, registries);
    const reachable = reachableFromDeploy(draft, snapshot, PassMask.INFANTRY);
    const minDistance = requirement.minDistanceFromDeploy ?? 0;
    const maxNearest =
      requirement.maxNearestDistanceFromDeploy ?? Number.POSITIVE_INFINITY;
    const taken = hookTileKeys(draft);
    const hookCoords = hookTiles(draft);
    const reaches = (square: Square): boolean => square.tiles.some(reachable);
    const spread = (square: Square): boolean =>
      square.tiles.every((tile) =>
        hookCoords.every(
          (hook) => manhattanDistance(hook, tile) >= WRECK_SPREAD_FROM_HOOKS,
        ),
      );
    const open = levelSquares(draft, footprint, taken, isOpenGround).filter(
      (square) => square.nearest >= minDistance,
    );
    const paved = (): readonly Square[] =>
      levelSquares(draft, footprint, taken, isPassableGround).filter(
        (square) => square.nearest >= minDistance && reaches(square),
      );
    const tiers: readonly (() => readonly Square[])[] = [
      () =>
        open.filter((s) => s.nearest <= maxNearest && reaches(s) && spread(s)),
      () => open.filter((s) => reaches(s) && spread(s)),
      () => open.filter(reaches),
      paved,
      () => open,
    ];
    let placed = 0;
    for (let i = 0; i < requirement.count; i++) {
      const pool = firstNonEmpty(tiers);
      const pick = pool === undefined ? undefined : rng.shuffle([...pool])[0];
      if (pick === undefined) {
        break;
      }
      const meta: HookMeta = { ...requirement.meta, footprint };
      draft.addHook(
        "objectives",
        HookKinds.WRECK,
        pick.tiles,
        requirement.requiredPass,
        meta,
      );
      for (const tile of pick.tiles) {
        taken.add(draft.tileKey(tile));
      }
      placed += 1;
    }
    diagnostics.note(`${String(placed)}/${String(requirement.count)} wrecks`);
  }
}

// ===========================================
// Helpers
// ===========================================

/** The requirement's `footprint`, a whole side of at least 1, or the mech default. */
function footprintOf(meta: HookMeta | undefined): number {
  const side = meta?.footprint;
  return typeof side === "number" && Number.isInteger(side) && side >= 1
    ? side
    : DEFAULT_WRECK_FOOTPRINT;
}
