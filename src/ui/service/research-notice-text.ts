// ===========================================
// Research notice text
// ===========================================

/**
 * The one-line notice for research that has just appeared (campaign arc
 * §8): the new nodes by name, and where to find them. The bootstrap
 * shows it in the notice bar, which outlives the mission results screen
 * the reveal usually lands on.
 *
 * ```
 *   [Spitter Autopsy]            ──► "New research: Spitter Autopsy. Open the tech tree to study it."
 *   [Spitter Autopsy, Pheromone] ──► "New research: Spitter Autopsy, Pheromone. Open the tech tree to study them."
 * ```
 *
 * @param nodes - The revealed nodes, at least one, in tree order.
 * @returns The notice's message.
 */
export function researchRevealedNotice(
  nodes: readonly { readonly name: string }[],
): string {
  const names = nodes.map((node) => node.name).join(", ");
  const them = nodes.length === 1 ? "it" : "them";
  return `New research: ${names}. Open the tech tree to study ${them}.`;
}
