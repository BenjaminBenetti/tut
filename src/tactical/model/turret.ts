import type { ModelAssetId } from "../../content/data/model-ids";
import type { Unit } from "./unit";
import type { UnitWeapon } from "./unit-weapon";

// ===========================================
// Turret
// ===========================================

/**
 * The source id every deployed turret is built from, and the id of the
 * equipment that deploys it (#1138). A turret has no roster entry: its
 * `Unit.sourceId` is this, so the names resolver falls through to the
 * template's name and the debrief finds nothing to bring home.
 */
export const TURRET_SOURCE_ID = "turret";

/**
 * The source id of a garrison turret (#1155): one of the region's
 * defensive batteries, standing on the map when the mission opens. Its
 * own id so it gets its own template (`"turret:garrison-turret"`, named
 * for what it is) while everything that reads `kind === "turret"` treats
 * it exactly as an engineer's.
 */
export const GARRISON_TURRET_SOURCE_ID = "garrison-turret";

/**
 * What a deployed turret is (#1138, GDD §6.2.4): the stats every turret
 * fights with, frozen into one template per mission the way a species
 * is, and the battery it runs on. An engineer puts one down within two
 * tiles for an action; it goes on overwatch at once and again as every
 * player turn opens, fires twice per watch with the rough power of a
 * rifle, and burns out after `batteryTurns` player turns, exactly as a
 * scanner does. A garrison turret (#1155) is the same tuning without a
 * battery: it runs on the region's mains and watches every turn until
 * the bugs pull it down.
 *
 * ```
 *   deployed on turn T, batteryTurns 3
 *
 *   turn   T      T+1    T+2    T+3
 *   left   3      2      1      0  ──► TurretBurnedOut, hp 0, gone
 *   watch  ✓      ✓      ✓      ─      (two shots each bug phase)
 *
 *   garrison, no batteryTurns
 *
 *   turn   1      2      3      …      until hp 0 ──► TurretDestroyed
 *   left   —      —      —      —
 *   watch  ✓      ✓      ✓      ✓
 * ```
 */
export interface TurretTuning {
  /** What the card and the log call it, e.g. `"Turret"`. */
  readonly name: string;
  /** Hit points; a turret is a box of metal, sturdier than a squad. Positive integer. */
  readonly maxHp: number;
  /** Damage absorbed per hit. Non-negative integer. */
  readonly armor: number;
  /** Tiles it sees, for fog of war; a rifle squad's. Positive integer. */
  readonly sightRange: number;
  /** The one gun it fires on overwatch; its profile says how many shots a watch gets. */
  readonly weapon: UnitWeapon;
  /**
   * Player turns a fresh turret runs before its battery dies. Positive
   * integer, or absent for a turret on mains (#1155): it has no battery,
   * never burns out, and its unit carries no `turnsLeft`.
   */
  readonly batteryTurns?: number;
  /** Model graphics draws it with. */
  readonly modelId: ModelAssetId;
}

// ===========================================
// Helpers
// ===========================================

/**
 * True for a turret that runs on a battery (#1138) rather than on mains
 * (#1155): its `turnsLeft` drains as each player turn opens. A turret
 * without one never burns out.
 */
export function turretHasBattery(
  unit: Pick<Unit, "kind" | "turnsLeft">,
): boolean {
  return unit.kind === "turret" && unit.turnsLeft !== undefined;
}

/**
 * True for a living turret whose battery still holds, or that has none
 * (#1138, #1155): it goes on overwatch as the player turn opens and its
 * gun sweeps. The one predicate the rules and the renderer share, so
 * "burnt out" is answered in one place, as `radarIsActive` answers it
 * for a scanner.
 *
 * ```
 *   hp > 0   turnsLeft     active
 *   yes      3             yes     an engineer's, battery holding
 *   yes      absent        yes     a garrison turret on mains
 *   yes      0             no      (never stored: burning out zeroes hp too)
 *   no       any           no      burnt out or destroyed
 * ```
 */
export function turretIsActive(
  unit: Pick<Unit, "kind" | "hp" | "turnsLeft">,
): boolean {
  return (
    unit.kind === "turret" &&
    unit.hp > 0 &&
    (unit.turnsLeft === undefined || unit.turnsLeft > 0)
  );
}

/**
 * True for a turret that ran its battery down (#1138), as opposed to
 * one the bugs destroyed: the renderer leaves a smoking husk for the
 * first and a death burst for the second. A garrison turret has no
 * battery to run down, so it is never burnt out.
 */
export function turretBurnedOut(
  unit: Pick<Unit, "kind" | "hp" | "turnsLeft">,
): boolean {
  return unit.kind === "turret" && unit.hp <= 0 && unit.turnsLeft === 0;
}

/**
 * True for a turret the bugs (or a stray blast, or a fire) took down
 * (#1155): dead with battery still in it, or dead with no battery at
 * all. The complement of `turretBurnedOut` among dead turrets, so a
 * turret's end is always exactly one of the two.
 */
export function turretDestroyed(
  unit: Pick<Unit, "kind" | "hp" | "turnsLeft">,
): boolean {
  return unit.kind === "turret" && unit.hp <= 0 && unit.turnsLeft !== 0;
}
