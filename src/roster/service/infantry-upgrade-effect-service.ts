import type { EquipmentId } from "../../tactical/model/equipment";
import type {
  InfantryUpgradeDefinition,
  InfantryUpgradeId,
} from "../model/infantry-upgrade";
import { INFANTRY_UPGRADE_IDS } from "../model/infantry-upgrade";

// ===========================================
// Active upgrades
// ===========================================

/**
 * The definitions of the upgrades in `ids`, in `INFANTRY_UPGRADE_IDS`
 * order whatever order `ids` holds them in, so the same research always
 * folds into a squad the same way. Pure.
 *
 * @param ids - The upgrades the campaign has, normally what the tech tree unlocked.
 * @param definitions - The upgrade table.
 * @returns The active upgrades, in application order.
 */
export function activeInfantryUpgrades(
  ids: ReadonlySet<InfantryUpgradeId>,
  definitions: Readonly<Record<InfantryUpgradeId, InfantryUpgradeDefinition>>,
): readonly InfantryUpgradeDefinition[] {
  return INFANTRY_UPGRADE_IDS.filter((id) => ids.has(id)).map(
    (id) => definitions[id],
  );
}

// ===========================================
// Effects
// ===========================================

/**
 * The per-hit armour the upgrades add to every squad: the sum of their
 * `armorBonus`, zero when none has one.
 *
 * ```
 *   [squad-armour-1 (+1), frag-grenades, squad-armour-2 (+1)]  ──►  2
 * ```
 *
 * @param upgrades - The active upgrades.
 * @returns The armour to add, a non-negative integer.
 */
export function infantryArmorBonus(
  upgrades: readonly InfantryUpgradeDefinition[],
): number {
  return upgrades.reduce((sum, upgrade) => sum + (upgrade.armorBonus ?? 0), 0);
}

/**
 * A squad's kit with the upgrades applied in upgrade order, each one
 * swapping what the kit holds and then adding its own items, so a later
 * rung replaces what an earlier one handed out: frag grenades turn the
 * grenade into a frag grenade, and incendiary grenades then turn that
 * into an incendiary one. An item no upgrade names is carried as it was,
 * and the swaps keep the kit's order and length; an added item follows
 * the kit and is carried once, even when the kit already holds it. The
 * result is always a new list; `equipment` is never touched.
 *
 * ```
 *   [grenade, medkit]
 *     frag-grenades         ──► [frag-grenade, medkit]
 *     incendiary-grenades   ──► [incendiary-grenade, medkit]
 *     field-medic-training  ──► [incendiary-grenade, field-medkit]
 *     capture-net           ──► [incendiary-grenade, field-medkit, capture-net]
 * ```
 *
 * @param equipment - The squad type's kit; empty for a type carrying none.
 * @param upgrades - The active upgrades, in application order.
 * @returns The kit the squad carries into the mission.
 */
export function upgradedEquipment(
  equipment: readonly EquipmentId[],
  upgrades: readonly InfantryUpgradeDefinition[],
): readonly EquipmentId[] {
  return upgrades.reduce<readonly EquipmentId[]>(
    (kit, upgrade) => {
      const swapped = kit.map((item) => upgrade.equipmentSwaps?.[item] ?? item);
      const carried = [...swapped];
      for (const item of upgrade.equipmentAdds ?? []) {
        if (!carried.includes(item)) {
          carried.push(item);
        }
      }
      return carried;
    },
    [...equipment],
  );
}
