import type { CityId } from "./city";

// ===========================================
// Tunnel sabotage spec
// ===========================================

/**
 * The spread a Tunnel Sabotage offer is racing (campaign arc §6.7, ADR
 * 0013 §2.2): the city tunnelling toward its neighbour, and the day its
 * next spread is due. The briefing counts down to that day, and the
 * offer lapses on it.
 *
 * ```
 *   offer made on day D, city's cooldown c after today's spread step
 *     ──► spreadDueDay = D + max(1, c)            (nextSpreadDay)
 *     ──► expiresDay   = spreadDueDay              the offer lapses as the city spreads
 *   won          ──► the city's spread held for 10 days (holdSpread)
 *   lost/lapsed  ──► nothing: the spread happens as normal
 * ```
 *
 * Frozen when the offer is made; plain serializable data. Optional on
 * `Mission`, so no save needs a migration.
 */
export interface TunnelSabotageSpec {
  /** The city about to spread; the offer's own city. */
  readonly cityId: CityId;
  /** The overworld day the city's next spread is due, and the offer lapses. */
  readonly spreadDueDay: number;
}
