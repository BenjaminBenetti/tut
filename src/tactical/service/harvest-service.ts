import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { manhattanDistance } from "../../core/service/grid-math";
import { CARCASS_HARVESTED } from "../model/carcass-harvested-event";
import type { HarvestCarcassCommand } from "../model/harvest-carcass-command";
import type { ObjectiveTuning } from "../model/objective-tuning";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalHandler } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import type { TechCarcass, TechCarcassId } from "../model/tech-carcass";
import type { Unit, UnitId } from "../model/unit";
import { isInfantrySquad } from "../model/unit";

// ===========================================
// Types
// ===========================================

/** A carcass a squad can strip from where it stands. */
export interface ReachableCarcass {
  readonly carcass: TechCarcass;
  /** Manhattan tiles between the squad and the carcass. */
  readonly distance: number;
}

/** What a harvest the rules would accept looks like: who strips what. */
export interface HarvestCheck {
  readonly unit: Unit;
  readonly carcass: TechCarcass;
}

// ===========================================
// Validation
// ===========================================

/**
 * The `HarvestCarcass` precondition set, asked as a question (#1171).
 * The handler applies it; the wheel and `reachableCarcasses` ask it, so
 * a HUD that offers only what this accepts can never offer a command
 * the handler refuses.
 *
 * ```
 *   unit missing ──► unit-not-on-map      down ──► unit-dead
 *   not a TDF squad ──► not-a-squad       other side's phase ──► wrong-phase
 *   no actions ──► no-action-points       unknown carcass ──► unknown-carcass
 *   already stripped ──► carcass-already-harvested
 *   manhattan(unit, carcass) > interactRange ──► carcass-out-of-reach
 * ```
 *
 * Harvesting is the interact action pointed at a carcass, so it shares
 * `ObjectiveTuning`'s cost and reach rather than carrying its own.
 */
export function validateHarvest(
  mission: TacticalState,
  unitId: UnitId,
  carcassId: TechCarcassId,
  tuning: ObjectiveTuning,
): Result<HarvestCheck, TacticalError> {
  const acting = actingSquad(mission, unitId, tuning);
  if (!acting.ok) {
    return acting;
  }
  const carcass = mission.carcasses.find(
    (candidate) => candidate.id === carcassId,
  );
  if (carcass === undefined) {
    return err({ kind: "unknown-carcass", carcassId });
  }
  if (carcass.harvested) {
    return err({ kind: "carcass-already-harvested", carcassId });
  }
  const distance = manhattanDistance(acting.value.pos, carcass.pos);
  if (distance > tuning.interactRange) {
    return err({
      kind: "carcass-out-of-reach",
      carcassId,
      distance,
      range: tuning.interactRange,
    });
  }
  return ok({ unit: acting.value, carcass });
}

/**
 * The carcasses the unit could strip right now, nearest first; empty
 * for anything that is not a squad free to act. Ties keep `carcasses`
 * order. Pure; reads only its arguments.
 */
export function reachableCarcasses(
  mission: TacticalState,
  unitId: UnitId,
  tuning: ObjectiveTuning,
): readonly ReachableCarcass[] {
  const acting = actingSquad(mission, unitId, tuning);
  if (!acting.ok) {
    return [];
  }
  const reachable: ReachableCarcass[] = [];
  for (const carcass of mission.carcasses) {
    if (carcass.harvested) {
      continue;
    }
    const distance = manhattanDistance(acting.value.pos, carcass.pos);
    if (distance <= tuning.interactRange) {
      reachable.push({ carcass, distance });
    }
  }
  return reachable.sort((a, b) => a.distance - b.distance);
}

// ===========================================
// HarvestCarcass
// ===========================================

/**
 * Builds the `HarvestCarcass` handler (#1171, GDD §6.3). On success the
 * carcass is marked harvested, the squad pays the interact action, and
 * `CarcassHarvested` carries the points into the log, which is where
 * the resolver reads them back: the state holds no running total, so a
 * replay and the debrief agree by construction.
 *
 * ```
 *   validateHarvest ──► err ──► the refusal, nothing spent
 *          │
 *          ▼
 *   carcass.harvested = true, ap − interactApCost
 *   CarcassHarvested { unitId, carcassId, techPoints }
 * ```
 *
 * Harvesting never ends the mission: the force still has to get home.
 * Pure; draws nothing.
 */
export function createHarvestHandler(
  tuning: ObjectiveTuning,
): TacticalHandler<HarvestCarcassCommand> {
  return (mission, command) => {
    const { unitId, carcassId } = command.payload;
    const checked = validateHarvest(mission, unitId, carcassId, tuning);
    if (!checked.ok) {
      return checked;
    }
    const { carcass } = checked.value;
    const state: TacticalState = {
      ...mission,
      units: mission.units.map((candidate) =>
        candidate.id === unitId
          ? { ...candidate, ap: candidate.ap - tuning.interactApCost }
          : candidate,
      ),
      carcasses: mission.carcasses.map((candidate) =>
        candidate.id === carcassId
          ? { ...candidate, harvested: true }
          : candidate,
      ),
    };
    return ok({
      state,
      events: [
        {
          type: CARCASS_HARVESTED,
          payload: { unitId, carcassId, techPoints: carcass.techPoints },
        },
      ],
    });
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The unit as a squad free to spend the interact action: on the map,
 * standing, a TDF infantry squad, in its own phase, with the points.
 */
function actingSquad(
  mission: TacticalState,
  unitId: UnitId,
  tuning: ObjectiveTuning,
): Result<Unit, TacticalError> {
  const unit = mission.units.find((candidate) => candidate.id === unitId);
  if (unit === undefined) {
    return err({ kind: "unit-not-on-map", unitId });
  }
  if (unit.hp <= 0) {
    return err({ kind: "unit-dead", unitId });
  }
  // Stripping a carcass is infantry work (GDD §6.3).
  if (!isInfantrySquad(unit)) {
    return err({ kind: "not-a-squad", unitId });
  }
  if (unit.team !== TEAM_FOR_PHASE[mission.phase]) {
    return err({ kind: "wrong-phase", unitId });
  }
  if (unit.ap < tuning.interactApCost) {
    return err({ kind: "no-action-points", unitId });
  }
  return ok(unit);
}
