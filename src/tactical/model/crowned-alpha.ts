import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { UnitId } from "./unit";

// ===========================================
// Crowned alpha
// ===========================================

/**
 * The named alpha of an Alpha Present mission (campaign arc §8, §11),
 * on the tactical side: the name and level frozen on the offer
 * (`Mission.alpha`), copied at launch, and once the sitrep's rule has
 * crowned a bug, which unit carries them.
 *
 * ```
 *   launch   { name, level, speciesId? }          copied from Mission.alpha
 *   crowned  { name, level, speciesId?, unitId }  the first phase a bug stands on the map
 *   result   unitId ──► MissionResult.alpha { speciesId, survived, wound? }
 * ```
 *
 * Plain serializable data, optional on `TacticalState`, so no save needs
 * a migration.
 */
export interface CrownedAlpha {
  /** What the unit card and the log call it, e.g. "Grinder". */
  readonly name: string;
  /** Nemesis level: 0 for an alpha met for the first time, else 1 or more. */
  readonly level: number;
  /** The species it was last time, when it is a nemesis come back; crowned first. */
  readonly speciesId?: BugSpeciesId;
  /** The bug that carries the name, once one has been crowned. */
  readonly unitId?: UnitId;
}
