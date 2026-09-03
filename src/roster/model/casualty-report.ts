import type { MechId } from "./mech";
import type { SquadId } from "./squad";

// ===========================================
// Per-unit reports
// ===========================================

/** Soldiers one deployed squad lost, and the kills it is credited with. */
export interface SquadCasualtyReport {
  readonly squadId: SquadId;
  /** Soldiers lost, `0` to the squad's strength at launch. */
  readonly losses: number;
  /** Kills credited to the squad; absent means none. */
  readonly kills?: number;
}

/** Damage one deployed mech took, and the kills it is credited with. */
export interface MechDamageCasualtyReport {
  readonly mechId: MechId;
  /** Damage added, `>= 0`, on the mech's `0..MECH_MAX_DAMAGE` scale. */
  readonly damage: number;
  /** Kills credited to the mech; absent means none. */
  readonly kills?: number;
}

// ===========================================
// Report
// ===========================================

/**
 * What the roster needs to know about a finished mission: who went, what
 * they lost and who did not come back. The overworld's `MissionResult`
 * satisfies the report fields structurally; `LaunchMission` (#67) adds
 * the deployment's ids so unhurt survivors can still be credited with
 * the mission. Owned by the roster so it never imports overworld types.
 *
 * ```
 *   MissionResult + Deployment ──► CasualtyReport ──► applyCasualties ──► roster'
 * ```
 *
 * Invariants the producer upholds: every id in `squadsWiped` also has a
 * `squadCasualties` entry, every id in `mechsDestroyed` a `mechDamage`
 * entry, and every reported unit is in the deployed lists.
 */
export interface CasualtyReport {
  /** The mission that was resolved. */
  readonly missionId: string;
  /** Losses per deployed squad; squads with no losses may be omitted. */
  readonly squadCasualties: readonly SquadCasualtyReport[];
  /** Squads whose strength reached zero; removed from the roster. */
  readonly squadsWiped: readonly SquadId[];
  /** Mechs whose damage reached `MECH_MAX_DAMAGE`; gone with their parts. */
  readonly mechsDestroyed: readonly MechId[];
  /** Damage per deployed mech; mechs with no damage may be omitted. */
  readonly mechDamage: readonly MechDamageCasualtyReport[];
  /** Every squad that deployed, so unhurt survivors are credited too. */
  readonly deployedSquadIds: readonly SquadId[];
  /** Every mech that deployed. */
  readonly deployedMechIds: readonly MechId[];
}
