import { manhattanDistance } from "../../../core/service/grid-math";
import { allHooks } from "../../model/hook";
import type { MapDraft } from "../../model/map-draft";
import type { MapRecipe } from "../../model/map-recipe";
import type { UnitClass } from "../../model/pass-mask";
import type { MapGenRegistries } from "../../model/registries";
import type { ResolvedMapGenParams } from "../../model/resolved-params";
import type { TileCoord } from "../../model/tile-coord";
import { freezeDraft } from "../../service/draft-freezer";
import { isBoundaryColumn } from "../../service/draft-queries";
import type { ReachabilitySnapshot } from "../../service/hatch-space";
export { hatchSpace } from "../../service/hatch-space";
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

/** Every tile any hook placed so far claims, for keeping clear of them. */
export function hookTiles(draft: MapDraft): TileCoord[] {
  return [
    ...draft.hooks.deployZones,
    ...draft.hooks.objectives,
    ...draft.hooks.edgeSpawns,
    ...(draft.hooks.extraction === undefined ? [] : [draft.hooks.extraction]),
  ].flatMap((hook) => hook.tiles);
}

// ===========================================
// Level squares
// ===========================================

/** Which columns a square may stand on: open ground, or any passable ground. */
export type GroundTest = (draft: MapDraft, x: number, z: number) => boolean;

/** A candidate square zone: its ground tiles and its nearest deploy distance. */
export interface LevelSquare {
  readonly tiles: readonly TileCoord[];
  readonly nearest: number;
}

/**
 * Every `size` × `size` square in row order whose columns all pass
 * `ground`, sit off the boundary, stand on one level, and claim no hook
 * tile in `taken`: the candidates a square objective (a wreck, a tunnel
 * mouth) is drawn from.
 *
 * @param draft - The draft being placed on.
 * @param size - The square's side in tiles.
 * @param taken - Keys of tiles a hook already claims.
 * @param ground - Which columns the square may stand on.
 */
export function levelSquares(
  draft: MapDraft,
  size: number,
  taken: ReadonlySet<number>,
  ground: GroundTest,
): LevelSquare[] {
  const found: LevelSquare[] = [];
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

/**
 * The first tier that holds a candidate, evaluated lazily in order, or
 * undefined when every tier is empty.
 *
 * @param tiers - Candidate pools from the most to the least preferred.
 */
export function firstNonEmpty<T>(
  tiers: readonly (() => readonly T[])[],
): readonly T[] | undefined {
  for (const tier of tiers) {
    const pool = tier();
    if (pool.length > 0) {
      return pool;
    }
  }
  return undefined;
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

// ===========================================
// Reachability on a draft
// ===========================================

/** The interim draft frozen once so several queries share the work. */
export type DraftSnapshot = ReachabilitySnapshot;

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
