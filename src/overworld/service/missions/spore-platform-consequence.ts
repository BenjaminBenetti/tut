import type { Mission } from "../../model/mission";
import type { MissionConsequenceRule } from "../../model/mission-consequence-rule";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";

// ===========================================
// Spore Platform: consequences
// ===========================================

/**
 * What the Spore Platform does to the overworld as a mission type:
 * nothing. Everything the finale means is the story's (arc D1, D7),
 * applied by the story service after this rule: victory on a win, and
 * on a loss +30 infestation on every city and `platform-failed`, then
 * defeat on a second. The host city is only where the squad lifts off
 * from, so the result's infestation delta is not applied to it, and a
 * pinned offer never lapses.
 *
 * ```
 *   played  unchanged   (the story rule decides victory or D7)
 *   lapsed  unchanged   (never happens: the offer is pinned)
 * ```
 */
export const SPORE_PLATFORM_CONSEQUENCE: MissionConsequenceRule = {
  typeId: "spore-platform",

  /** Nothing of the type's own: the story rule resolves the finale. */
  onResolved(
    state: OverworldState,
    _mission: Mission,
  ): OverworldApplied<OverworldState> {
    return { state, events: [] };
  },

  /** Nothing: a pinned offer never lapses. */
  onExpired(
    state: OverworldState,
    _mission: Mission,
  ): OverworldApplied<OverworldState> {
    return { state, events: [] };
  },
};
