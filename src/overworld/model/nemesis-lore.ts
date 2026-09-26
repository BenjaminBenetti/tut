import type { NemesisMark } from "./nemesis";

// ===========================================
// Nemesis lore
// ===========================================

/**
 * The words the nemesis record is written in (campaign arc §6.8, §8):
 * the names a fresh Broodmother or alpha may take, and the scars each
 * kind of wound leaves. Static content in `overworld/data/nemesis-lore.ts`;
 * the offer rule, the alpha decorator and the consequence rules take it
 * as a parameter rather than importing the data.
 *
 * ```
 *   broodmotherNames  drawn with the offer's stream for a fresh Broodmother
 *   alphaNames        drawn with the decorator's stream for a fresh alpha
 *   scars[mark]       one picked by name and escapes, never drawn
 * ```
 *
 * Every list is non-empty; the names in one list are distinct.
 */
export interface NemesisLore {
  /** Names for a Broodmother met for the first time, e.g. "Old Scald". */
  readonly broodmotherNames: readonly string[];
  /** Names for an alpha met for the first time, e.g. "Grinder". */
  readonly alphaNames: readonly string[];
  /** Scar lines by what last hurt it, e.g. "burned along her flank". */
  readonly scars: Readonly<Record<NemesisMark, readonly string[]>>;
}
