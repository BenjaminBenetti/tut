import type { NemesisId } from "./nemesis";

// ===========================================
// Alpha Hunt spec
// ===========================================

/**
 * Who an Alpha Hunt offer hunts (campaign arc §6.8, ADR 0013 §2.2): a
 * Broodmother met for the first time, or a nemesis come back. Frozen
 * on the offer when it is made, so the briefing, the map and the
 * nemesis record all read the same Broodmother.
 *
 * ```
 *   fresh     { name }                                   drawn from the name table
 *   nemesis   { nemesisId, name, scar, scars, level }    copied from progress.nemeses
 *
 *   setup     placeBroodmother(…, { scars })  ──► hp = broodmotherHp(difficulty, scars)
 *   played    killed  ──► the nemesis (if any) leaves the record
 *             escaped ──► the record gains her, or raises her level, escapes and scar
 * ```
 *
 * `scars` is her earlier escapes, which `broodmotherHp` turns into the
 * +25% hit points a scar is worth; 0 on a first meeting. Plain
 * serializable data, optional on `Mission`, so no save needs a
 * migration.
 */
export interface AlphaHuntSpec {
  /** The nemesis she is, when the hunt is for one the campaign remembers. */
  readonly nemesisId?: NemesisId;
  /** What the briefing calls her, e.g. "Old Scald". */
  readonly name: string;
  /** The wound she carries from her last escape; absent on a first meeting. */
  readonly scar?: string;
  /** Earlier escapes, a non-negative integer; 0 on a first meeting. */
  readonly scars: number;
  /** Her nemesis level, 1 or more; absent on a first meeting. */
  readonly level?: number;
}
