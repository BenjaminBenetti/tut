import type { PartTier } from "../../roster/model/mech-part";
import type { TechEffect } from "./tech-effect";

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

/**
 * What sort of research a node is (ADR 0013 §2.7). A `part` node is the
 * ADR 0011 kind: it unlocks mech parts and is priced by its tier. The
 * others carry an explicit price and whatever effects they grant:
 *
 * | kind       | what it is                                          |
 * |------------|-----------------------------------------------------|
 * | `part`     | mech parts, priced at the tier cost                 |
 * | `intel`    | a story gate: an Intel project (campaign arc §4)    |
 * | `autopsy`  | a species' counter, offered on its first kill (§8)  |
 * | `infantry` | squad upgrades and squad types (§10, D8)            |
 * | `story`    | anything else the story spine grants (Last Hope)    |
 */
export type TechNodeKind = "part" | "intel" | "autopsy" | "infantry" | "story";

/** Every node kind, in the order the design lists them. */
export const TECH_NODE_KINDS: readonly TechNodeKind[] = [
  "part",
  "intel",
  "autopsy",
  "infantry",
  "story",
];

/**
 * A node's tier: 2 or 3, since tier 1 parts need no node. For a `part`
 * node it is the tier of the parts it unlocks and sets its price; for
 * every other kind it only picks the ring the graph draws the node on
 * (2 inner, 3 outer) and says nothing about its price.
 */
export type TechNodeTier = Exclude<PartTier, 1>;

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
 * One unlockable node of the tech tree (GDD §5.5.1, #1171; ADR 0013
 * §2.7). A node is bought once with tech points and then applies its
 * effects: a part node makes its parts purchasable for credits in the
 * mech bay, other kinds set flags, open squad types or upgrade the
 * infantry. Tier 1 parts need no node.
 *
 * A node may also be **hidden**: while any flag in `requiresFlags` is
 * missing from the campaign's conditions it is not drawn, not listed and
 * cannot be bought, so an Intel project appears only once its item is in
 * hand.
 *
 * ```
 *   TechNode "tech.jump-jets"
 *   ├── family         mobility          the spoke it sits on
 *   ├── kind           part              what sort of research it is
 *   ├── tier           2                 part tier; for other kinds the ring
 *   ├── cost           18                tech points to unlock
 *   ├── requires       []                nodes that must be unlocked first
 *   ├── requiresFlags  (none)            flags that must be set to see it
 *   └── effects        [part legs-jumper] what buying it does
 * ```
 */
export interface TechNode {
  readonly id: TechNodeId;
  /** Display name, e.g. `"Jump Jets"`. */
  readonly name: string;
  /** One or two sentences for the tree card. */
  readonly description: string;
  readonly family: TechFamilyId;
  /** What sort of research this is; `part` nodes are priced by tier. */
  readonly kind: TechNodeKind;
  /**
   * For a `part` node, the tier of the parts it unlocks, which also sets
   * its price. For any other kind, only the ring the graph places it on.
   */
  readonly tier: TechNodeTier;
  /** Tech points the unlock costs; positive and whole. */
  readonly cost: number;
  /** Nodes that must already be unlocked; empty for a family's first rung. */
  readonly requires: readonly TechNodeId[];
  /**
   * Campaign flags that must all be set before the node is shown at all;
   * absent or empty for a node that is always visible. A node's flags
   * include every flag its prerequisites need, so a visible node never
   * names a hidden one.
   */
  readonly requiresFlags?: readonly string[];
  /**
   * What buying the node does; never empty. A part node carries only
   * part effects, and each part appears in exactly one node.
   */
  readonly effects: readonly TechEffect[];
}
