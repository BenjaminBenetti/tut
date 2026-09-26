import type { PartId } from "../../roster/model/mech-part";
import type { PartAvailability } from "../../roster/model/part-availability";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { TechCatalogue } from "../model/tech-catalogue";
import { partIdsOf } from "../model/tech-effect";
import type { TechState } from "../model/tech-state";

// ===========================================
// Unlocked parts
// ===========================================

/** Every part id the part effects of the unlocked nodes of `tech` name; an unknown node names none. */
export function unlockedPartIds(
  catalogue: TechCatalogue,
  tech: TechState,
): ReadonlySet<PartId> {
  const ids = new Set<PartId>();
  for (const nodeId of tech.unlocked) {
    const node = catalogue.getNode(nodeId);
    if (node === undefined) {
      continue;
    }
    for (const partId of partIdsOf(node)) {
      ids.add(partId);
    }
  }
  return ids;
}

// ===========================================
// Availability
// ===========================================

/**
 * The roster's `PartAvailability` as the tech tree decides it (#1171):
 * a tier 1 part is always purchasable, and any other part is purchasable
 * once a node naming it is unlocked. A part the catalogue does not know
 * is reported unavailable and left for loadout validation to name.
 *
 * ```
 *   isAvailable(id) = part.tier === 1  ∨  id ∈ partIdsOf(unlocked nodes)
 * ```
 */
export function createPartAvailability(
  techCatalogue: TechCatalogue,
  parts: PartCatalogue,
  tech: TechState,
): PartAvailability {
  const unlocked = unlockedPartIds(techCatalogue, tech);
  return {
    isAvailable: (id) => {
      const part = parts.getPart(id);
      if (part === undefined) {
        return false;
      }
      return part.tier === 1 || unlocked.has(id);
    },
  };
}
