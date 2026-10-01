import { ok } from "../../../core/model/result";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionSetupRule } from "../../model/mission-setup-rule";
import type { EdgeWavePressure } from "../../model/wave-pressure-tuning";
import { pressEdgeWaves } from "../edge-wave-pressure-service";

// ===========================================
// Decorator
// ===========================================

/**
 * `rule` with its type's edge waves pressed harder (#1179): once the
 * type's own setup has stood its objective up, the first wave comes
 * `turnsSooner` turns early and every wave surges. The setup table
 * binds each pressed type to its entry in `WAVE_PRESSURE_TUNING`. A
 * press narrowed to one act (`onlyInAct`) leaves the type's other
 * offers exactly as the rule set them up.
 *
 * ```
 *   rule.setup(state, map, mission, deps)
 *     refused                          ──► refused, as it was
 *     ok, the press not on this offer  ──► set up, as it was
 *     ok                               ──► pressEdgeWaves(set up, pressure)
 * ```
 *
 * Everything else about the rule (its type, where its force deploys,
 * whether it is garrisoned) is the rule's own. The story's setup and
 * the sitreps run after this, so Swarm Tide's surge lands on top and
 * keeps the larger of the two.
 *
 * @param rule - The type's own setup.
 * @param pressure - How much harder its edge waves press.
 * @returns The rule with the pressure applied after its setup.
 */
export function withWavePressure(
  rule: MissionSetupRule,
  pressure: EdgeWavePressure,
): MissionSetupRule {
  return {
    ...rule,

    /** The type's own setup, then its edge waves pressed if the press is on this offer. */
    setup(state, map, mission, deps) {
      const setUp = rule.setup(state, map, mission, deps);
      return setUp.ok && pressesOffer(pressure, mission)
        ? ok(pressEdgeWaves(setUp.value, pressure))
        : setUp;
    },
  };
}

// ===========================================
// Query
// ===========================================

/**
 * Whether `pressure` lands on `offer` (#1179): always for a press on the
 * whole type, and for one narrowed to an act (`onlyInAct`) only on an
 * offer made in that act. An offer that carries no act (one saved
 * before acts) is in none.
 *
 * @param pressure - The type's press.
 * @param offer - The overworld offer being set up.
 * @returns True when the offer's edge waves are pressed.
 */
export function pressesOffer(
  pressure: Pick<EdgeWavePressure, "onlyInAct">,
  offer: Pick<Mission, "act">,
): boolean {
  return pressure.onlyInAct === undefined || offer.act === pressure.onlyInAct;
}
