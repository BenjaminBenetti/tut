// ===========================================
// Objective tuning
// ===========================================

/**
 * Balance knobs for working objectives and leaving the map (GDD §6.2:
 * "interact with objective"; §6.3: destroying egg spawners is the
 * baseline objective). Services receive a tuning object rather than
 * importing the defaults, so tests and difficulty settings can
 * substitute their own. Defaults live in `tactical/data/objective-tuning.ts`.
 *
 * ```
 *   Interact:  manhattan(unit, spawner) <= interactRange
 *              ap − interactApCost, spawner.hp − chargeDamage
 *              hp <= 0 ──► spawner destroyed, its objective complete
 *
 *   Extract:   unit.pos is an extraction tile
 *              ap − extractApCost, unit leaves `units` for `extracted`
 * ```
 */
export interface ObjectiveTuning {
  /** Action points one `Interact` costs. Positive integer. */
  readonly interactApCost: number;
  /** Manhattan tiles an interacting unit may stand from its objective. Non-negative integer. */
  readonly interactRange: number;
  /** Hit points one `Interact` takes off an egg spawner. Positive integer. */
  readonly chargeDamage: number;
  /** Action points `Extract` costs; `0` lets a spent unit still walk out. Non-negative integer. */
  readonly extractApCost: number;
}
