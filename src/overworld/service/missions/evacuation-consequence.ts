import type {
  MissionConsequenceContext,
  MissionConsequenceRule,
  MissionSettlement,
} from "../../model/mission-consequence-rule";
import type { Mission } from "../../model/mission";
import type { MissionResult } from "../../model/mission-result";
import type { StipendWindow } from "../../model/mission-tuning";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";
import { queueStipendModifier } from "../stipend-modifier-service";

// ===========================================
// Constants
// ===========================================

/** The stipend modifier a saved evacuation grants; a second win refreshes it. */
export const EVACUATION_SAVED_SOURCE = "evacuation-saved";

/** The stipend modifier a lost or ignored evacuation costs; a second one refreshes it. */
export const EVACUATION_LOST_SOURCE = "evacuation-lost";

/**
 * The tactical objective kind that counts the groups aboard, read off
 * the result's generic rows so the overworld never imports tactical
 * types (ADR 0013 §2.3).
 */
export const RESCUE_OBJECTIVE_KIND = "rescue-civilians";

// ===========================================
// Evacuation: consequences
// ===========================================

/**
 * What an evacuation does to the campaign (arc §6.4). It moves no
 * city's infestation: the people left, the bugs did not. It pays and
 * costs through the stipend, the government's gratitude or its anger.
 *
 * **Settled:** every group walked aboard adds the offer's
 * `creditsPerGroup` to the credits, whatever the outcome (a group flown
 * out is flown out), and the resolver's infestation change is zeroed so
 * the debrief says what the campaign does.
 *
 * **Played:** saved (at least half the groups aboard, as the rescue
 * objective counts it) lifts the stipend by half for ten payments;
 * anything else, a loss or an extraction that left too many behind,
 * cuts it by a tenth for ten.
 *
 * **Lapsed:** the same cut.
 *
 * ```
 *   settled  credits + creditsPerGroup × civiliansRescued; infestationDelta 0
 *   played   saved ──► stipend × savedStipend.factor for savedStipend.days  (source evacuation-saved)
 *            else  ──► stipend × lostStipend.factor for lostStipend.days    (source evacuation-lost)
 *   lapsed   stipend × lostStipend.factor for lostStipend.days             (source evacuation-lost)
 * ```
 *
 * **Overlap:** each outcome's window refreshes rather than stacks
 * (`queueStipendModifier` by source): two evacuations saved in a row
 * give one ×1.5 restarted at ten days, never ×2.25, and two lost give
 * one ×0.9. A win and a loss are different sources, so both run and
 * multiply (×1.35) until the older one ends; an event's modifiers
 * multiply with either, as they always have. The windows count
 * payments: one granted at a launch covers the next ten daily
 * stipends, and one granted by a lapse covers that day's and the nine
 * after.
 */
export const EVACUATION_CONSEQUENCE: MissionConsequenceRule = {
  typeId: "evacuation",

  /** Credits for every group aboard on top of the outcome's; no infestation change. */
  settle(mission: Mission, result: MissionResult): MissionSettlement {
    return {
      creditsAwarded:
        result.creditsAwarded +
        (mission.evacuation?.creditsPerGroup ?? 0) *
          (result.civiliansRescued ?? 0),
      infestationDelta: 0,
    };
  },

  /** The stipend lifted for a saved evacuation, cut for any other. */
  onResolved(
    state: OverworldState,
    _mission: Mission,
    result: MissionResult,
    ctx: MissionConsequenceContext,
  ): OverworldApplied<OverworldState> {
    const tuning = ctx.tuning.evacuation;
    return evacueesSaved(result)
      ? queueWindow(state, EVACUATION_SAVED_SOURCE, tuning.savedStipend)
      : queueWindow(state, EVACUATION_LOST_SOURCE, tuning.lostStipend);
  },

  /** The stipend cut: the people were left where they were. */
  onExpired(
    state: OverworldState,
    _mission: Mission,
    ctx: MissionConsequenceContext,
  ): OverworldApplied<OverworldState> {
    return queueWindow(
      state,
      EVACUATION_LOST_SOURCE,
      ctx.tuning.evacuation.lostStipend,
    );
  },
};

// ===========================================
// Helpers
// ===========================================

/**
 * Whether the evacuation saved its city: the result's rescue objective
 * complete (at least half the groups aboard, by the objective's own
 * count) when the resolver reported one, otherwise (auto-resolved, no
 * objectives) a won outcome. Read by the debrief as well, so the
 * tagline and the stipend agree.
 */
export function evacueesSaved(result: MissionResult): boolean {
  const rescue = result.objectives?.find(
    (objective) => objective.kind === RESCUE_OBJECTIVE_KIND,
  );
  return rescue === undefined ? result.outcome === "won" : rescue.complete;
}

/** The overworld with `window` queued as a stipend modifier of `source`. */
function queueWindow(
  state: OverworldState,
  source: string,
  window: StipendWindow,
): OverworldApplied<OverworldState> {
  return {
    state: {
      ...state,
      stipendModifiers: queueStipendModifier(state.stipendModifiers, {
        factor: window.factor,
        daysLeft: window.days,
        source,
      }),
    },
    events: [],
  };
}
