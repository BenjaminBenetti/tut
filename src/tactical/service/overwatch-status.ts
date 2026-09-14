import type { Unit, UnitStatus } from "../model/unit";
import type { UnitWeapon } from "../model/unit-weapon";
import { overwatchShotsOf } from "../model/weapon-profile";

// ===========================================
// Overwatch status
// ===========================================
//
// One place that puts a unit on watch, spends a reaction shot, and
// lets the watch lapse (#1138). Before turrets, "on overwatch" was a
// status alone and every shot cleared it; a turret's gun fires twice
// per watch, so the watch now carries a count. The handler that buys a
// watch, the phase step that grants a turret one, the reaction that
// spends it and the refresh that lets it lapse all go through here, so
// the count cannot drift from the status.
//
// ```
//   enterOverwatch(unit, weapons)  ──► status + overwatch, overwatchShots = the gun's (only when > 1)
//   spendOverwatchShot(unit)       ──► shots − 1; at 0 the status goes and the count with it
//   leaveOverwatch(unit)           ──► status − overwatch, count gone
// ```

/**
 * Reaction shots the unit has left in its current watch: what it
 * recorded, or one — every watch before #1138, and every watch a
 * single-shot weapon buys, which records nothing.
 */
export function overwatchShotsLeft(unit: Pick<Unit, "overwatchShots">): number {
  return unit.overwatchShots ?? 1;
}

/**
 * The unit on overwatch with the shots its first weapon's profile
 * grants (#1138). A unit already watching keeps its status list as it
 * is, so the status is never listed twice; the count is written only
 * when the gun grants more than one, so a squad's record stays exactly
 * what it was before turrets and a save from before them needs no
 * rewrite.
 *
 * @param unit - The unit going on watch.
 * @param weapons - What it carries; the first is what a reaction fires.
 * @returns The unit, watching.
 */
export function enterOverwatch(
  unit: Unit,
  weapons: readonly UnitWeapon[],
): Unit {
  const status: readonly UnitStatus[] = unit.status.includes("overwatch")
    ? unit.status
    : [...unit.status, "overwatch"];
  const shots =
    weapons[0] === undefined ? 1 : overwatchShotsOf(weapons[0].profile);
  const { overwatchShots: _dropped, ...rest } = unit;
  return shots > 1
    ? { ...rest, status, overwatchShots: shots }
    : { ...rest, status };
}

/**
 * The unit after one reaction shot (#1138): a watch with shots to spare
 * counts one down and stays; the last shot clears the status and the
 * count together, which is what every watch did before turrets.
 *
 * @param unit - The watcher that just fired.
 * @returns The unit, still watching or clear.
 */
export function spendOverwatchShot(unit: Unit): Unit {
  const left = overwatchShotsLeft(unit) - 1;
  if (left <= 0) {
    return leaveOverwatch(unit);
  }
  return { ...unit, overwatchShots: left };
}

/**
 * The unit with its watch lapsed: the status removed and the count
 * dropped, so a stale count never outlives the status it belonged to.
 *
 * @param unit - The unit whose watch ends.
 * @returns The unit, clear.
 */
export function leaveOverwatch(unit: Unit): Unit {
  const { overwatchShots: _dropped, ...rest } = unit;
  return {
    ...rest,
    status: unit.status.filter((entry) => entry !== "overwatch"),
  };
}
