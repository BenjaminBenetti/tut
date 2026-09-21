import type { Rect } from "../../../core/model/grid";
import { manhattanDistance } from "../../../core/service/grid-math";
import type { GenerationContext } from "../../model/generation-pass";
import { HookKinds } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { MapDraft } from "../../model/map-draft";
import type { HookRequirement } from "../../model/map-recipe";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import { isBoundaryColumn, isOpenGround } from "../../service/draft-queries";
import {
  distanceToDeploy,
  hookTileKeys,
  reachableFromDeploy,
  snapshotDraft,
} from "./placer-support";

// ===========================================
// Constants
// ===========================================

/**
 * Fewest manhattan tiles between two generators (#1175). Closer and one
 * squad member covers both from a single tile; farther and a small
 * installation's yard cannot hold them.
 */
export const MIN_GENERATOR_SPREAD = 3;

/**
 * How far from the landmark's walls the search widens, ring by ring. The
 * first ring is the yard; the last is anywhere the squad can walk.
 */
export const LANDMARK_RINGS: readonly number[] = [3, 5, 8, 12];

// ===========================================
// GeneratorPlacer
// ===========================================

/**
 * Places the generators of a defend-installation map (GDD §5.4, #1175):
 * `count` point hooks on open ground around the landmark building, each
 * reachable by infantry, at least `minDistanceFromDeploy` from the drop
 * zone and `MIN_GENERATOR_SPREAD` from each other.
 *
 * ```
 *          ┌────────────┐
 *      G   │  landmark  │  G      ring 3: the yard
 *          └────────────┘
 *               G
 *
 *   open ground, off the boundary, on no hook tile, >= minDistance from deploy
 *     ├─ within ring r of the landmark, reachable, spread  ──► r = 3, 5, 8, 12
 *     ├─ anywhere reachable, spread                        ──► next
 *     ├─ anywhere reachable                                ──► then
 *     └─ any open ground                                   ──► last resort
 *   rng.shuffle(pool)[0], one hook per generator
 * ```
 *
 * Without a landmark on the draft the rings measure from the board's
 * centre instead, so a recipe that asks for generators alone still gets
 * them. The recipe asks for an exact count (I8), so the fallbacks widen
 * until every generator has a tile.
 */
export class GeneratorPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.GENERATOR;
  /** After deploy, before the edge spawns, which need no clearance from it. */
  readonly priority = 5;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` generator hooks to the objectives, one tile each. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, params, registries, rng, diagnostics } = context;
    const snapshot = snapshotDraft(draft, params, registries);
    const reachable = reachableFromDeploy(draft, snapshot, PassMask.INFANTRY);
    const minDistance = requirement.minDistanceFromDeploy ?? 0;
    const taken = hookTileKeys(draft);
    const anchor = landmarkFootprint(draft, params.landmark) ?? {
      x: Math.floor(draft.width / 2),
      z: Math.floor(draft.depth / 2),
      w: 1,
      d: 1,
    };
    const candidates = openGround(draft).filter(
      (coord) =>
        !taken.has(draft.tileKey(coord)) &&
        distanceToDeploy(draft, coord) >= minDistance,
    );
    const placed: TileCoord[] = [];
    const spread = (coord: TileCoord): boolean =>
      placed.every(
        (tile) => manhattanDistance(tile, coord) >= MIN_GENERATOR_SPREAD,
      );
    for (let i = 0; i < requirement.count; i++) {
      const free = candidates.filter(
        (coord) => !placed.some((tile) => sameColumn(tile, coord)),
      );
      const tiers: readonly (readonly TileCoord[])[] = [
        ...LANDMARK_RINGS.map((ring) =>
          free.filter(
            (c) => gapToRect(anchor, c) <= ring && reachable(c) && spread(c),
          ),
        ),
        free.filter((c) => reachable(c) && spread(c)),
        free.filter(reachable),
        free,
      ];
      const pool = tiers.find((tier) => tier.length > 0);
      const pick = pool === undefined ? undefined : rng.shuffle([...pool])[0];
      if (pick === undefined) {
        break;
      }
      draft.addHook(
        "objectives",
        HookKinds.GENERATOR,
        [pick],
        requirement.requiredPass,
        requirement.meta,
      );
      placed.push(pick);
    }
    diagnostics.note(
      `${String(placed.length)}/${String(requirement.count)} generators` +
        (params.landmark === undefined ? "" : ` around the ${params.landmark}`),
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * The first footprint rectangle of the landmark building, or undefined
 * when the draft has no building of that kind.
 */
export function landmarkFootprint(
  draft: MapDraft,
  landmark: string | undefined,
): Rect | undefined {
  if (landmark === undefined) {
    return undefined;
  }
  return draft.buildings.find((b) => b.kind === landmark)?.footprint[0];
}

/**
 * Chebyshev gap between a column and a rectangle: zero inside it, one
 * for the ring hugging its walls, and so on outward.
 */
export function gapToRect(rect: Rect, coord: { x: number; z: number }): number {
  const dx = Math.max(rect.x - coord.x, coord.x - (rect.x + rect.w - 1), 0);
  const dz = Math.max(rect.z - coord.z, coord.z - (rect.z + rect.d - 1), 0);
  return Math.max(dx, dz);
}

/** True when two coordinates share a column, whatever their layer. */
function sameColumn(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.z === b.z;
}

/** Open ground away from the map edge, in row order. */
function openGround(draft: MapDraft): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (isOpenGround(draft, x, z) && !isBoundaryColumn(draft, x, z)) {
        tiles.push(draft.groundCoord(x, z));
      }
    }
  }
  return tiles;
}
