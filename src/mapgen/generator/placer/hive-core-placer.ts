import type { GenerationContext } from "../../model/generation-pass";
import { HookKinds, type HookMeta } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { MapDraft } from "../../model/map-draft";
import type { HookRequirement } from "../../model/map-recipe";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import { chamberAt } from "../../service/cavern-queries";
import { isOpenGround } from "../../service/draft-queries";
import {
  distanceToDeploy,
  hookTileKeys,
  reachableFromDeploy,
  snapshotDraft,
} from "./placer-support";

// ===========================================
// Constants
// ===========================================

/** Side of the square a hive core covers when no cavern planned its pad. */
const FALLBACK_PAD_SIZE = 3;

// ===========================================
// HiveCorePlacer
// ===========================================

/**
 * Places the hive core (#1179): a square zone the squad must reach and
 * destroy. On a hive cavern it is the core pad the carve left level in
 * the deepest chamber, so the core is always at the far end of the main
 * route. On any other map it is the flat, open square farthest from the
 * deploy zone that a mech can reach, so the kind works on every
 * archetype.
 *
 * Deterministic: the pad is planned, and the fallback is a scan. A pad
 * nearer the drop ship than `minDistanceFromDeploy` is still placed and
 * noted, and invariant I8 reports it.
 *
 * ```
 *   meta { chamberId: "chamber-5", footprint: 3 }   // chamberId on caverns only
 * ```
 */
export class HiveCorePlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.HIVE_CORE;
  /** After the deploy zones it measures from, before anything that avoids it. */
  readonly priority = 5;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` hive core zones to the objectives. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, diagnostics } = context;
    for (let n = 0; n < requirement.count; n++) {
      const pad =
        n === 0 && draft.cavern !== undefined
          ? cavernPad(draft)
          : farthestPad(draft, context);
      if (pad === undefined) {
        diagnostics.note("no flat open square for the hive core");
        return;
      }
      const distance = Math.min(
        ...pad.tiles.map((tile) => distanceToDeploy(draft, tile)),
      );
      if (distance < (requirement.minDistanceFromDeploy ?? 0)) {
        diagnostics.note(
          `hive core only ${String(distance)} from deploy`,
          pad.tiles[0],
        );
      }
      const chamber = chamberAt(
        draft,
        pad.tiles[0]?.x ?? -1,
        pad.tiles[0]?.z ?? -1,
      );
      const meta: HookMeta = {
        ...(chamber === undefined ? {} : { chamberId: chamber.id }),
        footprint: pad.size,
        ...requirement.meta,
      };
      draft.addHook(
        "objectives",
        HookKinds.HIVE_CORE,
        pad.tiles,
        requirement.requiredPass,
        meta,
      );
    }
  }
}

// ===========================================
// Pads
// ===========================================

/** A square of ground tiles and its side. */
interface Pad {
  readonly tiles: readonly TileCoord[];
  readonly size: number;
}

/** The cavern's planned core pad, on the ground it was levelled to. */
function cavernPad(draft: MapDraft): Pad | undefined {
  const pad = draft.cavern?.corePad;
  if (pad === undefined) return undefined;
  return { tiles: squareAt(draft, pad.x, pad.z, pad.size), size: pad.size };
}

/**
 * The flat open square farthest from deploy, preferring squares a mech
 * can reach; scan order breaks ties.
 */
function farthestPad(
  draft: MapDraft,
  context: GenerationContext,
): Pad | undefined {
  const snapshot = snapshotDraft(draft, context.params, context.registries);
  const reachable = reachableFromDeploy(draft, snapshot, PassMask.MECH);
  const taken = hookTileKeys(draft);
  let best: { tiles: TileCoord[]; score: number } | undefined;
  for (let z = 0; z + FALLBACK_PAD_SIZE <= draft.depth; z++) {
    for (let x = 0; x + FALLBACK_PAD_SIZE <= draft.width; x++) {
      const tiles = squareAt(draft, x, z, FALLBACK_PAD_SIZE);
      const level = tiles[0]?.y;
      const usable = tiles.every(
        (tile) =>
          tile.y === level &&
          isOpenGround(draft, tile.x, tile.z) &&
          !taken.has(draft.tileKey(tile)),
      );
      if (!usable) continue;
      const reach = tiles.some(reachable) ? 1_000_000 : 0;
      const score =
        reach + Math.min(...tiles.map((tile) => distanceToDeploy(draft, tile)));
      if (best === undefined || score > best.score) best = { tiles, score };
    }
  }
  return best === undefined
    ? undefined
    : { tiles: best.tiles, size: FALLBACK_PAD_SIZE };
}

/** The ground tiles of a `size` square by its lowest corner. */
function squareAt(
  draft: MapDraft,
  x0: number,
  z0: number,
  size: number,
): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = z0; z < z0 + size; z++) {
    for (let x = x0; x < x0 + size; x++) tiles.push(draft.groundCoord(x, z));
  }
  return tiles;
}
