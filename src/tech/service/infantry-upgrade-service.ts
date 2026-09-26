import type {
  InfantryUpgradeDefinition,
  InfantryUpgradeId,
} from "../../roster/model/infantry-upgrade";
import { activeInfantryUpgrades } from "../../roster/service/infantry-upgrade-effect-service";
import type { TechCatalogue } from "../model/tech-catalogue";
import { infantryUpgradeIdsOf } from "../model/tech-effect";
import type { TechState } from "../model/tech-state";

// ===========================================
// Unlocked upgrades
// ===========================================

/**
 * Every infantry upgrade the infantry-upgrade effects of the unlocked
 * nodes of `tech` grant; an unknown node grants none. Mirrors
 * `unlockedPartIds`.
 *
 * @param catalogue - The tech tree.
 * @param tech - What the campaign has researched.
 * @returns The ids of the granted upgrades.
 */
export function unlockedInfantryUpgradeIds(
  catalogue: TechCatalogue,
  tech: TechState,
): ReadonlySet<InfantryUpgradeId> {
  const ids = new Set<InfantryUpgradeId>();
  for (const nodeId of tech.unlocked) {
    const node = catalogue.getNode(nodeId);
    if (node === undefined) {
      continue;
    }
    for (const upgradeId of infantryUpgradeIdsOf(node)) {
      ids.add(upgradeId);
    }
  }
  return ids;
}

/**
 * The campaign's infantry upgrades as the tech tree decides them
 * (campaign arc §10.3, D8): the definitions of every upgrade an unlocked
 * node grants, in application order. Derived afresh whenever a mission
 * starts or a screen asks, never stored on a squad, so a squad hired
 * after the research carries the upgrade as surely as one hired before
 * it.
 *
 * ```
 *   tech.unlocked ──► nodes ──► infantry-upgrade effects ──► ids
 *                                                            │
 *   definitions ────────────────────────────────────────────►┴─► upgrades, in INFANTRY_UPGRADE_IDS order
 * ```
 *
 * @param catalogue - The tech tree.
 * @param definitions - The upgrade table.
 * @param tech - What the campaign has researched.
 * @returns The active upgrades, ready for the unit factory.
 */
export function infantryUpgradesFor(
  catalogue: TechCatalogue,
  definitions: Readonly<Record<InfantryUpgradeId, InfantryUpgradeDefinition>>,
  tech: TechState,
): readonly InfantryUpgradeDefinition[] {
  return activeInfantryUpgrades(
    unlockedInfantryUpgradeIds(catalogue, tech),
    definitions,
  );
}
