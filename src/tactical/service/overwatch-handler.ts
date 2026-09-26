import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { actingUnit } from "./acting-unit";
import type { OverwatchCommand } from "../model/overwatch-command";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalHandler } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
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
 *   no weapon to watch with ──► err no-such-weapon
 *   otherwise ──► ap 0, status + overwatch, UnitStatusChanged
 * ```
 */
export const overwatchHandler: TacticalHandler<OverwatchCommand> = (
  mission,
  command,
) => {
  const { unitId } = command.payload;
  const acting = validateOverwatch(mission, unitId);
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

// ===========================================
// Validation
// ===========================================

/**
 * Whether `unitId` may go on overwatch, asked by the handler and by the
 * wheel alike: the acting preconditions at one action point, then a
 * weapon to watch with. A civilian group carries none (campaign arc
 * §6.4), and a watch with nothing to fire spent the turn for nothing.
 *
 * ```
 *   actingUnit(1 AP) refuses ──► that refusal
 *   no weapon on the template ──► no-such-weapon
 *   otherwise                 ──► the unit
 * ```
 *
 * @param mission - The mission the unit is in.
 * @param unitId - The unit that would watch.
 * @returns The unit when it may watch, or why it may not.
 */
export function validateOverwatch(
  mission: TacticalState,
  unitId: UnitId,
): Result<Unit, TacticalError> {
  const acting = actingUnit(mission, unitId, 1);
  if (!acting.ok) {
    return acting;
  }
  const weapons = mission.templates[acting.value.templateId]?.weapons ?? [];
  return weapons.length === 0
    ? err({ kind: "no-such-weapon", unitId })
    : acting;
}
