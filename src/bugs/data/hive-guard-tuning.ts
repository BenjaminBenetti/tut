import type { HiveGuardTuning } from "../model/hive-guard-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * Shipped weights (#1179): the guard throws at whatever its volley
 * hurts most, and finishes off what it can.
 *
 * - **Value is the unit.** `valueWeight` (1) scores a target by the
 *   share of its remaining hit points one volley is expected to take:
 *   5 damage at 65 % into a full 16 hit point squad is about 0.2, into
 *   a 50 hit point mech about 0.07. The guard picks the squad.
 * - **A kill is worth half a volley more.** `killWeight` (0.5) lifts a
 *   target a top-of-range hit would finish above any other that is not
 *   worth half its hit points more, so a wounded squad at the edge of
 *   its reach is taken before a fresh one standing closer.
 */
export const HIVE_GUARD_TUNING: HiveGuardTuning = {
  valueWeight: 1,
  killWeight: 0.5,
};
