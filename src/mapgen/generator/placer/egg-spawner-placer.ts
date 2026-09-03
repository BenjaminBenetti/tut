import { DIRECTIONS } from "../../../core/model/direction";
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
  hatchSpace,
  hookTileKeys,
  reachableFromDeploy,
  snapshotDraft,
} from "./placer-support";

// ===========================================
// Constants
// ===========================================

/** Minimum manhattan distance between two spawners. */
const MIN_SPREAD = 6;

/** Share of spawners placed indoors when interiors are available. */
const INTERIOR_SHARE = 0.5;

/** Default hatch radius written into `meta` when the recipe gives none. */
const DEFAULT_HATCH_RADIUS = 3;

/**
 * Fewest infantry-reachable tiles a spawner needs within its hatch radius
 * (itself included) so hatched bugs have somewhere to stand. The
 * connectivity pass only adds passability, so the count holds on the
 * final map.
 */
export const HATCH_SPACE_MIN = 6;

/** A candidate tile and whether it is inside a building. */
interface Candidate {
  readonly coord: TileCoord;
  readonly interior: boolean;
}

// ===========================================
// EggSpawnerPlacer
// ===========================================

/**
 * Places egg spawners (GDD §6.3): point hooks at least
 * `minDistanceFromDeploy` from any deploy tile, spread at least
 * `MIN_SPREAD` apart, half of them inside buildings when interiors exist,
 * with at least `HATCH_SPACE_MIN` infantry-reachable tiles within the
 * hatch radius, preferring tiles infantry can already reach. The rest of
 * the map's open ground is the fallback so the count is always met.
 */
export class EggSpawnerPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.EGG_SPAWNER;
  readonly priority = 10;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` spawner hooks to the objectives. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, params, registries, rng, diagnostics } = context;
    const snapshot = snapshotDraft(draft, params, registries);
    const reachable = reachableFromDeploy(draft, snapshot, PassMask.INFANTRY);
    const radius = hatchRadiusOf(requirement);
    const minDistance = requirement.minDistanceFromDeploy ?? 0;
    const taken = hookTileKeys(draft);
    const all = collectCandidates(draft).filter(
      (c) =>
        !taken.has(draft.tileKey(c.coord)) &&
        distanceToDeploy(draft, c.coord) >= minDistance,
    );
    const roomy = all.filter(
      (c) =>
        hatchSpace(snapshot, c.coord, radius, PassMask.INFANTRY) >=
        HATCH_SPACE_MIN,
    );
    const spacious = roomy.length >= requirement.count ? roomy : all;
    const preferred = spacious.filter((c) => reachable(c.coord));
    const pool = preferred.length >= requirement.count ? preferred : spacious;
    if (pool.length === 0) {
      diagnostics.note("no candidate tiles for egg spawners");
      return;
    }
    const placed: TileCoord[] = [];
    let remaining = rng.shuffle(pool);
    for (let i = 0; i < requirement.count; i++) {
      if (remaining.length === 0) {
        remaining = rng.shuffle(
          pool.filter((c) => !placed.some((p) => sameColumn(p, c.coord))),
        );
        if (remaining.length === 0) {
          break;
        }
      }
      const wantInterior = i < Math.ceil(requirement.count * INTERIOR_SHARE);
      const interior = remaining.filter((c) => c.interior);
      const pick =
        wantInterior && interior.length > 0 ? interior[0] : remaining[0];
      if (pick === undefined) {
        break;
      }
      placed.push(pick.coord);
      draft.addHook(
        "objectives",
        HookKinds.EGG_SPAWNER,
        [pick.coord],
        requirement.requiredPass,
        {
          hatchRadius: radius,
          ...requirement.meta,
        },
      );
      remaining = remaining.filter(
        (c) => manhattanDistance(c.coord, pick.coord) >= MIN_SPREAD,
      );
    }
    diagnostics.note(
      `${placed.length}/${requirement.count} egg spawners, ` +
        `${placed.filter((p) => draft.getTile(p) !== undefined).length} indoors`,
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/** Interior floor tiles and open ground away from the map edge. */
function collectCandidates(draft: MapDraft): Candidate[] {
  const candidates: Candidate[] = [];
  for (const tile of draft.tiles()) {
    if (
      tile.surface === SurfaceIds.FLOOR &&
      draft.propAt(tile) === undefined &&
      !hasDoor(draft, tile) &&
      !isEntrance(draft, tile)
    ) {
      candidates.push({
        coord: { x: tile.x, y: tile.y, z: tile.z },
        interior: true,
      });
    }
  }
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (isOpenGround(draft, x, z) && !isBoundaryColumn(draft, x, z)) {
        candidates.push({ coord: draft.groundCoord(x, z), interior: false });
      }
    }
  }
  return candidates;
}

/** True when any edge of the tile holds a door. */
function hasDoor(draft: MapDraft, tile: TileCoord): boolean {
  return DIRECTIONS.some(
    (direction) => draft.wallAt(tile, direction) === "door",
  );
}

/** True when the tile is a building entrance. */
function isEntrance(draft: MapDraft, tile: TileCoord): boolean {
  return draft.buildings.some((b) =>
    b.entrances.some(
      (e) => e.tile.x === tile.x && e.tile.y === tile.y && e.tile.z === tile.z,
    ),
  );
}

/** The recipe's hatch radius, or the default when it gives none. */
function hatchRadiusOf(requirement: HookRequirement): number {
  const radius = requirement.meta?.hatchRadius;
  return typeof radius === "number" ? radius : DEFAULT_HATCH_RADIUS;
}

/** Column equality. */
function sameColumn(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.z === b.z && a.y === b.y;
}
