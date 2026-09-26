import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { NemesisId } from "./nemesis";

// ===========================================
// Named alpha
// ===========================================

/**
 * The alpha an Alpha Present offer carries (campaign arc §8, §11): the
 * name one bug on the map will take, and, when the alpha is a nemesis
 * come back, who it was. Frozen on the offer by the alpha decorator and
 * copied onto the tactical mission at launch, where the sitrep's phase
 * step crowns one bug with it.
 *
 * ```
 *   fresh     { name, level: 0 }                           +50% hp, +1 damage
 *   nemesis   { name, level, nemesisId, speciesId, scar }  +25% hp more per level;
 *                                                           its species is crowned first
 * ```
 *
 * Plain serializable data, optional on `Mission` and `TacticalState`, so
 * no save needs a migration.
 */
export interface NamedAlpha {
  /** What the unit card and the log call it, e.g. "Grinder". */
  readonly name: string;
  /** Nemesis level: 0 for an alpha met for the first time, else 1 or more. */
  readonly level: number;
  /** The nemesis it is, when it survived an earlier mission. */
  readonly nemesisId?: NemesisId;
  /** The species it was last time; the crowning prefers a bug of it. */
  readonly speciesId?: BugSpeciesId;
  /** The wound it carries from last time; absent on a first meeting. */
  readonly scar?: string;
}
