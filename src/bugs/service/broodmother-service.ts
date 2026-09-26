import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { BROODMOTHER_TUNING } from "../data/broodmother-tuning";
import type { BroodmotherTuning } from "../model/broodmother-tuning";

// ===========================================
// Constants
// ===========================================

/** The Broodmother's species id: what a placed one carries as `Unit.sourceId`. */
export const BROODMOTHER_SPECIES_ID: BugSpeciesId = "broodmother";

// ===========================================
// Hit points
// ===========================================

/**
 * The Broodmother's hit points for a mission (#1179, campaign arc
 * §6.8): her base, a little more for every difficulty step above 1,
 * and a quarter more of that for every scar — each earlier escape. The
 * nemesis record passes the scars; Alpha Hunt's setup passes both.
 *
 * ```
 *   round( (hpBase + hpPerDifficulty·max(0, difficulty − 1))
 *          · (1 + scarHpBonus·max(0, scars)) )
 *
 *   shipped:  d1 → 60   d5 → 68   d10 → 78      one scar: d5 → 85
 * ```
 *
 * @param difficulty - The mission's difficulty, 1 or more.
 * @param scars - Earlier escapes; 0 for a Broodmother never met.
 * @param tuning - Her numbers; the shipped set by default.
 * @returns Her max hit points, a positive whole number.
 */
export function broodmotherHp(
  difficulty: number,
  scars: number,
  tuning: BroodmotherTuning = BROODMOTHER_TUNING,
): number {
  const base =
    tuning.hpBase + tuning.hpPerDifficulty * Math.max(0, difficulty - 1);
  return Math.max(
    1,
    Math.round(base * (1 + tuning.scarHpBonus * Math.max(0, scars))),
  );
}

// ===========================================
// Predicates
// ===========================================

/** True when `unit` is a Broodmother: a bug of her species, alive or not. */
export function isBroodmother(unit: Pick<Unit, "team" | "sourceId">): boolean {
  return unit.team === "bugs" && unit.sourceId === BROODMOTHER_SPECIES_ID;
}

/**
 * True when a Broodmother flees rather than lays and keeps her
 * distance (#1179, arc §6.8): once she has turned (`Unit.fleeing`), or
 * whenever her hit points are at or below `fleeAtHpFraction` of her max.
 * The second clause lets the behaviour run for the edge in the very
 * phase the wound lands, before the flight step has marked her.
 *
 * @param unit - The Broodmother.
 * @param tuning - Her numbers; the shipped set by default.
 * @returns Whether she is fleeing.
 */
export function isFleeing(
  unit: Pick<Unit, "hp" | "maxHp" | "fleeing">,
  tuning: BroodmotherTuning = BROODMOTHER_TUNING,
): boolean {
  return (
    unit.fleeing === true || unit.hp <= unit.maxHp * tuning.fleeAtHpFraction
  );
}

// ===========================================
// Queries
// ===========================================

/**
 * True when a Broodmother has escaped this mission by the map edge
 * (#1179, arc §6.8): what Alpha Hunt's objective fails on and what the
 * nemesis record reads to give her a scar. Reads `TacticalState.escaped`,
 * never the log.
 *
 * @param state - The mission.
 * @returns Whether any Broodmother has left the map.
 */
export function broodmotherEscaped(state: TacticalState): boolean {
  return (state.escaped ?? []).some(isBroodmother);
}
