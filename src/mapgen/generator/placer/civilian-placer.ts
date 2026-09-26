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
// Types
// ===========================================

/** An interior floor tile a group could shelter on, and whose building it is. */
interface Shelter {
  readonly tile: TileCoord;
  readonly buildingId: string;
}

// ===========================================
// CivilianPlacer
// ===========================================

/**
 * Places the trapped civilian groups of an evacuation map (campaign arc
 * §6.4): one point hook per group on a ground-floor interior tile, one
 * group to a building, on a tile infantry can already walk to from the
 * drop zone, so a rescuer can stand beside it and the group can walk
 * out the way the rescuer came in.
 *
 * ```
 *   ┌──────────┐    ┌───────┐
 *   │  C       │    │     C │     C  one group, inside, ground floor
 *   │        ▯ door ▯       │
 *   └──────────┘    └───────┘
 *
 *   floor-0 interior floor, no prop, no stair foot, on no hook tile,
 *   >= minDistance from deploy
 *     ├─ in a building with no group yet, reachable  ──► preferred
 *     ├─ in a building with no group yet             ──► the connectivity pass repairs
 *     ├─ in any building, reachable                  ──► more groups than buildings
 *     └─ open ground, reachable                      ──► a board with no interiors
 *   rng.pick a building, then rng.pick a tile inside it
 * ```
 *
 * The recipe asks for an exact count (I8), so the tiers widen until
 * every group has a tile. A reachable ground-floor tile always has a
 * reachable neighbour on its own floor, which is where the rescuer
 * stands: the path that reaches it came through one, since stair feet
 * are excluded.
 */
export class CivilianPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.CIVILIAN;
  /**
   * After the spawners and edge spawns, before the carcass: the groups
   * shelter where the town already is, and the carcass keeps clear of
   * them.
   */
  readonly priority = 12;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` civilian hooks to the objectives, one building each. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, params, registries, rng, diagnostics } = context;
    const snapshot = snapshotDraft(draft, params, registries);
    const reachable = reachableFromDeploy(draft, snapshot, PassMask.INFANTRY);
    const minDistance = requirement.minDistanceFromDeploy ?? 0;
    const taken = hookTileKeys(draft);
    const free = (coord: TileCoord): boolean =>
      !taken.has(draft.tileKey(coord)) &&
      distanceToDeploy(draft, coord) >= minDistance;
    const shelters = interiorShelters(draft).filter((shelter) =>
      free(shelter.tile),
    );
    const outdoor = openGround(draft).filter(free);
    const used = new Set<string>();
    let placed = 0;
    for (let i = 0; i < requirement.count; i++) {
      const open = shelters.filter(
        (shelter) =>
          !used.has(shelter.buildingId) &&
          !taken.has(draft.tileKey(shelter.tile)),
      );
      const any = shelters.filter(
        (shelter) => !taken.has(draft.tileKey(shelter.tile)),
      );
      const tiers: readonly (readonly Shelter[])[] = [
        open.filter((shelter) => reachable(shelter.tile)),
        open,
        any.filter((shelter) => reachable(shelter.tile)),
        outdoor
          .filter((tile) => !taken.has(draft.tileKey(tile)) && reachable(tile))
          .map((tile) => ({ tile, buildingId: "" })),
      ];
      const pool = tiers.find((tier) => tier.length > 0);
      const pick = pool === undefined ? undefined : pickShelter(pool, rng);
      if (pick === undefined) {
        break;
      }
      draft.addHook(
        "objectives",
        HookKinds.CIVILIAN,
        [pick.tile],
        requirement.requiredPass,
        requirement.meta,
      );
      taken.add(draft.tileKey(pick.tile));
      used.add(pick.buildingId);
      placed += 1;
    }
    diagnostics.note(
      `${String(placed)}/${String(requirement.count)} civilian groups in ${String(
        [...used].filter((id) => id !== "").length,
      )} buildings`,
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * One shelter from the pool: a building first, every building with
 * room equally likely whatever its size, then a tile inside it. Picking
 * the tile straight from the pool would crowd the groups into the
 * biggest buildings.
 */
function pickShelter(
  pool: readonly Shelter[],
  rng: GenerationContext["rng"],
): Shelter | undefined {
  if (pool.length === 0) {
    return undefined;
  }
  const buildings = [...new Set(pool.map((shelter) => shelter.buildingId))];
  const building = rng.pick(buildings);
  return rng.pick(pool.filter((shelter) => shelter.buildingId === building));
}

/**
 * Ground-floor interior floor tiles with nothing standing on them and no
 * stair or ladder landing, in the draft's tile order: where a group can
 * shelter without blocking the way up.
 */
function interiorShelters(draft: MapDraft): Shelter[] {
  const landings = new Set<number>();
  for (const connector of draft.connectors) {
    landings.add(draft.tileKey(connector.from));
    landings.add(draft.tileKey(connector.to));
  }
  const shelters: Shelter[] = [];
  for (const tile of draft.tiles()) {
    if (
      tile.surface === SurfaceIds.FLOOR &&
      tile.floorIndex === 0 &&
      tile.buildingId !== undefined &&
      draft.propAt(tile) === undefined &&
      !landings.has(draft.tileKey(tile))
    ) {
      shelters.push({
        tile: { x: tile.x, y: tile.y, z: tile.z },
        buildingId: tile.buildingId,
      });
    }
  }
  return shelters;
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
