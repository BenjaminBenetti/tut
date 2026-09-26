import type { EquipmentId } from "../../tactical/model/equipment";

// ===========================================
// Ids
// ===========================================

/**
 * One campaign-wide infantry upgrade (campaign arc §10.3, D8). A closed
 * union so a tech node naming an upgrade the table does not define fails
 * to compile. Owned by `roster/` (ADR 0002 §2.1): the tech tree grants
 * upgrades by id, and the tactical side reads only the definitions.
 *
 * | Id                     | What every squad gets                          |
 * |------------------------|------------------------------------------------|
 * | `squad-armour-1`       | +1 armour                                      |
 * | `squad-armour-2`       | +1 armour more (+2 in all)                     |
 * | `frag-grenades`        | the grenade becomes a frag grenade             |
 * | `incendiary-grenades`  | the grenade becomes an incendiary grenade      |
 * | `field-medic-training` | the medic squad's medkit becomes a field medkit |
 */
export type InfantryUpgradeId =
  | "squad-armour-1"
  | "squad-armour-2"
  | "frag-grenades"
  | "incendiary-grenades"
  | "field-medic-training";

/**
 * Every infantry upgrade id, in the order upgrades are applied: armour
 * first, then the grenade ladder bottom rung first, then the medkit.
 * Append, never insert.
 */
export const INFANTRY_UPGRADE_IDS: readonly InfantryUpgradeId[] = [
  "squad-armour-1",
  "squad-armour-2",
  "frag-grenades",
  "incendiary-grenades",
  "field-medic-training",
];

// ===========================================
// Definition
// ===========================================

/**
 * What an infantry upgrade does to every squad, current and future
 * (campaign arc §10.3). Content, typed here and defined in
 * `roster/data/infantry-upgrades.ts`.
 *
 * An upgrade is plain data the unit factory folds into a squad's
 * template at mission start, so a new upgrade is a new row, never a new
 * branch in the rules:
 *
 * ```
 *   InfantryUpgradeDefinition
 *   ├── armorBonus      added to every squad's per-hit armour
 *   └── equipmentSwaps  carried item id ──► the item it becomes
 *
 *   squad type equipment [grenade, medkit]
 *        │  frag-grenades         grenade      ──► frag-grenade
 *        │  incendiary-grenades   frag-grenade ──► incendiary-grenade
 *        │  field-medic-training  medkit       ──► field-medkit
 *        ▼
 *   template equipment   [incendiary-grenade, field-medkit]
 * ```
 *
 * Upgrades are never stored on a squad: they are derived from the
 * unlocked tech whenever a mission starts, the same way parts are.
 */
export interface InfantryUpgradeDefinition {
  readonly id: InfantryUpgradeId;
  /** Display name, e.g. `"Squad armour I"`. */
  readonly name: string;
  /** What it does in a few words, e.g. `"+1 armour on every squad"`. */
  readonly summary: string;
  /** Per-hit armour every squad gains; absent means none. Non-negative integer. */
  readonly armorBonus?: number;
  /**
   * Carried items this upgrade replaces, keyed by the item carried
   * before it: a squad whose kit lists a key carries the value instead.
   * Absent means the kit is untouched.
   */
  readonly equipmentSwaps?: Readonly<Partial<Record<EquipmentId, EquipmentId>>>;
}
