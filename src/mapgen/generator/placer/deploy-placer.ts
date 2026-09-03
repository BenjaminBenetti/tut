import type { Direction } from "../../../core/model/direction";
import { DIRECTIONS } from "../../../core/model/direction";
import type { Rng } from "../../../core/model/rng";
import { stepGridPos } from "../../../core/service/grid-math";
import type { GenerationContext } from "../../model/generation-pass";
import { HookKinds } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { MapDraft } from "../../model/map-draft";
import type { HookRequirement } from "../../model/map-recipe";
import type { TileCoord } from "../../model/tile-coord";
import { columnKey, isPassableGround } from "../../service/draft-queries";
import {
  buildGroundComponents,
  largestGroundComponent,
} from "../../service/ground-components";
import { MIN_DEPLOY_INFANTRY_TILES } from "../../service/map-validator";
import { hookTileKeys } from "./placer-support";

// ===========================================
// Constants
// ===========================================

/** Tiles a deploy zone grows to. */
const TARGET_TILES = 16;

/** Columns from the edge a zone may be seeded in. */
const EDGE_BAND = 4;

/** Seeds tried per edge before moving on. */
const SEEDS_PER_EDGE = 12;

/** A zone and the edge it hugs. */
interface Zone {
  readonly edge: Direction;
  readonly tiles: TileCoord[];
}

// ===========================================
// DeployPlacer
// ===========================================

/**
 * Places deploy zones: a flat, contiguous blob of passable ground grown
 * from a seed within a few columns of a map edge, at least
 * `MIN_DEPLOY_INFANTRY_TILES` tiles, no props, every tile at one level so
 * both classes can move within it (invariant I6). Extra zones take other
 * edges.
 *
 * ```
 *   edge w  ▌DDD
 *           ▌DDDD      16 tiles, one level, no props
 *           ▌DDD
 * ```
 */
export class DeployPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.DEPLOY;
  readonly priority = 0;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` zones, each on a fresh edge where possible. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, rng, diagnostics } = context;
    const usedEdges = new Set<Direction>();
    for (let i = 0; i < requirement.count; i++) {
      const zone = findZone(draft, rng.fork(`zone-${i}`), usedEdges);
      if (zone === undefined) {
        diagnostics.note(`no ground for deploy zone ${i}`);
        continue;
      }
      usedEdges.add(zone.edge);
      draft.addHook(
        "deployZones",
        HookKinds.DEPLOY,
        zone.tiles,
        requirement.requiredPass,
        requirement.meta,
      );
      diagnostics.note(
        `deploy zone of ${zone.tiles.length} tiles on edge ${zone.edge}`,
        zone.tiles[0],
      );
    }
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Tries seeds near each unused edge (then used ones) and returns the first
 * zone that reaches the target, else the largest found.
 */
function findZone(
  draft: MapDraft,
  rng: Rng,
  usedEdges: ReadonlySet<Direction>,
): Zone | undefined {
  const fresh = rng.shuffle(DIRECTIONS.filter((edge) => !usedEdges.has(edge)));
  const reused = DIRECTIONS.filter((edge) => usedEdges.has(edge));
  const taken = hookTileKeys(draft);
  const mainland = mainlandColumns(draft);
  let best: Zone | undefined;
  for (const edge of [...fresh, ...reused]) {
    const all = seedColumns(draft, edge, taken);
    const onMainland = all.filter((seed) =>
      mainland.has(columnKey(draft, seed.x, seed.z)),
    );
    const seeds = rng.shuffle(onMainland.length > 0 ? onMainland : all);
    for (const seed of seeds.slice(0, SEEDS_PER_EDGE)) {
      const tiles = growZone(draft, seed, taken);
      if (tiles.length >= TARGET_TILES) {
        return { edge, tiles };
      }
      if (best === undefined || tiles.length > best.tiles.length) {
        best = { edge, tiles };
      }
    }
    if (best !== undefined && best.tiles.length >= MIN_DEPLOY_INFANTRY_TILES) {
      return best;
    }
  }
  return best;
}

/**
 * Column keys of the largest connected ground area. Seeding there keeps
 * the deploy zone off mesas and islands nothing can reach (a ramp joins
 * one-level steps, but a two-level cliff stays a cliff).
 */
function mainlandColumns(draft: MapDraft): ReadonlySet<number> {
  const ground = buildGroundComponents(draft);
  const root = largestGroundComponent(ground);
  const keys = new Set<number>();
  if (root === undefined) {
    return keys;
  }
  for (const key of ground.nodes) {
    if (ground.components.find(key) === root) {
      keys.add(key);
    }
  }
  return keys;
}

/** Passable ground columns within the edge band, as ground coordinates. */
function seedColumns(
  draft: MapDraft,
  edge: Direction,
  taken: ReadonlySet<number>,
): TileCoord[] {
  const seeds: TileCoord[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      const distance =
        edge === "w"
          ? x
          : edge === "e"
            ? draft.width - 1 - x
            : edge === "n"
              ? z
              : draft.depth - 1 - z;
      if (distance >= EDGE_BAND || !isPassableGround(draft, x, z)) {
        continue;
      }
      const coord = draft.groundCoord(x, z);
      if (!taken.has(draft.tileKey(coord))) {
        seeds.push(coord);
      }
    }
  }
  return seeds;
}

/**
 * Breadth-first growth over passable ground at the seed's level with no
 * wall on the crossed edge and no hook on the tile, up to the target.
 */
function growZone(
  draft: MapDraft,
  seed: TileCoord,
  taken: ReadonlySet<number>,
): TileCoord[] {
  const tiles: TileCoord[] = [seed];
  const seen = new Set<number>([draft.tileKey(seed)]);
  for (const current of tiles) {
    if (tiles.length >= TARGET_TILES) {
      break;
    }
    for (const direction of DIRECTIONS) {
      const next = stepGridPos(current, direction);
      if (
        !isPassableGround(draft, next.x, next.z) ||
        draft.groundLevelAt(next.x, next.z) !== seed.y ||
        draft.wallAt(current, direction) !== undefined
      ) {
        continue;
      }
      const key = draft.tileKey(next);
      if (seen.has(key) || taken.has(key)) {
        continue;
      }
      seen.add(key);
      tiles.push(next);
      if (tiles.length >= TARGET_TILES) {
        break;
      }
    }
  }
  return tiles;
}
