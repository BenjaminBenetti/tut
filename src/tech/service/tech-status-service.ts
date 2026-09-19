import type { EconomyState } from "../../economy/model/economy-state";
import type { TechNode, TechNodeId } from "../model/tech-node";
import type { TechState } from "../model/tech-state";

// ===========================================
// Types
// ===========================================

/**
 * What a tree card can be, in the order a player works through them:
 *
 * | status         | meaning                                              |
 * |----------------|------------------------------------------------------|
 * | `unlocked`     | bought; its parts are in the bay                     |
 * | `available`    | prerequisites bought and the pool covers the cost    |
 * | `unaffordable` | prerequisites bought, pool too small                 |
 * | `locked`       | at least one prerequisite not bought                 |
 */
export type TechNodeStatus =
  "unlocked" | "available" | "unaffordable" | "locked";

// ===========================================
// Status
// ===========================================

/** The prerequisites of `node` that are not yet unlocked, in the node's order. */
export function missingPrerequisites(
  node: TechNode,
  tech: TechState,
): readonly TechNodeId[] {
  return node.requires.filter((id) => !tech.unlocked.includes(id));
}

/**
 * Classifies one node against the tree and the pool, the same order of
 * checks `unlockTech` refuses in, so a card the screen shows as
 * available is one the command will accept.
 */
export function techNodeStatus(
  node: TechNode,
  tech: TechState,
  economy: Pick<EconomyState, "techPoints">,
): TechNodeStatus {
  if (tech.unlocked.includes(node.id)) {
    return "unlocked";
  }
  if (missingPrerequisites(node, tech).length > 0) {
    return "locked";
  }
  return economy.techPoints >= node.cost ? "available" : "unaffordable";
}
