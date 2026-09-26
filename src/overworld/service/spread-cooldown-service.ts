import type { CityId } from "../model/city";
import type { OverworldApplied } from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import { SPREAD_HELD } from "../model/spread-held-event";
import type { SpreadCooldowns } from "../model/spread-cooldown";
import { findCity } from "./earth-map-query-service";

// ===========================================
// Queries
// ===========================================

/**
 * Days `cityId` must still wait before it may spread, as the overworld
 * stores it: 0 when it has no entry, which is off cooldown.
 *
 * @param cooldowns - The overworld's spread cooldowns.
 * @param cityId - The city to read.
 */
export function spreadCooldownOf(
  cooldowns: SpreadCooldowns,
  cityId: CityId,
): number {
  return cooldowns[cityId] ?? 0;
}

/**
 * The first day `cityId` may spread again, read after `day`'s spread
 * step (the mission director runs after it). The spread step first
 * ticks every cooldown down a day and drops the ones at 1, then lets
 * every city without an entry spread, so a city at `c` spreads on the
 * `c`-th tick from now, and one with no entry on the next.
 *
 * ```
 *   day 10, no entry ──► 11        day 10, cooldown 1 ──► 11
 *   day 10, cooldown 2 ──► 12      day 10, cooldown 5 ──► 15
 * ```
 *
 * It is when the cooldown allows it; whether the city then spreads is
 * the spread step's call (still at the threshold, a neighbour below the
 * maximum, its region not paused).
 *
 * @param cooldowns - The overworld's spread cooldowns.
 * @param cityId - The city to read.
 * @param day - The overworld day, after its spread step.
 */
export function nextSpreadDay(
  cooldowns: SpreadCooldowns,
  cityId: CityId,
  day: number,
): number {
  return day + Math.max(1, spreadCooldownOf(cooldowns, cityId));
}

// ===========================================
// Commands
// ===========================================

/**
 * Holds `cityId`'s spread for at least `days` days (arc §6.7): its
 * cooldown becomes `days`, or stays where it is if already longer, so a
 * hold never shortens a wait. The spread step then ticks it down like
 * any cooldown its own spread set. Emits `SpreadHeld` with the cooldown
 * it leaves, or nothing when the city is unknown or already waits as
 * long.
 *
 * ```
 *   cooldown 2, hold 10 ──► 10, SpreadHeld { days: 10 }
 *   cooldown 12, hold 10 ──► 12, nothing
 * ```
 *
 * @param state - The overworld.
 * @param cityId - The city to hold.
 * @param days - The least cooldown to leave; a positive integer.
 * @throws {RangeError} when `days` is not a positive integer: the spread
 *   step rejects any other cooldown, so the mistake is caught here.
 */
export function holdSpread(
  state: OverworldState,
  cityId: CityId,
  days: number,
): OverworldApplied<OverworldState> {
  if (!Number.isInteger(days) || days <= 0) {
    throw new RangeError(
      `Invalid spread hold ${String(days)} for city "${cityId}": must be a positive integer`,
    );
  }
  if (
    findCity(state.map, cityId) === undefined ||
    spreadCooldownOf(state.spreadCooldowns, cityId) >= days
  ) {
    return { state, events: [] };
  }
  return {
    state: {
      ...state,
      spreadCooldowns: { ...state.spreadCooldowns, [cityId]: days },
    },
    events: [{ type: SPREAD_HELD, payload: { cityId, days } }],
  };
}
