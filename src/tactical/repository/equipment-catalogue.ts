import { EQUIPMENT } from "../data/equipment";
import type {
  EquipmentCatalogue,
  EquipmentDefinition,
  EquipmentId,
} from "../model/equipment";

// ===========================================
// Catalogue
// ===========================================

/**
 * An `EquipmentCatalogue` over a record of definitions (#1132). The
 * composition root and the HUD use the shipped one below; a test builds
 * one over whatever it needs.
 *
 * @param definitions - The definitions, keyed by id.
 * @returns A catalogue answering by id, in the record's order.
 */
export function createEquipmentCatalogue(
  definitions: Readonly<Record<EquipmentId, EquipmentDefinition>>,
): EquipmentCatalogue {
  const ids = Object.keys(definitions);
  return {
    ids,
    get: (id) => (Object.hasOwn(definitions, id) ? definitions[id] : undefined),
  };
}

/** The shipped equipment, as the rules and the HUD read it. */
export const SHIPPED_EQUIPMENT: EquipmentCatalogue =
  createEquipmentCatalogue(EQUIPMENT);
