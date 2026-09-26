import { killedSpeciesOf } from "../../tech/model/tech-conditions";
import type { TechNode } from "../../tech/model/tech-node";
import { wordsOf } from "./tech-effect-describer";

// ===========================================
// Types
// ===========================================

/** Where the tech tree's kind line finds names. */
export interface TechNodeKindSources {
  /**
   * Names the species an autopsy studies; absent, or not knowing the
   * id, the id's words are shown.
   */
  readonly speciesOf?: (
    speciesId: string,
  ) => { readonly name: string } | undefined;
}

// ===========================================
// Kind line
// ===========================================

/**
 * The detail panel's line saying what sort of research a node is,
 * when that is more than "a part" (ADR 0013 §2.7). An autopsy names
 * the species it studies, read off the kill flag that hid it (campaign
 * arc §8, §10.2); the other kinds say nothing yet, and their packages
 * add a line here when they want one.
 *
 * ```
 *   kind "autopsy", requiresFlags ["killed:spitter"]  ──► "Autopsy: Spitter"
 *   kind "autopsy", ["killed:armoured-carapace"]      ──► "Autopsy: Armoured carapace"
 *                                                        (a kill group: its id's words)
 *   kind "autopsy", no kill flag                      ──► "Autopsy"
 *   kind "part"                                        ──► undefined
 * ```
 *
 * @param node - The node the panel shows.
 * @param sources - Where species names come from.
 * @returns The line, or undefined when there is nothing to say.
 */
export function techNodeKindText(
  node: Pick<TechNode, "kind" | "requiresFlags">,
  sources: TechNodeKindSources = {},
): string | undefined {
  if (node.kind !== "autopsy") {
    return undefined;
  }
  const species = (node.requiresFlags ?? [])
    .map(killedSpeciesOf)
    .find((id) => id !== undefined);
  if (species === undefined) {
    return "Autopsy";
  }
  const name = sources.speciesOf?.(species)?.name ?? wordsOf(species);
  return `Autopsy: ${name}`;
}
