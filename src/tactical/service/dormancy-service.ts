import type { TacticalState } from "../model/tactical-state";
import type { UnitId } from "../model/unit";
import { isDormant } from "../model/unit";

// ===========================================
// Resting bugs
// ===========================================

/**
 * The bugs that sit out the current bug phase (#1179, campaign arc
 * §7.5): every living `dormant` bug, and — during a bug phase — every
 * member of a brood that woke in this same bug phase. The one predicate
 * the synchronous bug phase, the Jev activation and the Jev driver all
 * read, so a sleeping brood costs no behaviour scoring, no pathing and
 * no relay call anywhere.
 *
 * ```
 *   woke in …                       acts in …
 *   player phase of turn N    ──►   bug phase of turn N      (the next one)
 *   bug phase of turn N       ──►   bug phase of turn N + 1  (sits this one out)
 *   (a fire at the phase's opening, an overwatch shot, a bug's stray blow)
 * ```
 *
 * A brood woken while the bugs are already moving does not join them:
 * the phase's actors were fixed when it opened, and a bug that could
 * wake and act before the squad sees it stir would be an ambush the
 * player had no turn to answer.
 *
 * @param mission - The mission in progress.
 * @returns The ids of living bugs that must not act now; empty when there are none.
 */
export function restingBugIds(mission: TacticalState): ReadonlySet<UnitId> {
  const resting = new Set<UnitId>();
  for (const unit of mission.units) {
    if (unit.team === "bugs" && unit.hp > 0 && isDormant(unit)) {
      resting.add(unit.id);
    }
  }
  if (mission.phase !== "bugs") {
    return resting;
  }
  for (const brood of mission.broods ?? []) {
    if (brood.woke?.phase === "bugs" && brood.woke.turn === mission.turn) {
      for (const memberId of brood.memberIds) {
        resting.add(memberId);
      }
    }
  }
  return resting;
}
