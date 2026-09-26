import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { TechEffect } from "../../tech/model/tech-effect";
import type { TechEffectLabels } from "../model/tech-effect-labels";
import { damageResistanceText } from "./damage-resistance-text";

// ===========================================
// Types
// ===========================================

/** Where the names of a node's effects come from. */
export interface TechEffectNameSources {
  /** Names the parts a part effect unlocks. */
  readonly parts: Pick<PartCatalogue, "getPart">;
  /** Names the squad type a squad-type effect opens; absent, the id's words are shown. */
  readonly squadTypes?: Pick<SquadTypeCatalogue, "getSquadType">;
  /** Names flags and infantry upgrades; absent, or missing an id, the id's words are shown. */
  readonly labels?: TechEffectLabels;
}

// ===========================================
// Describe
// ===========================================

/**
 * One effect of a tech node in words, for the detail panel's "Unlocks"
 * list (ADR 0013 §2.7): a part by its catalogue name, with what it
 * resists when it resists anything (campaign arc §10.2), a squad type
 * by its name, a flag or an infantry upgrade by its label. Whatever has
 * no name falls back to its id's words, so every effect reads as plain
 * text.
 *
 * ```
 *   { kind: "part", partId: "legs-sprint" }         ──► "Sprint Legs"
 *   { kind: "part", partId: "utility-acid-…" }      ──► "Acid-Resistant Plating (acid resist 3)"
 *   { kind: "squad-type", squadTypeId: "rifle" }    ──► "Rifle Squad"
 *   { kind: "flag", flag: "capture-net" }           ──► "The capture net"  (labelled)
 *   { kind: "infantry-upgrade", upgradeId: "a-1" }  ──► "A 1"              (unlabelled)
 * ```
 *
 * @param effect - The effect to name.
 * @param sources - The catalogues and labels names come from.
 * @returns A short noun phrase.
 */
export function describeTechEffect(
  effect: TechEffect,
  sources: TechEffectNameSources,
): string {
  switch (effect.kind) {
    case "part": {
      const part = sources.parts.getPart(effect.partId);
      if (!part) {
        return effect.partId;
      }
      const resists = damageResistanceText(part.traits?.resist);
      return resists.length === 0
        ? part.name
        : `${part.name} (${resists.join(", ")})`;
    }
    case "squad-type":
      return (
        sources.squadTypes?.getSquadType(effect.squadTypeId)?.name ??
        wordsOf(effect.squadTypeId)
      );
    case "flag":
      return sources.labels?.flags[effect.flag] ?? wordsOf(effect.flag);
    case "infantry-upgrade":
      return (
        sources.labels?.infantryUpgrades[effect.upgradeId] ??
        wordsOf(effect.upgradeId)
      );
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * A kebab-case id as words with a capital first letter: `"capture-net"`
 * → `"Capture net"`. Shared with the kind line, which names a species
 * no lookup knows the same way.
 *
 * @param id - Any kebab-, snake- or dot-separated id.
 * @returns Its words, capitalised.
 */
export function wordsOf(id: string): string {
  const words = id
    .split(/[-_.]+/)
    .filter((word) => word !== "")
    .join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
