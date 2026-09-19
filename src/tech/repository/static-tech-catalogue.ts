import type { Registry } from "../../core/model/registry";
import { createRegistry } from "../../core/service/definition-registry";
import type { TechCatalogue } from "../model/tech-catalogue";
import type { TechFamily, TechNode, TechNodeId } from "../model/tech-node";

// ===========================================
// StaticTechCatalogue
// ===========================================

/**
 * `TechCatalogue` over an in-memory node list and family table, normally
 * `TECH_NODES` and `TECH_FAMILIES`. Duplicate node ids are a content bug
 * and are rejected at construction; a prerequisite that names no node is
 * caught the same way, so a typo in the tree fails at composition rather
 * than when a player reaches that card.
 */
export class StaticTechCatalogue implements TechCatalogue {
  // ===========================================
  // Fields
  // ===========================================

  private readonly nodes: Registry<TechNode>;
  private readonly families: readonly TechFamily[];

  // ===========================================
  // Construction
  // ===========================================

  /** Indexes the nodes; throws on a duplicate id or an unknown prerequisite. */
  constructor(nodes: readonly TechNode[], families: readonly TechFamily[]) {
    this.nodes = createRegistry("tech", nodes);
    this.families = families;
    for (const node of nodes) {
      for (const required of node.requires) {
        if (!this.nodes.has(required)) {
          throw new Error(
            `Tech "${node.id}" requires unknown tech "${required}"`,
          );
        }
      }
    }
  }

  // ===========================================
  // TechCatalogue
  // ===========================================

  /** Returns the node with the given id, or `undefined` if unknown. */
  getNode(id: TechNodeId): TechNode | undefined {
    return this.nodes.find(id);
  }

  /** Returns every node in the order they were supplied. */
  listNodes(): readonly TechNode[] {
    return this.nodes.values;
  }

  /** Returns every family in the order they were supplied. */
  listFamilies(): readonly TechFamily[] {
    return this.families;
  }
}
