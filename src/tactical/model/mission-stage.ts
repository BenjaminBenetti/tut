import type { TacticalEvent } from "./tactical-event";
import type { Unit } from "./unit";
import type { UnitTemplate, UnitTemplateId } from "./unit-template";

// ===========================================
// Linked missions (ADR 0013 amendment, #1179)
// ===========================================

/**
 * What one finished stage of a linked mission leaves for the mission's
 * single result (ADR 0013 amendment): everyone of the stage who did not
 * go on to the next — the dead of both sides, the force left behind,
 * turrets, the bugs still standing — with their stat blocks, and the
 * events the result reads (kills, carcasses stripped, units abandoned).
 * The survivors who went on are not here: they are the next stage's
 * units, under the same ids, so each unit is counted once.
 *
 * ```
 *   stage n ends won ──► survivors ──► stage n + 1's units (same ids)
 *                   └──► everyone else, templates, the result's events ──► EarlierStage
 * ```
 *
 * Plain data, saved with the mission, so a campaign saved between or
 * during the stages resolves the same way.
 */
export interface EarlierStage {
  /** The stage's zero-based index. */
  readonly index: number;
  /** The turn the stage ended on. */
  readonly turns: number;
  /** Units that did not go on, frozen as the stage ended. */
  readonly units: readonly Unit[];
  /** Stat blocks of the stage, for the kills' worth. */
  readonly templates: Readonly<Record<UnitTemplateId, UnitTemplate>>;
  /** The stage's events the mission result reads, oldest first. */
  readonly log: readonly TacticalEvent[];
}

/**
 * Where a linked mission stands (ADR 0013 amendment): which stage is on
 * the map, how many there are, and what the stages already won left
 * behind. Absent on every one-map mission, and on every mission saved
 * before linked missions, so no save needs a migration.
 *
 * ```
 *   index 0 ─ win ─► index 1 ─ win ─► … ─ win at index count − 1 ─► won
 *      └─ lose or leave any stage ──────────────────────────────────► lost
 * ```
 */
export interface MissionStageState {
  /** The stage being played, zero-based. */
  readonly index: number;
  /** Stages in the mission; at least 2 when this is present. */
  readonly count: number;
  /** The stages already won, oldest first. */
  readonly earlier: readonly EarlierStage[];
}
