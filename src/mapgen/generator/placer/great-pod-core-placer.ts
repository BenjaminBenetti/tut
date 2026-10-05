import type { GenerationContext } from "../../model/generation-pass";
import { HookKinds } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { HookRequirement } from "../../model/map-recipe";
import type { TileCoord } from "../../model/tile-coord";

// ===========================================
// GreatPodCorePlacer
// ===========================================

/**
 * Places a great pod's core (#1238): the square the pod's plan left at
 * its middle, lowest corner first, so the mission stands a 3×3 core with
 * that tile as its anchor. The core is sealed inside the hull until a
 * weapon breaches it, so its recipe asks for `requiredPass: NONE` and
 * the connectivity pass never tries to dig a way in.
 *
 * ```
 *   draft.greatPod.core { x, z, size } ──► one hook, size² tiles, meta { footprint: size }
 *   no great pod                       ──► noted; invariant I8 reports the missing hook
 * ```
 *
 * Only the first of `count` has a pod to stand on: a great pod has one
 * core.
 */
export class GreatPodCorePlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.GREAT_POD_CORE;
  /** After the deploy zones, with the other objectives. */
  readonly priority = 5;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds the pod's core square to the objectives. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, diagnostics } = context;
    const core = draft.greatPod?.core;
    if (core === undefined) {
      diagnostics.note("no great pod: its core has nowhere to stand");
      return;
    }
    if (requirement.count < 1) return;
    const tiles: TileCoord[] = [];
    for (let z = core.z; z < core.z + core.size; z++) {
      for (let x = core.x; x < core.x + core.size; x++) {
        tiles.push(draft.groundCoord(x, z));
      }
    }
    draft.addHook(
      "objectives",
      HookKinds.GREAT_POD_CORE,
      tiles,
      requirement.requiredPass,
      { footprint: core.size, ...requirement.meta },
    );
    if (requirement.count > 1) {
      diagnostics.note(
        `a great pod has one core; ${String(requirement.count - 1)} not placed`,
      );
    }
  }
}
