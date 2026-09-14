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
 * What a deployed turret is (#1138, GDD §6.2.4): the stats every turret
 * fights with, frozen into one template per mission the way a species
 * is, and the battery it runs on. An engineer puts one down within two
 * tiles for an action; it goes on overwatch at once and again as every
 * player turn opens, fires twice per watch with the rough power of a
 * rifle, and burns out after `batteryTurns` player turns, exactly as a
 * scanner does.
 *
 * ```
 *   deployed on turn T, batteryTurns 3
 *
 *   turn   T      T+1    T+2    T+3
 *   left   3      2      1      0  ──► TurretBurnedOut, hp 0, gone
 *   watch  ✓      ✓      ✓      ─      (two shots each bug phase)
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
  /** Player turns a fresh turret runs before its battery dies. Positive integer. */
  readonly batteryTurns: number;
  /** Model graphics draws it with. */
  readonly modelId: ModelAssetId;
}

// ===========================================
// Helpers
// ===========================================

/**
 * True for a living turret whose battery still holds (#1138): it goes
 * on overwatch as the player turn opens and its gun sweeps. The one
 * predicate the rules and the renderer share, so "burnt out" is
 * answered in one place, as `radarIsActive` answers it for a scanner.
 */
export function turretIsActive(
  unit: Pick<Unit, "kind" | "hp" | "turnsLeft">,
): boolean {
  return unit.kind === "turret" && unit.hp > 0 && (unit.turnsLeft ?? 0) > 0;
}

/**
 * True for a turret that ran its battery down (#1138), as opposed to
 * one the bugs destroyed: the renderer leaves a smoking husk for the
 * first and a death burst for the second.
 */
export function turretBurnedOut(
  unit: Pick<Unit, "kind" | "hp" | "turnsLeft">,
): boolean {
  return unit.kind === "turret" && unit.hp <= 0 && unit.turnsLeft === 0;
}
