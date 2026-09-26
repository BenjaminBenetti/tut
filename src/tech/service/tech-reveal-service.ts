import type { TechConditions } from "../model/tech-conditions";
import type { TechNode } from "../model/tech-node";
import { isTechNodeHidden } from "./tech-status-service";

// ===========================================
// Reveals
// ===========================================

/**
 * The nodes a change of conditions brings out of hiding (ADR 0013
 * §2.7): hidden under `before`, shown under `after`, in tree order.
 * The first kill of a species is the usual change, and its autopsy the
 * node it reveals (campaign arc §8); a story flag revealing an Intel
 * project is the same change. A node hidden again is not a reveal.
 *
 * ```
 *   before { }                  after { killed:spitter }
 *   Spitter Autopsy  hidden ──► shown                  ──► [Spitter Autopsy]
 *   Jump Jets        shown  ──► shown                  ──► (not a reveal)
 * ```
 *
 * @param nodes - The tree, in the order reveals are reported.
 * @param before - The conditions before the change.
 * @param after - The conditions after it.
 * @returns The nodes newly shown; empty when nothing was revealed.
 */
export function revealedTechNodes(
  nodes: readonly TechNode[],
  before: TechConditions,
  after: TechConditions,
): readonly TechNode[] {
  return nodes.filter(
    (node) => isTechNodeHidden(node, before) && !isTechNodeHidden(node, after),
  );
}
