import type { EconomyState } from "../../economy/model/economy-state";
import type { TechConditions } from "../model/tech-conditions";
import type { TechNode, TechNodeId } from "../model/tech-node";
import type { TechState } from "../model/tech-state";

// ===========================================
// Types
// ===========================================

/**
 * What a tree card can be, in the order the checks run (ADR 0013 §2.7):
 *
 * | status         | meaning                                              |
 * |----------------|------------------------------------------------------|
 * | `hidden`       | a required flag is missing; not drawn at all         |
 * | `unlocked`     | bought; its effects apply                            |
 * | `locked`       | at least one prerequisite not bought                 |
 * | `unaffordable` | prerequisites bought, pool too small                 |
 * | `available`    | prerequisites bought and the pool covers the cost    |
 */
export type TechNodeStatus =
  "hidden" | "unlocked" | "available" | "unaffordable" | "locked";

// ===========================================
// Visibility
// ===========================================

/** The flags `node` requires that `conditions` does not have, in the node's order. */
export function missingFlags(
  node: TechNode,
  conditions: TechConditions,
): readonly string[] {
  return (node.requiresFlags ?? []).filter(
    (flag) => !conditions.flags.has(flag),
  );
}

/**
 * Whether `node` is hidden: any flag it requires is missing. A hidden
 * node is not drawn, not listed and cannot be bought (ADR 0013 §2.7).
 */
export function isTechNodeHidden(
  node: TechNode,
  conditions: TechConditions,
): boolean {
  return missingFlags(node, conditions).length > 0;
}

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
 * Classifies one node against the conditions, the tree and the pool,
 * with the same checks in the same order `unlockTech` refuses in, so a
 * card the screen shows as available is one the command will accept and
 * a hidden one is one it refuses as hidden:
 *
 * ```
 *   hidden? ──► unlocked? ──► prerequisites missing? ──► pool covers cost?
 *     │            │                  │                     │        │
 *   hidden      unlocked            locked               available unaffordable
 * ```
 *
 * `unlockTech` has one more check, for an unknown id, which a status
 * never needs because it is handed a node.
 */
export function techNodeStatus(
  node: TechNode,
  tech: TechState,
  economy: Pick<EconomyState, "techPoints">,
  conditions: TechConditions,
): TechNodeStatus {
  if (isTechNodeHidden(node, conditions)) {
    return "hidden";
  }
  if (tech.unlocked.includes(node.id)) {
    return "unlocked";
  }
  if (missingPrerequisites(node, tech).length > 0) {
    return "locked";
  }
  return economy.techPoints >= node.cost ? "available" : "unaffordable";
}
