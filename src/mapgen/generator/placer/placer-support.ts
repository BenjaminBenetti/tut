import { manhattanDistance } from "../../../core/service/grid-math";
import { allHooks } from "../../model/hook";
import type { MapDraft } from "../../model/map-draft";
import type { MapRecipe } from "../../model/map-recipe";
import type { UnitClass } from "../../model/pass-mask";
import type { MapGenRegistries } from "../../model/registries";
import type { ResolvedMapGenParams } from "../../model/resolved-params";
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

/**
 * Freezes the draft as it stands and answers "can this class reach the
 * coordinate from a deploy zone" under the real §5 rule. Placers use it
 * to prefer reachable tiles; the connectivity pass is the guarantee.
 */
export function reachableFromDeploy(
  draft: MapDraft,
  params: ResolvedMapGenParams,
  registries: MapGenRegistries,
  unitClass: UnitClass,
): (coord: TileCoord) => boolean {
  const map = freezeDraft(draft, recipeFor(params), registries);
  const index = new TileIndex(map);
  const reach = new ReachabilityService(index, map.connectors);
  const reachable = reach.reachableFrom(deployTiles(draft), unitClass);
  return (coord: TileCoord): boolean => {
    const tile = index.getAt(coord);
    return tile !== undefined && reachable.has(index.keyOf(tile));
  };
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
