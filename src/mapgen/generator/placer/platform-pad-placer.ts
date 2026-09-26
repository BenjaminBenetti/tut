import type { GenerationContext } from "../../model/generation-pass";
import type { HookKind, HookMeta } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { HookGroup, MapDraft } from "../../model/map-draft";
import type { HookRequirement } from "../../model/map-recipe";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import { isOpenGround } from "../../service/draft-queries";
import { platformPads } from "../../service/platform-queries";
import {
  distanceToDeploy,
  hookTileKeys,
  reachableFromDeploy,
  snapshotDraft,
} from "./placer-support";

// ===========================================
// Types
// ===========================================

/** A square of ground tiles, its side and any metadata the plan gave it. */
interface Pad {
  readonly tiles: readonly TileCoord[];
  readonly size: number;
  readonly meta?: HookMeta;
}

// ===========================================
// PlatformPadPlacer
// ===========================================

/**
 * Places a square hook the spore platform planned (#1179): the docking
 * ring, the hatch to stage 2, the core seed, the Sovereign's dais, the
 * guard posts, and the core's deploy zone at the causeway's start. One
 * class serves every such kind; each instance names its kind, hook group
 * and priority.
 *
 * On a platform the hooks are the layout's pads for the kind, in plan
 * order, on the ground they were levelled to. On any other map, and for
 * any count beyond what the plan holds, the placer falls back to the
 * flat open square of the kind's `fallbackSize` farthest from deploy
 * that a mech can reach, so the kind works on every archetype (the
 * `HiveCorePlacer` precedent).
 *
 * ```
 *   meta { footprint: 5 }                     // docking-ring, platform-core
 *   meta { footprint: 2, side: "west" }       // guard-post
 * ```
 *
 * A pad nearer deploy than `minDistanceFromDeploy` is still placed and
 * noted; invariant I8 reports it.
 */
export class PlatformPadPlacer implements HookPlacer {
  // ===========================================
  // Construction
  // ===========================================

  /**
   * Places `id` hooks into `group` at `priority`, falling back to squares
   * of `fallbackSize` off the platform.
   */
  constructor(
    readonly id: HookKind,
    readonly fallbackSize: number,
    readonly priority = 5,
    private readonly group: HookGroup = "objectives",
  ) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` hooks of the kind. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, diagnostics } = context;
    const planned = platformPads(draft, this.id).map((pad): Pad => ({
      tiles: squareAt(draft, pad.x, pad.z, pad.size),
      size: pad.size,
      ...(pad.meta === undefined ? {} : { meta: pad.meta }),
    }));
    for (let n = 0; n < requirement.count; n++) {
      const pad = planned[n] ?? this.farthestPad(draft, context);
      if (pad === undefined) {
        diagnostics.note(`no flat open square for ${this.id}`);
        return;
      }
      if (this.group !== "deployZones") {
        const distance = Math.min(
          ...pad.tiles.map((tile) => distanceToDeploy(draft, tile)),
        );
        if (distance < (requirement.minDistanceFromDeploy ?? 0)) {
          diagnostics.note(
            `${this.id} only ${String(distance)} from deploy`,
            pad.tiles[0],
          );
        }
      }
      draft.addHook(this.group, this.id, pad.tiles, requirement.requiredPass, {
        footprint: pad.size,
        ...pad.meta,
        ...requirement.meta,
      });
    }
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * The flat open square farthest from deploy, preferring squares a mech
   * can reach and never overlapping another hook; scan order breaks ties.
   */
  private farthestPad(
    draft: MapDraft,
    context: GenerationContext,
  ): Pad | undefined {
    const size = this.fallbackSize;
    const snapshot = snapshotDraft(draft, context.params, context.registries);
    const reachable =
      draft.hooks.deployZones.length === 0
        ? () => false
        : reachableFromDeploy(draft, snapshot, PassMask.MECH);
    const taken = hookTileKeys(draft);
    let best: { tiles: TileCoord[]; score: number } | undefined;
    for (let z = 0; z + size <= draft.depth; z++) {
      for (let x = 0; x + size <= draft.width; x++) {
        const tiles = squareAt(draft, x, z, size);
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
          reach +
          Math.min(...tiles.map((tile) => distanceToDeploy(draft, tile)));
        if (best === undefined || score > best.score) best = { tiles, score };
      }
    }
    return best === undefined ? undefined : { tiles: best.tiles, size };
  }
}

// ===========================================
// Helpers
// ===========================================

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
