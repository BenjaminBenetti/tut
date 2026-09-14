import { ok } from "../../core/model/result";
import { actingUnit } from "./acting-unit";
import type { OverwatchCommand } from "../model/overwatch-command";
import type { TacticalHandler } from "../model/tactical-handler";
import { UNIT_STATUS_CHANGED } from "../model/unit-status-changed-event";
import { enterOverwatch } from "./overwatch-status";

// ===========================================
// Handler
// ===========================================

/**
 * Applies an `Overwatch` (GDD §6.2): the unit spends every remaining
 * action point and gains the `overwatch` status, with as many reaction
 * shots as its gun grants (`enterOverwatch`, #1138), which
 * `overwatchReaction` spends on the enemy steps it can fire at and
 * `refreshSides` lets lapse at the unit's next turn. Pure; draws nothing.
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
  const acting = actingUnit(mission, unitId, 1);
  if (!acting.ok) {
    return acting;
  }
  const unit = acting.value;
  const watching = enterOverwatch(
    { ...unit, ap: 0 },
    mission.templates[unit.templateId]?.weapons ?? [],
  );
  const { status } = watching;
  return ok({
    state: {
      ...mission,
      units: mission.units.map((candidate) =>
        candidate.id === unitId ? watching : candidate,
      ),
    },
    events: [{ type: UNIT_STATUS_CHANGED, payload: { unitId, status } }],
  });
};
