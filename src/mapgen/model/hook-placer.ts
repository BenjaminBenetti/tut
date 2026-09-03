import type { GenerationContext } from "./generation-pass";
import type { HookKind } from "./hook";
import type { HookRequirement } from "./map-recipe";

// ===========================================
// Hook placer
// ===========================================

/**
 * Places hooks of one kind (ADR 0004 §7.4). The hook pass resolves each
 * `HookRequirement` to a placer through the registry, so a new hook kind
 * is a new placer plus a registry entry, never an edit to the pass.
 *
 * ```
 *   HookRequirement { kind: "egg-spawner", count: 3 }
 *        │  registry.get(kind)
 *        ▼
 *   EggSpawnerPlacer.place(requirement, context)  ─► draft.hooks.objectives
 * ```
 */
export interface HookPlacer {
  /** The hook kind this placer satisfies; doubles as the registry id. */
  readonly id: HookKind;
  /** Lower runs first. Deploy zones anchor every other placement. */
  readonly priority: number;

  /**
   * Adds `requirement.count` hooks to the draft. Reachability is not
   * guaranteed here (the connectivity pass repairs it) but placers prefer
   * tiles reachable from the deploy zones so repairs stay rare.
   */
  place(requirement: HookRequirement, context: GenerationContext): void;
}
