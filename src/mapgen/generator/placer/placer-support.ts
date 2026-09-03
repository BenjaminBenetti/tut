import { manhattanDistance } from "../../../core/service/grid-math";
import { allHooks } from "../../model/hook";
import type { MapDraft } from "../../model/map-draft";
import type { MapRecipe } from "../../model/map-recipe";
import type { UnitClass } from "../../model/pass-mask";
import type { MapGenRegistries } from "../../model/registries";
import type { ResolvedMapGenParams } from "../../model/resolved-params";
import type { Tile } from "../../model/tile";
import type { TileCoord } from "../../model/tile-coord";
import { freezeDraft } from "../../service/draft-freezer";
import { ReachabilityService } from "../../service/reachability-service";
import { TileIndex } from "../../service/tile-index";

// ===========================================
// Deploy-relative queries
// ===========================================

/** Every tile of every deploy zone placed so far. */
export function deployTiles(draft: MapDraft): TileCoord[] {
  return draft.hooks.deployZones.flatMap((zone) => zone.tiles);
}

/** Manhattan distance to the nearest deploy tile; Infinity with none. */
export function distanceToDeploy(draft: MapDraft, coord: TileCoord): number {
  let best = Number.POSITIVE_INFINITY;
  for (const tile of deployTiles(draft)) {
    best = Math.min(best, manhattanDistance(tile, coord));
  }
  return best;
}

/** Keys of every tile any hook already claims. */
export function hookTileKeys(draft: MapDraft): Set<number> {
  const keys = new Set<number>();
  const groups = {
    deployZones: draft.hooks.deployZones,
    objectives: draft.hooks.objectives,
    edgeSpawns: draft.hooks.edgeSpawns,
    extraction: draft.hooks.extraction ?? {
      id: "",
      kind: "",
      tiles: [],
      requiredPass: 0,
    },
  };
  for (const hook of allHooks(groups)) {
    for (const tile of hook.tiles) {
      keys.add(draft.tileKey(tile));
    }
  }
  return keys;
}

// ===========================================
// Reachability on a draft
// ===========================================

/** The interim draft frozen once so several queries share the work. */
export interface DraftSnapshot {
  readonly index: TileIndex;
  readonly reach: ReachabilityService;
}

/**
 * Freezes the draft as it stands so placers can ask reachability
 * questions under the real §5 rule instead of re-deriving it.
 */
export function snapshotDraft(
  draft: MapDraft,
  params: ResolvedMapGenParams,
  registries: MapGenRegistries,
): DraftSnapshot {
  const map = freezeDraft(draft, recipeFor(params), registries);
  const index = new TileIndex(map);
  return { index, reach: new ReachabilityService(index, map.connectors) };
}

/**
 * Answers "can this class reach the coordinate from a deploy zone" on a
 * snapshot. Placers use it to prefer reachable tiles; the connectivity
 * pass is the guarantee.
 */
export function reachableFromDeploy(
  draft: MapDraft,
  snapshot: DraftSnapshot,
  unitClass: UnitClass,
): (coord: TileCoord) => boolean {
  const { index, reach } = snapshot;
  const reachable = reach.reachableFrom(deployTiles(draft), unitClass);
  return (coord: TileCoord): boolean => {
    const tile = index.getAt(coord);
    return tile !== undefined && reachable.has(index.keyOf(tile));
  };
}

/**
 * How many tiles the class can reach from `origin` (itself included)
 * without stepping further than `radius` columns from it, under the §5
 * rule: the room a spawner has to hatch into. Zero when the origin has
 * no tile or the class cannot stand there.
 *
 * ```
 *   . # . . .      # wall  o counted  x beyond the radius
 *   o # o o x      radius 2 from S: 8 tiles, the wall keeps the
 *   o S o o x      far side out unless a door connects it
 *   o # o o x
 * ```
 */
export function hatchSpace(
  snapshot: DraftSnapshot,
  origin: TileCoord,
  radius: number,
  unitClass: UnitClass,
): number {
  const { index, reach } = snapshot;
  const start = index.getAt(origin);
  if (start === undefined || (start.pass & unitClass) === 0) {
    return 0;
  }
  const seen = new Set<number>([index.keyOf(start)]);
  const queue: Tile[] = [start];
  // Pushing while iterating is the queue: array iterators see appended tiles.
  for (const tile of queue) {
    for (const next of reach.neighbours(tile, unitClass)) {
      const key = index.keyOf(next);
      const spread = Math.abs(next.x - origin.x) + Math.abs(next.z - origin.z);
      if (seen.has(key) || spread > radius) {
        continue;
      }
      seen.add(key);
      queue.push(next);
    }
  }
  return seen.size;
}

/** A throwaway recipe so the freezer can stamp the interim map. */
function recipeFor(params: ResolvedMapGenParams): MapRecipe {
  return {
    seed: "",
    params: {
      archetype: params.archetype,
      biome: params.biome.id,
      settlement: params.settlement.id,
      size: { width: params.width, depth: params.depth },
      hooks: params.hooks,
    },
  };
}
