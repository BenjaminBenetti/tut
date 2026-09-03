import type { Rng } from "../../../core/model/rng";
import { manhattanDistance } from "../../../core/service/grid-math";
import type { GenerationContext } from "../../model/generation-pass";
import { HookKinds } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { MapDraft } from "../../model/map-draft";
import type { HookRequirement } from "../../model/map-recipe";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import {
  isBoundaryColumn,
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

/** Edge spawns keep at least this far from any deploy tile. */
const MIN_DISTANCE_FROM_DEPLOY = 12;

/** Zone size along the edge. */
const ZONE_MIN = 4;
const ZONE_MAX = 6;

/** Distinct zones keep at least this far apart. */
const ZONE_GAP = 8;

/** Seeds are drawn from the farthest third of the candidates. */
const FAR_SHARE = 1 / 3;

// ===========================================
// EdgeSpawnPlacer
// ===========================================

/**
 * Places edge spawn zones (GDD §6.3): short runs of boundary tiles far
 * from the deploy zones, on passable ground, preferring tiles bugs can
 * walk from into the map. Zones sit on different stretches of edge.
 *
 * ```
 *   SSSSS.............      north edge, far from D
 *   .................
 *   ...............DDD
 * ```
 */
export class EdgeSpawnPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.EDGE_SPAWN;
  readonly priority = 10;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` zones to the edge spawns. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, params, registries, rng, diagnostics } = context;
    const reachable = reachableFromDeploy(
      draft,
      snapshotDraft(draft, params, registries),
      PassMask.INFANTRY,
    );
    const taken = hookTileKeys(draft);
    let candidates = boundaryCandidates(draft, taken);
    const preferred = candidates.filter(reachable);
    if (preferred.length >= ZONE_MIN) {
      candidates = preferred;
    }
    let placed = 0;
    for (let i = 0; i < requirement.count; i++) {
      if (candidates.length === 0) {
        diagnostics.note(`no edge left for spawn zone ${i}`);
        break;
      }
      const seed = pickFarSeed(draft, candidates, rng);
      const size = rng.nextInt(ZONE_MIN, ZONE_MAX);
      const tiles = growAlongEdge(draft, seed, size, candidates);
      draft.addHook(
        "edgeSpawns",
        HookKinds.EDGE_SPAWN,
        tiles,
        requirement.requiredPass,
        requirement.meta,
      );
      placed++;
      candidates = candidates.filter((c) =>
        tiles.every((t) => manhattanDistance(t, c) >= ZONE_GAP),
      );
    }
    diagnostics.note(`${placed}/${requirement.count} edge spawn zones`);
  }
}

// ===========================================
// Helpers
// ===========================================

/** Passable boundary ground far enough from the deploy zones. */
function boundaryCandidates(
  draft: MapDraft,
  taken: ReadonlySet<number>,
): TileCoord[] {
  const out: TileCoord[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (!isBoundaryColumn(draft, x, z) || !isPassableGround(draft, x, z)) {
        continue;
      }
      const coord = draft.groundCoord(x, z);
      if (
        !taken.has(draft.tileKey(coord)) &&
        distanceToDeploy(draft, coord) >= MIN_DISTANCE_FROM_DEPLOY
      ) {
        out.push(coord);
      }
    }
  }
  return out;
}

/** A random candidate among the farthest third from the deploy zones. */
function pickFarSeed(
  draft: MapDraft,
  candidates: readonly TileCoord[],
  rng: Rng,
): TileCoord {
  const sorted = [...candidates].sort(
    (a, b) => distanceToDeploy(draft, b) - distanceToDeploy(draft, a),
  );
  const far = sorted.slice(
    0,
    Math.max(1, Math.ceil(sorted.length * FAR_SHARE)),
  );
  return rng.pick(far);
}

/**
 * Walks the boundary both ways from the seed collecting candidate tiles
 * until the zone reaches `size` or the edge runs out of candidates.
 */
function growAlongEdge(
  draft: MapDraft,
  seed: TileCoord,
  size: number,
  candidates: readonly TileCoord[],
): TileCoord[] {
  const keys = new Set(candidates.map((c) => draft.tileKey(c)));
  const alongX = seed.z === 0 || seed.z === draft.depth - 1;
  const tiles: TileCoord[] = [seed];
  for (const step of [1, -1]) {
    for (let offset = 1; tiles.length < size; offset++) {
      const x = alongX ? seed.x + step * offset : seed.x;
      const z = alongX ? seed.z : seed.z + step * offset;
      if (!draft.inBounds(x, z)) {
        break;
      }
      const coord = draft.groundCoord(x, z);
      if (!keys.has(draft.tileKey(coord))) {
        break;
      }
      tiles.push(coord);
    }
  }
  return tiles;
}
