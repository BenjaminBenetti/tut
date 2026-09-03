import { err, ok } from "../../core/model/result";
import type { OverwatchCommand } from "../model/overwatch-command";
import type { TacticalHandler } from "../model/tactical-handler";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import type { UnitStatus } from "../model/unit";
import { UNIT_STATUS_CHANGED } from "../model/unit-status-changed-event";

// ===========================================
// Handler
// ===========================================

/**
 * Applies an `Overwatch` (GDD §6.2): the unit spends every remaining
 * action point and gains the `overwatch` status, which `overwatchReaction`
 * consumes on the first enemy step it can fire at and `refreshSides`
 * lets lapse at the unit's next turn. Pure; draws nothing.
 *
 * ```
 *   unit missing ──► err unit-not-on-map      down ──► err unit-dead
 *   not its side's phase ──► err wrong-phase  no actions left ──► err no-action-points
 *   otherwise ──► ap 0, status + overwatch, UnitStatusChanged
 * ```
 */
export const overwatchHandler: TacticalHandler<OverwatchCommand> = (
  mission,
  command,
) => {
  const { unitId } = command.payload;
  const unit = mission.units.find((candidate) => candidate.id === unitId);
  if (unit === undefined) {
    return err({ kind: "unit-not-on-map", unitId });
  }
  if (unit.hp <= 0) {
    return err({ kind: "unit-dead", unitId });
  }
  if (unit.team !== TEAM_FOR_PHASE[mission.phase]) {
    return err({ kind: "wrong-phase", unitId });
  }
  if (unit.ap <= 0) {
    return err({ kind: "no-action-points", unitId });
  }
  const status: readonly UnitStatus[] = unit.status.includes("overwatch")
    ? unit.status
    : [...unit.status, "overwatch"];
  return ok({
    state: {
      ...mission,
      units: mission.units.map((candidate) =>
        candidate.id === unitId ? { ...candidate, ap: 0, status } : candidate,
      ),
    },
    events: [{ type: UNIT_STATUS_CHANGED, payload: { unitId, status } }],
  });
};
