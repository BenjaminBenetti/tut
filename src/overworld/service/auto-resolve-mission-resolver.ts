import type { Rng } from "../../core/model/rng";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import type { MechRater } from "../../roster/model/mech-rater";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { AutoResolveTuning } from "../model/auto-resolve-tuning";
import type { Deployment } from "../model/deployment";
import type { Mission } from "../model/mission";
import type { MissionResolutionState } from "../model/mission-resolution-state";
import type { MissionResolver } from "../model/mission-resolver";
import type {
  MechDamageReport,
  MissionOutcome,
  MissionResult,
  SquadCasualties,
} from "../model/mission-result";
import {
  computeForceRating,
  deployedMechs,
  deployedSquads,
} from "./force-rating-service";
import { creditsFor, infestationDeltaFor } from "./mission-reward-service";

// ===========================================
// Dependencies
// ===========================================

/** What the auto-resolver needs injected. */
export interface AutoResolveDeps {
  readonly squadTypes: SquadTypeCatalogue;
  readonly mechRater: MechRater;
  readonly tuning: AutoResolveTuning;
}

// ===========================================
// Formula
// ===========================================

/**
 * Chance the deployed force wins (GDD §4), a logistic curve over how far
 * the force rating sits above or below what the difficulty demands:
 *
 * ```
 *   P(win) = 1 / (1 + e^−((force − difficulty × difficultyScale) / winSpread))
 *
 *   P
 *   1 ┤                 ╭────────
 *     │              ╭──╯
 * 0.5 ┤ · · · · · ·╭╯
 *     │        ╭───╯
 *   0 ┼────────╯──────┼───────────► force
 *              difficulty × scale
 * ```
 */
export function winProbability(
  force: number,
  difficulty: number,
  tuning: Pick<AutoResolveTuning, "difficultyScale" | "winSpread">,
): number {
  const margin = force - difficulty * tuning.difficultyScale;
  return 1 / (1 + Math.exp(-margin / tuning.winSpread));
}

// ===========================================
// AutoResolveMissionResolver
// ===========================================

/**
 * The M1 placeholder `MissionResolver` (GDD §4): no map, no turns, just a
 * rating comparison and dice. Pure: every draw comes from the `rng` the
 * caller passes (a labelled fork of the campaign RNG), inputs are never
 * mutated, and nothing is applied here; `LaunchMission` (#67) applies the
 * returned `MissionResult`.
 *
 * Draw order, part of the determinism contract:
 *
 * ```
 *   1. chance(P(win))                       won?
 *   2. chance(extractChance)                only when not won: extracted or lost
 *   3. per squad, per living soldier:       chance(casualtyChance[outcome])
 *   4. per mech:                            chance(mechDestructionChance[outcome])
 *                                           then nextInt(mechDamage[outcome]) if not destroyed
 * ```
 */
export class AutoResolveMissionResolver implements MissionResolver {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: AutoResolveDeps;

  // ===========================================
  // Construction
  // ===========================================

  /** Resolves with the given catalogue, rater and tuning. */
  constructor(deps: AutoResolveDeps) {
    this.deps = deps;
  }

  // ===========================================
  // MissionResolver
  // ===========================================

  /**
   * Rolls the mission out. See the class doc for the draw order.
   *
   * @throws {Error} if the deployment names a squad or mech missing from
   *   `state`, or a squad whose type is not in the catalogue.
   */
  resolve(
    mission: Mission,
    deployment: Deployment,
    state: MissionResolutionState,
    rng: Rng,
  ): MissionResult {
    const { tuning } = this.deps;
    const force = computeForceRating(deployment, state, this.deps);
    const outcome = this.rollOutcome(force, mission.difficulty, rng);

    const squadCasualties: SquadCasualties[] = [];
    const squadsWiped: string[] = [];
    for (const squad of deployedSquads(deployment, state)) {
      const losses = countHits(
        squad.strength,
        tuning.casualtyChance[outcome],
        rng,
      );
      if (losses === 0) {
        continue;
      }
      squadCasualties.push({ squadId: squad.id, losses });
      if (losses >= squad.strength) {
        squadsWiped.push(squad.id);
      }
    }

    const mechDamage: MechDamageReport[] = [];
    const mechsDestroyed: string[] = [];
    for (const mech of deployedMechs(deployment, state)) {
      const remaining = MECH_MAX_DAMAGE - mech.damage;
      const destroyed = rng.chance(tuning.mechDestructionChance[outcome]);
      const range = tuning.mechDamage[outcome];
      const rolled = destroyed ? remaining : rng.nextInt(range.min, range.max);
      const damage = Math.min(remaining, rolled);
      if (damage === 0) {
        continue;
      }
      mechDamage.push({ mechId: mech.id, damage });
      if (damage >= remaining) {
        mechsDestroyed.push(mech.id);
      }
    }

    return {
      missionId: mission.id,
      cityId: mission.cityId,
      outcome,
      squadCasualties,
      squadsWiped,
      mechsDestroyed,
      mechDamage,
      creditsAwarded: creditsFor(outcome, mission, tuning),
      infestationDelta: infestationDeltaFor(outcome, mission, tuning),
    };
  }

  // ===========================================
  // Private
  // ===========================================

  /** Draws 1 and 2: win, else extraction or loss. */
  private rollOutcome(
    force: number,
    difficulty: number,
    rng: Rng,
  ): MissionOutcome {
    if (rng.chance(winProbability(force, difficulty, this.deps.tuning))) {
      return "won";
    }
    return rng.chance(this.deps.tuning.extractChance) ? "extracted" : "lost";
  }
}

// ===========================================
// Helpers
// ===========================================

/** Rolls `trials` independent chances and counts the hits. */
function countHits(trials: number, probability: number, rng: Rng): number {
  let hits = 0;
  for (let i = 0; i < trials; i++) {
    if (rng.chance(probability)) {
      hits++;
    }
  }
  return hits;
}
