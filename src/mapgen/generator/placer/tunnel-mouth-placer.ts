import { manhattanDistance } from "../../../core/service/grid-math";
import type { GenerationContext } from "../../model/generation-pass";
import type { HookMeta } from "../../model/hook";
import { HookKinds } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { HookRequirement } from "../../model/map-recipe";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import { isOpenGround, isPassableGround } from "../../service/draft-queries";
import type { GroundTest, LevelSquare } from "./placer-support";
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

/** A tunnel mouth's side in tiles (the bestiary kit: 2×2, set into the ground). */
export const TUNNEL_MOUTH_FOOTPRINT = 2;

/**
 * Fewest manhattan tiles between the nearest tiles of two tunnel mouths.
 *
 * Two reasons, the second the one that sets the number:
 *
 * - A breaching charge blasts a radius of 3, and the squad that set it
 *   stands next to the mouth; 3 + 1 would keep one mouth's charge off the
 *   next mouth and off whoever is working it.
 * - The three are meant to be three places, not one (arc §6.7): an
 *   infantry squad moves 7 tiles an action, so 12 is a turn's dash apart
 *   and no spot on the map works two mouths at once. The fuses burn for
 *   3 turns, so a force that splits seals the three in a few turns and
 *   one that stays together walks a circuit under burrowers.
 *
 * Never relaxed while a spaced square remains; a board too cramped for
 * any spaced square places the rest as far apart as it can, and says so.
 */
export const TUNNEL_MOUTH_SPACING = 12;

/**
 * Fewest manhattan tiles between a mouth and any hook already placed
 * (deploy, edge spawns, other objectives). A mouth on an edge spawn
 * would surface burrowers into the wave; four tiles gives the squad a
 * step between the two.
 */
export const TUNNEL_MOUTH_SPREAD_FROM_HOOKS = 4;

// ===========================================
// Types
// ===========================================

/** A candidate square: its ground tiles and its nearest deploy distance. */
type Square = LevelSquare;

// ===========================================
// TunnelMouthPlacer
// ===========================================

/**
 * Places the tunnel mouths of a Tunnel Sabotage map (arc §6.7): `count`
 * 2×2 squares on level ground, off the map edge and on no hook tile, at
 * least `minDistanceFromDeploy` from the drop ship, each reachable by
 * infantry and by mechs, and at least `TUNNEL_MOUTH_SPACING` from every
 * mouth placed before it. The mouths are placed one at a time; tiers
 * widen until one holds a square:
 *
 * ```
 *   level 2×2, off the boundary, clear of hook tiles, >= minDistance from deploy,
 *   some tile reached by infantry and some by mechs
 *     1. open ground, spaced, spread from hooks, nearest <= maxNearest ──► preferred
 *     2. open ground, spaced, spread from hooks
 *     3. open ground, spaced
 *     4. passable ground (road, sidewalk), spaced     ──► a dense city block
 *     5. open ground, the farthest from the mouths placed ──► cramped: noted
 *   rng.shuffle(pool)[0]
 * ```
 *
 * Tier 5 keeps the count (the objective asks for three) at the cost of
 * the spacing, and picks the square farthest from the mouths already
 * placed; the diagnostics note it. A board with no reachable level
 * square at all places what it can and says so, and I8 reports it.
 *
 * ```
 *   meta { footprint: 2 }
 * ```
 */
export class TunnelMouthPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.TUNNEL_MOUTH;
  /** After the spawners and edge spawns, so it keeps clear of them; before the extraction. */
  readonly priority = 12;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` tunnel mouths to the objectives; the tunnel sabotage map asks for three. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, params, registries, rng, diagnostics } = context;
    const snapshot = snapshotDraft(draft, params, registries);
    const infantry = reachableFromDeploy(draft, snapshot, PassMask.INFANTRY);
    const mech = reachableFromDeploy(draft, snapshot, PassMask.MECH);
    const minDistance = requirement.minDistanceFromDeploy ?? 0;
    const maxNearest =
      requirement.maxNearestDistanceFromDeploy ?? Number.POSITIVE_INFINITY;
    const taken = hookTileKeys(draft);
    const hookCoords = hookTiles(draft);
    const reaches = (square: Square): boolean =>
      square.tiles.some(infantry) && square.tiles.some(mech);
    const spread = (square: Square): boolean =>
      square.tiles.every((tile) =>
        hookCoords.every(
          (hook) =>
            manhattanDistance(hook, tile) >= TUNNEL_MOUTH_SPREAD_FROM_HOOKS,
        ),
      );
    const eligible = (ground: GroundTest): readonly Square[] =>
      levelSquares(draft, TUNNEL_MOUTH_FOOTPRINT, taken, ground).filter(
        (square) => square.nearest >= minDistance && reaches(square),
      );
    const open = eligible(isOpenGround);
    let paved: readonly Square[] | undefined;
    const mouths: (readonly TileCoord[])[] = [];
    const free = (square: Square): boolean =>
      square.tiles.every((tile) => !taken.has(draft.tileKey(tile)));
    const spaced = (square: Square): boolean =>
      mouths.every(
        (mouth) => gapBetween(square.tiles, mouth) >= TUNNEL_MOUTH_SPACING,
      );
    const tiers: readonly (() => readonly Square[])[] = [
      () =>
        open.filter(
          (s) => free(s) && s.nearest <= maxNearest && spaced(s) && spread(s),
        ),
      () => open.filter((s) => free(s) && spaced(s) && spread(s)),
      () => open.filter((s) => free(s) && spaced(s)),
      () =>
        (paved ??= eligible(isPassableGround)).filter(
          (s) => free(s) && spaced(s),
        ),
    ];
    let cramped = 0;
    for (let i = 0; i < requirement.count; i++) {
      const pool = firstNonEmpty(tiers);
      let pick = pool === undefined ? undefined : rng.shuffle([...pool])[0];
      if (pick === undefined) {
        pick = farthestFrom(open.filter(free), mouths);
        cramped += pick === undefined ? 0 : 1;
      }
      if (pick === undefined) {
        break;
      }
      const meta: HookMeta = {
        ...requirement.meta,
        footprint: TUNNEL_MOUTH_FOOTPRINT,
      };
      draft.addHook(
        "objectives",
        HookKinds.TUNNEL_MOUTH,
        pick.tiles,
        requirement.requiredPass,
        meta,
      );
      for (const tile of pick.tiles) {
        taken.add(draft.tileKey(tile));
      }
      mouths.push(pick.tiles);
    }
    diagnostics.note(
      `${String(mouths.length)}/${String(requirement.count)} tunnel mouths` +
        (cramped > 0 ? `, ${String(cramped)} under the spacing` : ""),
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/** Fewest manhattan tiles between any tile of `a` and any tile of `b`. */
export function gapBetween(
  a: readonly TileCoord[],
  b: readonly TileCoord[],
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of a) {
    for (const q of b) {
      best = Math.min(best, manhattanDistance(p, q));
    }
  }
  return best;
}

/**
 * The square farthest from every mouth placed (by its smallest gap), the
 * first in row order on a tie; the first square when none is placed.
 * Deterministic, so the cramped fallback draws nothing.
 */
function farthestFrom(
  pool: readonly Square[],
  mouths: readonly (readonly TileCoord[])[],
): Square | undefined {
  let best: Square | undefined;
  let bestGap = Number.NEGATIVE_INFINITY;
  for (const square of pool) {
    const gap = Math.min(
      ...mouths.map((mouth) => gapBetween(square.tiles, mouth)),
    );
    if (gap > bestGap) {
      best = square;
      bestGap = gap;
    }
  }
  return best;
}
