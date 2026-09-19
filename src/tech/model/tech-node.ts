import type { PartId, PartTier } from "../../roster/model/mech-part";

// ===========================================
// Ids
// ===========================================

/** Identifies a node in the tech tree, e.g. `"tech.jump-jets"`. Plain string (ADR 0003 §2.4). */
export type TechNodeId = string;

/**
 * The six research families of the mech roster guide
 * (`docs/design/mech-roster.md`, "Future research families"). Closed so a
 * node naming a family the tree does not draw fails to compile.
 */
export type TechFamilyId =
  | "mobility"
  | "protection"
  | "ballistics"
  | "energy"
  | "fire-support"
  | "support";

/** Every family, in the order the tree draws its columns. */
export const TECH_FAMILY_IDS: readonly TechFamilyId[] = [
  "mobility",
  "protection",
  "ballistics",
  "energy",
  "fire-support",
  "support",
];

// ===========================================
// Definitions
// ===========================================

/** One column of the tree: what the family is about, for the screen. */
export interface TechFamily {
  readonly id: TechFamilyId;
  /** Display name, e.g. `"Mobility"`. */
  readonly name: string;
  /** One sentence on what the family buys. */
  readonly description: string;
}

/**
 * One unlockable node of the tech tree (GDD §5.5.1, #1171). A node is
 * bought once with tech points; buying it makes every part it names
 * purchasable for credits in the mech bay. Tier 1 parts need no node.
 *
 * ```
 *   TechNode "tech.jump-jets"
 *   ├── family    mobility          the column it sits in
 *   ├── tier      2                 the row: 2 or 3 (tier 1 is free)
 *   ├── cost      18                tech points to unlock
 *   ├── requires  []                nodes that must be unlocked first
 *   └── unlocks   ["legs-jumper"]   parts that become purchasable
 * ```
 */
export interface TechNode {
  readonly id: TechNodeId;
  /** Display name, e.g. `"Jump Jets"`. */
  readonly name: string;
  /** One or two sentences for the tree card. */
  readonly description: string;
  readonly family: TechFamilyId;
  /** Tier of the parts it unlocks; every node is tier 2 or 3. */
  readonly tier: Exclude<PartTier, 1>;
  /** Tech points the unlock costs; positive and whole. */
  readonly cost: number;
  /** Nodes that must already be unlocked; empty for a family's first rung. */
  readonly requires: readonly TechNodeId[];
  /** Parts made purchasable; each part appears in exactly one node. */
  readonly unlocks: readonly PartId[];
}
