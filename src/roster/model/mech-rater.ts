import type { Mech } from "./mech";

/**
 * Scores a built mech for the M1 auto-resolver. The overworld depends on
 * this interface rather than on the loadout validation service, so the
 * resolver can be tested with a stub and the roster can change how a
 * rating is derived without touching mission code.
 */
export interface MechRater {
  /**
   * Combat rating of the mech as built, before any damage penalty. Never
   * negative; `0` for a mech whose loadout no longer validates.
   */
  rateMech(mech: Mech): number;
}
