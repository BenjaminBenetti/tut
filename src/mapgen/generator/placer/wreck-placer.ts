import { manhattanDistance } from "../../../core/service/grid-math";
import type { GenerationContext } from "../../model/generation-pass";
import type { HookMeta } from "../../model/hook";
import { HookKinds } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { MapDraft } from "../../model/map-draft";
import type { HookRequirement } from "../../model/map-recipe";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import {
  isBoundaryColumn,
  isOpenGround,
  isPassableGround,
} from "../../service/draft-queries";
import {
  distanceToDeploy,
  hookTileKeys,
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

/** Which columns a square may stand on: open ground, or any passable ground. */
type GroundTest = (draft: MapDraft, x: number, z: number) => boolean;

/** A candidate square: its ground tiles and its nearest deploy distance. */
interface Square {
  readonly tiles: readonly TileCoord[];
  readonly nearest: number;
}

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
    const open = squares(draft, footprint, taken, isOpenGround).filter(
      (square) => square.nearest >= minDistance,
    );
    const paved = (): readonly Square[] =>
      squares(draft, footprint, taken, isPassableGround).filter(
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

/** The first tier that holds a square, evaluated lazily in order. */
function firstNonEmpty(
  tiers: readonly (() => readonly Square[])[],
): readonly Square[] | undefined {
  for (const tier of tiers) {
    const pool = tier();
    if (pool.length > 0) {
      return pool;
    }
  }
  return undefined;
}

/**
 * Every `size` square in row order whose columns all pass `ground`, sit
 * off the boundary, stand on one level, and claim no hook tile.
 */
function squares(
  draft: MapDraft,
  size: number,
  taken: ReadonlySet<number>,
  ground: GroundTest,
): Square[] {
  const found: Square[] = [];
  for (let z = 1; z + size < draft.depth; z++) {
    for (let x = 1; x + size < draft.width; x++) {
      const tiles = squareAt(draft, x, z, size, ground);
      if (tiles === undefined) {
        continue;
      }
      const level = tiles[0]?.y;
      if (
        tiles.some((tile) => tile.y !== level || taken.has(draft.tileKey(tile)))
      ) {
        continue;
      }
      found.push({
        tiles,
        nearest: Math.min(
          ...tiles.map((tile) => distanceToDeploy(draft, tile)),
        ),
      });
    }
  }
  return found;
}

/** The ground tiles of the square at (x0, z0), or undefined when a column fails. */
function squareAt(
  draft: MapDraft,
  x0: number,
  z0: number,
  size: number,
  ground: GroundTest,
): TileCoord[] | undefined {
  const tiles: TileCoord[] = [];
  for (let z = z0; z < z0 + size; z++) {
    for (let x = x0; x < x0 + size; x++) {
      if (!ground(draft, x, z) || isBoundaryColumn(draft, x, z)) {
        return undefined;
      }
      tiles.push(draft.groundCoord(x, z));
    }
  }
  return tiles;
}

/** Every tile any hook placed so far claims, for keeping clear of them. */
function hookTiles(draft: MapDraft): TileCoord[] {
  return [
    ...draft.hooks.deployZones,
    ...draft.hooks.objectives,
    ...draft.hooks.edgeSpawns,
    ...(draft.hooks.extraction === undefined ? [] : [draft.hooks.extraction]),
  ].flatMap((hook) => hook.tiles);
}
