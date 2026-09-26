import type { Rng } from "../../../core/model/rng";
import type { CraterSite } from "../../model/crater-site";
import type { GenerationContext } from "../../model/generation-pass";
import { HookKinds } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { MapDraft } from "../../model/map-draft";
import type { HookRequirement } from "../../model/map-recipe";
import { classesIn } from "../../model/pass-mask";
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
 * How much farther from the target than the nearest candidate a pod may
 * land, in columns. The pod reads as sitting in the middle of the bowl
 * without landing on the exact same column every seed.
 */
export const POD_SCATTER = 1.5;

// ===========================================
// SporePodPlacer
// ===========================================

/**
 * Places the spore pod of a crash site (campaign arc §6.3, §7): a point
 * hook on the crater floor near the centre of the bowl, on flat open
 * ground every class in `requiredPass` can already walk to, at least
 * `minDistanceFromDeploy` from the drop zone and off every hook placed
 * before it.
 *
 * ```
 *        ▁▁▂▂▃▃▃▃▃▂▂▁▁          target: draft.crater.centre
 *        ▁▂▃▄▄▄▄▄▄▄▃▂▁                  (the board's centre without a crater)
 *        ▁▂▃▄▄ ● ▄▄▃▂▁          ● the pod
 *
 *   open ground, flat, off the boundary, clear of hooks and connector ends,
 *   >= minDistance from deploy
 *     ├─ within maxNearest: on the floor, reachable       ──► only when the recipe
 *     ├─ within maxNearest: anywhere, reachable           ──► sets maxNearest
 *     ├─ on the crater floor, reachable by every required class ──► preferred
 *     ├─ on the crater floor                                    ──► the connectivity pass repairs
 *     ├─ anywhere, reachable                                    ──► no crater, or no floor left
 *     └─ anywhere                                               ──► last resort
 *   nearest to the target, rng among those within POD_SCATTER of the nearest
 * ```
 *
 * The recipe asks for exactly one (I8), so the tiers widen until
 * something is found. Without a crater — a pod asked of a settlement —
 * the target is the board's centre, so the hook still lands somewhere
 * sensible rather than failing the map.
 *
 * `maxNearestDistanceFromDeploy` is a preference, as for the other
 * placers: a scripted landing (First Skyfall) asks for the pod within
 * reach of the drop zone, and gets the reachable tile nearest the
 * bowl's centre inside that reach, on the floor if the floor comes that
 * close and on the near terraces if not. When nothing is that close the
 * ordinary tiers apply. Without it the tiers, and the draws, are
 * exactly the ordinary ones.
 */
export class SporePodPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.SPORE_POD;
  /**
   * After deploy, which it is measured from, and before the spawners,
   * edge spawns and carcass, so they keep clear of it rather than it of
   * them.
   */
  readonly priority = 5;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` pod hooks to the objectives; a crash site asks for one. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, params, registries, rng, diagnostics } = context;
    const snapshot = snapshotDraft(draft, params, registries);
    const reachers = classesIn(requirement.requiredPass).map((unitClass) =>
      reachableFromDeploy(draft, snapshot, unitClass),
    );
    const reachable = (coord: TileCoord): boolean =>
      reachers.every((reaches) => reaches(coord));
    const crater = draft.crater;
    const target = crater?.centre ?? {
      x: Math.floor(draft.width / 2),
      z: Math.floor(draft.depth / 2),
    };
    const minDistance = requirement.minDistanceFromDeploy ?? 0;
    const taken = hookTileKeys(draft);
    const ground = flatOpenGround(draft).filter(
      (coord) =>
        !taken.has(draft.tileKey(coord)) &&
        distanceToDeploy(draft, coord) >= minDistance,
    );
    const floor =
      crater === undefined
        ? []
        : ground.filter((coord) => onCraterFloor(coord, crater));
    const maxNearest = requirement.maxNearestDistanceFromDeploy;
    const near = (coord: TileCoord): boolean =>
      maxNearest !== undefined && distanceToDeploy(draft, coord) <= maxNearest;
    const tiers: readonly (readonly TileCoord[])[] = [
      ...(maxNearest === undefined
        ? []
        : [
            floor.filter((coord) => near(coord) && reachable(coord)),
            ground.filter((coord) => near(coord) && reachable(coord)),
          ]),
      floor.filter(reachable),
      floor,
      ground.filter(reachable),
      ground,
    ];
    let placed = 0;
    for (let i = 0; i < requirement.count; i++) {
      const pool = tiers
        .map((tier) => tier.filter((coord) => !taken.has(draft.tileKey(coord))))
        .find((tier) => tier.length > 0);
      if (pool === undefined) {
        break;
      }
      const pick = nearest(pool, target, rng);
      draft.addHook(
        "objectives",
        HookKinds.SPORE_POD,
        [pick],
        requirement.requiredPass,
        requirement.meta,
      );
      taken.add(draft.tileKey(pick));
      placed += 1;
    }
    diagnostics.note(
      `${String(placed)}/${String(requirement.count)} spore pods` +
        (crater === undefined ? ", no crater: board centre" : ""),
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Open ground away from the map edge, without a slope piece and without a
 * connector landing on it, in row order. A pod on a ramp's foot would
 * stand in the one way up the terrace.
 */
function flatOpenGround(draft: MapDraft): TileCoord[] {
  const landings = new Set<number>();
  for (const connector of draft.connectors) {
    landings.add(connector.from.z * draft.width + connector.from.x);
    landings.add(connector.to.z * draft.width + connector.to.x);
  }
  const tiles: TileCoord[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (
        isOpenGround(draft, x, z) &&
        !isBoundaryColumn(draft, x, z) &&
        draft.slopeAt(x, z) === undefined &&
        !landings.has(z * draft.width + x)
      ) {
        tiles.push(draft.groundCoord(x, z));
      }
    }
  }
  return tiles;
}

/** True on the bowl's flat floor: within its radius and at its level. */
function onCraterFloor(coord: TileCoord, crater: CraterSite): boolean {
  return (
    coord.y === crater.floorLevel &&
    Math.hypot(coord.x - crater.centre.x, coord.z - crater.centre.z) <=
      crater.floorRadius
  );
}

/**
 * One of the candidates nearest the target: every candidate within
 * `POD_SCATTER` of the nearest distance is equally likely.
 */
function nearest(
  pool: readonly TileCoord[],
  target: { readonly x: number; readonly z: number },
  rng: Rng,
): TileCoord {
  const distance = (coord: TileCoord): number =>
    Math.hypot(coord.x - target.x, coord.z - target.z);
  const best = Math.min(...pool.map(distance));
  const close = pool.filter((coord) => distance(coord) <= best + POD_SCATTER);
  return rng.pick(close);
}
