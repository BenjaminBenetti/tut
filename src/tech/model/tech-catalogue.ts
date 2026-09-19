import type { TechFamily, TechNode, TechNodeId } from "./tech-node";

/**
 * Read-only lookup over the tech tree. Services and screens depend on
 * this interface; the app decides which tree backs it (ADR 0003 §2.5).
 */
export interface TechCatalogue {
  /** Returns the node with the given id, or `undefined` when unknown. */
  getNode(id: TechNodeId): TechNode | undefined;

  /** Every node in catalogue order: family by family, tier 2 before tier 3. */
  listNodes(): readonly TechNode[];

  /** Every family in the order the tree draws them. */
  listFamilies(): readonly TechFamily[];
}
