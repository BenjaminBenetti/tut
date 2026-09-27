import type { JevMovementRules } from "../../tactical/model/jev-movement-rules";
import { BROODMOTHER_TUNING } from "../data/broodmother-tuning";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import type { BroodmotherTuning } from "../model/broodmother-tuning";
import type { PersonaLookup } from "../model/persona";
import type { SovereignTuning } from "../model/sovereign-tuning";
import { isFleeing } from "./broodmother-service";
import { isRetreating, isSovereign } from "./sovereign-service";

// ===========================================
// Named-enemy movement rules
// ===========================================

/**
 * The bugs' answers to Jev's movement questions (#1179, ADR 0012): what
 * a named enemy's persona allows its moves. The app hands the result to
 * the Jev controller as `JevActionRules.movement`.
 *
 * ```
 *   canFlee(actor)  ──► personaOf(actor.persona)?.flees === true
 *                       ∧ isFleeing(actor): marked, or hp ≤ maxHp·fleeAtHpFraction
 *   leashOf(actor)  ──► a Sovereign with a core:
 *                         { core, radius: retreating ? holdRadius : leashRadius }
 *                       anyone else: none
 * ```
 *
 * Flight is offered from the decision she is hurt enough to run, not
 * before: offered at full health, Jev took the exit at 51 of 68 HP and
 * walked her past the TDF (#1179 re-check), against a persona that
 * keeps its distance until half HP. The threshold is her flight rule's
 * (`isFleeing`), so a hit taken in her own phase opens the exit before
 * the next phase start marks her `fleeing`.
 *
 * The leash is her fallback's (`SovereignBehaviour`): the same tuning,
 * the same retreat test, the same radii. Neither her persona nor the
 * Spore Platform's data carries one; the platform's `chamberRadius` is
 * the size of the carved chamber, not how far she ranges.
 *
 * @param personaOf - Resolves a unit's persona; the shipped table in the app.
 * @param sovereign - The Sovereign's numbers; the shipped set by default.
 * @param broodmother - The flight threshold; the shipped set by default.
 * @returns The rules Jev's movement offer consults.
 */
export function createNamedEnemyMovementRules(
  personaOf: PersonaLookup,
  sovereign: SovereignTuning = SOVEREIGN_TUNING,
  broodmother: BroodmotherTuning = BROODMOTHER_TUNING,
): JevMovementRules {
  return {
    canFlee: (actor) =>
      actor.persona !== undefined &&
      personaOf(actor.persona)?.flees === true &&
      isFleeing(actor, broodmother),
    leashOf: (actor) =>
      isSovereign(actor) && actor.core !== undefined
        ? {
            core: actor.core,
            radius: isRetreating(actor, sovereign)
              ? sovereign.holdRadius
              : sovereign.leashRadius,
          }
        : undefined,
  };
}
