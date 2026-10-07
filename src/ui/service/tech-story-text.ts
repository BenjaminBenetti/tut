import { isCampaignFlagId } from "../../content/model/campaign-flag-id";
import type { TechNode } from "../../tech/model/tech-node";
import { isStoryTechNode } from "../../tech/model/tech-node-kind-traits";
import type { TechStoryNote, TechStoryNotes } from "../model/tech-story-notes";

// ===========================================
// Constants
// ===========================================

/**
 * What a story node says when no note names where it leads: true of
 * every intel and story node, and plain rather than blank, so a new
 * node still reads as story before its note is written.
 */
export const TECH_STORY_FALLBACK = "Story: moves the campaign on.";

// ===========================================
// Story line
// ===========================================

/**
 * The detail panel's story line for `node` (#1237): what researching it
 * opens, in plain words. Only a node whose kind advances the story
 * (`isStoryTechNode`) has one. Its note is found through the flags it
 * sets, the first flag with a note winning, since the flag is what the
 * story pins its mission on.
 *
 * ```
 *   intel, flag capture-net    ──► "Story: opens Live Specimen, the mission that ends Act I."
 *   story, flag with no note   ──► "Story: moves the campaign on."
 *   part / autopsy / infantry  ──► undefined
 * ```
 *
 * @param node - The node the panel shows.
 * @param notes - What each story flag opens.
 * @returns The line, or undefined for a node that is not story.
 */
export function techStoryText(
  node: Pick<TechNode, "kind" | "effects">,
  notes: TechStoryNotes,
): string | undefined {
  if (!isStoryTechNode(node)) {
    return undefined;
  }
  const note = storyNoteOf(node, notes);
  return note === undefined
    ? TECH_STORY_FALLBACK
    : `Story: opens ${note.opens}.`;
}

/** The note of the first flag `node` sets that has one, if any. */
function storyNoteOf(
  node: Pick<TechNode, "effects">,
  notes: TechStoryNotes,
): TechStoryNote | undefined {
  for (const effect of node.effects) {
    if (effect.kind !== "flag" || !isCampaignFlagId(effect.flag)) {
      continue;
    }
    const note = notes[effect.flag];
    if (note !== undefined) {
      return note;
    }
  }
  return undefined;
}
