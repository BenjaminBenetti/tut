import { manhattanDistance } from "../../../core/service/grid-math";
import { SurfaceIds } from "../../data/surfaces";
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
 * Fewest manhattan tiles between the carcass and any hook already placed
 * (#1171). A carcass beside a nest is harvested under its hatchlings; a
 * few tiles off, the detour is the player's to weigh.
 */
export const MIN_SPREAD_FROM_HOOKS = 4;

// ===========================================
// TechCarcassPlacer
// ===========================================

/**
 * Places the tech carcass (GDD §6.3, #1171): one point hook on open
 * ground the squad can walk to, at least `minDistanceFromDeploy` from
 * the deploy zone and within `maxNearestDistanceFromDeploy` of it when
 * the board allows, clear of every hook placed before it.
 *
 * ```
 *   open ground, off the boundary, on no hook tile, >= minDistance from deploy
 *     ├─ infantry can already reach it and it is within maxNearest  ──► preferred
 *     ├─ infantry can already reach it                               ──► next
 *     ├─ any of the above, but within MIN_SPREAD_FROM_HOOKS of a hook ──► after those
 *     └─ interior floor tiles                                         ──► last resort
 *   rng.shuffle(pool)[0]
 * ```
 *
 * The recipe asks for exactly one (I8), so the fallbacks widen until
 * something is found; a board with no open ground at all is one the
 * egg spawners could not be placed on either.
 */
export class TechCarcassPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.TECH_CARCASS;
  /** After the spawners and edge spawns, so it can keep clear of them. */
  readonly priority = 15;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` carcass hooks to the objectives; the recipe asks for one. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, params, registries, rng, diagnostics } = context;
    const snapshot = snapshotDraft(draft, params, registries);
    const reachable = reachableFromDeploy(draft, snapshot, PassMask.INFANTRY);
    const minDistance = requirement.minDistanceFromDeploy ?? 0;
    const maxNearest =
      requirement.maxNearestDistanceFromDeploy ?? Number.POSITIVE_INFINITY;
    const taken = hookTileKeys(draft);
    const clearOf = hookTiles(draft);
    const farEnough = (coord: TileCoord): boolean =>
      !taken.has(draft.tileKey(coord)) &&
      distanceToDeploy(draft, coord) >= minDistance;
    const spread = (coord: TileCoord): boolean =>
      clearOf.every(
        (tile) => manhattanDistance(tile, coord) >= MIN_SPREAD_FROM_HOOKS,
      );
    const outdoor = openGround(draft).filter(farEnough);
    const tiers: readonly (readonly TileCoord[])[] = [
      outdoor.filter(
        (c) =>
          spread(c) && reachable(c) && distanceToDeploy(draft, c) <= maxNearest,
      ),
      outdoor.filter((c) => spread(c) && reachable(c)),
      outdoor.filter(reachable),
      outdoor,
      interiorFloors(draft).filter(farEnough),
    ];
    let placed = 0;
    for (let i = 0; i < requirement.count; i++) {
      const pool = tiers.find((tier) => tier.length > 0);
      if (pool === undefined) {
        break;
      }
      const pick = rng.shuffle([...pool])[0];
      if (pick === undefined) {
        break;
      }
      draft.addHook(
        "objectives",
        HookKinds.TECH_CARCASS,
        [pick],
        requirement.requiredPass,
        requirement.meta,
      );
      placed += 1;
    }
    diagnostics.note(
      `${String(placed)}/${String(requirement.count)} tech carcasses`,
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/** Every tile any hook placed so far claims, for keeping clear of them. */
function hookTiles(draft: MapDraft): TileCoord[] {
  return [
    ...draft.hooks.deployZones,
    ...draft.hooks.objectives,
    ...draft.hooks.edgeSpawns,
    ...(draft.hooks.extraction === undefined ? [] : [draft.hooks.extraction]),
  ].flatMap((hook) => hook.tiles);
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

/** Interior floor tiles with nothing standing on them. */
function interiorFloors(draft: MapDraft): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (const tile of draft.tiles()) {
    if (tile.surface === SurfaceIds.FLOOR && draft.propAt(tile) === undefined) {
      tiles.push({ x: tile.x, y: tile.y, z: tile.z });
    }
  }
  return tiles;
}
