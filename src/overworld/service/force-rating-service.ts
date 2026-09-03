import type { Mech } from "../../roster/model/mech";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import type { MechRater } from "../../roster/model/mech-rater";
import type { Squad } from "../../roster/model/squad";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { AutoResolveTuning } from "../model/auto-resolve-tuning";
import type { Deployment } from "../model/deployment";
import type { MissionResolutionState } from "../model/mission-resolution-state";

// ===========================================
// Dependencies
// ===========================================

/** What force rating needs injected: catalogue and rater by interface. */
export interface ForceRatingDeps {
  readonly squadTypes: SquadTypeCatalogue;
  readonly mechRater: MechRater;
  readonly tuning: Pick<AutoResolveTuning, "damagePenalty">;
}

// ===========================================
// Per-unit ratings
// ===========================================

/**
 * A squad's worth in a straight fight: its type's rating scaled by how
 * many soldiers it has left.
 *
 * @throws {Error} if the squad's type is not in the catalogue.
 */
export function squadRating(
  squad: Squad,
  squadTypes: SquadTypeCatalogue,
): number {
  const type = squadTypes.getSquadType(squad.typeId);
  if (type === undefined) {
    throw new Error(`Squad "${squad.id}" has unknown type "${squad.typeId}"`);
  }
  if (squad.maxStrength <= 0) {
    return 0;
  }
  return (type.combatRating * squad.strength) / squad.maxStrength;
}

/**
 * A mech's worth as it stands: its built rating reduced by accumulated
 * damage, `damagePenalty` deciding how much damage matters.
 */
export function mechRating(
  mech: Mech,
  mechRater: MechRater,
  tuning: Pick<AutoResolveTuning, "damagePenalty">,
): number {
  const damageFraction = mech.damage / MECH_MAX_DAMAGE;
  const factor = Math.max(0, 1 - damageFraction * tuning.damagePenalty);
  return mechRater.rateMech(mech) * factor;
}

// ===========================================
// Force
// ===========================================

/**
 * Total rating of the deployed force: every named squad and mech looked
 * up in `state` and summed (GDD §4).
 *
 * @throws {Error} if the deployment names a squad or mech that is not
 *   in `state`; `LaunchMission` (#67) validates the deployment first, so
 *   this is a programmer error.
 */
export function computeForceRating(
  deployment: Deployment,
  state: MissionResolutionState,
  deps: ForceRatingDeps,
): number {
  let total = 0;
  for (const squad of deployedSquads(deployment, state)) {
    total += squadRating(squad, deps.squadTypes);
  }
  for (const mech of deployedMechs(deployment, state)) {
    total += mechRating(mech, deps.mechRater, deps.tuning);
  }
  return total;
}

// ===========================================
// Lookup
// ===========================================

/** The squads named by the deployment, in deployment order. */
export function deployedSquads(
  deployment: Deployment,
  state: MissionResolutionState,
): Squad[] {
  return deployment.squadIds.map((id) => {
    const squad = state.squads.find((s) => s.id === id);
    if (squad === undefined) {
      throw new Error(`Deployment names unknown squad "${id}"`);
    }
    return squad;
  });
}

/** The mechs named by the deployment, in deployment order. */
export function deployedMechs(
  deployment: Deployment,
  state: MissionResolutionState,
): Mech[] {
  return deployment.mechIds.map((id) => {
    const mech = state.mechs.find((m) => m.id === id);
    if (mech === undefined) {
      throw new Error(`Deployment names unknown mech "${id}"`);
    }
    return mech;
  });
}
