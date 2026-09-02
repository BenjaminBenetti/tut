import type { MechLoadout } from "./mech-loadout";

// ===========================================
// Types
// ===========================================

/**
 * Identifier of an owned mech, issued by core's `IdGenerator` with the
 * `"mech"` prefix (e.g. `"mech-2"`). Plain string, matching the
 * generator's contract.
 */
export type MechId = string;

// ===========================================
// Constants
// ===========================================

/** `damage` at which a mech is destroyed and, with its parts, gone (GDD §5.7). */
export const MECH_MAX_DAMAGE = 100;

// ===========================================
// Mech
// ===========================================

/**
 * One roster entry: a built mech that persists across missions with
 * damage, kills and experience (GDD §5.7). Plain data inside
 * `GameState.roster`, saved as-is.
 *
 * `loadout` is the mech's own copy of the template it was built from;
 * editing the saved template later does not change the mech, and part
 * upgrades (#69) apply to this copy.
 *
 * Invariants (enforced by the services that mutate mechs, not the type):
 * `damage` is an integer in `0..MECH_MAX_DAMAGE`; a mech at max damage is
 * destroyed and removed from the roster.
 */
export interface Mech {
  /** Unique id from the id generator. */
  readonly id: MechId;
  /** Player-facing name, e.g. `"Hammerhead"`. */
  readonly name: string;
  /** The parts this mech is built from. */
  readonly loadout: MechLoadout;
  /** Accumulated damage, `0` (pristine) to `MECH_MAX_DAMAGE` (destroyed). */
  readonly damage: number;
  /** Lifetime confirmed kills across missions. */
  readonly kills: number;
  /** Missions the mech has returned from. */
  readonly missionsSurvived: number;
  /** Accumulated experience points. */
  readonly xp: number;
}
