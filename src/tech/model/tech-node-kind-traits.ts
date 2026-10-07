import type { TechNode, TechNodeKind } from "./tech-node";

// ===========================================
// Traits
// ===========================================

/**
 * What a node kind is to the campaign, beside how it is priced (ADR 0013
 * §2.7). Structural facts about the kind, as `SPAWNER_VARIANT_TRAITS`
 * holds for spawners: one entry per kind, so a new kind that does not
 * say whether it moves the story on fails to compile.
 */
export interface TechNodeKindTraits {
  /**
   * True when researching a node of this kind moves the story spine on:
   * an Intel project sets the flag the story pins an act's mission on
   * (campaign arc §4), and a story node is the spine's own research
   * (Last Hope, D7). The tech tree draws such nodes as story (#1237).
   */
  readonly advancesStory: boolean;
}

/**
 * Every node kind's traits.
 *
 * ```
 *   kind       advancesStory   shipped nodes
 *   part       no              the mech part blueprints
 *   intel      yes             Pheromone Analysis, Pod Telemetry, Platform Approach
 *   autopsy    no              one per species, offered on its first kill
 *   infantry   no              squad upgrades and squad types
 *   story      yes             Last Hope
 * ```
 */
export const TECH_NODE_KIND_TRAITS: Readonly<
  Record<TechNodeKind, TechNodeKindTraits>
> = {
  part: { advancesStory: false },
  intel: { advancesStory: true },
  autopsy: { advancesStory: false },
  infantry: { advancesStory: false },
  story: { advancesStory: true },
};

// ===========================================
// Queries
// ===========================================

/**
 * Whether researching `node` moves the story on, read off its kind
 * (`TECH_NODE_KIND_TRAITS`), never off its id.
 *
 * @param node - The node, or anything carrying its kind (a graph placement).
 * @returns True for an Intel project or a story node.
 */
export function isStoryTechNode(node: Pick<TechNode, "kind">): boolean {
  return TECH_NODE_KIND_TRAITS[node.kind].advancesStory;
}
