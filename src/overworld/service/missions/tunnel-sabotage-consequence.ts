import type {
  MissionConsequenceContext,
  MissionConsequenceRule,
} from "../../model/mission-consequence-rule";
import type { Mission } from "../../model/mission";
import type { MissionResult } from "../../model/mission-result";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";
import { holdSpread } from "../spread-cooldown-service";

// ===========================================
// Tunnel sabotage: consequences
// ===========================================

/**
 * What a tunnel sabotage does to its city (arc §6.7).
 *
 * **Played:** a win holds the city's spread: its spread cooldown is set
 * to `tuning.tunnelSabotage.holdDays` (10) through `holdSpread`, which
 * the spread step then ticks down like any other, so the spread that
 * was due is cancelled and the city spreads no sooner than 10 days on.
 * Anything short of a win (lost, abandoned, extracted with a mouth
 * still open) changes nothing: the spread happens as normal. The
 * resolver's `infestationDelta` is not applied either way; the spread
 * is what the mission is about, and the arc pays nothing else.
 *
 * **Lapsed:** nothing. The offer lapses on the day the city spreads,
 * and the spread is the cost of ignoring it, so the type carries no
 * ignore penalty on top.
 *
 * ```
 *   played  tunnels sealed ∧ won ──► holdSpread(city, holdDays) ──► SpreadHeld
 *           otherwise            ──► unchanged
 *   lapsed                       ──► unchanged
 * ```
 *
 * The city is the spec's, else the offer's. Whether the tunnels were
 * sealed is read without the tactical layer's types: the resolver's
 * `tunnelsSealed` of `tunnelsTotal` when it reported them, otherwise
 * every reported objective complete, otherwise (auto-resolved) the
 * outcome alone.
 */
export const TUNNEL_SABOTAGE_CONSEQUENCE: MissionConsequenceRule = {
  typeId: "tunnel-sabotage",

  /** A win with the tunnels sealed holds the city's spread; anything else changes nothing. */
  onResolved(
    state: OverworldState,
    mission: Mission,
    result: MissionResult,
    ctx: MissionConsequenceContext,
  ): OverworldApplied<OverworldState> {
    if (result.outcome !== "won" || !tunnelsSealed(result)) {
      return { state, events: [] };
    }
    return holdSpread(
      state,
      mission.tunnelSabotage?.cityId ?? mission.cityId,
      ctx.tuning.tunnelSabotage.holdDays,
    );
  },

  /** Nothing: the city spreads as it was going to. */
  onExpired(state: OverworldState): OverworldApplied<OverworldState> {
    return { state, events: [] };
  },
};

// ===========================================
// Helpers
// ===========================================

/**
 * Whether every tunnel mouth was sealed: the resolver's count when it
 * reported one, otherwise every reported objective complete, otherwise
 * (no objectives reported: auto-resolved) true, leaving the outcome to
 * decide.
 *
 * @param result - What the resolver reported.
 */
export function tunnelsSealed(result: MissionResult): boolean {
  if (result.tunnelsSealed !== undefined && result.tunnelsTotal !== undefined) {
    return result.tunnelsSealed >= result.tunnelsTotal;
  }
  if (result.objectives !== undefined && result.objectives.length > 0) {
    return result.objectives.every((objective) => objective.complete);
  }
  return true;
}
